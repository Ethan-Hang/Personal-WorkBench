import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openDatabase,
  runCoreMigrations,
  SqliteItemRepository,
  SqliteSettingsRepository,
} from '@workbench/data';
import { LocalBackupService } from './service.js';

const temporaryDirectories: string[] = [];
/** Windows 上没 close 的库文件删不掉（EPERM），临时目录会残留。 */
const openDatabases: Database.Database[] = [];

interface Harness {
  dataDir: string;
  sqlite: Database.Database;
  settings: SqliteSettingsRepository;
  service: LocalBackupService;
  /** 让 24h 限流可测：不动系统时钟，只挪服务看到的「现在」。 */
  setNow: (at: Date | undefined) => void;
}

function harness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'wb-local-backup-'));
  temporaryDirectories.push(dataDir);
  // 用真实文件库而不是 :memory:——本地备份要证明的正是「WAL 里的数据也进快照」，
  // 而 :memory: 根本没有 WAL，用它测等于把要验的那条性质绕开了。
  const { db, sqlite } = openDatabase(join(dataDir, 'workbench.db'));
  runCoreMigrations(db);
  openDatabases.push(sqlite);
  const settings = new SqliteSettingsRepository(() => sqlite);
  let now: Date | undefined;
  const service = new LocalBackupService({
    settings,
    getSqlite: () => sqlite,
    accountId: () => 'local-default',
    dataDir,
    device: 'test-device',
    appVersion: '0.0.0',
    now: () => now ?? new Date(),
  });
  return {
    dataDir,
    sqlite,
    settings,
    service,
    setNow: (at) => {
      now = at;
    },
  };
}

/** 同一毫秒内连跑会撞名（upload 用 wx 排他创建），错开一点点。 */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2));
}

