import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SqliteInteropRepository } from './sqlite-interop-repository.js';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-31T09:00:00.000Z';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createDraft(id: string, requestId = `request-${id}`) {
  return {
    id,
    requestId,
    source: {
      id: `source-${id}`,
      format: 'bibtex' as const,
      displayName: 'library.bib',
      sourcePath: '/tmp/library.bib',
      contentHash: hash(`source-${id}`),
      byteSize: 1_024,
      encoding: 'utf-8' as const,
      parserName: '@retorquere/bibtex-parser',
      parserVersion: '10.0.1',
    },
  };
}

function parsedRecord(index: number) {
  const rawRecord = `@article{shared-key, title={Paper ${index}}}`;
  return {
    id: `record-${index}`,
    ordinal: index,
    sourceKey: 'shared-key',
    rawHash: hash(rawRecord),
    rawRecord,
    summary: `Paper ${index}`,
    formatShadow: { fields: { custom: `unknown-${index}` } },
    mapped: {
      type: 'article' as const,
      sourceType: 'article',
      title: `Paper ${index}`,
      abstract: null,
      issued: { year: 2026, month: null, day: null, literal: '2026' },
      publicationTitle: null,
      publisher: null,
      volume: null,
      issue: null,
      pages: null,
      contributors: [],
      identifiers: [],
      tagSuggestions: [],
    },
    diagnostics: [],
    status: 'valid' as const,
  };
}

