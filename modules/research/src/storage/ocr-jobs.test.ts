import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const HASH = 'd'.repeat(64);

function fixture() {
  const database = makeResearchDatabase(() => '2026-08-30T13:00:00.000Z');
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

describe('OCR job repository', () => {
  it('逐页原子保存 checkpoint、缓存和 FTS，并保留已有 PDF 正文', async () => {
    const { repo, sqlite } = fixture();
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
      textContent: 'native searchable text',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });
    await repo.commitPageText({
      assetId: 'asset-1',
      pageNumber: 2,
      totalPages: 2,
      source: 'pdf',
      contentHash: HASH,
      textContent: '',
      pageSize: { width: 612, height: 792 },
      positions: [],
      generator: 'pdfjs',
      generatorVersion: 'pdfjs-test',
    });

    const job = await repo.createOcrJob({
      id: 'ocr-1',
      assetId: 'asset-1',
      assetHash: HASH,
      languages: ['chi_sim', 'eng'],
      engine: 'tesseract.js',
      engineVersion: '7.0.0',
      languagePackVersion: 'packs-v1',
    });
    expect(job).toMatchObject({ status: 'queued', nextPage: 1, assetHash: HASH });
    await repo.setOcrJobStatus(job.id, 'running');
    await repo.setOcrTotalPages(job.id, 2);
    await repo.commitOcrPage({
      jobId: job.id,
      pageNumber: 1,
      totalPages: 2,
      textContent: 'ocr should not replace native text',
      pageSize: { width: 612, height: 792 },
      positions: [],
    });
    await repo.commitOcrPage({
      jobId: job.id,
      pageNumber: 2,
      totalPages: 2,
      textContent: '扫描页 中文 OCR evidence',
      pageSize: { width: 612, height: 792 },
      positions: [],
    });
    expect(await repo.getOcrJob(job.id)).toMatchObject({ nextPage: 3, totalPages: 2 });
    await repo.setOcrJobStatus(job.id, 'completed');

    expect(
      sqlite
        .prepare(
          'SELECT page_number, source, text_content FROM research_page_text WHERE asset_id = ? ORDER BY page_number',
        )
        .all('asset-1'),
    ).toEqual([
      { page_number: 1, source: 'pdf', text_content: 'native searchable text' },
      { page_number: 2, source: 'ocr', text_content: '扫描页 中文 OCR evidence' },
    ]);
    await expect(
      repo.searchPageText({ query: 'evidence', assetId: 'asset-1', limit: 10 }),
    ).resolves.toEqual([expect.objectContaining({ pageNumber: 2, source: 'ocr' })]);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM research_ocr_page_cache').get()).toEqual({
      count: 2,
    });
  });

  it('相同缓存键直接恢复，版本变化保留旧缓存但移出当前索引', async () => {
    const { repo, sqlite } = fixture();
    const create = (id: string, version: string) =>
      repo.createOcrJob({
        id,
        assetId: 'asset-1',
        assetHash: HASH,
        languages: ['eng'],
        engine: 'tesseract.js',
        engineVersion: version,
        languagePackVersion: 'packs-v1',
      });
    const first = await create('ocr-1', '7.0.0');
    await repo.setOcrJobStatus(first.id, 'running');
    await repo.commitOcrPage({
      jobId: first.id,
      pageNumber: 1,
      totalPages: 1,
      textContent: 'cached old OCR token',
      pageSize: { width: 612, height: 792 },
      positions: [],
    });
    await repo.setOcrJobStatus(first.id, 'completed');

    const reused = await create('ocr-2', '7.0.0');
    await repo.setOcrJobStatus(reused.id, 'running');
    await expect(repo.completeOcrJobFromCache(reused.id)).resolves.toMatchObject({
      status: 'completed',
      nextPage: 2,
    });
    await expect(
      repo.searchPageText({ query: 'cached', assetId: 'asset-1', limit: 10 }),
    ).resolves.toHaveLength(1);

    const upgraded = await create('ocr-3', '8.0.0');
    await repo.setOcrJobStatus(upgraded.id, 'running');
    await expect(repo.completeOcrJobFromCache(upgraded.id)).resolves.toBeNull();
    await expect(
      repo.searchPageText({ query: 'cached', assetId: 'asset-1', limit: 10 }),
    ).resolves.toHaveLength(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM research_ocr_page_cache').get()).toEqual({
      count: 1,
    });
  });

  it('重启只恢复 queued、running 和 interrupted 任务', async () => {
    const { repo } = fixture();
    for (const [id, status] of [
      ['ocr-running', 'running'],
      ['ocr-paused', 'paused'],
    ] as const) {
      await repo.createOcrJob({
        id,
        assetId: 'asset-1',
        assetHash: HASH,
        languages: ['eng'],
        engine: 'test',
        engineVersion: '1',
        languagePackVersion: '1',
      });
      await repo.setOcrJobStatus(id, status);
    }
    await expect(repo.markRecoverableOcrJobsInterrupted()).resolves.toEqual(['ocr-running']);
    await expect(repo.getOcrJob('ocr-running')).resolves.toMatchObject({
      status: 'interrupted',
      errorCode: 'PROCESS_RESTARTED',
    });
    await expect(repo.getOcrJob('ocr-paused')).resolves.toMatchObject({ status: 'paused' });
  });
});
