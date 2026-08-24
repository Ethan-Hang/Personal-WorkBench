import { afterEach, describe, expect, it } from 'vitest';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});

function fixture() {
  let tick = 0;
  const database = makeResearchDatabase(() =>
    new Date(Date.UTC(2026, 7, 23, 1, 0, tick++)).toISOString(),
  );
  databases.push(database);
  const service = new ResearchService({
    repository: database.repo,
    contentStore: new ResearchContentStore(() => '/tmp/research-duplicates-unused'),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
  });
  return { ...database, service };
}

async function manual(service: ResearchService, title: string, year: number | null) {
  return service.createManualWork({
    title,
    type: 'article',
    year,
    authors: [],
    editionKind: 'journal',
    publicationTitle: null,
    publisher: null,
    identifiers: [],
    collectionIds: [],
  });
}

describe('重复作品治理', () => {
  it('显式选择存活记录、字段、Edition 和首选版本，合并后可完整撤销', async () => {
    const { service, repo, sqlite } = fixture();
    const firstCollection = await service.createCollection({ name: 'First collection' });
    const secondCollection = await service.createCollection({ name: 'Second collection' });
    const firstTag = await service.createTag({
      name: 'First tag',
      aliases: [],
      color: null,
      description: null,
    });
    const secondTag = await service.createTag({
      name: 'Second tag',
      aliases: [],
      color: null,
      description: null,
    });
    const survivor = await manual(service, 'Canonical title', 2024);
    const merged = await manual(service, 'Alternate title', 2025);
    const external = await manual(service, 'Related work', 2023);
    await service.setWorkCollections(survivor.work.id, [firstCollection.id]);
    await service.setWorkCollections(merged.work.id, [secondCollection.id]);
    await service.setWorkTags(survivor.work.id, [firstTag.id]);
    await service.setWorkTags(merged.work.id, [secondTag.id]);
    await service.addWorkRelation(merged.work.id, {
      targetWorkId: external.work.id,
      kind: 'cites',
      note: 'source relation',
    });

    const preview = await service.previewWorkMerge(survivor.work.id, merged.work.id);
    const record = await service.mergeWorks(survivor.work.id, {
      mergedWorkId: merged.work.id,
      expectedSurvivorRevision: preview.survivor.revision,
      expectedMergedRevision: preview.merged.revision,
      fieldChoices: {
        title: 'survivor',
        type: 'survivor',
        abstract: 'survivor',
        year: 'merged',
      },
      editionIdsToMove: preview.merged.editionIds,
      preferredEditionId: preview.merged.editionIds[0]!,
    });

    const combined = await service.getWork(survivor.work.id);
    expect(combined.work).toMatchObject({ title: 'Canonical title', year: 2025 });
    expect(combined.editions).toHaveLength(2);
    expect(combined.work.collectionIds).toEqual(
      expect.arrayContaining([firstCollection.id, secondCollection.id]),
    );
    expect(combined.tags.map((tag) => tag.id)).toEqual(
      expect.arrayContaining([firstTag.id, secondTag.id]),
    );
    expect(combined.relations).toEqual([
      expect.objectContaining({ targetWorkId: external.work.id, kind: 'cites' }),
    ]);
    expect(await repo.getWork(merged.work.id)).toMatchObject({
      status: 'merged',
      redirectToWorkId: survivor.work.id,
    });
    expect(
      (
        sqlite
          .prepare(
            `SELECT value_json FROM research_metadata_assertions
             WHERE entity_type = 'work' AND entity_id = ? AND field_name = 'year' AND is_selected = 1`,
          )
          .get(survivor.work.id) as { value_json: string }
      ).value_json,
    ).toBe('2025');

    await service.undoMerge(record.id);
    const restoredSurvivor = await service.getWork(survivor.work.id);
    const restoredMerged = await service.getWork(merged.work.id);
    expect(restoredSurvivor.work).toMatchObject({ title: 'Canonical title', year: 2024 });
    expect(restoredSurvivor.editions).toHaveLength(1);
    expect(restoredSurvivor.work.collectionIds).toEqual([firstCollection.id]);
    expect(restoredSurvivor.tags.map((tag) => tag.id)).toEqual([firstTag.id]);
    expect(restoredMerged.work).toMatchObject({
      title: 'Alternate title',
      year: 2025,
      status: 'active',
    });
    expect(restoredMerged.editions).toHaveLength(1);
    expect(restoredMerged.work.collectionIds).toEqual([secondCollection.id]);
    expect(restoredMerged.tags.map((tag) => tag.id)).toEqual([secondTag.id]);
    expect(restoredMerged.relations).toEqual([
      expect.objectContaining({ targetWorkId: external.work.id, kind: 'cites' }),
    ]);
  });

  it('合并后的受影响数据发生变化时拒绝撤销', async () => {
    const { service } = fixture();
    const survivor = await manual(service, 'Survivor', 2024);
    const merged = await manual(service, 'Merged', 2024);
    const tag = await service.createTag({
      name: 'Later tag',
      aliases: [],
      color: null,
      description: null,
    });
    const preview = await service.previewWorkMerge(survivor.work.id, merged.work.id);
    const record = await service.mergeWorks(survivor.work.id, {
      mergedWorkId: merged.work.id,
      expectedSurvivorRevision: preview.survivor.revision,
      expectedMergedRevision: preview.merged.revision,
      fieldChoices: { title: 'survivor', type: 'survivor', abstract: 'survivor', year: 'survivor' },
      editionIdsToMove: preview.merged.editionIds,
      preferredEditionId: preview.survivor.editionIds[0]!,
    });
    await service.setWorkTags(survivor.work.id, [tag.id]);
    await expect(service.undoMerge(record.id)).rejects.toThrow('不能覆盖后续修改');
  });
});
