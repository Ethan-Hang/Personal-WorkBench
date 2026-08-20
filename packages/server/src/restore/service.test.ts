import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConnectionHolder,
  createDatabaseClient,
  openSqliteConnection,
  runCoreMigrations,
  SqliteItemRepository,
} from '@workbench/data';
import type { BackupListItem, BackupMeta } from '@workbench/sync/contract';
import { migrationWatermarks } from '@workbench/sync/node';
import { ServiceState } from '../service-state.js';
import { RestoreService, type RestoreBackupSource } from './service.js';

const temporaryDirectories: string[] = [];

/** 内存里的假云端：只需要能按名字给出 meta 与 .db.gz。 */
class FakeSource implements RestoreBackupSource {
  readonly items = new Map<string, { meta: BackupMeta; gz: Buffer }>();

  async list(): Promise<BackupListItem[]> {
    return [...this.items].map(([name, { meta }]) => ({ name, complete: true, meta }));
  }

  async download(name: string): Promise<Buffer> {
    const found = this.items.get(name);
    if (found === undefined) throw new Error(`没有这份备份：${name}`);
    return found.gz;
  }
}

interface Harness {
  dataDir: string;
  dbPath: string;
  holder: ConnectionHolder;
  state: ServiceState;
  source: FakeSource;
  service: RestoreService;
  /** 让接下来的 N 次迁移失败。1 = 只炸正向 verify，回退那次照常成功。 */
  failMigrations: { remaining: number };
}

function migrate(sqlite: Database.Database): void {
  runCoreMigrations(createDatabaseClient(sqlite));
}

async function titles(connection: Database.Database): Promise<string[]> {
  const items = await new SqliteItemRepository(() => connection).list({});
  return items.map((item) => item.title).sort();
}

function createHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-restore-'));
  temporaryDirectories.push(dataDir);
  const dbPath = join(dataDir, 'accounts', 'local-default', 'workbench.db');
  const holder = new ConnectionHolder();
  migrate(holder.open(dbPath));
  const state = new ServiceState();
  const source = new FakeSource();
  const failMigrations = { remaining: 0 };
  const service = new RestoreService({
    holder,
    state,
    dataDir,
    dbPath: () => dbPath,
    source,
    moduleIds: [],
    migrate: (sqlite) => {
      if (failMigrations.remaining > 0) {
        failMigrations.remaining -= 1;
        throw new Error('迁移炸了');
      }
      migrate(sqlite);
    },
  });
  return { dataDir, dbPath, holder, state, source, service, failMigrations };
}

