import { describe, expect, it } from 'vitest';
import { runMigrationsFrom } from '@workbench/data';
import { makeResearchDatabase } from '../testing/harness.js';

const HASH_A = 'a'.repeat(64);

function seedWork(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite'], id: string) {
  sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort)
       VALUES (?, 'article', ?, ?)`,
    )
    .run(id, `Title ${id}`, `title ${id}`);
  sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES (?, ?, 'journal', ?)`,
    )
    .run(`edition-${id}`, id, `Title ${id}`);
}

describe('research migrations', () => {
  it('建立 38 张规范领域表和三个 FTS5 搜索索引且迁移可重复执行', () => {
    const { db, sqlite } = makeResearchDatabase();
    const tables = sqlite
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'research_%'
           AND name NOT LIKE 'research_work_search%'
           AND name NOT LIKE 'research_page_text_fts%'
           AND name NOT LIKE 'research_knowledge_search_fts%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(38);
    expect(tables.map((table) => table.name)).toContain('research_works');
    expect(tables.map((table) => table.name)).toContain('research_export_jobs');
    expect(tables.map((table) => table.name)).toContain('research_metadata_cache');
    expect(tables.map((table) => table.name)).toContain('research_storage_config');
    expect(tables.map((table) => table.name)).toContain('research_managed_root_migrations');
    expect(tables.map((table) => table.name)).toContain('research_asset_reader_state');
    expect(tables.map((table) => table.name)).toContain('research_annotations');
    expect(tables.map((table) => table.name)).toContain('research_ocr_page_cache');
    expect(tables.map((table) => table.name)).toContain('research_notes');
    expect(tables.map((table) => table.name)).toContain('research_evidence');
    expect(tables.map((table) => table.name)).toContain('research_knowledge_search');
    expect(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name = 'research_work_search'`,
        )
        .get(),
    ).toEqual({ name: 'research_work_search' });
    expect(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name = 'research_page_text_fts'`,
        )
        .get(),
    ).toEqual({ name: 'research_page_text_fts' });
    expect(
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name = 'research_knowledge_search_fts'`,
        )
        .get(),
    ).toEqual({ name: 'research_knowledge_search_fts' });

    // 模块迁移有独立 ledger，重复执行不应重放 DDL。
    expect(() => runMigrationsFrom(db, 'modules/research/migrations')).not.toThrow();
  });

  it('内容 hash 是硬唯一，且数据库拒绝非法 SHA-256', () => {
    const { sqlite } = makeResearchDatabase();
    const insert = sqlite.prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type)
       VALUES (?, 'sha256', ?, 42, 'application/pdf')`,
    );

    insert.run('asset-1', HASH_A);
    expect(() => insert.run('asset-2', HASH_A)).toThrow(/UNIQUE/);
    expect(() => insert.run('asset-bad', `${'a'.repeat(63)}Z`)).toThrow(/CHECK/);
  });

  it('同一 DOI 可以出现在多个版本，供服务层生成重复候选', () => {
    const { sqlite } = makeResearchDatabase();
    seedWork(sqlite, 'work-1');
    seedWork(sqlite, 'work-2');

    const insert = sqlite.prepare(
      `INSERT INTO research_identifiers
       (id, entity_type, entity_id, scheme, value, normalized_value)
       VALUES (?, 'edition', ?, 'doi', ?, ?)`,
    );
    insert.run('identifier-1', 'edition-work-1', 'https://doi.org/10.1000/Test', '10.1000/test');
    insert.run('identifier-2', 'edition-work-2', 'doi:10.1000/test', '10.1000/test');

    const count = sqlite
      .prepare(
        `SELECT COUNT(*) AS count FROM research_identifiers
         WHERE scheme = 'doi' AND normalized_value = '10.1000/test'`,
      )
      .get() as { count: number };
    expect(count.count).toBe(2);
  });

  it('一个 Work 可加入多个目录，移除一条引用不影响其他关系', () => {
    const { sqlite } = makeResearchDatabase();
    seedWork(sqlite, 'work-1');
    const insertCollection = sqlite.prepare(
      `INSERT INTO research_collections (id, name, normalized_name)
       VALUES (?, ?, ?)`,
    );
    insertCollection.run('collection-a', 'A', 'a');
    insertCollection.run('collection-b', 'B', 'b');
    const insertEntry = sqlite.prepare(
      `INSERT INTO research_collection_entries (id, collection_id, work_id)
       VALUES (?, ?, 'work-1')`,
    );
    insertEntry.run('entry-a', 'collection-a');
    insertEntry.run('entry-b', 'collection-b');

    sqlite.prepare('DELETE FROM research_collection_entries WHERE id = ?').run('entry-a');

    expect(
      sqlite
        .prepare('SELECT collection_id FROM research_collection_entries WHERE work_id = ?')
        .all('work-1'),
    ).toEqual([{ collection_id: 'collection-b' }]);
    expect(sqlite.prepare('SELECT id FROM research_works WHERE id = ?').get('work-1')).toEqual({
      id: 'work-1',
    });
  });

  it('根目录同名、同 Asset 多个托管位置和同字段多个 current 都由数据库拒绝', () => {
    const { sqlite } = makeResearchDatabase();
    seedWork(sqlite, 'work-1');
    sqlite
      .prepare(
        `INSERT INTO research_collections (id, name, normalized_name)
         VALUES ('collection-1', '论文', '论文')`,
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO research_collections (id, name, normalized_name)
           VALUES ('collection-2', '论文', '论文')`,
        )
        .run(),
    ).toThrow(/UNIQUE/);

    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type)
         VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf')`,
      )
      .run(HASH_A);
    const insertLocation = sqlite.prepare(
      `INSERT INTO research_asset_locations
       (id, asset_id, mode, original_path, resolved_path, object_key)
       VALUES (?, 'asset-1', 'managed', ?, ?, ?)`,
    );
    insertLocation.run('location-1', '/tmp/source-a.pdf', '/library/object', 'sha256/aa/aa/hash');
    expect(() =>
      insertLocation.run(
        'location-2',
        '/tmp/source-b.pdf',
        '/library/another-object',
        'sha256/aa/aa/hash',
      ),
    ).toThrow(/UNIQUE/);

    const insertAssertion = sqlite.prepare(
      `INSERT INTO research_metadata_assertions
       (id, entity_type, entity_id, field_name, value_json, source_kind, observed_at, is_selected)
       VALUES (?, 'work', 'work-1', 'title', ?, 'user', '2026-08-23T10:20:30.000Z', 1)`,
    );
    insertAssertion.run('assertion-1', JSON.stringify('标题一'));
    expect(() => insertAssertion.run('assertion-2', JSON.stringify('标题二'))).toThrow(/UNIQUE/);
  });

  it('附件引用阻止直接删除 Asset；删除 Work 只级联关系并保留内容索引', () => {
    const { sqlite } = makeResearchDatabase();
    seedWork(sqlite, 'work-1');
    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type)
         VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf')`,
      )
      .run(HASH_A);
    sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name)
         VALUES ('attachment-1', 'edition-work-1', 'asset-1', 'primary-pdf', 'paper.pdf')`,
      )
      .run();

    expect(() => sqlite.prepare('DELETE FROM research_assets WHERE id = ?').run('asset-1')).toThrow(
      /FOREIGN KEY/,
    );

    sqlite.prepare('DELETE FROM research_works WHERE id = ?').run('work-1');
    expect(
      sqlite.prepare('SELECT id FROM research_attachments WHERE id = ?').get('attachment-1'),
    ).toBeUndefined();
    expect(sqlite.prepare('SELECT id FROM research_assets WHERE id = ?').get('asset-1')).toEqual({
      id: 'asset-1',
    });
  });
});
