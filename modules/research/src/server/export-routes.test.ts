import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  canonicalImportPreviewSchema,
  canonicalImportReportSchema,
  portableExportJobSchema,
  portableExportPreviewSchema,
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
  const root = await mkdtemp(join(tmpdir(), 'research-export-routes-'));
  roots.push(root);
  const database = makeResearchDatabase();
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => join(root, 'managed'),
    contentStore: new ResearchContentStore(() => join(root, 'managed')),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
    documentDialog: {
      saveDocument: async () => null,
      pickDocument: async () => join(root, 'library.json'),
    },
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, root, app };
}

describe('research portable export routes', () => {
  it('canonical 恢复 API 选择来源、预览空库并提交事务导入', async () => {
    const { app, sqlite, root } = await fixture();
    const source = makeResearchDatabase(() => '2026-08-30T18:00:00.000Z');
    try {
      source.sqlite
        .prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, status, revision, created_at, updated_at)
           VALUES ('restored-work', 'article', 'Restored through API', 'restored through api',
                   'active', 1, ?, ?)`,
        )
        .run('2026-08-30T18:00:00.000Z', '2026-08-30T18:00:00.000Z');
      const canonical = await source.repo.exportCanonicalSnapshot('2026-08-30T18:00:00.000Z');
      const sourcePath = join(root, 'library.json');
      await writeFile(sourcePath, JSON.stringify(canonical));

      const picked = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.canonicalImportPickSource,
        payload: {},
      });
      expect(picked.statusCode).toBe(200);
      expect(picked.json()).toEqual({ path: sourcePath, cancelled: false });
      const preview = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.canonicalImportPreview,
        payload: { sourcePath },
      });
      expect(preview.statusCode).toBe(200);
      expect(canonicalImportPreviewSchema.parse(preview.json())).toMatchObject({
        schemaVersion: 3,
        targetEmpty: true,
        workCount: 1,
      });
      const restored = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.canonicalImports,
        payload: { sourcePath, confirmed: true },
      });
      expect(restored.statusCode).toBe(200);
      expect(canonicalImportReportSchema.parse(restored.json())).toMatchObject({
        importedWorks: 1,
        foreignKeysValid: true,
        roundTripValid: true,
      });
      expect(
        sqlite.prepare("SELECT title FROM research_works WHERE id = 'restored-work'").get(),
      ).toEqual({ title: 'Restored through API' });
    } finally {
      source.sqlite.close();
      await app.close();
      sqlite.close();
    }
  });

  it('预检、启动、轮询并原子发布 JSON-only 资料包', async () => {
    const { app, sqlite, root } = await fixture();
    try {
      const created = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workManual,
        payload: {
          title: 'Exported API Work',
          type: 'article',
          year: 2026,
          authors: ['API Author'],
          editionKind: 'journal',
          publicationTitle: 'Portable Journal',
          publisher: null,
          identifiers: [{ scheme: 'doi', value: '10.1000/export-api' }],
          collectionIds: [],
        },
      });
      expect(created.statusCode).toBe(201);

      const targetPath = join(root, 'api-export');
      const previewResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.exportPreview,
        payload: {
          targetPath,
          includeManagedFiles: false,
          includeLinkedFiles: false,
        },
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(portableExportPreviewSchema.parse(previewResponse.json())).toMatchObject({
        workCount: 1,
        attachmentCount: 0,
        selectedAssetCount: 0,
        targetExists: false,
      });

      const startedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.exports,
        payload: {
          targetPath,
          includeManagedFiles: false,
          includeLinkedFiles: false,
        },
      });
      expect(startedResponse.statusCode).toBe(202);
      let job = portableExportJobSchema.parse(startedResponse.json());
      for (let attempt = 0; attempt < 50 && job.status === 'running'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const polled = await app.inject({
          method: 'GET',
          url: RESEARCH_API_V1.exportJob(job.id),
        });
        expect(polled.statusCode).toBe(200);
        job = portableExportJobSchema.parse(polled.json());
      }
      expect(job.status).toBe('completed');
      expect(job.report).toMatchObject({
        targetPath,
        roundTripValid: true,
        workCount: 1,
        attachmentCount: 0,
      });
      await Promise.all(
        ['library.json', 'manifest.json', 'report.json'].map((file) =>
          access(join(targetPath, file)),
        ),
      );

      const collision = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.exports,
        payload: {
          targetPath,
          includeManagedFiles: false,
          includeLinkedFiles: false,
        },
      });
      expect(collision.statusCode).toBe(409);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
