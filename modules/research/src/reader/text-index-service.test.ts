import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { ReaderContentSource } from './content-source.js';
import { ResearchTextIndexService } from './text-index-service.js';
import {
  TextIndexExtractionError,
  type PageTextExtractionOptions,
  type PageTextExtractor,
} from './text-index.js';

const roots: string[] = [];
const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const services: ResearchTextIndexService[] = [];

class FakeExtractor implements PageTextExtractor {
  readonly starts: number[] = [];

  constructor(
    private readonly totalPages: number,
    private readonly delayMs = 0,
    private readonly empty = false,
  ) {}

  async extract(options: PageTextExtractionOptions): Promise<void> {
    this.starts.push(options.startPage);
    await options.onMetadata(this.totalPages);
    const pages = [];
    if (
      options.priorityPage !== null &&
      options.priorityPage >= options.startPage &&
      options.priorityPage <= this.totalPages
    ) {
      pages.push(options.priorityPage);
    }
    for (let page = options.startPage; page <= this.totalPages; page += 1) pages.push(page);
    for (const pageNumber of new Set(pages)) {
      if (options.signal.aborted) {
        throw new TextIndexExtractionError('aborted', 'TEXT_INDEX_ABORTED');
      }
      await options.onPage(
        {
          pageNumber,
          text: this.empty ? '' : `page ${pageNumber} durable searchable research text`,
          pageSize: { width: 612, height: 792 },
          positions: this.empty ? [] : [{ start: 0, end: 4, x: 10, y: 700, width: 20, height: 10 }],
        },
        this.totalPages,
      );
      if (this.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      }
    }
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-text-index-service-'));
  roots.push(root);
  const bytes = Buffer.from('fake pdf bytes for injected extractor');
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
    source: new ReaderContentSource(database.repo, () => root),
  };
}

async function waitFor(
  service: ResearchTextIndexService,
  predicate: (job: Awaited<ReturnType<ResearchTextIndexService['get']>>) => boolean,
) {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const job = await service.get('asset-1');
    if (predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('text index state timed out');
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  databases.splice(0).forEach((database) => database.sqlite.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('research text index service', () => {
  it('暂停后保留逐页 checkpoint，并从下一缺页恢复', async () => {
    const value = await fixture();
    const extractor = new FakeExtractor(8, 15);
    const service = new ResearchTextIndexService(value.repo, value.source, {
      extractor,
      parserVersion: 'test-v1',
      yieldMs: 0,
    });
    services.push(service);

    await service.start('asset-1', { priorityPage: 1 });
    await waitFor(service, (job) => (job?.indexedPages ?? 0) >= 1);
    const paused = await service.pause('asset-1');
    expect(paused).toMatchObject({ status: 'paused', indexedPages: expect.any(Number) });
    const nextPage = paused.nextPage;

    await service.resume('asset-1', { priorityPage: null });
    const completed = await waitFor(service, (job) => job?.status === 'completed');
    expect(completed).toMatchObject({ indexedPages: 8, nextPage: 9, totalPages: 8 });
    expect(extractor.starts).toEqual([1, nextPage]);
  });

  it('进程重启把 running 标成 interrupted 后自动从 checkpoint 续建', async () => {
    const value = await fixture();
    await value.repo.resetTextIndexJob({
      assetId: 'asset-1',
      assetHash: value.hash,
      parserVersion: 'test-v1',
    });
    await value.repo.setTextIndexJobStatus('asset-1', 'running');
    await value.repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 1,
      totalPages: 3,
      source: 'pdf',
      contentHash: value.hash,
      textContent: 'page 1 durable searchable research text',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'test-v1',
    });
    const extractor = new FakeExtractor(3);
    const service = new ResearchTextIndexService(value.repo, value.source, {
      extractor,
      parserVersion: 'test-v1',
      yieldMs: 0,
    });
    services.push(service);

    await service.recoverInterruptedJobs();
    await waitFor(service, (job) => job?.status === 'completed');
    expect(extractor.starts).toEqual([2]);
  });

  it('parser 版本变化清除旧派生页并完整重建', async () => {
    const value = await fixture();
    const firstExtractor = new FakeExtractor(2);
    const first = new ResearchTextIndexService(value.repo, value.source, {
      extractor: firstExtractor,
      parserVersion: 'test-v1',
      yieldMs: 0,
    });
    services.push(first);
    await first.start('asset-1', { priorityPage: null });
    await waitFor(first, (job) => job?.status === 'completed');

    const secondExtractor = new FakeExtractor(2);
    const second = new ResearchTextIndexService(value.repo, value.source, {
      extractor: secondExtractor,
      parserVersion: 'test-v2',
      yieldMs: 0,
    });
    services.push(second);
    await second.start('asset-1', { priorityPage: 2 });
    const rebuilt = await waitFor(second, (job) => job?.status === 'completed');
    expect(rebuilt).toMatchObject({ parserVersion: 'test-v2', indexedPages: 2 });
    expect(secondExtractor.starts).toEqual([1]);
  });

  it('无文本 PDF 标成 ocr-recommended，不伪装为已完成索引', async () => {
    const value = await fixture();
    const service = new ResearchTextIndexService(value.repo, value.source, {
      extractor: new FakeExtractor(5, 0, true),
      parserVersion: 'test-v1',
      yieldMs: 0,
    });
    services.push(service);
    await service.start('asset-1', { priorityPage: null });
    const job = await waitFor(service, (candidate) => candidate?.status === 'ocr-recommended');
    expect(job).toMatchObject({ indexedPages: 5, textCharacters: 0, errorCode: 'OCR_RECOMMENDED' });
  });
});
