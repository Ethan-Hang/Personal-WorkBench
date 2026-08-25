import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  collectionViewSchema,
  searchIndexRebuildResponseSchema,
  worksPageResponseSchema,
} from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-search-routes-'));
  roots.push(root);
  const database = makeResearchDatabase();
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => join(root, 'managed'),
    contentStore: new ResearchContentStore(() => join(root, 'managed')),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app };
}

const filters = {
  collectionIds: [],
  tagIds: [],
  types: [],
  yearFrom: 2025,
  yearTo: null,
  attachmentRoles: [],
  storageModes: [],
  fileStatuses: [],
  maintenance: [],
  relatedWorkId: null,
};

describe('research search routes', () => {
  it('搜索、保存智能目录、重跑和索引重建使用同一版本化契约', async () => {
    const { app, sqlite } = await fixture();
    try {
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workManual,
        payload: {
          title: 'Searchable API Work',
          type: 'article',
          year: 2026,
          authors: ['Ada Lovelace'],
          editionKind: 'journal',
          publicationTitle: 'API Journal',
          publisher: null,
          identifiers: [],
          collectionIds: [],
        },
      });
      const ast = { version: 1, text: 'Lovelce', filters, sort: 'relevance' };
      const searched = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workSearch,
        payload: { ast, cursor: null, limit: 20 },
      });
      expect(searched.statusCode).toBe(200);
      expect(worksPageResponseSchema.parse(searched.json()).works).toHaveLength(1);

      const savedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.savedQueries,
        payload: { name: 'Recent API papers', parentId: null, ast },
      });
      expect(savedResponse.statusCode).toBe(201);
      const saved = collectionViewSchema.parse(savedResponse.json());
      expect(saved.kind).toBe('smart');
      const rerun = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.savedQueryRun(saved.id),
      });
      expect(worksPageResponseSchema.parse(rerun.json()).works).toHaveLength(1);

      const rebuilt = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.searchIndexRebuild,
      });
      expect(searchIndexRebuildResponseSchema.parse(rebuilt.json()).indexedWorks).toBe(1);

      sqlite
        .prepare('UPDATE research_collections SET query_json = \'{"version":99}\' WHERE id = ?')
        .run(saved.id);
      const unsupported = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.savedQueryRun(saved.id),
      });
      expect(unsupported.statusCode).toBe(409);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
