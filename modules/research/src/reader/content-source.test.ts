import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { ReaderContentSource } from './content-source.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-reader-source-'));
  roots.push(root);
  const managedRoot = join(root, 'managed');
  const bytes = Buffer.from('%PDF-1.7\nreader-content-source\n%%EOF');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const objectPath = join(managedRoot, ...objectKey.split('/'));
  await mkdir(join(objectPath, '..'), { recursive: true });
  await writeFile(objectPath, bytes);
  const database = makeResearchDatabase(() => '2026-08-30T12:00:00.000Z');
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: hash, byteSize: bytes.length, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'source.pdf'),
      resolvedPath: objectPath,
      objectKey,
      state: 'available',
    },
  );
  return {
    ...database,
    bytes,
    hash,
    managedRoot,
    objectPath,
    source: new ReaderContentSource(database.repo, () => managedRoot),
  };
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('reader content source', () => {
  it('只从 Repository 中的 Asset 位置解析内容并按范围流式读取', async () => {
    const { source, bytes, hash } = await fixture();

    const content = await source.resolve('asset-1');
    expect(content).toMatchObject({
      assetId: 'asset-1',
      contentHash: hash,
      byteSize: bytes.length,
      mimeType: 'application/pdf',
    });
    const stream = content.open({ start: 0, end: 4 });
    expect(source.activeStreams).toBe(1);
    expect(await readStream(stream)).toEqual(bytes.subarray(0, 5));
    expect(source.activeStreams).toBe(0);
  });

  it('托管对象路径越界时不读取文件', async () => {
    const { sqlite, source, managedRoot } = await fixture();
    sqlite
      .prepare(
        `UPDATE research_asset_locations
         SET object_key = '../outside.pdf', resolved_path = ?
         WHERE id = 'location-1'`,
      )
      .run(join(managedRoot, '..', 'outside.pdf'));

    await expect(source.resolve('asset-1')).rejects.toMatchObject({
      code: 'READER_ASSET_UNAVAILABLE',
      status: 409,
    });
  });

  it('首选位置缺失时回退到同一 Asset 的可用链接位置', async () => {
    const value = await fixture();
    const linkedPath = join(value.managedRoot, '..', 'linked.pdf');
    await writeFile(linkedPath, value.bytes);
    await value.repo.storeAsset(
      {
        id: 'asset-duplicate',
        contentHash: value.hash,
        byteSize: value.bytes.length,
        mimeType: 'application/pdf',
      },
      {
        id: 'location-linked',
        mode: 'linked',
        originalPath: linkedPath,
        resolvedPath: linkedPath,
        objectKey: null,
        state: 'available',
      },
    );
    await rm(value.objectPath);

    const content = await value.source.resolve('asset-1');
    expect(await readStream(content.open())).toEqual(value.bytes);
    expect(value.source.activeStreams).toBe(0);
  });

  it('内容大小变化与回收状态返回明确错误', async () => {
    const changed = await fixture();
    await writeFile(join(changed.managedRoot, 'extra.pdf'), Buffer.from('other'));
    changed.sqlite
      .prepare("UPDATE research_assets SET byte_size = byte_size + 1 WHERE id = 'asset-1'")
      .run();
    await expect(changed.source.resolve('asset-1')).rejects.toMatchObject({
      code: 'READER_ASSET_UNAVAILABLE',
      message: 'PDF 文件内容已经变化，请先检查或重新定位',
    });

    const recycled = await fixture();
    recycled.sqlite
      .prepare("UPDATE research_assets SET state = 'recycled' WHERE id = 'asset-1'")
      .run();
    await expect(recycled.source.resolve('asset-1')).rejects.toMatchObject({
      code: 'READER_ASSET_RECYCLED',
    });
  });
});
