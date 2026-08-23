import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});

describe('research FTS5 search index', () => {
  it('迁移建立聚合文档，并由 Work、Edition、Contributor 和 Identifier 触发器同步', () => {
    const database = makeResearchDatabase();
    databases.push(database);
    const { sqlite } = database;
    sqlite
      .prepare(
        `INSERT INTO research_works (id, type, title, title_sort, abstract, year, status)
         VALUES ('work-1', 'article', 'Trustworthy Systems', 'trustworthy systems',
                 'Local-first abstract', 2026, 'active')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_editions
         (id, work_id, kind, title, publication_title, publisher)
         VALUES ('edition-1', 'work-1', 'journal', 'Trustworthy Systems',
                 'Journal of Durable Data', 'Open Press')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_contributors (id, edition_id, role, display_name, sequence)
         VALUES ('contributor-1', 'edition-1', 'author', 'Ada Lovelace', 0)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_identifiers
         (id, entity_type, entity_id, scheme, value, normalized_value)
         VALUES ('identifier-1', 'edition', 'edition-1', 'doi', '10.1000/trust', '10.1000/trust')`,
      )
      .run();

    expect(
      sqlite
        .prepare(
          `SELECT title, abstract, authors, publication, identifiers
           FROM research_work_search WHERE work_id = 'work-1'`,
        )
        .get(),
    ).toMatchObject({
      title: 'Trustworthy Systems',
      abstract: 'Local-first abstract',
      authors: 'Ada Lovelace',
      publication: expect.stringContaining('Journal of Durable Data'),
      identifiers: 'doi:10.1000/trust',
    });

    sqlite
      .prepare(
        "UPDATE research_contributors SET display_name = 'Grace Hopper' WHERE id = 'contributor-1'",
      )
      .run();
    sqlite.prepare("DELETE FROM research_identifiers WHERE id = 'identifier-1'").run();
    expect(
      sqlite
        .prepare("SELECT authors, identifiers FROM research_work_search WHERE work_id = 'work-1'")
        .get(),
    ).toEqual({ authors: 'Grace Hopper', identifiers: '' });
  });

  it('重建命令从规范表恢复缺失索引', async () => {
    const database = makeResearchDatabase();
    databases.push(database);
    database.sqlite
      .prepare(
        `INSERT INTO research_works (id, type, title, title_sort, status)
         VALUES ('work-1', 'article', 'First', 'first', 'active'),
                ('work-2', 'report', 'Second', 'second', 'active')`,
      )
      .run();
    database.sqlite.prepare('DELETE FROM research_work_search').run();
    expect(
      (
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_work_search').get() as {
          count: number;
        }
      ).count,
    ).toBe(0);

    expect(await database.repo.rebuildSearchIndex()).toBe(2);
    expect(
      (
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_work_search').get() as {
          count: number;
        }
      ).count,
    ).toBe(2);
  });
});
