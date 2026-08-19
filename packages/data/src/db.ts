import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_MIGRATIONS = resolve(HERE, '../migrations');

export function createDatabaseClient(sqlite: Database.Database): Db {
  return drizzle(sqlite, { schema });
}

export function openSqliteConnection(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const SqliteConstructor =
    typeof Database === 'function'
      ? Database
      : (Database as unknown as { default: typeof Database }).default;
  const sqlite = new SqliteConstructor(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

export function openDatabase(path: string): { db: Db; sqlite: Database.Database } {
  const sqlite = openSqliteConnection(path);
  return { db: createDatabaseClient(sqlite), sqlite };
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
  const table = migrationsTableFor(folder);
  const sqlite = (db as unknown as { $client?: Database.Database }).$client;

  if (sqlite && typeof sqlite.prepare === 'function') {
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`,
    );
    const row = sqlite.prepare(`SELECT count(*) as c FROM "${table}"`).get() as
      { c: number } | undefined;
    if (row && row.c === 0) {
      const legacyTableExists = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`,
        )
        .get();
      if (legacyTableExists) {
        try {
          const journalPath = resolve(process.cwd(), folder, 'meta/_journal.json');
          const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
            entries?: Array<{ when: number }>;
          };
          const timestamps = (journal.entries ?? []).map((e) => e.when);
          if (timestamps.length > 0) {
            const placeholders = timestamps.map(() => '?').join(',');
            const legacyEntries = sqlite
              .prepare(
                `SELECT hash, created_at FROM __drizzle_migrations WHERE created_at IN (${placeholders})`,
              )
              .all(...timestamps) as Array<{ hash: string; created_at: number }>;
            for (const entry of legacyEntries) {
              sqlite
                .prepare(`INSERT INTO "${table}" (hash, created_at) VALUES (?, ?)`)
                .run(entry.hash, entry.created_at);
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  migrate(db, {
    migrationsFolder: resolve(process.cwd(), folder),
    migrationsTable: table,
  });
}

/** 测试专用：`:memory:` 库 + 已跑完 core 迁移。不 mock 数据库（spec §12.2）。 */
export function openTestDatabase(): { db: Db; sqlite: Database.Database } {
  const handle = openDatabase(':memory:');
  runCoreMigrations(handle.db);
  return handle;
}
