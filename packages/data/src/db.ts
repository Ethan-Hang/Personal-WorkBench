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

/**
 * 每个模块的迁移记账表都独立。
 *
 * drizzle 的迁移器用**一张表里的一个全局水位**判断某条迁移该不该跑
 * （`sqlite-core/dialect.js`：`Number(lastDbMigration.created_at) < migration.folderMillis`）。
 * 所有模块共用 `__drizzle_migrations` 时，先跑的模块只要时间戳更新，
 * 后跑模块的迁移就会被**静默跳过**——症状是「表不存在」，而迁移器一声不吭。
 *
 * 分表之后，模块之间的注册顺序与时间戳先后彻底互不影响。这也让「删模块 =
 * 删一个目录」更完整：模块的迁移记账随它自己走，不留在公共表里。
 */
function migrationsTableFor(folder: string): string {
  const slug = folder.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `__drizzle_migrations_${slug}`;
}

/** 跑某个模块携带的迁移（spec §8.1 migrations 字段）。 */
export function runMigrationsFrom(db: Db, folder: string): void {
  migrate(db, {
    migrationsFolder: resolve(process.cwd(), folder),
    migrationsTable: migrationsTableFor(folder),
  });
}

/** 测试专用：`:memory:` 库 + 已跑完 core 迁移。不 mock 数据库（spec §12.2）。 */
export function openTestDatabase(): { db: Db; sqlite: Database.Database } {
  const handle = openDatabase(':memory:');
  runCoreMigrations(handle.db);
  return handle;
}