describe('SqliteInteropRepository', () => {
  it('支持 10,000 条记录、重复 source key 和末页分页', () => {
    const { interopRepo, sqlite } = makeResearchDatabase(() => NOW);
    const created = interopRepo.createOrGetImport(createDraft('job-scale'));
    const parsing = interopRepo.updateImport(created.id, created.revision, {
      status: 'parsing',
      totalCount: 10_000,
    });
    const records = Array.from({ length: 10_000 }, (_, index) => parsedRecord(index));
    const parsed = interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 10_000,
      checkpointOrdinal: 10_000,
      records,
    });

    expect(parsed.counts.processed).toBe(10_000);
    expect(parsed.counts.valid).toBe(10_000);
    const page = interopRepo.listRecords(parsed.id, { offset: 9_950, limit: 50 });
    expect(page.items).toHaveLength(50);
    expect(page.items[0]?.ordinal).toBe(9_950);
    expect(page.nextOffset).toBeNull();
    expect(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM research_interop_records
           WHERE source_id = ? AND source_key = 'shared-key'`,
        )
        .get(parsed.source.id),
    ).toEqual({ count: 10_000 });
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('request id 幂等且 revision 冲突不会覆盖决定', () => {
    const { interopRepo } = makeResearchDatabase(() => NOW);
    const first = interopRepo.createOrGetImport(createDraft('job-idempotent', 'same-request'));
    const second = interopRepo.createOrGetImport(createDraft('job-ignored', 'same-request'));
    expect(second.id).toBe(first.id);

    const parsing = interopRepo.updateImport(first.id, first.revision, {
      status: 'parsing',
      totalCount: 1,
    });
    interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 1,
      checkpointOrdinal: 1,
      records: [parsedRecord(0)],
    });
    const record = interopRepo.getRecord('record-0');
    expect(record).not.toBeNull();
    const decision = {
      action: 'accept' as const,
      workId: null,
      editionId: null,
      fieldSuggestions: [],
      attachmentCandidates: [],
    };
    interopRepo.saveDecision('record-0', record!.revision, decision);
    expect(() => interopRepo.saveDecision('record-0', record!.revision, decision)).toThrow(
      /revision conflict/,
    );
  });

  it('每次操作读取当前 sqlite，账号切换后不会沿用旧库', () => {
    const first = makeResearchDatabase(() => NOW);
    const second = makeResearchDatabase(() => NOW);
    let active = first.sqlite;
    const repo = new SqliteInteropRepository(
      () => active,
      () => NOW,
    );
    repo.createOrGetImport(createDraft('job-account'));
    expect(repo.getImport('job-account')).not.toBeNull();

    active = second.sqlite;
    expect(repo.getImport('job-account')).toBeNull();
    repo.createOrGetImport(createDraft('job-second-account'));
    expect(first.interopRepo.getImport('job-second-account')).toBeNull();
    expect(second.interopRepo.getImport('job-second-account')).not.toBeNull();
  });

  it('中断恢复保留完整 checkpoint，等待审查时可直接取消', () => {
    const { interopRepo } = makeResearchDatabase(() => NOW);
    const created = interopRepo.createOrGetImport(createDraft('job-recovery'));
    const parsing = interopRepo.updateImport(created.id, created.revision, {
      status: 'parsing',
      totalCount: 2,
    });
    const checkpoint = interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 2,
      checkpointOrdinal: 1,
      records: [parsedRecord(0)],
    });

    expect(interopRepo.reconcileInterrupted()).toBe(1);
    const interrupted = interopRepo.getImport(created.id)!;
    expect(interrupted).toMatchObject({
      status: 'interrupted',
      checkpointOrdinal: checkpoint.checkpointOrdinal,
    });
    expect(interrupted.counts.processed).toBe(1);

    const reviewing = interopRepo.updateImport(interrupted.id, interrupted.revision, {
      status: 'awaiting-review',
    });
    const cancelled = interopRepo.requestCancel(reviewing.id, reviewing.revision);
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelRequested: true,
      checkpointOrdinal: 1,
    });
  });

  it('导出范围排除回收站，preferred/all 版本策略和 key revision 可重复验证', () => {
    const { interopRepo, sqlite } = makeResearchDatabase(() => NOW);
    for (const [id, status] of [
      ['work-a', 'active'],
      ['work-b', 'active'],
      ['work-trash', 'trashed'],
    ] as const) {
      sqlite
        .prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, status, revision, created_at, updated_at)
           VALUES (?, 'article', ?, ?, ?, 1, ?, ?)`,
        )
        .run(id, id, id, status, NOW, NOW);
      for (const suffix of ['1', '2']) {
        sqlite
          .prepare(
            `INSERT INTO research_editions
             (id, work_id, kind, title, revision, created_at, updated_at)
             VALUES (?, ?, 'journal', ?, 1, ?, ?)`,
          )
          .run(`${id}-edition-${suffix}`, id, `${id}-${suffix}`, NOW, NOW);
      }
      sqlite
        .prepare('UPDATE research_works SET preferred_edition_id = ? WHERE id = ?')
        .run(`${id}-edition-2`, id);
    }
    sqlite
      .prepare(
        `INSERT INTO research_collections
         (id, parent_id, name, normalized_name, kind, sort_order, created_at, updated_at)
         VALUES ('collection-a', NULL, 'A', 'a', 'manual', 0, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_collection_entries (id, collection_id, work_id, created_at)
         VALUES ('collection-entry-a', 'collection-a', 'work-a', ?)`,
      )
      .run(NOW);

    expect(interopRepo.projectExportRecords({ kind: 'all-active' }, 'preferred')).toHaveLength(2);
    expect(interopRepo.projectExportRecords({ kind: 'all-active' }, 'all')).toHaveLength(4);
    expect(
      interopRepo.projectExportRecords(
        { kind: 'collection', collectionId: 'collection-a' },
        'preferred',
      ),
    ).toMatchObject([{ work: { id: 'work-a' }, edition: { id: 'work-a-edition-2' } }]);
    expect(
      interopRepo.projectExportRecords(
        { kind: 'selection', workIds: ['work-a', 'work-trash'] },
        'preferred',
      ),
    ).toMatchObject([{ work: { id: 'work-a' } }]);

    const saved = interopRepo.saveCitationKeyPreference({
      id: 'key-a',
      workId: 'work-a',
      editionId: null,
      preferredKey: 'Smith2026',
      expectedRevision: 0,
    });
    expect(saved).toMatchObject({ preferredKey: 'Smith2026', revision: 1, source: 'user' });
    expect(() =>
      interopRepo.saveCitationKeyPreference({
        id: 'key-a-stale',
        workId: 'work-a',
        editionId: null,
        preferredKey: 'Changed',
        expectedRevision: 0,
      }),
    ).toThrow(/revision conflict/);
  });
});
