import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
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
  /** 恢复前那次强制安全快照的调用记录。 */
  safetySnapshots: string[];
  failSafetySnapshot: { yes: boolean };
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
  const safetySnapshots: string[] = [];
  const failSafetySnapshot = { yes: false };
  const service = new RestoreService({
    holder,
    state,
    dataDir,
    dbPath: () => dbPath,
    source,
    moduleIds: [],
    snapshotBefore: async (reason) => {
      if (failSafetySnapshot.yes) throw new Error('磁盘满了');
      safetySnapshots.push(reason);
    },
    migrate: (sqlite) => {
      if (failMigrations.remaining > 0) {
        failMigrations.remaining -= 1;
        throw new Error('迁移炸了');
      }
      migrate(sqlite);
    },
  });
  return {
    dataDir,
    dbPath,
    holder,
    state,
    source,
    service,
    failMigrations,
    safetySnapshots,
    failSafetySnapshot,
  };
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

describe('恢复前的强制安全快照', () => {
  it('confirm 会先打一份本地快照，回退点之外再多一层网', async () => {
    await seedBackup(harness, 'b1.db.gz', async () => {});

    await harness.service.preflight('b1.db.gz');
    await harness.service.confirm('b1.db.gz');

    expect(harness.safetySnapshots).toEqual(['恢复']);
  });

  it('安全快照失败则整个恢复拒绝开始，与「没有回退点就不动手」同一条原则', async () => {
    await seedBackup(harness, 'b1.db.gz', async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        title: '云端的',
        kind: 'task',
      });
    });
    await new SqliteItemRepository(() => harness.holder.current()).create('todo', {
      title: '本地的',
      kind: 'task',
    });
    await harness.service.preflight('b1.db.gz');
    harness.failSafetySnapshot.yes = true;

    await expect(harness.service.confirm('b1.db.gz')).rejects.toThrow(/安全快照/);

    // 本地库一个字节都没被碰过。
    expect(await titles(harness.holder.current())).toEqual(['本地的']);
    expect(harness.state.current().state).toBe('idle');
  });

  it('预检不打快照：它对本地库只读，随时可取消', async () => {
    await seedBackup(harness, 'b1.db.gz', async () => {});

    await harness.service.preflight('b1.db.gz');

    expect(harness.safetySnapshots).toEqual([]);
  });
});

async function seedItemInto(holder: ConnectionHolder, title: string): Promise<void> {
  await new SqliteItemRepository(() => holder.current()).create('todo', { kind: 'task', title });
}

/** 把一份 .db.gz 里的库水位顶到未来，用来触发「备份比代码新」。 */
async function seedLocalFileWithFutureWatermark(source: string): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-local-import-newer-'));
  temporaryDirectories.push(directory);
  const raw = gunzipSync(readFileSync(source));
  const path = join(directory, 'bumped.db');
  writeFileSync(path, raw);
  const connection = openSqliteConnection(path);
  connection.prepare('UPDATE __drizzle_migrations SET created_at = created_at + 999999999').run();
  connection.close();

  const gzPath = join(directory, '2099-01-01T00-00-00-000Z.db.gz');
  writeFileSync(gzPath, gzipSync(readFileSync(path)));
  return gzPath;
}

/** 造一个本地 .db.gz 文件（可选地带上旁挂 meta），模拟用户从别处拷来的备份。 */
async function seedLocalFile(
  seed: (connection: Database.Database) => Promise<void>,
  options: { withMeta?: Partial<BackupMeta> | false; corrupt?: boolean } = {},
): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-local-import-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'seed.db');
  const connection = openSqliteConnection(path);
  migrate(connection);
  await seed(connection);
  const migrations = migrationWatermarks(connection);
  connection.close();

  const raw = readFileSync(path);
  const gzPath = join(directory, '2026-08-19T10-00-00-000Z.db.gz');
  writeFileSync(gzPath, options.corrupt === true ? Buffer.from('这不是 gzip') : gzipSync(raw));

  if (options.withMeta !== false) {
    writeFileSync(
      `${gzPath}.meta.json`,
      JSON.stringify({
        v: 1,
        createdAt: '2026-08-19T10:00:00.000Z',
        accountId: 'local-default',
        device: '另一台机器',
        appVersion: '0.0.0',
        migrations,
        counts: {},
        bytes: raw.byteLength,
        sha256: 'x',
        ...(options.withMeta ?? {}),
      }),
    );
  }
  return gzPath;
}

