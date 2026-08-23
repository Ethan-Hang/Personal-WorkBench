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
    new Date(Date.UTC(2026, 7, 23, 0, 0, tick++)).toISOString(),
  );
  databases.push(database);
  const service = new ResearchService({
    repository: database.repo,
    contentStore: new ResearchContentStore(() => '/tmp/research-tags-unused'),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
  });
  return { ...database, service };
}

async function manual(service: ResearchService, title: string) {
  return service.createManualWork({
    title,
    type: 'unknown',
    year: null,
    authors: [],
    editionKind: 'unknown',
    publicationTitle: null,
    publisher: null,
    identifiers: [],
    collectionIds: [],
  });
}

describe('标签治理', () => {
  it('规范化名称和别名，候选只提示，不自动合并', async () => {
    const { service } = fixture();
    const machineLearning = await service.createTag({
      name: 'Machine Learning',
      aliases: ['ML'],
      color: '#335577',
      description: 'Methods',
    });

    await expect(
      service.createTag({
        name: 'Ｍａｃｈｉｎｅ Learning',
        aliases: [],
        color: null,
        description: null,
      }),
    ).rejects.toThrow('已经存在');
    await expect(
      service.createTag({ name: 'Another', aliases: ['ml'], color: null, description: null }),
    ).rejects.toThrow('已经存在');

    const candidates = await service.findTagCandidates('machine learnin', 10);
    expect(candidates.candidates[0]).toMatchObject({
      tag: { id: machineLearning.id },
      reason: 'prefix',
    });
    expect((await service.listTags('active', undefined, 'name')).tags).toHaveLength(1);
  });

  it('支持分配、使用量排序、回收、恢复和永久删除', async () => {
    const { service } = fixture();
    const first = await service.createTag({
      name: 'First',
      aliases: [],
      color: null,
      description: null,
    });
    const second = await service.createTag({
      name: 'Second',
      aliases: [],
      color: null,
      description: null,
    });
    const work = await manual(service, 'Tagged work');
    await service.setWorkTags(work.work.id, [second.id]);

    expect((await service.listTags('active', undefined, 'usage')).tags[0]!.id).toBe(second.id);
    expect((await service.getWork(work.work.id)).tags.map((tag) => tag.id)).toEqual([second.id]);

    const preview = await service.tagDeletionPreview(second.id);
    expect(preview).toMatchObject({ usageCount: 1, aliasCount: 0 });
    await service.trashTag(
      second.id,
      (await service.listTags('active', undefined, 'name')).tags.find(
        (tag) => tag.id === second.id,
      )!.updatedAt,
    );
    expect((await service.getWork(work.work.id)).tags).toEqual([]);
    await service.restoreTag(second.id);
    expect((await service.getWork(work.work.id)).tags.map((tag) => tag.id)).toEqual([second.id]);

    await service.trashTag(first.id, first.updatedAt);
    await service.permanentlyDeleteTag(first.id);
    expect(
      (await service.listTags('all', undefined, 'name')).tags.map((tag) => tag.id),
    ).not.toContain(first.id);
  });

  it('批量添加和移除标签复用同一结果摘要', async () => {
    const { service } = fixture();
    const tag = await service.createTag({
      name: 'Batch tag',
      aliases: [],
      color: null,
      description: null,
    });
    const first = await manual(service, 'Batch first');
    const second = await manual(service, 'Batch second');
    const added = await service.applyBulkWorkAction({
      action: 'add-tags',
      workIds: [first.work.id, second.work.id],
      tagIds: [tag.id],
    });
    expect(added.results.every((result) => result.status === 'succeeded')).toBe(true);
    expect((await service.listTags('active', undefined, 'usage')).tags[0]!.usageCount).toBe(2);

    await service.applyBulkWorkAction({
      action: 'remove-tags',
      workIds: [first.work.id, second.work.id],
      tagIds: [tag.id],
    });
    expect((await service.listTags('active', undefined, 'usage')).tags[0]!.usageCount).toBe(0);
  });

  it('合并保留旧名、转移引用，并可按快照撤销', async () => {
    const { service } = fixture();
    const survivor = await service.createTag({
      name: 'Artificial Intelligence',
      aliases: ['AI'],
      color: '#112233',
      description: null,
    });
    const merged = await service.createTag({
      name: 'Machine Intelligence',
      aliases: ['MI'],
      color: null,
      description: null,
    });
    const firstWork = await manual(service, 'First tagged work');
    const secondWork = await manual(service, 'Second tagged work');
    await service.setWorkTags(firstWork.work.id, [survivor.id]);
    await service.setWorkTags(secondWork.work.id, [merged.id]);
    const current = await service.listTags('active', undefined, 'name');
    const currentSurvivor = current.tags.find((tag) => tag.id === survivor.id)!;
    const currentMerged = current.tags.find((tag) => tag.id === merged.id)!;

    const record = await service.mergeTags({
      survivorId: survivor.id,
      mergedId: merged.id,
      expectedSurvivorUpdatedAt: currentSurvivor.updatedAt,
      expectedMergedUpdatedAt: currentMerged.updatedAt,
    });
    const after = await service.listTags('all', undefined, 'name');
    expect(after.tags.find((tag) => tag.id === survivor.id)).toMatchObject({
      aliases: expect.arrayContaining(['AI', 'MI', 'Machine Intelligence']),
      usageCount: 2,
    });
    expect(after.tags.find((tag) => tag.id === merged.id)!.trashedAt).not.toBeNull();
    expect((await service.getWork(secondWork.work.id)).tags.map((tag) => tag.id)).toEqual([
      survivor.id,
    ]);

    expect(await service.undoMerge(record.id)).toMatchObject({ status: 'reverted' });
    expect((await service.getWork(firstWork.work.id)).tags.map((tag) => tag.id)).toEqual([
      survivor.id,
    ]);
    expect((await service.getWork(secondWork.work.id)).tags.map((tag) => tag.id)).toEqual([
      merged.id,
    ]);
    expect((await service.listTags('active', undefined, 'name')).tags).toHaveLength(2);
  });
});
