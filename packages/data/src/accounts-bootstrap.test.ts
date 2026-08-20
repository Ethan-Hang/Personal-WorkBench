import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveActiveDatabase } from './accounts-bootstrap.js';
import { AccountsStore, DEFAULT_ACCOUNT_ID } from './accounts-store.js';
import { createDatabaseClient, openSqliteConnection, runCoreMigrations } from './db.js';
import { SqliteItemRepository } from './item-repository.js';

const temporaryDirectories: string[] = [];

function makeDataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-bootstrap-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** 造一个「迁移前」的旧库：`<dataDir>/workbench.db`，带一条真实数据。 */
async function seedLegacyDatabase(dataDir: string): Promise<string> {
  const legacyPath = join(dataDir, 'workbench.db');
  const connection = openSqliteConnection(legacyPath);
  const db = createDatabaseClient(connection);
  runCoreMigrations(db);
  await new SqliteItemRepository(() => connection).create('todo', {
    kind: 'task',
    title: '迁移前就存在的事项',
  });
  connection.close();
  return legacyPath;
}

async function titlesIn(dbPath: string): Promise<string[]> {
  const connection = openSqliteConnection(dbPath);
  try {
    const items = await new SqliteItemRepository(() => connection).list({});
    return items.map((item) => item.title);
  } finally {
    connection.close();
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveActiveDatabase', () => {
  it('把旧库一次性搬进 local-default，数据原封不动', async () => {
    const dataDir = makeDataDir();
    const legacyPath = await seedLegacyDatabase(dataDir);

    const resolved = resolveActiveDatabase({ dataDir });

    expect(resolved.mode).toBe('accounts');
    expect(resolved.dbPath).toBe(join(dataDir, 'accounts', DEFAULT_ACCOUNT_ID, 'workbench.db'));
    expect(await titlesIn(resolved.dbPath)).toEqual(['迁移前就存在的事项']);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it('迁移只搬主库文件，不留下 -wal / -shm', async () => {
    const dataDir = makeDataDir();
    await seedLegacyDatabase(dataDir);

    resolveActiveDatabase({ dataDir });

    expect(readdirSync(dataDir).filter((name) => name.includes('workbench.db'))).toEqual([]);
    expect(readdirSync(join(dataDir, 'accounts', DEFAULT_ACCOUNT_ID))).toEqual(['workbench.db']);
  });

  it('迁移后写下的注册表以 local-default 为当前账号', async () => {
    const dataDir = makeDataDir();
    await seedLegacyDatabase(dataDir);

    resolveActiveDatabase({ dataDir });

    const registry = new AccountsStore(dataDir).read();
    expect(registry.activeId).toBe(DEFAULT_ACCOUNT_ID);
    expect(registry.accounts).toHaveLength(1);
    expect(registry.accounts[0]).toMatchObject({
      id: DEFAULT_ACCOUNT_ID,
      kind: 'local',
      dbDir: `accounts/${DEFAULT_ACCOUNT_ID}`,
    });
  });

  it('全新安装直接建默认账号，不需要有旧库', () => {
    const dataDir = makeDataDir();

    const resolved = resolveActiveDatabase({ dataDir });

    expect(resolved.dbPath).toBe(join(dataDir, 'accounts', DEFAULT_ACCOUNT_ID, 'workbench.db'));
    expect(new AccountsStore(dataDir).exists()).toBe(true);
  });

  it('注册表已存在时不再迁移，遗留的旧库文件原地不动', async () => {
    const dataDir = makeDataDir();
    await seedLegacyDatabase(dataDir);
    resolveActiveDatabase({ dataDir });
    const strayLegacy = join(dataDir, 'workbench.db');
    writeFileSync(strayLegacy, 'not a database');

    const resolved = resolveActiveDatabase({ dataDir });

    expect(resolved.dbPath).toBe(join(dataDir, 'accounts', DEFAULT_ACCOUNT_ID, 'workbench.db'));
    expect(existsSync(strayLegacy)).toBe(true);
  });

  it('注册表跟着 activeId 走，而不是恒定 local-default', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    resolveActiveDatabase({ dataDir });
    const registry = store.read();
    const second = {
      ...registry.accounts[0]!,
      id: 'second',
      displayName: '第二个',
      dbDir: 'accounts/second',
    };
    store.write({ ...registry, activeId: 'second', accounts: [...registry.accounts, second] });

    const resolved = resolveActiveDatabase({ dataDir });

    expect(resolved.dbPath).toBe(join(dataDir, 'accounts', 'second', 'workbench.db'));
  });

  it('WORKBENCH_DB 是逃生舱：锁定单库、不建注册表、不迁移', async () => {
    const dataDir = makeDataDir();
    const legacyPath = await seedLegacyDatabase(dataDir);

    const resolved = resolveActiveDatabase({ dataDir, dbPathOverride: legacyPath });

    expect(resolved).toEqual({ mode: 'single', dbPath: legacyPath });
    expect(new AccountsStore(dataDir).exists()).toBe(false);
    expect(existsSync(legacyPath)).toBe(true);
  });
});
