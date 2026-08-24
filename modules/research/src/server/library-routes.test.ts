import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  attachmentDeletionPreviewSchema,
  bulkWorkPreviewSchema,
  bulkWorkResultSchema,
  collectionDeletionPreviewSchema,
  collectionViewSchema,
  workDetailViewSchema,
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
  const root = await mkdtemp(join(tmpdir(), 'research-library-routes-'));
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

async function createWork(app: Awaited<ReturnType<typeof fixture>>['app'], title: string) {
  const response = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.workManual,
    payload: {
      title,
      type: 'unknown',
      year: null,
      authors: [],
      editionKind: 'unknown',
      publicationTitle: null,
      publisher: null,
      identifiers: [],
      collectionIds: [],
    },
  });
  expect(response.statusCode).toBe(201);
  return workDetailViewSchema.parse(response.json());
}

describe('research library routes', () => {
  it('目录、关系、系统视图和批量治理共用版本化 API', async () => {
    const { app, sqlite } = await fixture();
    try {
      const root = collectionViewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.collections,
            payload: { name: 'Root' },
          })
        ).json(),
      );
      const child = collectionViewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.collections,
            payload: { name: 'Child', parentId: root.id },
          })
        ).json(),
      );
      const moved = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.collection(child.id),
        payload: { name: 'Child renamed', parentId: null, sortOrder: 0 },
      });
      expect(collectionViewSchema.parse(moved.json())).toMatchObject({
        name: 'Child renamed',
        parentId: null,
        sortOrder: 0,
      });

      const first = await createWork(app, 'First route work');
      const second = await createWork(app, 'Second route work');
      const relationResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workRelations(first.work.id),
        payload: { targetWorkId: second.work.id, kind: 'cites', note: null },
      });
      const related = workDetailViewSchema.parse(relationResponse.json());
      expect(related.relations).toEqual([
        expect.objectContaining({ kind: 'cites', direction: 'outgoing' }),
      ]);

      const bulkInput = {
        action: 'add-to-collections',
        workIds: [first.work.id, second.work.id],
        collectionIds: [root.id],
      };
      const preview = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workBulkPreview,
        payload: bulkInput,
      });
      expect(bulkWorkPreviewSchema.parse(preview.json()).items).toHaveLength(2);
      const applied = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workBulk,
        payload: bulkInput,
      });
      expect(
        bulkWorkResultSchema
          .parse(applied.json())
          .results.every((result) => result.status === 'succeeded'),
      ).toBe(true);

      const uncategorized = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.works}?systemView=uncategorized`,
      });
      expect(worksPageResponseSchema.parse(uncategorized.json()).works).toEqual([]);

      const deletionPreview = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.collectionDeletionPreview(root.id),
      });
      expect(collectionDeletionPreviewSchema.parse(deletionPreview.json())).toMatchObject({
        directWorkCount: 2,
      });
      const deleted = await app.inject({
        method: 'DELETE',
        url: `${RESEARCH_API_V1.collection(root.id)}?strategy=unclassified`,
      });
      expect(deleted.statusCode).toBe(200);
      const afterDelete = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.works}?systemView=uncategorized`,
      });
      expect(worksPageResponseSchema.parse(afterDelete.json()).works).toHaveLength(2);

      const removedRelation = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.workRelation(related.relations[0]!.id),
      });
      expect(removedRelation.statusCode).toBe(204);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('元数据编辑和附件回收站接口使用同一份详情契约', async () => {
    const { app, repo, sqlite } = await fixture();
    try {
      const created = await createWork(app, 'Editable route work');
      const edition = created.editions[0]!;
      const editedResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.workMetadata(created.work.id),
        payload: {
          expectedWorkRevision: created.work.revision,
          work: { title: 'Edited route work', abstract: 'Edited through API' },
          edition: {
            id: edition.id,
            expectedRevision: edition.revision,
            publisher: 'Route Press',
            authors: ['Route Author'],
          },
        },
      });
      expect(editedResponse.statusCode).toBe(200);
      const edited = workDetailViewSchema.parse(editedResponse.json());
      expect(edited.work).toMatchObject({
        title: 'Edited route work',
        abstract: 'Edited through API',
        authors: ['Route Author'],
      });
      expect(edited.editions[0]).toMatchObject({ publisher: 'Route Press' });

      const stored = await repo.storeAsset(
        {
          id: 'route-linked-asset',
          contentHash: 'd'.repeat(64),
          byteSize: 24,
          mimeType: 'text/plain',
        },
        {
          id: 'route-linked-location',
          mode: 'linked',
          originalPath: '/source/route-notes.txt',
          resolvedPath: '/source/route-notes.txt',
          objectKey: null,
          state: 'available',
        },
      );
      await repo.addAttachment({
        id: 'route-linked-attachment',
        editionId: edition.id,
        assetId: stored.asset.id,
        role: 'other',
        displayName: 'route-notes.txt',
      });

      const recycled = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.attachment('route-linked-attachment'),
      });
      expect(recycled.statusCode).toBe(204);
      const restored = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.attachmentRestore('route-linked-attachment'),
      });
      expect(restored.statusCode).toBe(204);
      await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.attachment('route-linked-attachment'),
      });
      const previewResponse = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.attachmentDeletionPreview('route-linked-attachment'),
      });
      expect(previewResponse.statusCode).toBe(200);
      const preview = attachmentDeletionPreviewSchema.parse(previewResponse.json());
      expect(preview).toMatchObject({ linkedLocationCount: 1, managedObjectCount: 0 });
      const permanentlyDeleted = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.attachmentPermanentDelete('route-linked-attachment'),
        payload: { confirmationToken: preview.confirmationToken },
      });
      expect(permanentlyDeleted.statusCode).toBe(200);
      expect(permanentlyDeleted.json()).toMatchObject({
        deleted: true,
        linkedSourcesDeleted: false,
      });
      expect(await repo.getAsset('route-linked-asset')).toBeNull();
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
