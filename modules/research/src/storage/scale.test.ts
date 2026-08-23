import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createDatabaseClient, runCoreMigrations, runMigrationsFrom } from '@workbench/data';
import { SqliteResearchRepository } from './sqlite-repository.js';

const enabled = process.env.RUN_RESEARCH_SCALE === '1';
const run = enabled ? describe : describe.skip;
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

run('research 正式表结构规模基准', () => {
  it('10k Work / 20k Asset 达到切片 A 资源阈值', async () => {
    const root = mkdtempSync(join(tmpdir(), 'research-scale-'));
    roots.push(root);
    const dbPath = join(root, 'research.db');
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = createDatabaseClient(sqlite);
    runCoreMigrations(db);
    runMigrationsFrom(db, 'modules/research/migrations');

    const seedStarted = performance.now();
    sqlite.transaction(() => {
      const work = sqlite.prepare(
        `INSERT INTO research_works
         (id, type, title, title_sort, year, status)
         VALUES (?, 'article', ?, ?, ?, 'active')`,
      );
      const edition = sqlite.prepare(
        `INSERT INTO research_editions (id, work_id, kind, title)
         VALUES (?, ?, 'journal', ?)`,
      );
      const asset = sqlite.prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state)
         VALUES (?, 'sha256', ?, 4096, 'application/pdf', 'active')`,
      );
      const location = sqlite.prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, object_key, state)
         VALUES (?, ?, 'managed', ?, ?, ?, 'available')`,
      );
      const attachment = sqlite.prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status)
         VALUES (?, ?, ?, 'primary-pdf', ?, 'active')`,
      );
      const collectionEntry = sqlite.prepare(
        `INSERT INTO research_collection_entries (id, collection_id, work_id)
         VALUES (?, 'collection-main', ?)`,
      );
      const tag = sqlite.prepare(
        `INSERT INTO research_tags (id, name, normalized_name) VALUES (?, ?, ?)`,
      );
      const workTag = sqlite.prepare(
        `INSERT INTO research_work_tags (id, work_id, tag_id) VALUES (?, ?, ?)`,
      );

      sqlite
        .prepare(
          `INSERT INTO research_collections (id, name, normalized_name)
           VALUES ('collection-main', '全部论文', '全部论文')`,
        )
        .run();
      for (let index = 0; index < 1_000; index += 1) {
        tag.run(`tag-${index}`, `Tag ${index}`, `tag ${index}`);
      }
      for (let index = 0; index < 10_000; index += 1) {
        const workId = `work-${index.toString().padStart(5, '0')}`;
        work.run(workId, `Paper ${index}`, `paper ${index}`, 2000 + (index % 27));
        collectionEntry.run(`entry-${index}`, workId);
        for (let tagIndex = 0; tagIndex < 3; tagIndex += 1) {
          const selected = (index * 7 + tagIndex) % 1_000;
          workTag.run(`work-tag-${index}-${tagIndex}`, workId, `tag-${selected}`);
        }
      }
      for (let index = 0; index < 20_000; index += 1) {
        const workIndex = index % 10_000;
        const workId = `work-${workIndex.toString().padStart(5, '0')}`;
        const editionId = `edition-${index}`;
        const assetId = `asset-${index}`;
        const digest = index.toString(16).padStart(64, '0');
        edition.run(editionId, workId, `Paper ${workIndex}`);
        asset.run(assetId, digest);
        const objectKey = `sha256/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}`;
        location.run(`location-${index}`, assetId, `/generated/${index}.pdf`, objectKey, objectKey);
        attachment.run(`attachment-${index}`, editionId, assetId, `${index}.pdf`);
      }
    })();
    const seedMs = performance.now() - seedStarted;

    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    const repo = new SqliteResearchRepository(() => sqlite);
    const listTimes: number[] = [];
    for (let sample = 0; sample < 30; sample += 1) {
      const started = performance.now();
      await repo.listWorks({ status: 'active', query: `Paper ${sample}`, limit: 30 });
      listTimes.push(performance.now() - started);
    }
    const maintenanceTimes: number[] = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const started = performance.now();
      sqlite
        .prepare(
          `SELECT l.state, COUNT(*) AS count
           FROM research_asset_locations l
           JOIN research_assets a ON a.id = l.asset_id
           GROUP BY l.state`,
        )
        .all();
      maintenanceTimes.push(performance.now() - started);
    }
    const hashStarted = performance.now();
    const findHash = sqlite.prepare(
      "SELECT id FROM research_assets WHERE hash_algorithm = 'sha256' AND content_hash = ?",
    );
    for (let index = 0; index < 1_000; index += 1) {
      findHash.get(index.toString(16).padStart(64, '0'));
    }
    const hashMs = performance.now() - hashStarted;

    const metadataStarted = performance.now();
    sqlite.transaction(() => {
      const insert = sqlite.prepare(
        `INSERT INTO research_metadata_assertions
         (id, entity_type, entity_id, field_name, value_json, source_kind, observed_at)
         VALUES (?, 'work', ?, 'title', ?, 'filename', '2026-08-23T12:00:00.000Z')`,
      );
      for (let index = 0; index < 200; index += 1) {
        insert.run(
          `scale-assertion-${index}`,
          `work-${index.toString().padStart(5, '0')}`,
          `"${index}"`,
        );
      }
    })();
    const metadataMs = performance.now() - metadataStarted;
    const integrityStarted = performance.now();
    const integrity = sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const integrityMs = performance.now() - integrityStarted;

    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    const dbMiB = statSync(dbPath).size / 1024 / 1024;
    const rssMiB = process.memoryUsage().rss / 1024 / 1024;
    const metrics = {
      seedMs,
      dbMiB,
      rssMiB,
      listP95Ms: p95(listTimes),
      maintenanceP95Ms: p95(maintenanceTimes),
      hash1000Ms: hashMs,
      metadata200Ms: metadataMs,
      integrityMs,
    };
    console.info('research scale metrics', metrics);

    expect(integrity).toEqual([{ integrity_check: 'ok' }]);
    expect(metrics.listP95Ms).toBeLessThanOrEqual(100);
    expect(metrics.maintenanceP95Ms).toBeLessThanOrEqual(250);
    expect(metrics.hash1000Ms).toBeLessThanOrEqual(100);
    expect(metrics.metadata200Ms).toBeLessThanOrEqual(1_000);
    expect(metrics.dbMiB).toBeLessThanOrEqual(100);
    expect(metrics.rssMiB).toBeLessThanOrEqual(250);
    expect(metrics.integrityMs).toBeLessThanOrEqual(2_000);

    sqlite.close();
  }, 30_000);
});
