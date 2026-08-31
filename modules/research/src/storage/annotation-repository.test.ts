import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-30T14:00:00.000Z';
const HASH = 'd'.repeat(64);
const ANCHOR = {
  pageNumber: 7,
  pageSize: { width: 612, height: 792 },
  rect: null,
  quads: [{ x1: 10, y1: 20, x2: 30, y2: 20, x3: 10, y3: 10, x4: 30, y4: 10 }],
  textQuote: null,
  assetHash: HASH,
  editionId: null,
};

async function fixture() {
  const database = makeResearchDatabase(() => NOW);
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: HASH, byteSize: 10, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: '/tmp/paper.pdf',
      resolvedPath: `/managed/${HASH}`,
      objectKey: `sha256/dd/dd/${HASH}`,
      state: 'available',
    },
  );
  return database;
}

describe('annotation repository', () => {
  it('活动上下文名称唯一，归档后可复用名称但恢复会检测冲突', async () => {
    const { repo } = await fixture();
    expect(
      await repo.createReadingContext({
        id: 'context-1',
        name: 'Review',
        normalizedName: 'review',
        description: null,
        color: null,
      }),
    ).toMatchObject({ kind: 'saved' });
    expect(
      await repo.createReadingContext({
        id: 'context-2',
        name: 'REVIEW',
        normalizedName: 'review',
        description: null,
        color: null,
      }),
    ).toEqual({ kind: 'conflict' });

    expect(
      await repo.archiveReadingContext('context-1', 'keep-archived', () => 'unused'),
    ).toMatchObject({ kind: 'archived' });
    expect(
      await repo.createReadingContext({
        id: 'context-2',
        name: 'Review',
        normalizedName: 'review',
        description: null,
        color: null,
      }),
    ).toMatchObject({ kind: 'saved' });
    expect(await repo.restoreReadingContext('context-1')).toEqual({ kind: 'conflict' });
  });

  it('目录重组不改变默认上下文，归档时解除绑定和阅读状态', async () => {
    const { repo } = await fixture();
    await repo.createCollection({
      id: 'parent',
      parentId: null,
      name: 'Parent',
      normalizedName: 'parent',
      sortOrder: 0,
    });
    await repo.createCollection({
      id: 'child',
      parentId: null,
      name: 'Child',
      normalizedName: 'child',
      sortOrder: 1,
    });
    await repo.createReadingContext({
      id: 'context-1',
      name: 'Context',
      normalizedName: 'context',
      description: null,
      color: null,
    });
    expect(await repo.setCollectionContext('child', 'context-1')).toMatchObject({ kind: 'saved' });
    await repo.moveCollection({
      id: 'child',
      parentId: 'parent',
      name: 'Renamed Child',
      normalizedName: 'renamed child',
      orderedSiblingIds: ['child'],
    });
    expect(await repo.getCollectionContext('child')).toMatchObject({
      context: { id: 'context-1' },
    });

    await repo.saveReaderState({
      assetId: 'asset-1',
      pageNumber: 1,
      pageOffsetRatio: 0,
      zoom: 1,
      rotation: 0,
      layout: 'continuous',
      lastContextId: 'context-1',
      expectedRevision: 0,
    });
    await repo.archiveReadingContext('context-1', 'keep-archived', () => 'unused');
    expect(await repo.getCollectionContext('child')).toMatchObject({ context: null });
    expect(await repo.getReaderState('asset-1')).toMatchObject({
      lastContextId: null,
      revision: 2,
    });
  });

  it('移到通用层时为活动批注和 tombstone 分别保存快照', async () => {
    const { repo } = await fixture();
    await repo.createReadingContext({
      id: 'context-1',
      name: 'Context',
      normalizedName: 'context',
      description: null,
      color: null,
    });
    await repo.createAnnotation({
      id: 'annotation-1',
      assetId: 'asset-1',
      editionId: null,
      contextId: 'context-1',
      kind: 'highlight',
      pageNumber: 7,
      anchor: ANCHOR,
      body: 'active',
      color: null,
      status: 'active',
    });
    await repo.createAnnotation({
      id: 'annotation-2',
      assetId: 'asset-1',
      editionId: null,
      contextId: 'context-1',
      kind: 'underline',
      pageNumber: 7,
      anchor: ANCHOR,
      body: 'deleted',
      color: null,
      status: 'active',
    });
    await repo.deleteAnnotation('annotation-2', {
      expectedRevision: 1,
      revisionId: 'revision-delete',
    });
    let sequence = 0;
    expect(
      await repo.archiveReadingContext(
        'context-1',
        'move-to-general',
        () => `revision-move-${++sequence}`,
      ),
    ).toMatchObject({ kind: 'archived', result: { movedAnnotations: 2 } });

    expect(await repo.getAnnotation('annotation-1')).toMatchObject({
      contextId: null,
      status: 'active',
      revision: 2,
    });
    expect(await repo.getAnnotation('annotation-2')).toMatchObject({
      contextId: null,
      status: 'deleted',
      revision: 3,
    });
    expect(
      (await repo.listAnnotationRevisions('annotation-2'))?.map((value) => value.reason),
    ).toEqual(['move-context', 'delete']);
  });
});
