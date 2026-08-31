import { describe, expect, it } from 'vitest';
import { ResearchAnnotationService } from './service.js';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-30T13:00:00.000Z';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

function makeIds() {
  let sequence = 0;
  return () => `generated-${++sequence}`;
}

function anchor(contentHash = HASH, editionId: string | null = null) {
  return {
    pageNumber: 2,
    pageSize: { width: 612, height: 792 },
    rect: null,
    quads: [{ x1: 72, y1: 700, x2: 180, y2: 700, x3: 72, y3: 684, x4: 180, y4: 684 }],
    textQuote: {
      exact: 'selected research text',
      prefix: 'before ',
      suffix: ' after',
      fingerprint: 'c'.repeat(64),
    },
    assetHash: contentHash,
    editionId,
  };
}

async function fixture() {
  const database = makeResearchDatabase(() => NOW);
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: HASH, byteSize: 42, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: '/tmp/paper.pdf',
      resolvedPath: `/library/sha256/aa/aa/${HASH}`,
      objectKey: `sha256/aa/aa/${HASH}`,
      state: 'available',
    },
  );
  const service = new ResearchAnnotationService(database.repo, { createId: makeIds() });
  return { ...database, service };
}

describe('research annotation service', () => {
  it('显式返回通用层，并隔离同一 Asset 的两个命名上下文', async () => {
    const { service } = await fixture();
    const first = await service.createContext({
      name: '综述',
      description: null,
      color: '#f59e0b',
    });
    const second = await service.createContext({
      name: '复现实验',
      description: null,
      color: null,
    });

    const catalog = await service.listContexts('active');
    expect(catalog.general).toEqual({ kind: 'general', id: 'general', name: '通用批注' });
    expect(catalog.contexts.map((value) => value.id).sort()).toEqual([first.id, second.id].sort());

    const general = await service.createAnnotation('asset-1', {
      contextId: null,
      kind: 'highlight',
      anchor: anchor(),
      body: 'general',
      color: '#fde047',
    });
    const inFirst = await service.createAnnotation('asset-1', {
      contextId: first.id,
      kind: 'underline',
      anchor: anchor(),
      body: 'first',
      color: null,
    });
    const inSecond = await service.createAnnotation('asset-1', {
      contextId: second.id,
      kind: 'strikeout',
      anchor: anchor(),
      body: 'second',
      color: null,
    });

    expect(
      (
        await service.listAnnotations({
          assetId: 'asset-1',
          contextIds: [first.id],
          includeGeneral: true,
          includeDeleted: false,
        })
      ).map((value) => value.id),
    ).toEqual([general.id, inFirst.id]);
    expect(
      (
        await service.listAnnotations({
          assetId: 'asset-1',
          contextIds: [second.id],
          includeGeneral: false,
          includeDeleted: false,
        })
      ).map((value) => value.id),
    ).toEqual([inSecond.id]);
  });

  it('Asset hash 或 Edition 不匹配时返回 needs-review', async () => {
    const { service } = await fixture();
    const wrongHash = await service.createAnnotation('asset-1', {
      contextId: null,
      kind: 'highlight',
      anchor: anchor(OTHER_HASH),
      body: null,
      color: null,
    });
    const wrongEdition = await service.createAnnotation('asset-1', {
      contextId: null,
      kind: 'highlight',
      anchor: anchor(HASH, 'old-edition'),
      body: null,
      color: null,
    });

    expect(wrongHash.status).toBe('needs-review');
    expect(wrongEdition).toMatchObject({
      editionId: null,
      status: 'needs-review',
      anchor: { editionId: 'old-edition' },
    });
  });

  it('乐观更新、删除和恢复都保存变更前快照', async () => {
    const { service } = await fixture();
    const created = await service.createAnnotation('asset-1', {
      contextId: null,
      kind: 'highlight',
      anchor: anchor(),
      body: 'draft',
      color: null,
    });
    const updated = await service.updateAnnotation(created.id, {
      body: 'confirmed',
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({ revision: 2, body: 'confirmed' });

    await expect(
      service.updateAnnotation(created.id, { body: 'stale', expectedRevision: 1 }),
    ).rejects.toMatchObject({
      code: 'ANNOTATION_CONFLICT',
      status: 409,
      details: { current: { revision: 2, body: 'confirmed' } },
    });

    const deleted = await service.deleteAnnotation(created.id, { expectedRevision: 2 });
    expect(deleted).toMatchObject({ revision: 3, status: 'deleted', deletedAt: NOW });
    expect(
      await service.listAnnotations({
        assetId: 'asset-1',
        contextIds: [],
        includeGeneral: true,
        includeDeleted: false,
      }),
    ).toEqual([]);

    const restored = await service.restoreAnnotation(created.id, { expectedRevision: 3 });
    expect(restored).toMatchObject({ revision: 4, status: 'active', deletedAt: null });
    const revisions = await service.listAnnotationRevisions(created.id);
    expect(revisions.map((value) => [value.revision, value.reason])).toEqual([
      [3, 'restore'],
      [2, 'delete'],
      [1, 'update'],
    ]);
    expect(revisions[2]?.snapshot.body).toBe('draft');
  });

  it('归档前预览数量，并支持保留 tombstone 或移到通用层', async () => {
    const { repo, service } = await fixture();
    await repo.createCollection({
      id: 'collection-1',
      parentId: null,
      name: '论文组',
      normalizedName: '论文组',
      sortOrder: 0,
    });
    const context = await service.createContext({
      name: '论文组阅读',
      description: null,
      color: null,
    });
    await service.setCollectionContext('collection-1', { contextId: context.id });
    const active = await service.createAnnotation('asset-1', {
      contextId: context.id,
      kind: 'highlight',
      anchor: anchor(),
      body: 'active',
      color: null,
    });
    const tombstone = await service.createAnnotation('asset-1', {
      contextId: context.id,
      kind: 'underline',
      anchor: anchor(),
      body: 'deleted',
      color: null,
    });
    await service.deleteAnnotation(tombstone.id, { expectedRevision: 1 });

    expect(await service.previewContextArchive(context.id)).toMatchObject({
      annotationCount: 2,
      activeAnnotationCount: 1,
      deletedAnnotationCount: 1,
      collectionCount: 1,
    });
    const archived = await service.archiveContext(context.id, { strategy: 'keep-archived' });
    expect(archived).toMatchObject({ context: { status: 'archived' }, movedAnnotations: 0 });
    expect(await service.getCollectionContext('collection-1')).toMatchObject({ context: null });
    expect((await service.getAnnotation(active.id)).contextId).toBe(context.id);

    await service.restoreContext(context.id);
    await service.setCollectionContext('collection-1', { contextId: context.id });
    const moved = await service.archiveContext(context.id, { strategy: 'move-to-general' });
    expect(moved.movedAnnotations).toBe(2);
    expect(await service.getAnnotation(active.id)).toMatchObject({ contextId: null, revision: 2 });
    expect((await service.listAnnotationRevisions(active.id))[0]).toMatchObject({
      revision: 1,
      reason: 'move-context',
      snapshot: { contextId: context.id },
    });
  });
});
