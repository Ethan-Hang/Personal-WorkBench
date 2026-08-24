import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  managedRootMigrationJobSchema,
  managedStorageStatusSchema,
  workDetailViewSchema,
} from '../contract.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import {
  SqliteResearchManagedRootController,
  SqliteResearchRepository,
} from '../storage/sqlite-repository.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('research managed root routes', () => {
  it('通过持久化任务迁移托管根并可轮询完成状态', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-root-routes-'));
    roots.push(root);
    const sourceRoot = join(root, 'source-root');
    const targetRoot = join(root, 'target-root');
    const files = join(root, 'files');
    await mkdir(files);
    const attachmentPath = join(files, 'dataset.bin');
    await writeFile(attachmentPath, Buffer.from('route managed root migration'));
    const database = makeResearchDatabase();
    const controller = new SqliteResearchManagedRootController(
      () => database.sqlite,
      () => sourceRoot,
    );
    const module = createResearchServerModule({
      repository: new SqliteResearchRepository(() => database.sqlite),
      managedRoot: () => sourceRoot,
      managedRootController: controller,
      metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
      filePicker: { pick: async () => [] },
    });
    const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
    try {
      const created = workDetailViewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.workManual,
            payload: {
              title: 'Managed root route work',
              type: 'dataset',
              year: 2026,
              authors: [],
              editionKind: 'unknown',
              publicationTitle: null,
              publisher: null,
              identifiers: [],
              collectionIds: [],
            },
          })
        ).json(),
      );
      const attached = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.editionAttachments(created.editions[0]!.id),
        payload: {
          path: attachmentPath,
          storageMode: 'managed',
          role: 'dataset',
          mimeType: 'application/octet-stream',
        },
      });
      expect(attached.statusCode).toBe(201);

      const startedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.managedRootMigrations,
        payload: { targetRoot },
      });
      expect(startedResponse.statusCode).toBe(202);
      let job = managedRootMigrationJobSchema.parse(startedResponse.json());
      for (let attempt = 0; attempt < 100 && job.status === 'running'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const polled = await app.inject({
          method: 'GET',
          url: RESEARCH_API_V1.managedRootMigration(job.id),
        });
        expect(polled.statusCode).toBe(200);
        job = managedRootMigrationJobSchema.parse(polled.json());
      }
      expect(job).toMatchObject({ status: 'completed', copiedObjects: 1, totalObjects: 1 });

      const statusResponse = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.managedStorage,
      });
      expect(managedStorageStatusSchema.parse(statusResponse.json())).toMatchObject({
        activeRoot: await realpath(targetRoot),
        latestMigration: { id: job.id, status: 'completed' },
      });
    } finally {
      await app.close();
      database.sqlite.close();
    }
  });
});