describe('本地文件导入的预检', () => {
  it('算出差异，与云端预检走的是同一条 ATTACH/EXCEPT 通路', async () => {
    await seedItemInto(harness.holder, '只在本地的');
    const filePath = await seedLocalFile(async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        title: '只在文件里的',
        kind: 'task',
      });
    });

    const result = await harness.service.preflightLocalFile(filePath);

    expect(result.compatible).toBe(true);
    expect(result.diff.core.added.map((entry) => entry.title)).toEqual(['只在文件里的']);
    expect(result.diff.core.removed.map((entry) => entry.title)).toEqual(['只在本地的']);
  });

  it('没有旁挂 meta.json 也能预检——用户从 U 盘拷来的可能只有 .db.gz', async () => {
    const filePath = await seedLocalFile(async () => {}, { withMeta: false });

    const result = await harness.service.preflightLocalFile(filePath);

    expect(result.compatible).toBe(true);
    expect(result.meta).toBeNull();
  });

  it('有旁挂 meta.json 时带上它，界面才能显示来源与时间', async () => {
    const filePath = await seedLocalFile(async () => {});

    const result = await harness.service.preflightLocalFile(filePath);

    expect(result.meta?.device).toBe('另一台机器');
  });

  it('水位比当前代码新则拒绝，且不给出差异——那份差异没有意义', async () => {
    const filePath = await seedLocalFile(async () => {});
    // 直接把文件里那个库的水位顶高，而不是改 meta：判断必须以真实的库为准。
    const bumped = await seedLocalFileWithFutureWatermark(filePath);

    const result = await harness.service.preflightLocalFile(bumped);

    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/比当前代码新/);
    expect(result.diff.core.added).toEqual([]);
  });

  it('文件不存在 → 404', async () => {
    await expect(
      harness.service.preflightLocalFile(join(tmpdir(), 'wb-no-such-file.db.gz')),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('不是 gzip → 409，并说清是文件本身的问题', async () => {
    const filePath = await seedLocalFile(async () => {}, { corrupt: true });

    await expect(harness.service.preflightLocalFile(filePath)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('预检不进忙碌态：它对本地库只读，随时可取消', async () => {
    const filePath = await seedLocalFile(async () => {});

    await harness.service.preflightLocalFile(filePath);

    expect(harness.state.current().state).toBe('idle');
  });

  it('连做两次预检不失败——ATTACH 之后必须 DETACH', async () => {
    const filePath = await seedLocalFile(async () => {});

    await harness.service.preflightLocalFile(filePath);

    await expect(harness.service.preflightLocalFile(filePath)).resolves.toMatchObject({
      compatible: true,
    });
  });

  it('预检之后可以直接 confirm：本地导入复用的就是那台五态机', async () => {
    const filePath = await seedLocalFile(async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        title: '从文件导入的',
        kind: 'task',
      });
    });

    await harness.service.preflightLocalFile(filePath);
    await harness.service.confirm(filePath);

    expect(await titles(harness.holder.current())).toEqual(['从文件导入的']);
  });
});

describe('本地文件导入的确认', () => {
  it('换库时把 -wal 与 -shm 一并删掉——留下旧 WAL 会让旧数据复活', async () => {
    await seedItemInto(harness.holder, '还在 WAL 里没 checkpoint 的旧数据');
    expect(existsSync(`${harness.dbPath}-wal`)).toBe(true);
    const filePath = await seedLocalFile(async () => {});
    await harness.service.preflightLocalFile(filePath);

    await harness.service.confirm(filePath);

    harness.holder.close();
    const reopened = openSqliteConnection(harness.dbPath);
    expect(await titles(reopened)).toEqual([]);
    reopened.close();
  });

  it('导入前也会打一份安全快照，且失败则整个导入拒绝开始', async () => {
    await seedItemInto(harness.holder, '本地的');
    const filePath = await seedLocalFile(async () => {});
    await harness.service.preflightLocalFile(filePath);
    harness.failSafetySnapshot.yes = true;

    await expect(harness.service.confirm(filePath)).rejects.toThrow(/安全快照/);

    expect(await titles(harness.holder.current())).toEqual(['本地的']);
  });

  it('没预检过就确认 → 409，不动任何文件', async () => {
    const filePath = await seedLocalFile(async () => {});

    await expect(harness.service.confirm(filePath)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('换了一个文件就确认 → 409：认领的必须是刚才预检的那一份', async () => {
    const first = await seedLocalFile(async () => {});
    const second = await seedLocalFile(async () => {});
    await harness.service.preflightLocalFile(first);

    await expect(harness.service.confirm(second)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('水位比代码新的文件预检过也拒绝确认', async () => {
    const filePath = await seedLocalFile(async () => {});
    const bumped = await seedLocalFileWithFutureWatermark(filePath);
    await harness.service.preflightLocalFile(bumped);

    await expect(harness.service.confirm(bumped)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('导入之后还能回退到导入前', async () => {
    await seedItemInto(harness.holder, '导入前就在的');
    const filePath = await seedLocalFile(async (connection) => {
      await new SqliteItemRepository(() => connection).create('todo', {
        title: '文件里的',
        kind: 'task',
      });
    });
    await harness.service.preflightLocalFile(filePath);
    await harness.service.confirm(filePath);

    await harness.service.rollback();

    expect(await titles(harness.holder.current())).toEqual(['导入前就在的']);
  });
});
