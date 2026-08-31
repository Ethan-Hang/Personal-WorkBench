import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';

const HASH = 'a'.repeat(64);

function seedAsset(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']) {
  sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type)
       VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf')`,
    )
    .run(HASH);
}

describe('reader migrations', () => {
  it('建立 reader、批注、索引、OCR 和导出表及页级 FTS', () => {
    const { sqlite } = makeResearchDatabase();
    const names = (
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type IN ('table', 'view') AND name LIKE 'research_%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'research_asset_reader_state',
        'research_reading_contexts',
        'research_collection_contexts',
        'research_annotations',
        'research_annotation_revisions',
        'research_page_text',
        'research_page_text_fts',
        'research_text_index_jobs',
        'research_ocr_jobs',
        'research_annotated_export_jobs',
      ]),
    );
  });

  it('通用层用 null 表示，命名上下文名称和目录默认绑定受约束', () => {
    const { sqlite } = makeResearchDatabase();
    seedAsset(sqlite);
    sqlite
      .prepare(
        `INSERT INTO research_annotations
         (id, asset_id, context_id, kind, page_number, anchor_json)
         VALUES ('annotation-general', 'asset-1', NULL, 'highlight', 1, '{}')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_reading_contexts (id, name, normalized_name)
         VALUES ('context-1', '毕业论文', '毕业论文')`,
      )
      .run();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO research_reading_contexts (id, name, normalized_name)
           VALUES ('context-2', '同名', '毕业论文')`,
        )
        .run(),
    ).toThrow(/UNIQUE/);
    expect(
      sqlite
        .prepare("SELECT context_id FROM research_annotations WHERE id = 'annotation-general'")
        .get(),
    ).toEqual({ context_id: null });
  });

  it('页正文写入、更新和删除同步 FTS', () => {
    const { sqlite } = makeResearchDatabase();
    seedAsset(sqlite);
    sqlite
      .prepare(
        `INSERT INTO research_page_text
         (asset_id, page_number, source, content_hash, text_content, generator, generator_version)
         VALUES ('asset-1', 1, 'pdf', ?, 'alpha research', 'pdfjs', '6.2.108')`,
      )
      .run(HASH);
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM research_page_text_fts WHERE research_page_text_fts MATCH 'alpha'",
        )
        .get(),
    ).toEqual({ count: 1 });

    sqlite
      .prepare(
        `UPDATE research_page_text SET text_content = 'beta workbench'
         WHERE asset_id = 'asset-1' AND page_number = 1`,
      )
      .run();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM research_page_text_fts WHERE research_page_text_fts MATCH 'alpha'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM research_page_text_fts WHERE research_page_text_fts MATCH 'beta'",
        )
        .get(),
    ).toEqual({ count: 1 });

    sqlite
      .prepare("DELETE FROM research_page_text WHERE asset_id = 'asset-1' AND page_number = 1")
      .run();
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM research_page_text_fts WHERE research_page_text_fts MATCH 'beta'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it('数据库拒绝非法阅读状态，删除 Asset 会级联阅读派生数据', () => {
    const { sqlite } = makeResearchDatabase();
    seedAsset(sqlite);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO research_asset_reader_state
           (asset_id, page_number, page_offset_ratio, zoom, rotation, layout)
           VALUES ('asset-1', 0, 0, 1, 0, 'continuous')`,
        )
        .run(),
    ).toThrow(/CHECK/);

    sqlite
      .prepare(
        `INSERT INTO research_asset_reader_state
         (asset_id, page_number, page_offset_ratio, zoom, rotation, layout)
         VALUES ('asset-1', 2, 0.5, 1.25, 90, 'continuous')`,
      )
      .run();
    sqlite.prepare("DELETE FROM research_assets WHERE id = 'asset-1'").run();
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM research_asset_reader_state').get(),
    ).toEqual({ count: 0 });
  });
});