afterEach(() => {
  for (const sqlite of openDatabases.splice(0)) sqlite.close();
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('配置', () => {
  it('默认落点是 dataDir/backups，不是某个写死的绝对路径', async () => {
    const { service, dataDir } = harness();

    const config = await service.getConfig();

    expect(config.targetDir).toBe('');
    expect(config.resolvedDir).toBe(join(dataDir, 'backups'));
    expect(config.autoEnabled).toBe(false);
    expect(config.retentionCount).toBe(5);
  });

  it('设了 targetDir 后 resolvedDir 跟着变，界面才知道备份到底落在哪', async () => {
    const { service } = harness();
    const custom = mkdtempSync(join(tmpdir(), 'wb-custom-'));
    temporaryDirectories.push(custom);

    const config = await service.updateConfig({ targetDir: custom });

    expect(config.targetDir).toBe(custom);
    expect(config.resolvedDir).toBe(custom);
  });

  it('目标目录不存在时当场报 400，不留到 run 的时候才炸', async () => {
    const { service } = harness();

    await expect(
      service.updateConfig({ targetDir: join(tmpdir(), 'wb-does-not-exist-xyz') }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('目标目录是个文件而不是目录时报 400', async () => {
    const { service, dataDir } = harness();
    const file = join(dataDir, 'not-a-dir.txt');
    writeFileSync(file, 'x');

    await expect(service.updateConfig({ targetDir: file })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('只改开关时不动已设好的 targetDir', async () => {
    const { service } = harness();
    const custom = mkdtempSync(join(tmpdir(), 'wb-custom-'));
    temporaryDirectories.push(custom);
    await service.updateConfig({ targetDir: custom });

    const config = await service.updateConfig({ autoEnabled: true });

    expect(config.targetDir).toBe(custom);
    expect(config.autoEnabled).toBe(true);
  });

  it('targetDir 传空串是「回到默认目录」，不是一个非法值', async () => {
    const { service, dataDir } = harness();
    const custom = mkdtempSync(join(tmpdir(), 'wb-custom-'));
    temporaryDirectories.push(custom);
    await service.updateConfig({ targetDir: custom });

    const config = await service.updateConfig({ targetDir: '' });

    expect(config.resolvedDir).toBe(join(dataDir, 'backups'));
  });
});

describe('run', () => {
  it('没有配置 WebDAV 也能跑：本地备份不依赖任何云端凭据', async () => {
    const { service } = harness();

    const item = await service.run();

    expect(item.complete).toBe(true);
    expect(item.meta?.accountId).toBe('local-default');
  });

  it('产出的备份能在 list 里看到，并落在 resolvedDir 下', async () => {
    const { service, dataDir } = harness();

    const item = await service.run();

    expect(existsSync(join(dataDir, 'backups', item.name))).toBe(true);
    expect((await service.list()).map((entry) => entry.name)).toEqual([item.name]);
  });

  it('落在用户指定的 targetDir 下', async () => {
    const { service } = harness();
    const custom = mkdtempSync(join(tmpdir(), 'wb-custom-'));
    temporaryDirectories.push(custom);
    await service.updateConfig({ targetDir: custom });

    const item = await service.run();

    expect(readdirSync(custom)).toContain(item.name);
  });

  it('备份里有 WAL 中尚未 checkpoint 的数据——这是禁用 fs.copyFile 的真正理由', async () => {
    const { service, sqlite, dataDir } = harness();
    const items = new SqliteItemRepository(() => sqlite);
    await items.create('todo', { title: '未 checkpoint 的待办', kind: 'task', importance: 'high' });

    const item = await service.run();

    const restored = join(dataDir, 'roundtrip.db');
    writeFileSync(restored, gunzipSync(await service.download(item.name)));
    const reopened = openDatabase(restored).sqlite;
    openDatabases.push(reopened);
    const row = reopened.prepare('SELECT title FROM items').get() as { title: string };
    expect(row.title).toBe('未 checkpoint 的待办');
  });
});

describe('保留策略', () => {
  it('自动快照关着时不删任何东西：自动删除不可逆，不能在关着开关时背后删', async () => {
    const { service } = harness();
    await service.updateConfig({ retentionCount: 1 });

    await service.run();
    await tick();
    await service.run();

    expect(await service.list()).toHaveLength(2);
  });

  it('自动快照开着时超出保留份数的最旧备份被删掉', async () => {
    const { service } = harness();
    await service.updateConfig({ autoEnabled: true, retentionCount: 2 });

    const first = await service.run();
    await tick();
    await service.run();
    await tick();
    await service.run();

    const names = (await service.list()).map((entry) => entry.name);
    expect(names).toHaveLength(2);
    expect(names).not.toContain(first.name);
  });

  it('只清理完整的备份，孤儿留给人手动删', async () => {
    const { service, dataDir } = harness();
    await service.updateConfig({ autoEnabled: true, retentionCount: 1 });
    const dir = join(dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const orphan = '2026-01-01T00-00-00-000Z.db.gz';
    writeFileSync(join(dir, orphan), Buffer.from([1]));

    await service.run();

    expect((await service.list()).map((entry) => entry.name)).toContain(orphan);
  });
});

describe('remove', () => {
  it('删掉指定备份', async () => {
    const { service } = harness();
    const item = await service.run();

    await service.remove(item.name);

    expect(await service.list()).toEqual([]);
  });
});

describe('启动时的自动快照', () => {
  it('开关关着时一份都不打：磁盘占用不该在用户不知情时增长', async () => {
    const { service } = harness();

    await service.maybeAutoSnapshot();

    expect(await service.list()).toEqual([]);
  });

  it('开关开着且没有历史备份时打一份', async () => {
    const { service } = harness();
    await service.updateConfig({ autoEnabled: true });

    await service.maybeAutoSnapshot();

    expect(await service.list()).toHaveLength(1);
  });

  it('距上次不足 24h 就跳过：一天重启十次不该刷出十份', async () => {
    const { service, setNow } = harness();
    await service.updateConfig({ autoEnabled: true });
    await service.maybeAutoSnapshot();

    setNow(new Date(Date.now() + 23 * 60 * 60 * 1000));
    await service.maybeAutoSnapshot();

    expect(await service.list()).toHaveLength(1);
  });

  it('距上次超过 24h 就再打一份', async () => {
    const { service, setNow } = harness();
    await service.updateConfig({ autoEnabled: true });
    await service.maybeAutoSnapshot();

    setNow(new Date(Date.now() + 25 * 60 * 60 * 1000));
    await service.maybeAutoSnapshot();

    expect(await service.list()).toHaveLength(2);
  });

  it('限流只看完整备份的时间，孤儿不能把限流窗口顶开', async () => {
    const { service, dataDir } = harness();
    await service.updateConfig({ autoEnabled: true });
    const dir = join(dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    // 一个「刚刚才写下」的孤儿。若限流按它算，这次启动就会被错误地跳过。
    writeFileSync(join(dir, '2099-01-01T00-00-00-000Z.db.gz'), Buffer.from([1]));

    await service.maybeAutoSnapshot();

    expect((await service.list()).filter((entry) => entry.complete)).toHaveLength(1);
  });
});

describe('高危操作前的强制快照', () => {
  it('开关关着也照打：这是安全网，不是周期备份', async () => {
    const { service } = harness();

    await service.snapshotBefore('恢复');

    expect(await service.list()).toHaveLength(1);
  });

  it('不限流：刚打过也照打，因为下一步就要不可逆地改数据', async () => {
    const { service } = harness();
    await service.updateConfig({ autoEnabled: true });
    await service.maybeAutoSnapshot();
    await tick();

    await service.snapshotBefore('导入');

    expect(await service.list()).toHaveLength(2);
  });

  it('原因写进 meta，界面才能解释这份备份为什么存在', async () => {
    const { service } = harness();

    const item = await service.snapshotBefore('删除账号');

    expect(item.meta?.reason).toBe('删除账号');
    expect((await service.list())[0]?.meta?.reason).toBe('删除账号');
  });

  it('手动导出不带 reason，不给一份用户主动打的备份编一个理由', async () => {
    const { service } = harness();

    const item = await service.run();

    expect(item.meta?.reason).toBeUndefined();
  });
});

describe('给另一个账号的库打快照', () => {
  it('落在当前账号的备份目录，但 meta.accountId 记着真正的主', async () => {
    const { service, dataDir } = harness();
    const otherDir = mkdtempSync(join(tmpdir(), 'wb-other-account-'));
    temporaryDirectories.push(otherDir);
    const otherPath = join(otherDir, 'workbench.db');
    const other = openDatabase(otherPath);
    openDatabases.push(other.sqlite);
    runCoreMigrations(other.db);
    await new SqliteItemRepository(() => other.sqlite).create('todo', {
      title: '另一个账号的事项',
      kind: 'task',
    });
    other.sqlite.close();
    openDatabases.pop();

    const item = await service.snapshotOfDatabase(otherPath, '工作账号', '删除账号');

    expect(item?.meta?.accountId).toBe('工作账号');
    expect(item?.meta?.reason).toBe('删除账号');
    expect(existsSync(join(dataDir, 'backups', item!.name))).toBe(true);
  });

  it('快照里装的是那个库的数据，不是当前库的', async () => {
    const { service, dataDir } = harness();
    const otherDir = mkdtempSync(join(tmpdir(), 'wb-other-account-'));
    temporaryDirectories.push(otherDir);
    const otherPath = join(otherDir, 'workbench.db');
    const other = openDatabase(otherPath);
    runCoreMigrations(other.db);
    await new SqliteItemRepository(() => other.sqlite).create('todo', {
      title: '只在另一个账号里',
      kind: 'task',
    });
    other.sqlite.close();

    const item = await service.snapshotOfDatabase(otherPath, '工作账号', '删除账号');

    const restored = join(dataDir, 'other-roundtrip.db');
    writeFileSync(restored, gunzipSync(await service.download(item!.name)));
    const reopened = openDatabase(restored).sqlite;
    openDatabases.push(reopened);
    const row = reopened.prepare('SELECT title FROM items').get() as { title: string };
    expect(row.title).toBe('只在另一个账号里');
  });

  it('库文件不存在时返回 null 而不是抛：没有东西可丢，不该拦住删除', async () => {
    const { service } = harness();

    const item = await service.snapshotOfDatabase(
      join(tmpdir(), 'wb-no-such-account.db'),
      '工作账号',
      '删除账号',
    );

    expect(item).toBeNull();
    expect(await service.list()).toEqual([]);
  });
});
