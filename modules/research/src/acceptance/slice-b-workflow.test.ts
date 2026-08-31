import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  annotationSchema,
  pageTextSearchResponseSchema,
  readingContextSchema,
  textIndexJobSchema,
  type TextIndexJob,
} from '../contract.js';
import { TextIndexExtractionError, type PageTextExtractor } from '../reader/text-index.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from '../server/index.js';

const roots: string[] = [];

class AcceptanceExtractor implements PageTextExtractor {
  constructor(
    private readonly totalPages: number,
    private readonly delayMs: number,
  ) {}

  async extract(options: Parameters<PageTextExtractor['extract']>[0]): Promise<void> {
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
          pageSize: { width: 612, height: 792 },
          text: `slice B searchable evidence page ${pageNumber}`,
          positions: [{ start: 8, end: 18, x: 72, y: 700, width: 70, height: 12 }],
        },
        this.totalPages,
      );
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }
}

async function waitForJob(
  app: Awaited<ReturnType<typeof buildApp>>,
  predicate: (job: TextIndexJob) => boolean,
): Promise<TextIndexJob> {
  const deadline = performance.now() + 5_000;
  let lastJob: TextIndexJob | null = null;
  while (performance.now() < deadline) {
    const response = await app.inject({
      method: 'GET',
      url: RESEARCH_API_V1.assetTextIndex('asset-1'),
    });
    const job = textIndexJobSchema.parse(response.json().job);
    lastJob = job;
    if (predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`slice B text index timed out: ${JSON.stringify(lastJob)}`);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('slice B reading workflow', () => {
  it('贯通上下文批注、tombstone、目录默认层和可恢复正文检索', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-slice-b-'));
    roots.push(root);
    const bytes = Buffer.from('slice B injected PDF bytes');
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
    await database.repo.createCollection({
      id: 'collection-1',
      parentId: null,
      name: 'Thesis',
      normalizedName: 'thesis',
      sortOrder: 0,
    });
    let sequence = 0;
    const build = async (extractor: PageTextExtractor, parserVersion: string) => {
      const module = createResearchServerModule({
        repository: database.repo,
        managedRoot: () => root,
        textIndexExtractor: extractor,
        textIndexParserVersion: parserVersion,
        metadata: { resolve: async () => undefined } as never,
        filePicker: { pick: async () => [] },
        createId: () => `slice-b-${++sequence}`,
      });
      return buildApp({ getSqlite: () => database.sqlite, modules: [module] });
    };
    const app = await build(new AcceptanceExtractor(12, 8), 'acceptance-v1');
    const anchor = (pageNumber: number) => ({
      pageNumber,
      pageSize: { width: 612, height: 792 },
      rect: null,
      quads: [{ x1: 72, y1: 710, x2: 180, y2: 710, x3: 72, y3: 695, x4: 180, y4: 695 }],
      textQuote: null,
      assetHash: hash,
      editionId: null,
    });
    try {
      const contexts = [];
      for (const name of ['Thesis review', 'Methods review']) {
        const response = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.readingContexts,
          payload: { name },
        });
        contexts.push(readingContextSchema.parse(response.json()));
      }
      const binding = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.collectionReadingContext('collection-1'),
        payload: { contextId: contexts[0]!.id },
      });
      expect(binding.json()).toMatchObject({ context: { id: contexts[0]!.id } });

      const created = [];
      for (const [index, contextId] of [null, contexts[0]!.id, contexts[1]!.id].entries()) {
        const response = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.assetAnnotations('asset-1'),
          payload: {
            contextId,
            kind: index === 2 ? 'area' : 'highlight',
            anchor:
              index === 2
                ? {
                    ...anchor(index + 1),
                    rect: { x: 72, y: 650, width: 120, height: 80 },
                    quads: [],
                  }
                : anchor(index + 1),
            body: `layer ${index}`,
            color: '#facc15',
          },
        });
        expect(response.statusCode, response.body).toBe(200);
        created.push(annotationSchema.parse(response.json()));
      }
      const layers = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.assetAnnotations('asset-1')}?contextIds=${contexts
          .map((context) => context.id)
          .join(',')}&includeGeneral=true`,
      });
      expect(layers.json()).toHaveLength(3);

      const deleted = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.annotation(created[1]!.id),
        payload: { expectedRevision: 1 },
      });
      const tombstone = annotationSchema.parse(deleted.json());
      expect(tombstone.status).toBe('deleted');
      const restored = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.annotationRestore(tombstone.id),
        payload: { expectedRevision: tombstone.revision },
      });
      expect(restored.json()).toMatchObject({ status: 'active', revision: 3 });

      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
        payload: { priorityPage: 7 },
      });
      await waitForJob(app, (job) => job.indexedPages >= 2);
    } finally {
      await app.close();
    }

    expect(await database.repo.getTextIndexJob('asset-1')).toMatchObject({
      status: 'interrupted',
    });
    const resumed = await build(new AcceptanceExtractor(12, 0), 'acceptance-v1');
    try {
      const completed = await waitForJob(resumed, (job) => job.status === 'completed');
      expect(completed).toMatchObject({ indexedPages: 12, nextPage: 13 });
      const search = await resumed.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.pageTextSearch}?query=evidence&assetId=asset-1`,
      });
      expect(pageTextSearchResponseSchema.parse(search.json()).results).toHaveLength(12);
    } finally {
      await resumed.close();
    }

    const upgraded = await build(new AcceptanceExtractor(12, 0), 'acceptance-v2');
    try {
      await upgraded.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
        payload: { priorityPage: 1 },
      });
      const rebuilt = await waitForJob(upgraded, (job) => job.status === 'completed');
      expect(rebuilt).toMatchObject({ parserVersion: 'acceptance-v2', indexedPages: 12 });
    } finally {
      await upgraded.close();
      database.sqlite.close();
    }
  });
});
