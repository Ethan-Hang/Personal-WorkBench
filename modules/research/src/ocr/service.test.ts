import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReaderContentSource } from '../reader/content-source.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { OcrEngineError, type OcrEngine, type OcrRecognitionOptions } from './engine.js';
import { ResearchOcrService } from './service.js';

const roots: string[] = [];
const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const services: ResearchOcrService[] = [];
let jobSequence = 0;

class FakeOcrEngine implements OcrEngine {
  calls = 0;

  constructor(
    private readonly texts: string[],
    private readonly delayMs = 0,
    private readonly failAtPage: number | null = null,
  ) {}

  async recognize(options: OcrRecognitionOptions): Promise<void> {
    this.calls += 1;
    await options.onMetadata(this.texts.length);
    for (let pageNumber = options.startPage; pageNumber <= this.texts.length; pageNumber += 1) {
      if (options.signal.aborted) throw new OcrEngineError('aborted', 'OCR_ABORTED');
      if (pageNumber === this.failAtPage) {
        throw new OcrEngineError('crashed', 'OCR_PDF_FAILED');
      }
      await options.onPage(
        {
          pageNumber,
          pageSize: { width: 612, height: 792 },
          text: this.texts[pageNumber - 1]!,
          positions: [],
        },
        this.texts.length,
      );
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-ocr-service-'));
  roots.push(root);
  const bytes = Buffer.from('fake PDF bytes for injected OCR engine');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const filePath = join(root, ...objectKey.split('/'));
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, bytes);
  const database = makeResearchDatabase();
  databases.push(database);
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: hash, byteSize: bytes.length, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'paper.pdf'),
      resolvedPath: filePath,
      objectKey,
      state: 'available',
    },
  );
  return {
    ...database,
    hash,
    root,
    source: new ReaderContentSource(database.repo, () => root),
  };
}

function makeService(
  value: Awaited<ReturnType<typeof fixture>>,
  engine: OcrEngine,
  options: {
    engineVersion?: string;
    beforeRun?: () => Promise<void> | void;
    afterRun?: () => Promise<void> | void;
  } = {},
) {
  const service = new ResearchOcrService(value.repo, value.source, {
    engine,
    engineName: 'test-ocr',
    engineVersion: options.engineVersion ?? '1',
    languagePackVersion: 'packs-1',
    cacheRoot: () => join(value.root, 'ocr-cache'),
    createId: () => `ocr-${++jobSequence}-${options.engineVersion ?? '1'}`,
    yieldMs: 0,
    ...(options.beforeRun ? { beforeRun: options.beforeRun } : {}),
    ...(options.afterRun ? { afterRun: options.afterRun } : {}),
  });
  services.push(service);
  return service;
}

async function waitFor(
  service: ResearchOcrService,
  predicate: (job: Awaited<ReturnType<ResearchOcrService['get']>>) => boolean,
) {
  const deadline = performance.now() + 5_000;
  let last = await service.get('asset-1');
  while (performance.now() < deadline) {
    last = await service.get('asset-1');
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`OCR job timed out: ${JSON.stringify(last)}`);
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  databases.splice(0).forEach((database) => database.sqlite.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ResearchOcrService', () => {
  it('明确确认后逐页索引中英文，并用相同版本缓存避免重复识别', async () => {
    const value = await fixture();
    const engine = new FakeOcrEngine(['English OCR evidence', '扫描页 中文 证据']);
    const events: string[] = [];
    const service = makeService(value, engine, {
      beforeRun: () => {
        events.push('suspend-index');
      },
      afterRun: () => {
        events.push('resume-index');
      },
    });
    await service.start('asset-1', { languages: ['eng', 'chi_sim'], confirmed: true });
    await expect(waitFor(service, (job) => job?.status === 'completed')).resolves.toMatchObject({
      processedPages: 2,
      totalPages: 2,
    });
    await expect(
      value.repo.searchPageText({ query: 'evidence', assetId: 'asset-1', limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ source: 'ocr', pageNumber: 1 })]);

    await service.start('asset-1', { languages: ['chi_sim', 'eng'], confirmed: true });
    await expect(waitFor(service, (job) => job?.status === 'completed')).resolves.toMatchObject({
      processedPages: 2,
    });
    expect(engine.calls).toBe(1);
    expect(events).toEqual(['suspend-index', 'resume-index', 'suspend-index', 'resume-index']);
  });

  it('拒绝并发任务，暂停在 250 ms 内收敛并从 checkpoint 恢复', async () => {
    const value = await fixture();
    const engine = new FakeOcrEngine(
      Array.from({ length: 12 }, (_, index) => `page ${index + 1} OCR`),
      20,
    );
    const service = makeService(value, engine);
    await service.start('asset-1', { languages: ['eng'], confirmed: true });
    await expect(
      service.start('asset-1', { languages: ['eng'], confirmed: true }),
    ).rejects.toMatchObject({ code: 'READER_OCR_BUSY', status: 409 });
    await waitFor(service, (job) => (job?.processedPages ?? 0) >= 2);
    const started = performance.now();
    const paused = await service.pause('asset-1');
    expect(performance.now() - started).toBeLessThan(250);
    expect(paused.status).toBe('paused');
    const checkpoint = paused.nextPage;
    await service.resume('asset-1');
    const completed = await waitFor(service, (job) => job?.status === 'completed');
    expect(completed?.nextPage).toBe(13);
    expect(checkpoint).toBeGreaterThan(1);
  });

  it('服务重启把运行任务标成 interrupted 并从最后成功页续建', async () => {
    const value = await fixture();
    const first = makeService(value, new FakeOcrEngine(['one', 'two', 'three', 'four'], 20));
    await first.start('asset-1', { languages: ['eng'], confirmed: true });
    await waitFor(first, (job) => (job?.processedPages ?? 0) >= 2);
    await first.shutdown();
    await expect(first.get('asset-1')).resolves.toMatchObject({ status: 'interrupted' });

    const second = makeService(value, new FakeOcrEngine(['one', 'two', 'three', 'four']));
    await second.recoverInterruptedJobs();
    await expect(waitFor(second, (job) => job?.status === 'completed')).resolves.toMatchObject({
      processedPages: 4,
    });
  });

  it('引擎版本变化移除旧 OCR 索引，失败可从头重建，并调用后台互斥钩子', async () => {
    const value = await fixture();
    const events: string[] = [];
    const first = makeService(value, new FakeOcrEngine(['old OCR token']), {
      beforeRun: () => {
        events.push('suspend-index');
      },
      afterRun: () => {
        events.push('resume-index');
      },
    });
    await first.start('asset-1', { languages: ['eng'], confirmed: true });
    await waitFor(first, (job) => job?.status === 'completed');

    const failed = makeService(value, new FakeOcrEngine(['new OCR token'], 0, 1), {
      engineVersion: '2',
    });
    await failed.start('asset-1', { languages: ['eng'], confirmed: true });
    await waitFor(failed, (job) => job?.status === 'failed');
    await expect(
      value.repo.searchPageText({ query: 'old', assetId: 'asset-1', limit: 10 }),
    ).resolves.toHaveLength(0);

    const rebuilt = makeService(value, new FakeOcrEngine(['new OCR token']), {
      engineVersion: '2',
    });
    await rebuilt.rebuild('asset-1', { languages: ['eng'], confirmed: true });
    await waitFor(rebuilt, (job) => job?.status === 'completed');
    await expect(
      value.repo.searchPageText({ query: 'new', assetId: 'asset-1', limit: 10 }),
    ).resolves.toHaveLength(1);
    expect(events).toEqual(['suspend-index', 'resume-index']);
  });
});
