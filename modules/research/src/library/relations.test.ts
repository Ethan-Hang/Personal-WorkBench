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
  return {
    ...database,
    service: new ResearchService({
      repository: database.repo,
      contentStore: new ResearchContentStore(() => '/tmp/research-relations-unused'),
      metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
      filePicker: { pick: async () => [] },
    }),
  };
}

async function manual(service: ResearchService, title: string, collectionIds: string[] = []) {
  return service.createManualWork({
    title,
    type: 'article',
    year: 2026,
    authors: [],
    editionKind: 'journal',
    publicationTitle: null,
    publisher: null,
    identifiers: [],
    collectionIds,
  });
}

describe('作品关系和批量治理', () => {
  it('有向关系双向展示，并在回收与恢复期间保留', async () => {
    const { service } = fixture();
    const source = await manual(service, 'Source work');
    const target = await manual(service, 'Target work');

    const sourceDetail = await service.addWorkRelation(source.work.id, {
      targetWorkId: target.work.id,
      kind: 'extends',
      note: 'Expanded experiment',
    });
    expect(sourceDetail.relations).toEqual([
      expect.objectContaining({
        kind: 'extends',
        direction: 'outgoing',
        counterpart: { id: target.work.id, title: 'Target work', status: 'active' },
      }),
    ]);
    expect((await service.getWork(target.work.id)).relations).toEqual([
      expect.objectContaining({
        direction: 'incoming',
        counterpart: expect.objectContaining({ id: source.work.id }),
      }),
    ]);

    await service.trashWork(target.work.id);
    expect((await service.getWork(source.work.id)).relations[0]?.counterpart.status).toBe(
      'trashed',
    );
    await service.restoreWork(target.work.id);
    const relationId = (await service.getWork(source.work.id)).relations[0]!.id;
    await service.deleteWorkRelation(relationId);
    expect((await service.getWork(source.work.id)).relations).toEqual([]);
  });

  it('批量操作先给影响预览，再逐项加入目录、回收和恢复', async () => {
    const { service } = fixture();
    const collection = await service.createCollection({ name: 'Batch' });
    const first = await manual(service, 'First');
    const second = await manual(service, 'Second');

    expect(
      (
        await service.listWorks({
          status: 'active',
          systemView: 'uncategorized',
          limit: 30,
        })
      ).works.map((work) => work.id),
    ).toEqual(expect.arrayContaining([first.work.id, second.work.id]));

    const addInput = {
      action: 'add-to-collections' as const,
      workIds: [first.work.id, second.work.id],
      collectionIds: [collection.id],
    };
    expect(await service.previewBulkWorkAction(addInput)).toMatchObject({
      action: 'add-to-collections',
      items: [{ attachmentCount: 0 }, { attachmentCount: 0 }],
    });
    expect((await service.applyBulkWorkAction(addInput)).results).toEqual([
      { workId: first.work.id, status: 'succeeded', message: null },
      { workId: second.work.id, status: 'succeeded', message: null },
    ]);
    expect(
      await service.listWorks({ status: 'active', systemView: 'uncategorized', limit: 30 }),
    ).toMatchObject({ works: [] });

    await service.applyBulkWorkAction({
      action: 'trash',
      workIds: [first.work.id, second.work.id],
    });
    expect(
      (await service.listWorks({ status: 'active', systemView: 'trash', limit: 30 })).works.map(
        (work) => work.id,
      ),
    ).toEqual(expect.arrayContaining([first.work.id, second.work.id]));
    const restored = await service.applyBulkWorkAction({
      action: 'restore',
      workIds: [first.work.id, 'missing-work'],
    });
    expect(restored.results).toEqual([
      { workId: first.work.id, status: 'succeeded', message: null },
      { workId: 'missing-work', status: 'failed', message: '作品不存在' },
    ]);
  });

  it('维护系统视图分别筛出缺失文件、待确认元数据和重复候选', async () => {
    const { service, repo, sqlite } = fixture();
    const first = await manual(service, 'Maintenance first');
    const second = await manual(service, 'Maintenance second');
    const stored = await repo.storeAsset(
      {
        id: 'shared-asset',
        contentHash: 'b'.repeat(64),
        byteSize: 12,
        mimeType: 'application/pdf',
      },
      {
        id: 'missing-location',
        mode: 'linked',
        originalPath: '/missing/paper.pdf',
        resolvedPath: '/missing/paper.pdf',
        objectKey: null,
        state: 'missing',
      },
    );
    await repo.addAttachment({
      id: 'first-attachment',
      editionId: first.editions[0]!.id,
      assetId: stored.asset.id,
      role: 'primary-pdf',
      displayName: 'first.pdf',
    });
    await repo.addAttachment({
      id: 'second-attachment',
      editionId: second.editions[0]!.id,
      assetId: stored.asset.id,
      role: 'primary-pdf',
      displayName: 'second.pdf',
    });
    sqlite
      .prepare(
        `UPDATE research_metadata_assertions
         SET is_user_confirmed = 0
         WHERE entity_type = 'work' AND entity_id = ? AND field_name = 'title'`,
      )
      .run(first.work.id);

    const missing = await service.listWorks({
      status: 'active',
      systemView: 'missing-files',
      limit: 30,
    });
    expect(missing.works.map((work) => work.id)).toEqual(
      expect.arrayContaining([first.work.id, second.work.id]),
    );
    const duplicates = await service.listWorks({
      status: 'active',
      systemView: 'duplicate-candidates',
      limit: 30,
    });
    expect(duplicates.works.map((work) => work.id)).toEqual(
      expect.arrayContaining([first.work.id, second.work.id]),
    );
    const metadata = await service.listWorks({
      status: 'active',
      systemView: 'metadata-review',
      limit: 30,
    });
    expect(metadata.works.map((work) => work.id)).toEqual([first.work.id]);
  });
});
