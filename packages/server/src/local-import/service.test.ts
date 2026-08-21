import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountsStore,
  ConnectionHolder,
  createDatabaseClient,
  openSqliteConnection,
  resolveActiveDatabase,
  runCoreMigrations,
  SqliteItemRepository,
} from '@workbench/data';
import { migrationWatermarks } from '@workbench/sync/node';
import { LocalImportService } from './service.js';

const temporaryDirectories: string[] = [];
const openDatabases: Database.Database[] = [];

function migrate(sqlite: Database.Database): void {
  runCoreMigrations(createDatabaseClient(sqlite));
}

interface Harness {
  dataDir: string;
  store: AccountsStore;
  holder: ConnectionHolder;
  service: LocalImportService;
}

function createHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-import-account-'));
  temporaryDirectories.push(dataDir);
  const active = resolveActiveDatabase({ dataDir });
  const holder = new ConnectionHolder();
  holder.open(active.dbPath);
  migrate(holder.current());
  const store = new AccountsStore(dataDir);
  const service = new LocalImportService({
    store,
    dataDir,
    migrate,
    localWatermarks: () => migrationWatermarks(holder.current()),
  });
  return { dataDir, store, holder, service };
}

/**
 * 造一份外来的 .db.gz。`migrated: false` 模拟「更旧的代码建的库」——
 * 一张业务表都没有，导入后必须靠跑迁移把它们建出来。
 */
function seedFile(
  options: { migrated?: boolean; seed?: (connection: Database.Database) => void } = {},
): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-import-file-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'seed.db');
  const connection = openSqliteConnection(path);
  if (options.migrated !== false) {
    migrate(connection);
    options.seed?.(connection);
  }
  connection.close();
  const gzPath = join(directory, '2026-08-19T10-00-00-000Z.db.gz');
  writeFileSync(gzPath, gzipSync(readFileSync(path)));
  return gzPath;
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  for (const sqlite of openDatabases.splice(0)) sqlite.close();
  harness.holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('导入为新账号', () => {
  it('建出一个新账号，库文件落在它自己的目录里', async () => {
    const filePath = seedFile();

    const account = await harness.service.importAsNewAccount(filePath, '从文件导入的');

    expect(account.displayName).toBe('从文件导入的');
    expect(existsSync(join(harness.dataDir, account.dbDir, 'workbench.db'))).toBe(true);
    expect(harness.store.read().accounts.map((entry) => entry.id)).toContain(account.id);
  });

  it('新账号里装的是文件里的数据', async () => {
    const filePath = seedFile({
      seed: (connection) => {
        connection
          .prepare(
            "INSERT INTO items (id, kind, title, status, importance, source_module, created_at, updated_at, is_all_day) VALUES ('x','task','文件里的事项','todo','normal','todo','2026-08-19T10:00:00.000Z','2026-08-19T10:00:00.000Z',0)",
          )
          .run();
      },
    });

    const account = await harness.service.importAsNewAccount(filePath, '工作');

    const imported = openSqliteConnection(join(harness.dataDir, account.dbDir, 'workbench.db'));
    openDatabases.push(imported);
    const titles = await new SqliteItemRepository(() => imported).list({});
    expect(titles.map((item) => item.title)).toEqual(['文件里的事项']);
  });

  it('外来的库是更旧的代码建的时也能用：导入后跑了迁移，表都在', async () => {
    const filePath = seedFile({ migrated: false });

    const account = await harness.service.importAsNewAccount(filePath, '很旧的备份');

    const imported = openSqliteConnection(join(harness.dataDir, account.dbDir, 'workbench.db'));
    openDatabases.push(imported);
    expect(() => imported.prepare('SELECT count(*) FROM items').get()).not.toThrow();
  });

  it('一个现有文件都不动：当前账号的库与 activeId 原样', async () => {
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      kind: 'task',
      title: '当前账号的',
    });
    const before = harness.store.read().activeId;

    await harness.service.importAsNewAccount(seedFile(), '工作');

    const items = await new SqliteItemRepository(() => harness.holder.current()).list({});
    expect(items.map((item) => item.title)).toEqual(['当前账号的']);
    expect(harness.store.read().activeId).toBe(before);
  });

  it('文件不存在 → 404', async () => {
    await expect(
      harness.service.importAsNewAccount(join(tmpdir(), 'wb-no-such.db.gz'), '工作'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('不是 gzip → 409', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-import-bad-'));
    temporaryDirectories.push(directory);
    const bad = join(directory, 'bad.db.gz');
    writeFileSync(bad, Buffer.from('这不是 gzip'));

    await expect(harness.service.importAsNewAccount(bad, '工作')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('水位比当前代码新 → 409：向下迁移不存在，导进来也是个跑不动的库', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-import-newer-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'seed.db');
    const connection = openSqliteConnection(path);
    migrate(connection);
    connection.prepare('UPDATE __drizzle_migrations SET created_at = created_at + 999999999').run();
    connection.close();
    const gzPath = join(directory, 'newer.db.gz');
    writeFileSync(gzPath, gzipSync(readFileSync(path)));

    await expect(harness.service.importAsNewAccount(gzPath, '工作')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('被拒绝时不留下半个账号', async () => {
    const before = harness.store.read().accounts.length;

    await expect(
      harness.service.importAsNewAccount(join(tmpdir(), 'wb-no-such.db.gz'), '工作'),
    ).rejects.toThrow();

    expect(harness.store.read().accounts).toHaveLength(before);
  });

  it('显示名为空 → 400，不建一个没有名字的账号', async () => {
    await expect(harness.service.importAsNewAccount(seedFile(), '   ')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
