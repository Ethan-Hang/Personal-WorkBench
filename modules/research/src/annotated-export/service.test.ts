import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ResearchAnnotationService } from '../annotation/service.js';
import type { Annotation } from '../contract.js';
import type { AnnotatedPdfWriteResult, AnnotatedPdfWriter } from '../interop/annotated-export.js';
import { planAnnotatedPdfExport } from '../interop/annotated-export.js';
import { ReaderContentSource } from '../reader/content-source.js';
import type { PdfOutputDialog } from '../server/file-picker.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { ResearchAnnotatedExportService } from './service.js';

const roots: string[] = [];
const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const services: ResearchAnnotatedExportService[] = [];
let exportSequence = 0;

class FakeWriter implements AnnotatedPdfWriter {
  mode: 'normal' | 'wait' | 'change-source' = 'normal';

  async inspect(sourcePath: string) {
    return { pageCount: 2, sourceBytes: (await stat(sourcePath)).size };
  }

  async write(input: {
    sourcePath: string;
    targetPath: string;
    sourceHash: string;
    annotations: Annotation[];
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => Promise<void> | void;
  }): Promise<AnnotatedPdfWriteResult> {
    if (this.mode === 'wait') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 5_000);
        input.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('cancelled', 'AbortError'));
          },
          { once: true },
        );
      });
    }
    if (input.signal.aborted) throw new DOMException('cancelled', 'AbortError');
    const source = await readFile(input.sourcePath);
    const output = Buffer.from(`annotated:${input.annotations.map((value) => value.id).join(',')}`);
    await writeFile(input.targetPath, output, { flag: 'wx' });
    await input.onProgress?.(input.annotations.length, input.annotations.length);
    if (this.mode === 'change-source') {
      const changed = Buffer.from(source);
      changed[changed.length - 1] = changed[changed.length - 1] === 0x41 ? 0x42 : 0x41;
      await writeFile(input.sourcePath, changed);
    }
    return {
      pageCount: 2,
      sourceBytes: source.length,
      outputBytes: output.length,
      outputHash: createHash('sha256').update(output).digest('hex'),
      outputReadable: true,
      fullRewrite: true,
      decisions: planAnnotatedPdfExport(input.annotations, 2, input.sourceHash),
      warnings: ['测试写入器使用完整重写'],
    };
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-annotated-export-service-'));
  roots.push(root);
  const managedRoot = join(root, 'managed');
  const source = makePdfFixture();
  const hash = createHash('sha256').update(source).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const sourcePath = join(managedRoot, ...objectKey.split('/'));
  await mkdir(join(sourcePath, '..'), { recursive: true });
  await writeFile(sourcePath, source);
  const database = makeResearchDatabase();
  databases.push(database);
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: hash, byteSize: source.length, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'paper.pdf'),
      resolvedPath: sourcePath,
      objectKey,
      state: 'available',
    },
  );
  const annotations = new ResearchAnnotationService(database.repo, {
    createId: (() => {
      let sequence = 0;
      return () => `annotation-${++sequence}`;
    })(),
  });
  const context = await annotations.createContext({
    name: '复现',
    description: null,
    color: '#2563eb',
  });
  const anchor = {
    pageNumber: 1,
    pageSize: { width: 612, height: 792 },
    rect: null,
    quads: [{ x1: 72, y1: 700, x2: 180, y2: 700, x3: 72, y3: 684, x4: 180, y4: 684 }],
    textQuote: {
      exact: 'selected research text',
      prefix: '',
      suffix: '',
      fingerprint: 'c'.repeat(64),
    },
    assetHash: hash,
    editionId: null,
  };
  await annotations.createAnnotation('asset-1', {
    contextId: null,
    kind: 'highlight',
    anchor,
    body: '通用批注正文不得进入报告',
    color: '#facc15',
  });
  await annotations.createAnnotation('asset-1', {
    contextId: context.id,
    kind: 'underline',
    anchor,
    body: '上下文批注正文不得进入报告',
    color: '#2563eb',
  });
  const writer = new FakeWriter();
  const revealed: string[] = [];
  const dialog: PdfOutputDialog = {
    savePdf: async () => join(root, 'picked'),
    reveal: async (filePath) => {
      revealed.push(filePath);
      return true;
    },
  };
  const service = new ResearchAnnotatedExportService(
    database.repo,
    new ReaderContentSource(database.repo, () => managedRoot),
    dialog,
    { writer, createId: () => `export-${++exportSequence}` },
  );
  services.push(service);
  return {
    ...database,
    root,
    source,
    sourcePath,
    hash,
    contextId: context.id,
    writer,
    service,
    revealed,
  };
}

