import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_MIGRATIONS = resolve(HERE, '../migrations');

export function openDatabase(path: string): { db: Db; sqlite: Database.Database } {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** 跑 core 自己的迁移。 */
export function runCoreMigrations(db: Db): void {
  migrate(db, { migrationsFolder: CORE_MIGRATIONS });
}

/** 跑某个模块携带的迁移（spec §8.1 migrations 字段）。 */
export function runMigrationsFrom(db: Db, folder: string): void {
  migrate(db, { migrationsFolder: resolve(process.cwd(), folder) });
}

/** 测试专用：`:memory:` 库 + 已跑完 core 迁移。不 mock 数据库（spec §12.2）。 */
export function openTestDatabase(): { db: Db; sqlite: Database.Database } {
  const handle = openDatabase(':memory:');
  runCoreMigrations(handle.db);
  return handle;
}
