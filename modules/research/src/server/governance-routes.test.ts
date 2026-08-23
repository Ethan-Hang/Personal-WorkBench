import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  mergeRecordViewSchema,
  tagCandidatesResponseSchema,
  tagDeletionPreviewSchema,
  tagViewSchema,
  tagsResponseSchema,
  workDetailViewSchema,
  workMergePreviewSchema,
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
  const root = await mkdtemp(join(tmpdir(), 'research-governance-routes-'));
  roots.push(root);
  let tick = 0;
  const database = makeResearchDatabase(() =>
    new Date(Date.UTC(2026, 7, 23, 2, 0, tick++)).toISOString(),
  );
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
      type: 'article',
      year: 2026,
      authors: [],
      editionKind: 'journal',
      publicationTitle: null,
      publisher: null,
      identifiers: [],
      collectionIds: [],
    },
  });
  expect(response.statusCode).toBe(201);
  return workDetailViewSchema.parse(response.json());
}

describe('research governance routes', () => {
  it('通过版本化 API 完成标签生命周期、候选、合并和撤销', async () => {
    const { app, sqlite } = await fixture();
    try {
      const createTag = async (name: string, aliases: string[] = []) => {
        const response = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.tags,
          payload: { name, aliases, color: null, description: null },
        });
        expect(response.statusCode).toBe(201);
        return tagViewSchema.parse(response.json());
      };
      const survivor = await createTag('Artificial Intelligence', ['AI']);
      const merged = await createTag('Machine Intelligence', ['MI']);
      const work = await createWork(app, 'Tagged route work');

      const assigned = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.workTags(work.work.id),
        payload: { tagIds: [merged.id] },
      });
      expect(workDetailViewSchema.parse(assigned.json()).tags[0]!.id).toBe(merged.id);

      const candidates = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.tagCandidates}?name=artificial%20intelligenc`,
      });
      expect(tagCandidatesResponseSchema.parse(candidates.json()).candidates[0]!.tag.id).toBe(
        survivor.id,
      );

      const current = tagsResponseSchema.parse(
        (await app.inject({ method: 'GET', url: `${RESEARCH_API_V1.tags}?status=active` })).json(),
      );
      const survivorVersion = current.tags.find((tag) => tag.id === survivor.id)!;
      const mergedVersion = current.tags.find((tag) => tag.id === merged.id)!;
      const mergedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.tagMerge,
        payload: {
          survivorId: survivor.id,
          mergedId: merged.id,
          expectedSurvivorUpdatedAt: survivorVersion.updatedAt,
          expectedMergedUpdatedAt: mergedVersion.updatedAt,
        },
      });
      expect(mergedResponse.statusCode).toBe(200);
      const record = mergeRecordViewSchema.parse(mergedResponse.json());
      expect(record.status).toBe('merged');

      const undo = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.mergeUndo(record.id),
      });
      expect(mergeRecordViewSchema.parse(undo.json()).status).toBe('reverted');

      const trashPreview = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.tagDeletionPreview(merged.id),
      });
      expect(tagDeletionPreviewSchema.parse(trashPreview.json()).usageCount).toBe(1);
      const refreshed = tagsResponseSchema
        .parse((await app.inject({ method: 'GET', url: RESEARCH_API_V1.tags })).json())
        .tags.find((tag) => tag.id === merged.id)!;
      const trashed = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.tag(merged.id),
        payload: { expectedUpdatedAt: refreshed.updatedAt },
      });
      expect(tagViewSchema.parse(trashed.json()).trashedAt).not.toBeNull();
      const restored = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.tagRestore(merged.id),
      });
      expect(tagViewSchema.parse(restored.json()).trashedAt).toBeNull();
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('通过 API 显式预览、合并和撤销重复 Work', async () => {
    const { app, sqlite } = await fixture();
    try {
      const survivor = await createWork(app, 'Canonical route title');
      const merged = await createWork(app, 'Alternate route title');
      const previewResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workMergePreview(survivor.work.id),
        payload: { mergedWorkId: merged.work.id },
      });
      expect(previewResponse.statusCode).toBe(200);
      const preview = workMergePreviewSchema.parse(previewResponse.json());

      const mergeResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workMerge(survivor.work.id),
        payload: {
          mergedWorkId: merged.work.id,
          expectedSurvivorRevision: preview.survivor.revision,
          expectedMergedRevision: preview.merged.revision,
          fieldChoices: {
            title: 'survivor',
            type: 'survivor',
            abstract: 'survivor',
            year: 'survivor',
          },
          editionIdsToMove: preview.merged.editionIds,
          preferredEditionId: preview.survivor.editionIds[0],
        },
      });
      expect(mergeResponse.statusCode).toBe(200);
      const record = mergeRecordViewSchema.parse(mergeResponse.json());
      expect(
        (await app.inject({ method: 'GET', url: RESEARCH_API_V1.work(survivor.work.id) })).json()
          .editions,
      ).toHaveLength(2);

      const undo = await app.inject({ method: 'POST', url: RESEARCH_API_V1.mergeUndo(record.id) });
      expect(mergeRecordViewSchema.parse(undo.json()).status).toBe('reverted');
      expect(
        workDetailViewSchema.parse(
          (await app.inject({ method: 'GET', url: RESEARCH_API_V1.work(merged.work.id) })).json(),
        ).work.status,
      ).toBe('active');
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
