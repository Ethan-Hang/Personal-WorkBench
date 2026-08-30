import { runMigrationsFrom } from '@workbench/data';
import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

describe('research knowledge migration', () => {
  it('建立 C1 真源、revision 与 FTS 表，并可重复运行迁移入口', () => {
    const database = makeResearchDatabase();
    try {
      const names = database.sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE name LIKE 'research_%' AND name IN (
             'research_notes', 'research_evidence', 'research_note_links',
             'research_knowledge_revisions', 'research_knowledge_search',
             'research_knowledge_search_fts'
           ) ORDER BY name`,
        )
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toEqual([
        'research_evidence',
        'research_knowledge_revisions',
        'research_knowledge_search',
        'research_knowledge_search_fts',
        'research_note_links',
        'research_notes',
      ]);

      expect(() => runMigrationsFrom(database.db, 'modules/research/migrations')).not.toThrow();
    } finally {
      database.sqlite.close();
    }
  });

  it('由数据库强制状态、revision、tombstone 和单一关系目标', () => {
    const database = makeResearchDatabase();
    try {
      expect(() =>
        database.sqlite
          .prepare(
            `INSERT INTO research_notes
             (id, title, body, status, revision, created_at, updated_at)
             VALUES ('bad-status', 'Bad', '', 'archived', 1, ?, ?)`,
          )
          .run('2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z'),
      ).toThrow(/constraint/i);

      database.sqlite
        .prepare(
          `INSERT INTO research_notes
           (id, title, body, status, revision, created_at, updated_at)
           VALUES ('note-1', 'Methods', '', 'active', 1, ?, ?)`,
        )
        .run('2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z');
      expect(() =>
        database.sqlite
          .prepare(
            `INSERT INTO research_note_links
             (id, note_id, status, revision, created_at, updated_at)
             VALUES ('link-1', 'note-1', 'active', 1, ?, ?)`,
          )
          .run('2026-08-30T00:00:00.000Z', '2026-08-30T00:00:00.000Z'),
      ).toThrow(/constraint/i);
    } finally {
      database.sqlite.close();
    }
  });

  it('统一内容表自动同步 FTS，A/B 数据不生成伪知识对象', () => {
    const database = makeResearchDatabase();
    try {
      database.sqlite
        .prepare(
          `INSERT INTO research_works (id, type, title, title_sort, status)
           VALUES ('work-1', 'article', 'Existing paper', 'existing paper', 'active')`,
        )
        .run();
      database.sqlite
        .prepare(
          `INSERT INTO research_reading_contexts
           (id, name, normalized_name, status) VALUES ('context-1', 'Review', 'review', 'active')`,
        )
        .run();
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_notes').get(),
      ).toMatchObject({ count: 0 });
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_evidence').get(),
      ).toMatchObject({ count: 0 });

      database.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search
           (entity_type, entity_id, context_id, work_id, title, body, status, updated_at)
           VALUES ('note', 'note-search-1', NULL, NULL, 'Methods note', 'causal inference',
                   'active', '2026-08-30T00:00:00.000Z')`,
        )
        .run();
      expect(
        database.sqlite
          .prepare(
            `SELECT search.entity_id
             FROM research_knowledge_search_fts fts
             JOIN research_knowledge_search search ON search.rowid = fts.rowid
             WHERE research_knowledge_search_fts MATCH 'causal'`,
          )
          .get(),
      ).toEqual({ entity_id: 'note-search-1' });
    } finally {
      database.sqlite.close();
    }
  });
});
