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
  const database = makeResearchDatabase();
  databases.push(database);
  const service = new ResearchService({
    repository: database.repo,
    contentStore: new ResearchContentStore(() => '/tmp/research-collections-unused'),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
  });
  return { ...database, service };
}

async function manual(service: ResearchService, title: string, collectionIds: string[] = []) {
  return service.createManualWork({
    title,
    type: 'unknown',
    year: null,
    authors: [],
    editionKind: 'unknown',
    publicationTitle: null,
    publisher: null,
    identifiers: [],
    collectionIds,
  });
}

describe('层级目录', () => {
  it('支持任意层级、移动排序，并拒绝循环和同父级重名', async () => {
    const { service } = fixture();
    const root = await service.createCollection({ name: 'Root' });
    const first = await service.createCollection({ name: 'First', parentId: root.id });
    const second = await service.createCollection({ name: 'Second', parentId: root.id });
    const leaf = await service.createCollection({ name: 'Leaf', parentId: first.id });

    await expect(service.updateCollection(root.id, { parentId: leaf.id })).rejects.toThrow(
      '自己的子目录',
    );
    await expect(service.createCollection({ name: ' second ', parentId: root.id })).rejects.toThrow(
      '同名目录',
    );

    await service.updateCollection(second.id, { sortOrder: 0, name: 'Second renamed' });
    const children = (await service.listCollections()).collections.filter(
      (collection) => collection.parentId === root.id,
    );
    expect(children).toEqual([
      expect.objectContaining({ id: second.id, name: 'Second renamed', sortOrder: 0 }),
      expect.objectContaining({ id: first.id, sortOrder: 1 }),
    ]);
  });

  it('删除目录按所选策略迁移子目录和条目，不删除作品或文件实体', async () => {
    const { service, sqlite } = fixture();
    const root = await service.createCollection({ name: 'Root' });
    const topic = await service.createCollection({ name: 'Topic', parentId: root.id });
    const leaf = await service.createCollection({ name: 'Leaf', parentId: topic.id });
    const work = await manual(service, 'Kept work', [topic.id]);

    expect(await service.collectionDeletionPreview(topic.id)).toMatchObject({
      childCount: 1,
      directWorkCount: 1,
      parentStrategyTargetId: root.id,
    });
    await service.deleteCollection(topic.id, 'parent');

    expect((await service.listCollections()).collections).toContainEqual(
      expect.objectContaining({ id: leaf.id, parentId: root.id }),
    );
    expect((await service.getWork(work.work.id)).work.collectionIds).toEqual([root.id]);

    await service.deleteCollection(root.id, 'unclassified');
    expect((await service.listCollections()).collections).toContainEqual(
      expect.objectContaining({ id: leaf.id, parentId: null }),
    );
    expect((await service.getWork(work.work.id)).work.collectionIds).toEqual([]);
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM research_works').get() as { count: number })
        .count,
    ).toBe(1);
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM research_assets').get() as { count: number })
        .count,
    ).toBe(0);
  });

  it('删除预览会报告目标层级的同名冲突', async () => {
    const { service } = fixture();
    const root = await service.createCollection({ name: 'Root' });
    const branch = await service.createCollection({ name: 'Branch', parentId: root.id });
    await service.createCollection({ name: 'Methods', parentId: root.id });
    await service.createCollection({ name: 'Methods', parentId: branch.id });

    const preview = await service.collectionDeletionPreview(branch.id);
    expect(preview.parentStrategyNameConflicts).toEqual(['Methods']);
    await expect(service.deleteCollection(branch.id, 'parent')).rejects.toThrow('同名目录');
    expect(
      (await service.listCollections()).collections.some((value) => value.id === branch.id),
    ).toBe(true);
  });
});
