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
  const service = new LocalBackupService({
    settings,
    getSqlite: () => sqlite,
    accountId: () => 'local-default',
    dataDir,
    device: 'test-device',
    appVersion: '0.0.0',
  });
  return { dataDir, sqlite, settings, service };
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