async function waitFor(service: ResearchAnnotatedExportService, id: string, statuses: string[]) {
  const deadline = performance.now() + 5_000;
  let job = await service.get(id);
  while (performance.now() < deadline) {
    job = await service.get(id);
    if (statuses.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`annotated export timed out: ${JSON.stringify(job)}`);
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  databases.splice(0).forEach((database) => database.sqlite.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ResearchAnnotatedExportService', () => {
  it('按当前可见层预览并发布新副本，报告只含批注身份和处理方式', async () => {
    const value = await fixture();
    await expect(
      value.service.pickTarget({ suggestedName: 'paper-annotated.pdf' }),
    ).resolves.toEqual({ path: join(value.root, 'picked.pdf'), cancelled: false });
    const targetPath = join(value.root, 'annotated.pdf');
    const preview = await value.service.preview('asset-1', {
      includeGeneral: false,
      contextIds: [value.contextId],
      targetPath,
    });
    expect(preview).toMatchObject({
      annotationCount: 1,
      standardCount: 1,
      flattenedCount: 0,
      skippedCount: 0,
      targetExists: false,
    });

    const started = await value.service.start('asset-1', {
      includeGeneral: true,
      contextIds: [value.contextId],
      targetPath,
      overwriteConfirmed: false,
    });
    const completed = await waitFor(value.service, started.id, ['completed']);
    expect(completed).toMatchObject({
      status: 'completed',
      completedAnnotations: 2,
      report: {
        sourceHashUnchanged: true,
        outputReadable: true,
        standardCount: 2,
        fullRewrite: true,
      },
    });
    expect(await readFile(value.sourcePath)).toEqual(value.source);
    expect(await readFile(targetPath, 'utf8')).toContain('annotation-2,annotation-3');
    expect(JSON.stringify(completed.report)).not.toContain('批注正文');
    await expect(value.service.openLocation(started.id)).resolves.toEqual({ opened: true });
    expect(value.revealed).toEqual([targetPath]);
  });

  it('拒绝原文件路径和未确认覆盖；确认后原子替换已有目标', async () => {
    const value = await fixture();
    await expect(
      value.service.start('asset-1', {
        includeGeneral: true,
        contextIds: [],
        targetPath: value.sourcePath,
        overwriteConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'READER_EXPORT_FAILED', status: 409 });

    const sourceAlias = join(value.root, 'source-alias.pdf');
    await link(value.sourcePath, sourceAlias);
    await expect(
      value.service.start('asset-1', {
        includeGeneral: true,
        contextIds: [],
        targetPath: sourceAlias,
        overwriteConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'READER_EXPORT_FAILED', status: 409 });

    const targetPath = join(value.root, 'existing.pdf');
    await writeFile(targetPath, 'keep-me');
    await expect(
      value.service.start('asset-1', {
        includeGeneral: true,
        contextIds: [],
        targetPath,
        overwriteConfirmed: false,
      }),
    ).rejects.toMatchObject({ code: 'READER_EXPORT_TARGET_EXISTS', status: 409 });
    expect(await readFile(targetPath, 'utf8')).toBe('keep-me');

    const started = await value.service.start('asset-1', {
      includeGeneral: true,
      contextIds: [],
      targetPath,
      overwriteConfirmed: true,
    });
    await waitFor(value.service, started.id, ['completed']);
    expect(await readFile(targetPath, 'utf8')).toContain('annotated:annotation-2');
    await expect(
      stat(join(value.root, `.${basename(targetPath)}.backup-${started.id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('取消清理临时文件，并持久化重试时的覆盖确认', async () => {
    const value = await fixture();
    value.writer.mode = 'wait';
    const targetPath = join(value.root, 'retry.pdf');
    const started = await value.service.start('asset-1', {
      includeGeneral: true,
      contextIds: [],
      targetPath,
      overwriteConfirmed: false,
    });
    await waitFor(value.service, started.id, ['running']);
    const cancelled = await value.service.cancel(started.id);
    expect(cancelled.status).toBe('cancelled');
    await expect(
      stat(join(value.root, `.${basename(targetPath)}.tmp-${started.id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(targetPath, 'existing');
    value.writer.mode = 'normal';
    const retried = await value.service.retry(started.id, { overwriteConfirmed: true });
    expect(retried.options.overwriteConfirmed).toBe(true);
    await waitFor(value.service, started.id, ['completed']);
    const stored = await value.repo.getAnnotatedExportJob(started.id);
    expect(JSON.parse(stored!.optionsJson).input.overwriteConfirmed).toBe(true);
  });

  it('并发启动只保留一个任务，服务关闭把在途任务标为 interrupted', async () => {
    const value = await fixture();
    value.writer.mode = 'wait';
    const outcomes = await Promise.allSettled([
      value.service.start('asset-1', {
        includeGeneral: true,
        contextIds: [],
        targetPath: join(value.root, 'first.pdf'),
        overwriteConfirmed: false,
      }),
      value.service.start('asset-1', {
        includeGeneral: true,
        contextIds: [],
        targetPath: join(value.root, 'second.pdf'),
        overwriteConfirmed: false,
      }),
    ]);
    const started = outcomes.find(
      (
        outcome,
      ): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof value.service.start>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(started?.value.status).toBe('queued');
    expect(rejected?.reason).toMatchObject({ code: 'READER_EXPORT_BUSY', status: 409 });
    await waitFor(value.service, started!.value.id, ['running']);
    await value.service.shutdown();
    await expect(value.service.get(started!.value.id)).resolves.toMatchObject({
      status: 'interrupted',
      errorCode: 'SERVER_STOPPED',
      completedAt: null,
    });
  });

  it('写入期间源文件变化会保留既有目标并清理临时文件', async () => {
    const value = await fixture();
    value.writer.mode = 'change-source';
    const targetPath = join(value.root, 'protected.pdf');
    await writeFile(targetPath, 'original-target');
    const started = await value.service.start('asset-1', {
      includeGeneral: true,
      contextIds: [],
      targetPath,
      overwriteConfirmed: true,
    });
    const failed = await waitFor(value.service, started.id, ['failed']);
    expect(failed.errorCode).toBe('READER_EXPORT_FAILED');
    expect(await readFile(targetPath, 'utf8')).toBe('original-target');
    await expect(
      stat(join(value.root, `.${basename(targetPath)}.tmp-${started.id}`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('恢复中断任务只清理符合命名规则的同目录临时文件', async () => {
    const value = await fixture();
    const safeTarget = join(value.root, 'safe.pdf');
    const safeTemp = join(value.root, '.safe.pdf.tmp-recover-safe');
    const unsafeTemp = join(value.root, 'do-not-delete.txt');
    await Promise.all([writeFile(safeTemp, 'temp'), writeFile(unsafeTemp, 'keep')]);
    for (const [id, targetPath, tempPath] of [
      ['recover-safe', safeTarget, safeTemp],
      ['recover-unsafe', join(value.root, 'unsafe.pdf'), unsafeTemp],
    ] as const) {
      await value.repo.createAnnotatedExportJob({
        id,
        assetId: 'asset-1',
        optionsJson: JSON.stringify({
          input: {
            includeGeneral: true,
            contextIds: [],
            targetPath,
            overwriteConfirmed: false,
          },
          sourceHash: value.hash,
        }),
        targetPath,
        tempPath,
        totalAnnotations: 1,
      });
    }
    await value.service.recoverInterruptedJobs();
    await expect(stat(safeTemp)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(unsafeTemp, 'utf8')).resolves.toBe('keep');
    await expect(value.repo.getAnnotatedExportJob('recover-safe')).resolves.toMatchObject({
      status: 'interrupted',
      errorCode: 'PROCESS_RESTARTED',
    });
  });
});
