import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileLifecycleError, ResearchContentStore } from './content-store.js';
import {
  nodeResearchFileSystem,
  type ResearchFileSystem,
  type SequentialFileHandle,
} from './file-system.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-content-store-'));
  roots.push(root);
  const sourceRoot = join(root, 'sources');
  const managedRoot = join(root, 'managed');
  await mkdir(sourceRoot);
  const sourcePath = join(sourceRoot, '论文 样本.pdf');
  const bytes = Buffer.from('%PDF-1.7\nResearch Workbench\n%%EOF\n');
  await writeFile(sourcePath, bytes);
  return {
    root,
    managedRoot,
    sourcePath,
    bytes,
    store: new ResearchContentStore(
      () => managedRoot,
      nodeResearchFileSystem,
      () => 'fixed-id',
    ),
  };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function systemError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('托管内容', () => {
  it('浏览器上传先流式落入账号 staging，完成后可显式清理', async () => {
    const { store, bytes } = await fixture();
    async function* chunks() {
      yield bytes.subarray(0, 7);
      yield bytes.subarray(7);
    }

    const staged = await store.stageManagedUpload(chunks());

    expect(staged.byteSize).toBe(bytes.length);
    expect(await readFile(staged.path)).toEqual(bytes);
    expect(await store.listStagingFiles()).toEqual([staged.path]);
    await store.discardStagedUpload(staged.path);
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('浏览器上传拒绝非 PDF 内容并清理 staging', async () => {
    const { store } = await fixture();
    async function* chunks() {
      yield Buffer.from('plain text');
    }

    await expect(store.stageManagedUpload(chunks())).rejects.toMatchObject({
      code: 'PDF_INVALID',
      stage: 'upload',
    });
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('扩展名是 pdf 但内容没有 PDF 签名时拒绝入库', async () => {
    const { sourcePath, store } = await fixture();
    await writeFile(sourcePath, Buffer.from('this is not a pdf'));

    await expect(store.ingestManaged(sourcePath)).rejects.toMatchObject({
      code: 'PDF_INVALID',
      stage: 'validate-pdf',
      retryable: false,
    });
    await expect(store.listStagingFiles()).resolves.toEqual([]);
  });

  it('流式 hash 后按 SHA-256 路径原子发布，源文件保持不变', async () => {
    const { store, sourcePath, bytes } = await fixture();
    const progress: number[] = [];

    const result = await store.ingestManaged(sourcePath, {
      onProgress: ({ processedBytes }) => progress.push(processedBytes),
    });

    const digest = sha256(bytes);
    expect(result).toMatchObject({
      contentHash: digest,
      byteSize: bytes.length,
      objectKey: `sha256/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}`,
      reusedObject: false,
    });
    expect(await readFile(sourcePath)).toEqual(bytes);
    expect(await readFile(result.objectPath)).toEqual(bytes);
    expect(progress.at(-1)).toBe(bytes.length);
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('重复与并发导入只保留一份内容，后到者校验并复用', async () => {
    const { managedRoot, sourcePath, bytes } = await fixture();
    let sequence = 0;
    const store = new ResearchContentStore(
      () => managedRoot,
      nodeResearchFileSystem,
      () => `staging-${sequence++}`,
    );

    const [first, second] = await Promise.all([
      store.ingestManaged(sourcePath),
      store.ingestManaged(sourcePath),
    ]);
    const third = await store.ingestManaged(sourcePath);

    expect(new Set([first.objectPath, second.objectPath, third.objectPath]).size).toBe(1);
    expect([first.reusedObject, second.reusedObject].filter(Boolean)).toHaveLength(1);
    expect(third.reusedObject).toBe(true);
    expect(await readFile(first.objectPath)).toEqual(bytes);
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('已存在对象内容不符时拒绝覆盖并保留现场', async () => {
    const { managedRoot, sourcePath, bytes, store } = await fixture();
    const digest = sha256(bytes);
    const target = join(managedRoot, 'sha256', digest.slice(0, 2), digest.slice(2, 4), digest);
    const corrupt = Buffer.alloc(bytes.length, 0x78);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, corrupt);

    await expect(store.ingestManaged(sourcePath)).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    });
    expect(await readFile(target)).toEqual(corrupt);
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('取消时删除临时文件，不发布半成品对象', async () => {
    const { managedRoot, sourcePath } = await fixture();
    await writeFile(sourcePath, Buffer.alloc(2 * 1024 * 1024, 0x61));
    const controller = new AbortController();
    const store = new ResearchContentStore(
      () => managedRoot,
      nodeResearchFileSystem,
      () => 'cancelled.part-id',
    );

    await expect(
      store.ingestManaged(sourcePath, {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_CANCELLED', causeCode: 'ABORT_ERR' });
    expect(await store.listStagingFiles()).toEqual([]);
    expect(await readdir(join(managedRoot, 'sha256')).catch(() => [])).toEqual([]);
  });

  it('空间不足保留机器错误并清理 staging', async () => {
    const { managedRoot, sourcePath } = await fixture();
    const failingFs: ResearchFileSystem = {
      ...nodeResearchFileSystem,
      async openWriteExclusive(path) {
        const inner = await nodeResearchFileSystem.openWriteExclusive(path);
        const wrapped: SequentialFileHandle = {
          ...inner,
          async write() {
            throw systemError('ENOSPC');
          },
        };
        return wrapped;
      },
    };
    const store = new ResearchContentStore(
      () => managedRoot,
      failingFs,
      () => 'no-space',
    );

    await expect(store.ingestManaged(sourcePath)).rejects.toMatchObject({
      code: 'FILE_NO_SPACE',
      causeCode: 'ENOSPC',
      retryable: true,
    });
    expect(await store.listStagingFiles()).toEqual([]);
  });

  it('只读源文件仍可安全导入', async () => {
    const { store, sourcePath, bytes } = await fixture();
    await chmod(sourcePath, 0o444);

    const result = await store.ingestManaged(sourcePath);

    expect(await readFile(result.objectPath)).toEqual(bytes);
  });

  it('永久清理前重新校验对象，且对象标识不能越出托管根', async () => {
    const { store, sourcePath } = await fixture();
    const result = await store.ingestManaged(sourcePath);

    await expect(
      store.removeManagedObject('../outside', result.contentHash, result.byteSize),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await store.removeManagedObject(result.objectKey, result.contentHash, result.byteSize);
    expect(
      await store.auditManaged(result.objectKey, result.contentHash, result.byteSize),
    ).toMatchObject({ state: 'missing' });
  });

  it('可扫描内容地址对象，并用可回滚隔离完成永久清理', async () => {
    const { store, sourcePath } = await fixture();
    const result = await store.ingestManaged(sourcePath);

    expect(await store.listManagedObjects()).toEqual([
      expect.objectContaining({
        objectKey: result.objectKey,
        objectPath: result.objectPath,
        contentHash: result.contentHash,
        byteSize: result.byteSize,
      }),
    ]);
    const first = await store.quarantineManagedObject(
      result.objectKey,
      result.contentHash,
      result.byteSize,
    );
    expect(first).not.toBeNull();
    expect(
      await store.auditManaged(result.objectKey, result.contentHash, result.byteSize),
    ).toMatchObject({ state: 'missing' });
    await store.restoreQuarantinedObject(first!);
    expect(
      await store.auditManaged(result.objectKey, result.contentHash, result.byteSize),
    ).toMatchObject({ state: 'available' });

    const second = await store.quarantineManagedObject(
      result.objectKey,
      result.contentHash,
      result.byteSize,
    );
    await store.finalizeQuarantinedObject(second!);
    expect(await store.listManagedObjects()).toEqual([]);
  });

  it('对账只清理达到期限的 staging 文件', async () => {
    const { managedRoot, store } = await fixture();
    const staging = join(managedRoot, '.staging');
    await mkdir(staging, { recursive: true });
    const old = join(staging, 'old.part');
    await writeFile(old, 'partial');

    expect(await store.removeStaleStagingFiles(new Date(Date.now() + 1_000))).toEqual([
      expect.stringMatching(/\.staging[\\/]old\.part$/),
    ]);
    expect(await store.listStagingFiles()).toEqual([]);
  });
});

describe('链接内容', () => {
  it('链接模式同样验证 PDF 内容签名', async () => {
    const { sourcePath, store } = await fixture();
    await writeFile(sourcePath, Buffer.from('plain text'));

    await expect(store.inspectLinked(sourcePath)).rejects.toMatchObject({
      code: 'PDF_INVALID',
      stage: 'validate-pdf',
    });
  });

  it('保存用户路径与 realpath，不复制源文件', async () => {
    const { managedRoot, sourcePath, bytes, store } = await fixture();

    const result = await store.inspectLinked(sourcePath);

    expect(result).toMatchObject({
      originalPath: sourcePath,
      contentHash: sha256(bytes),
      originalPathIsSymbolicLink: false,
    });
    expect(await readFile(sourcePath)).toEqual(bytes);
    expect(await readdir(managedRoot).catch(() => [])).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('符号链接保留原路径并记录目标路径', async () => {
    const { root, sourcePath, store } = await fixture();
    const linkPath = join(root, '论文链接.pdf');
    await symlink(sourcePath, linkPath);

    const result = await store.inspectLinked(linkPath);

    expect(result.originalPath).toBe(linkPath);
    expect(result.resolvedPath).toBe(await realpath(sourcePath));
    expect(result.originalPathIsSymbolicLink).toBe(true);
  });

  it('文件移走后标记 missing；同 hash 恢复，不同 hash 只生成候选', async () => {
    const { root, sourcePath, bytes, store } = await fixture();
    const original = await store.inspectLinked(sourcePath);
    await unlink(sourcePath);

    expect(
      await store.auditLinked(sourcePath, original.contentHash, original.byteSize),
    ).toMatchObject({ state: 'missing', errorCode: 'ENOENT' });

    const samePath = join(root, 'same.pdf');
    await writeFile(samePath, bytes);
    expect(await store.relink(samePath, original.contentHash)).toMatchObject({
      matchesExpectedAsset: true,
    });

    const differentPath = join(root, 'different.pdf');
    await writeFile(differentPath, Buffer.from('%PDF-1.7\ndifferent\n%%EOF'));
    expect(await store.relink(differentPath, original.contentHash)).toMatchObject({
      matchesExpectedAsset: false,
    });
  });

  it('同大小内容变化也通过 hash 检出', async () => {
    const { sourcePath, bytes, store } = await fixture();
    const original = await store.inspectLinked(sourcePath);
    await writeFile(sourcePath, Buffer.alloc(bytes.length, 0x62));

    expect(
      await store.auditLinked(sourcePath, original.contentHash, original.byteSize),
    ).toMatchObject({ state: 'changed', errorCode: 'HASH_CHANGED' });
  });
});

it('FileLifecycleError 暴露稳定字段', () => {
  const error = new FileLifecycleError('busy', 'FILE_BUSY', 'publish', true, 'EBUSY');
  expect(error).toMatchObject({
    name: 'FileLifecycleError',
    code: 'FILE_BUSY',
    stage: 'publish',
    retryable: true,
    causeCode: 'EBUSY',
  });
});
