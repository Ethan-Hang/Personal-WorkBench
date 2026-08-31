import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];

function fixture() {
  const database = makeResearchDatabase(() => '2026-08-30T03:00:00.000Z');
  databases.push(database);
  database.sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type)
       VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf')`,
    )
    .run('a'.repeat(64));
  return database;
}

afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});

describe('annotated export job repository', () => {
  it('持久化导出范围、同卷临时路径、进度和逐项报告', async () => {
    const { repo } = fixture();
    const created = await repo.createAnnotatedExportJob({
      id: 'export-1',
      assetId: 'asset-1',
      optionsJson: JSON.stringify({ input: { includeGeneral: true, contextIds: [] } }),
      targetPath: '/exports/paper.pdf',
      tempPath: '/exports/.paper.pdf.tmp-export-1',
      totalAnnotations: 3,
    });
    expect(created).toMatchObject({ status: 'queued', completedAnnotations: 0 });
    await expect(repo.getActiveAnnotatedExportJob()).resolves.toMatchObject({ id: 'export-1' });

    const completed = await repo.updateAnnotatedExportJob('export-1', {
      status: 'completed',
      tempPath: null,
      completedAnnotations: 3,
      reportJson: JSON.stringify({ schemaVersion: 1 }),
      completedAt: '2026-08-30T03:01:00.000Z',
    });
    expect(completed).toMatchObject({
      status: 'completed',
      completedAnnotations: 3,
      reportJson: '{"schemaVersion":1}',
      tempPath: null,
    });
    await expect(repo.getActiveAnnotatedExportJob()).resolves.toBeNull();
  });

  it('服务重启把 queued/running 标为 interrupted 并保留临时路径供清理', async () => {
    const { repo } = fixture();
    for (const [id, status] of [
      ['export-queued', 'queued'],
      ['export-running', 'running'],
      ['export-failed', 'failed'],
    ] as const) {
      await repo.createAnnotatedExportJob({
        id,
        assetId: 'asset-1',
        optionsJson: '{}',
        targetPath: `/exports/${id}.pdf`,
        tempPath: `/exports/.${id}.tmp`,
        totalAnnotations: 1,
      });
      await repo.updateAnnotatedExportJob(id, { status });
    }
    await expect(repo.markRecoverableAnnotatedExportJobsInterrupted()).resolves.toEqual([
      expect.objectContaining({ id: 'export-queued', tempPath: '/exports/.export-queued.tmp' }),
      expect.objectContaining({ id: 'export-running', tempPath: '/exports/.export-running.tmp' }),
    ]);
    await expect(repo.getAnnotatedExportJob('export-running')).resolves.toMatchObject({
      status: 'interrupted',
      errorCode: 'PROCESS_RESTARTED',
    });
    await expect(repo.getAnnotatedExportJob('export-failed')).resolves.toMatchObject({
      status: 'failed',
    });
  });
});
