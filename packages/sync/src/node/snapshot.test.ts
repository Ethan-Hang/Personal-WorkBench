import { expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createSnapshot } from './snapshot.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'snap-'));
}

const ctx = { accountId: 'local-default', device: 'test-host', appVersion: '0.0.0' };

it('快照捕获仍在 WAL 里、尚未 checkpoint 的数据', async () => {
  const dir = tmpDir();
  const dbPath = join(dir, 'w.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec('CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT)');
  sqlite.exec("INSERT INTO items VALUES ('a', '在 WAL 里')");

  const { gz, meta } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  const restored = join(dir, 'restored.db');
  writeFileSync(restored, gunzipSync(gz));
  const check = new Database(restored, { readonly: true });
  expect(check.prepare('SELECT title FROM items').get()).toEqual({ title: '在 WAL 里' });
  expect(meta.counts.items).toBe(1);

  check.close();
  sqlite.close();
});

it('快照记录每条迁移谱系各自的水位', async () => {
  const dir = tmpDir();
  const sqlite = new Database(join(dir, 'm.db'));
  sqlite.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, created_at NUMERIC)');
  sqlite.exec(
    'CREATE TABLE __drizzle_migrations_modules_todo_migrations (id INTEGER PRIMARY KEY, created_at NUMERIC)',
  );
  sqlite.exec('INSERT INTO __drizzle_migrations (created_at) VALUES (100), (300)');
  sqlite.exec('INSERT INTO __drizzle_migrations_modules_todo_migrations (created_at) VALUES (200)');

  const { meta } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  expect(meta.migrations).toEqual({
    __drizzle_migrations: 300,
    __drizzle_migrations_modules_todo_migrations: 200,
  });
  sqlite.close();
});

it('临时快照文件用完即删，不留垃圾', async () => {
  const dir = tmpDir();
  const tmpPath = join(dir, 'tmp.db');
  const sqlite = new Database(join(dir, 'x.db'));
  sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  await createSnapshot(sqlite, tmpPath, ctx);

  expect(existsSync(tmpPath)).toBe(false);
  sqlite.close();
});

it('文件名带 UTC 时间戳且以 .db.gz 结尾', async () => {
  const dir = tmpDir();
  const sqlite = new Database(join(dir, 'n.db'));
  sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  const { name } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  expect(name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db\.gz$/);
  sqlite.close();
});