/** 造一份「云端备份」：内容由 seed 决定，迁移水位与本地相同。 */
async function seedBackup(
  target: Harness,
  name: string,
  seed: (connection: Database.Database) => Promise<void>,
  overrides: Partial<BackupMeta> = {},
): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-restore-seed-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'seed.db');
  const connection = openSqliteConnection(path);
  migrate(connection);
  await seed(connection);
  const migrations = migrationWatermarks(connection);
  connection.close();

  target.source.items.set(name, {
    gz: gzipSync(readFileSync(path)),
    meta: {
      v: 1,
      createdAt: '2026-08-19T10:00:00.000Z',
      accountId: 'local-default',
      device: '另一台机器',
      appVersion: '0.0.0',
      migrations,
      counts: {},
      bytes: readFileSync(path).byteLength,
      sha256: 'x',
      ...overrides,
    },
  });
  return name;
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  harness.holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('RestoreService.preflight', () => {
  it('给出差异报告，且不动本地库', async () => {
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      kind: 'task',
      title: '本地独有',
    });
    await seedBackup(harness, 'b1.db.gz', async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        kind: 'task',
        title: '云端独有',
      });
    });

    const report = await harness.service.preflight('b1.db.gz');

    expect(report.compatible).toBe(true);
    expect(report.diff.core.added.map((row) => row.title)).toEqual(['云端独有']);
    expect(report.diff.core.removed.map((row) => row.title)).toEqual(['本地独有']);
    expect(await titles(harness.holder.current())).toEqual(['本地独有']);
  });

  it('预检不进入忙碌态——它没有副作用，其余请求不该被挡', async () => {
    await seedBackup(harness, 'b1.db.gz', async () => {});

    await harness.service.preflight('b1.db.gz');

    expect(harness.state.current()).toEqual({ state: 'idle' });
  });

  it('备份比代码新 → compatible 为 false，并说清是哪条谱系', async () => {
    await seedBackup(harness, 'newer.db.gz', async () => {}, {
      migrations: { __drizzle_migrations_from_the_future: 9_999_999_999_999 },
    });

    const report = await harness.service.preflight('newer.db.gz');

    expect(report.compatible).toBe(false);
    expect(report.reason).toContain('from_the_future');
  });

  it('云端没有这份备份 → 409', async () => {
    await expect(harness.service.preflight('查无此份.db.gz')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('RestoreService.confirm', () => {
  it('恢复后本地数据就是备份里的那一份', async () => {
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      kind: 'task',
      title: '恢复前的本地数据',
    });
    await seedBackup(harness, 'b1.db.gz', async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        kind: 'task',
        title: '备份里的数据',
      });
    });
    await harness.service.preflight('b1.db.gz');

    await harness.service.confirm('b1.db.gz');

    expect(await titles(harness.holder.current())).toEqual(['备份里的数据']);
    expect(harness.state.current()).toEqual({ state: 'idle' });
  });

  it('换库时把 -wal 与 -shm 一并删掉——留下旧 WAL 会让旧数据复活', async () => {
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      kind: 'task',
      title: '还在 WAL 里没 checkpoint 的旧数据',
    });
    expect(existsSync(`${harness.dbPath}-wal`)).toBe(true);
    await seedBackup(harness, 'b1.db.gz', async () => {});
    await harness.service.preflight('b1.db.gz');

    await harness.service.confirm('b1.db.gz');

    harness.holder.close();
    const reopened = openSqliteConnection(harness.dbPath);
    expect(await titles(reopened)).toEqual([]);
    reopened.close();
  });

  it('没预检过就确认 → 409，不动任何文件', async () => {
    await seedBackup(harness, 'b1.db.gz', async () => {});

    await expect(harness.service.confirm('b1.db.gz')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('备份比代码新时拒绝确认', async () => {
    await seedBackup(harness, 'newer.db.gz', async () => {}, {
      migrations: { __drizzle_migrations_from_the_future: 9_999_999_999_999 },
    });
    await harness.service.preflight('newer.db.gz');

    await expect(harness.service.confirm('newer.db.gz')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('verify 失败 → 自动回退，数据与恢复前逐行相等', async () => {
    const before = ['恢复前的甲', '恢复前的乙'];
    for (const title of before) {
      await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
        kind: 'task',
        title,
      });
    }
    await seedBackup(harness, 'b1.db.gz', async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        kind: 'task',
        title: '备份里的数据',
      });
    });
    await harness.service.preflight('b1.db.gz');
    harness.failMigrations.remaining = 1;

    await expect(harness.service.confirm('b1.db.gz')).rejects.toThrow();

    expect(await titles(harness.holder.current())).toEqual(before.sort());
    expect(harness.service.current().state).toBe('idle');
  });
});

describe('RestoreService 断电续命', () => {
  it('.restore/state.json 还在 → 启动时直接进入错误态并说明停在哪一步', () => {
    mkdirSync(join(harness.dataDir, '.restore'), { recursive: true });
    writeFileSync(
      join(harness.dataDir, '.restore', 'state.json'),
      JSON.stringify({ step: 'swap', name: 'b1.db.gz' }),
    );

    harness.service.resumeIfInterrupted();

    const state = harness.service.current();
    expect(state.state).toBe('error');
    expect(state.step).toContain('swap');
  });

  it('恢复顺利走完时 state.json 会被清掉，下次启动不会误报', async () => {
    await seedBackup(harness, 'b1.db.gz', async () => {});
    await harness.service.preflight('b1.db.gz');
    await harness.service.confirm('b1.db.gz');

    harness.service.resumeIfInterrupted();

    expect(harness.service.current().state).toBe('idle');
  });
});

describe('RestoreService.rollback', () => {
  it('手动回退把库换回恢复前的那一份', async () => {
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      kind: 'task',
      title: '恢复前的数据',
    });
    await seedBackup(harness, 'b1.db.gz', async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        kind: 'task',
        title: '备份里的数据',
      });
    });
    await harness.service.preflight('b1.db.gz');
    await harness.service.confirm('b1.db.gz');
    expect(await titles(harness.holder.current())).toEqual(['备份里的数据']);

    await harness.service.rollback();

    expect(await titles(harness.holder.current())).toEqual(['恢复前的数据']);
  });

  it('没有回退点时拒绝回退，而不是留下一个空库', async () => {
    await expect(harness.service.rollback()).rejects.toMatchObject({ statusCode: 409 });
  });
});
