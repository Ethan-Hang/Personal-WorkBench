import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { RESEARCH_API_V1, ocrJobSchema } from '../contract.js';
import type { OcrEngine, OcrRecognitionOptions } from '../ocr/engine.js';
import {
  TextIndexExtractionError,
  type PageTextExtractionOptions,
  type PageTextExtractor,
} from '../reader/text-index.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

interface Activities {
  text: boolean;
  ocr: boolean;
  overlap: boolean;
}

class SlowTextExtractor implements PageTextExtractor {
  constructor(private readonly activities: Activities) {}

  async extract(options: PageTextExtractionOptions): Promise<void> {
    this.activities.text = true;
    try {
      await options.onMetadata(20);
      for (let pageNumber = options.startPage; pageNumber <= 20; pageNumber += 1) {
        if (options.signal.aborted) {
          throw new TextIndexExtractionError('aborted', 'TEXT_INDEX_ABORTED');
        }
        if (this.activities.ocr) this.activities.overlap = true;
        await options.onPage(
          {
            pageNumber,
            pageSize: { width: 612, height: 792 },
            text: pageNumber === 1 ? '' : `native page ${pageNumber}`,
            positions: [],
          },
          20,
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      this.activities.text = false;
    }
  }
}

class RouteOcrEngine implements OcrEngine {
  constructor(private readonly activities: Activities) {}

  async recognize(options: OcrRecognitionOptions): Promise<void> {
    if (this.activities.text) this.activities.overlap = true;
    this.activities.ocr = true;
    try {
      await options.onMetadata(2);
      for (let pageNumber = options.startPage; pageNumber <= 2; pageNumber += 1) {
        await options.onPage(
          {
            pageNumber,
            pageSize: { width: 612, height: 792 },
            text: `route OCR searchable page ${pageNumber}`,
            positions: [],
          },
          2,
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } finally {
      this.activities.ocr = false;
    }
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-ocr-routes-'));
  roots.push(root);
  const bytes = Buffer.from('route OCR fake PDF');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const filePath = join(root, ...objectKey.split('/'));
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, bytes);
  const database = makeResearchDatabase();
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
  const activities = { text: false, ocr: false, overlap: false };
  let sequence = 0;
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => root,
    textIndexExtractor: new SlowTextExtractor(activities),
    textIndexParserVersion: 'route-text-v1',
    ocrEngine: new RouteOcrEngine(activities),
    ocrEngineVersion: 'route-ocr-v1',
    ocrLanguagePackVersion: 'route-packs-v1',
    ocrCacheRoot: () => join(root, 'ocr-cache'),
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
    createId: () => `ocr-route-${++sequence}`,
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, activities, app };
}

async function waitForOcr(app: Awaited<ReturnType<typeof buildApp>>, status: string) {
  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    const response = await app.inject({ method: 'GET', url: RESEARCH_API_V1.assetOcr('asset-1') });
    if (response.json().job?.status === status) return ocrJobSchema.parse(response.json().job);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`OCR route did not reach ${status}`);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('research OCR routes', () => {
  it('要求显式确认，返回进度，并把 OCR 文本接入正式搜索路由', async () => {
    const { app, sqlite } = await fixture();
    try {
      const empty = await app.inject({ method: 'GET', url: RESEARCH_API_V1.assetOcr('asset-1') });
      expect(empty.json()).toEqual({ job: null });
      const unconfirmed = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetOcrStart('asset-1'),
        payload: { languages: ['eng'], confirmed: false },
      });
      expect(unconfirmed.statusCode).toBe(400);

      const started = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetOcrStart('asset-1'),
        payload: { languages: ['eng', 'chi_sim'], confirmed: true },
      });
      expect(started.statusCode).toBe(200);
      expect(ocrJobSchema.parse(started.json())).toMatchObject({ assetId: 'asset-1' });
      await expect(waitForOcr(app, 'completed')).resolves.toMatchObject({ processedPages: 2 });

      const search = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.pageTextSearch}?query=searchable&assetId=asset-1`,
      });
      expect(search.json().results).toEqual([
        expect.objectContaining({ pageNumber: 1, source: 'ocr' }),
        expect.objectContaining({ pageNumber: 2, source: 'ocr' }),
      ]);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('OCR 启动前暂停全文索引，同一时刻只运行一个后台重任务', async () => {
    const { activities, app, sqlite } = await fixture();
    try {
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
        payload: { priorityPage: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetOcrStart('asset-1'),
        payload: { languages: ['eng'], confirmed: true },
      });
      await waitForOcr(app, 'completed');
      const textIndex = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetTextIndex('asset-1'),
      });
      expect(textIndex.json().job).toMatchObject({ status: 'paused', errorCode: 'OCR_ACTIVE' });
      expect(activities.overlap).toBe(false);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
