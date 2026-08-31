import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { RESEARCH_API_V1, pageTextSearchResponseSchema, textIndexJobSchema } from '../contract.js';
import type { PageTextExtractionOptions, PageTextExtractor } from '../reader/text-index.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { makePagedPdfFixture } from '../testing/pdf-fixture.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

class RouteExtractor implements PageTextExtractor {
  async extract(options: PageTextExtractionOptions): Promise<void> {
    await options.onMetadata(2);
    for (let pageNumber = options.startPage; pageNumber <= 2; pageNumber += 1) {
      await options.onPage(
        {
          pageNumber,
          text: `route searchable page ${pageNumber}`,
          pageSize: { width: 612, height: 792 },
          positions: [{ start: 6, end: 16, x: 72, y: 700, width: 60, height: 12 }],
        },
        2,
      );
    }
  }
}

async function fixture(options: { realWorker?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'research-text-index-routes-'));
  roots.push(root);
  const bytes = options.realWorker
    ? makePagedPdfFixture(3, (page) => `Production searchable document page ${page}`)
    : Buffer.from('route fake pdf bytes');
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
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => root,
    ...(options.realWorker
      ? {}
      : { textIndexExtractor: new RouteExtractor(), textIndexParserVersion: 'route-test-v1' }),
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('research text index routes', () => {
  it('正式服务组合使用真实 PDF.js 子进程完成索引', async () => {
    const { app, sqlite } = await fixture({ realWorker: true });
    try {
      const started = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
        payload: { priorityPage: 3 },
      });
      expect(started.statusCode).toBe(200);
      const deadline = performance.now() + 5_000;
      let status = '';
      while (performance.now() < deadline) {
        const response = await app.inject({
          method: 'GET',
          url: RESEARCH_API_V1.assetTextIndex('asset-1'),
        });
        status = response.json().job?.status ?? '';
        if (status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(status).toBe('completed');
      const search = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.pageTextSearch}?query=Production&assetId=asset-1`,
      });
      expect(pageTextSearchResponseSchema.parse(search.json()).results).toHaveLength(3);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('启动页级索引、查询进度并搜索当前 PDF', async () => {
    const { app, sqlite } = await fixture();
    try {
      const empty = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetTextIndex('asset-1'),
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ job: null });

      const started = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
        payload: { priorityPage: 2 },
      });
      expect(started.statusCode).toBe(200);
      expect(textIndexJobSchema.parse(started.json())).toMatchObject({ assetId: 'asset-1' });

      let job = null;
      const deadline = performance.now() + 3_000;
      while (performance.now() < deadline) {
        const response = await app.inject({
          method: 'GET',
          url: RESEARCH_API_V1.assetTextIndex('asset-1'),
        });
        job = response.json().job;
        if (job?.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(textIndexJobSchema.parse(job)).toMatchObject({
        status: 'completed',
        indexedPages: 2,
        nextPage: 3,
      });

      const search = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.pageTextSearch}?query=searchable&assetId=asset-1`,
      });
      expect(search.statusCode).toBe(200);
      expect(pageTextSearchResponseSchema.parse(search.json()).results).toHaveLength(2);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('拒绝空查询并为不存在的索引任务返回明确错误', async () => {
    const { app, sqlite } = await fixture();
    try {
      const invalid = await app.inject({ method: 'GET', url: RESEARCH_API_V1.pageTextSearch });
      expect(invalid.statusCode).toBe(400);

      const missing = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexResume('asset-1'),
        payload: {},
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: 'READER_INDEX_NOT_FOUND' });
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
