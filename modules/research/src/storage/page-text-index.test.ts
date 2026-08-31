import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const HASH = 'a'.repeat(64);

function fixture() {
  const database = makeResearchDatabase(() => '2026-08-30T12:00:00.000Z');
  databases.push(database);
  database.sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type)
       VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf')`,
    )
    .run(HASH);
  return database;
}

afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});

describe('page text index repository', () => {
  it('优先页不会越过连续 checkpoint，补齐缺页后继续推进', async () => {
    const { repo } = fixture();
    await repo.resetTextIndexJob({
      assetId: 'asset-1',
      assetHash: HASH,
      parserVersion: 'pdfjs-test',
    });
    await repo.setTextIndexJobStatus('asset-1', 'running');
    await repo.setTextIndexTotalPages('asset-1', 3);

    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 2,
      totalPages: 3,
      source: 'pdf',
      contentHash: HASH,
      textContent: 'priority research page',
      pageSize: { width: 612, height: 792 },
      positions: [{ start: 9, end: 17, x: 10, y: 20, width: 30, height: 8 }],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });
    expect(await repo.getTextIndexJob('asset-1')).toMatchObject({ nextPage: 1, totalPages: 3 });

    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 1,
      totalPages: 3,
      source: 'pdf',
      contentHash: HASH,
      textContent: 'first page',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });
    expect(await repo.getTextIndexJob('asset-1')).toMatchObject({ nextPage: 3 });
    expect(await repo.getTextIndexStats('asset-1')).toEqual({
      indexedPages: 2,
      textCharacters: 32,
      nonEmptyPages: 2,
    });
  });

  it('FTS 搜索返回页码、片段和首个文本位置并支持中文词项', async () => {
    const { repo } = fixture();
    await repo.resetTextIndexJob({
      assetId: 'asset-1',
      assetHash: HASH,
      parserVersion: 'pdfjs-test',
    });
    await repo.setTextIndexJobStatus('asset-1', 'running');
    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 1,
      totalPages: 2,
      source: 'pdf',
      contentHash: HASH,
      textContent: 'local research workbench',
      pageSize: { width: 612, height: 792 },
      positions: [{ start: 6, end: 14, x: 72, y: 700, width: 52, height: 12 }],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });
    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 2,
      totalPages: 2,
      source: 'pdf',
      contentHash: HASH,
      textContent: '本地 研究 工作台',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });

    await expect(
      repo.searchPageText({ query: 'research', assetId: 'asset-1', limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        assetId: 'asset-1',
        pageNumber: 1,
        snippet: 'local research workbench',
        matchStart: 6,
        matchEnd: 14,
        position: { x: 72, y: 700, width: 52, height: 12 },
      }),
    ]);
    await expect(
      repo.searchPageText({ query: '研究', assetId: undefined, limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ pageNumber: 2, source: 'pdf' })]);
  });

  it('parser 或 Asset hash 变化时重置规范页和 FTS 派生数据', async () => {
    const { repo } = fixture();
    await repo.resetTextIndexJob({
      assetId: 'asset-1',
      assetHash: HASH,
      parserVersion: 'pdfjs-old',
    });
    await repo.setTextIndexJobStatus('asset-1', 'running');
    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 1,
      totalPages: 1,
      source: 'pdf',
      contentHash: HASH,
      textContent: 'stale-token',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-old',
    });

    const reset = await repo.resetTextIndexJob({
      assetId: 'asset-1',
      assetHash: 'b'.repeat(64),
      parserVersion: 'pdfjs-new',
    });
    expect(reset).toMatchObject({ nextPage: 1, totalPages: 0, parserVersion: 'pdfjs-new' });
    expect(await repo.getTextIndexStats('asset-1')).toEqual({
      indexedPages: 0,
      textCharacters: 0,
      nonEmptyPages: 0,
    });
    await expect(
      repo.searchPageText({ query: 'stale-token', assetId: 'asset-1', limit: 10 }),
    ).resolves.toEqual([]);
  });
});
