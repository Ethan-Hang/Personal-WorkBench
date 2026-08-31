import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-30T12:00:00.000Z';
const HASH = 'a'.repeat(64);

async function storePdf() {
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
      observedSize: 42,
      lastCheckedAt: NOW,
    },
  );
  return database;
}

describe('reader repository', () => {
  it('读取 Asset、可用位置和附件摘要', async () => {
    const { repo } = await storePdf();

    const asset = await repo.getReaderAsset('asset-1');

    expect(asset).toMatchObject({
      id: 'asset-1',
      contentHash: HASH,
      byteSize: 42,
      mimeType: 'application/pdf',
      state: 'active',
      locations: [
        {
          id: 'location-1',
          mode: 'managed',
          state: 'available',
          objectKey: `sha256/aa/aa/${HASH}`,
        },
      ],
      attachments: [],
    });
    expect(await repo.getReaderAsset('missing')).toBeNull();
  });

  it('以 revision 0 创建状态，之后只接受当前 revision', async () => {
    const { repo } = await storePdf();
    expect(await repo.getReaderState('asset-1')).toBeNull();

    const created = await repo.saveReaderState({
      assetId: 'asset-1',
      pageNumber: 3,
      pageOffsetRatio: 0.25,
      zoom: 1.5,
      rotation: 90,
      layout: 'continuous',
      lastContextId: null,
      expectedRevision: 0,
    });
    expect(created).toMatchObject({
      kind: 'saved',
      state: { pageNumber: 3, revision: 1, lastContextId: null },
    });

    const stale = await repo.saveReaderState({
      assetId: 'asset-1',
      pageNumber: 9,
      pageOffsetRatio: 0,
      zoom: 2,
      rotation: 0,
      layout: 'single-page',
      lastContextId: null,
      expectedRevision: 0,
    });
    expect(stale).toMatchObject({ kind: 'conflict', current: { pageNumber: 3, revision: 1 } });

    const updated = await repo.saveReaderState({
      assetId: 'asset-1',
      pageNumber: 9,
      pageOffsetRatio: 0.75,
      zoom: 2,
      rotation: 180,
      layout: 'single-page',
      lastContextId: null,
      expectedRevision: 1,
    });
    expect(updated).toMatchObject({
      kind: 'saved',
      state: { pageNumber: 9, pageOffsetRatio: 0.75, revision: 2 },
    });
  });

  it('不存在的 Asset 不会创建孤立阅读状态', async () => {
    const { repo, sqlite } = makeResearchDatabase(() => NOW);

    expect(
      await repo.saveReaderState({
        assetId: 'missing',
        pageNumber: 1,
        pageOffsetRatio: 0,
        zoom: 1,
        rotation: 0,
        layout: 'continuous',
        lastContextId: null,
        expectedRevision: 0,
      }),
    ).toEqual({ kind: 'asset-not-found' });
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM research_asset_reader_state').get(),
    ).toEqual({ count: 0 });
  });

  it('账号连接切换后读取各自的 Asset 状态', async () => {
    const first = await storePdf();
    const second = makeResearchDatabase(() => NOW);
    let active = first.sqlite;
    const { SqliteResearchRepository } = await import('./sqlite-repository.js');
    const repo = new SqliteResearchRepository(
      () => active,
      () => NOW,
    );

    expect(await repo.getReaderAsset('asset-1')).not.toBeNull();
    active = second.sqlite;
    expect(await repo.getReaderAsset('asset-1')).toBeNull();
  });
});
