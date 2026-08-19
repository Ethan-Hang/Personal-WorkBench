import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CredentialsStore,
  openTestDatabase,
  SqliteItemRepository,
  SqliteSettingsRepository,
  type WebdavCredentials,
} from '@workbench/data';
import type { BackupListItem, BackupMeta } from '@workbench/sync/contract';
import { BackupService, type BackupStore } from './service.js';

const temporaryDirectories: string[] = [];

/** 内存里的假网盘。协议编解码由 webdav-client 自己的测试覆盖，这里只测服务逻辑。 */
class FakeBackupStore implements BackupStore {
  readonly data = new Map<string, Buffer>();
  readonly meta = new Map<string, BackupMeta>();
  uploads = 0;

  constructor(readonly credentials: WebdavCredentials) {}

  async upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void> {
    this.uploads += 1;
    this.data.set(name, gz);
    this.meta.set(name, meta);
  }

  async list(): Promise<BackupListItem[]> {
    return [...this.data.keys()]
      .sort()
      .reverse()
      .map((name) => {
        const meta = this.meta.get(name);
        return meta === undefined
          ? { name, complete: false, meta: null }
          : { name, complete: true, meta };
      });
  }

  async remove(name: string): Promise<void> {
    this.meta.delete(name);
    this.data.delete(name);
  }

  async download(name: string): Promise<Buffer> {
    const gz = this.data.get(name);
    if (gz === undefined) throw new Error(`没有这份备份：${name}`);
    return gz;
  }
}

interface Harness {
  dataDir: string;
  sqlite: Database.Database;
  credentials: CredentialsStore;
  settings: SqliteSettingsRepository;
  service: BackupService;
  stores: FakeBackupStore[];
  storeFor: (creds: WebdavCredentials) => FakeBackupStore;
  latestStore: () => FakeBackupStore;
}

const webdav: WebdavCredentials = {
  url: 'https://dav.example.com/dav/',
  username: 'me',
  password: 's3cret',
};

let clock = Date.parse('2026-08-19T10:00:00.000Z');

function createHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-backup-'));
  temporaryDirectories.push(dataDir);
  const { sqlite } = openTestDatabase();
  const credentials = new CredentialsStore(dataDir);
  const settings = new SqliteSettingsRepository(() => sqlite);
  const stores: FakeBackupStore[] = [];
  // 真实的 WebdavBackupStore 是无状态的（数据在网盘上），假的把数据放在自己身上，
  // 所以这里按 url 复用同一个实例，否则每次调用都会拿到一个空网盘。
  const storeFor = (creds: WebdavCredentials): FakeBackupStore => {
    const existing = stores.find((store) => store.credentials.url === creds.url);
    if (existing !== undefined) return existing;
    const store = new FakeBackupStore(creds);
    stores.push(store);
    return store;
  };
  const service = new BackupService({
    credentials,
    settings,
    getSqlite: () => sqlite,
    accountId: () => 'local-default',
    dataDir,
    device: '测试机',
    appVersion: '0.0.0',
    now: () => new Date(clock),
    createStore: storeFor,
  });
  return {
    dataDir,
    sqlite,
    credentials,
    settings,
    service,
    stores,
    storeFor,
    latestStore: () => {
      const store = stores.at(-1);
      if (store === undefined) throw new Error('还没有建过 store');
      return store;
    },
  };
}

function hoursAgo(hours: number): string {
  return new Date(clock - hours * 60 * 60 * 1000).toISOString();
}

/**
 * 直接往假网盘里塞一份「早就传过」的备份。
 *
 * 不用 `service.run()` 造这个前提：快照的 `createdAt` 来自真实时钟，与服务注入的
 * 假时钟不是同一个，混用会让「距上次多久」测的是两套时间的差。
 */
async function seedBackup(target: Harness, createdAt: string): Promise<void> {
  const store = target.storeFor(webdav);
  const name = `${createdAt.replace(/[:.]/g, '-')}.db.gz`;
  await store.upload(name, Buffer.from('旧备份'), {
    v: 1,
    createdAt,
    accountId: 'local-default',
    device: '测试机',
    appVersion: '0.0.0',
    migrations: {},
    counts: {},
    bytes: 6,
    sha256: 'x',
  });
}

let harness: Harness;

beforeEach(() => {
  clock = Date.parse('2026-08-19T10:00:00.000Z');
  harness = createHarness();
});

afterEach(() => {
  harness.sqlite.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('BackupService 配置', () => {
  it('没配过 WebDAV 时 configured 为 false，默认自动备份是关的', async () => {
    const config = await harness.service.getConfig();

    expect(config).toEqual({
      configured: false,
      url: null,
      username: null,
      autoEnabled: false,
      retentionCount: 10,
    });
  });

  it('密码只进不出：读接口永远不回传它', async () => {
    await harness.service.updateConfig(webdav);

    const config = await harness.service.getConfig();

    expect(config).toMatchObject({ configured: true, url: webdav.url, username: webdav.username });
    expect(JSON.stringify(config)).not.toContain(webdav.password);
  });

  it('只改开关不会把已存的密码抹掉', async () => {
    await harness.service.updateConfig(webdav);

    await harness.service.updateConfig({ autoEnabled: true });

    expect(harness.credentials.readWebdav()).toEqual(webdav);
    expect((await harness.service.getConfig()).autoEnabled).toBe(true);
  });

  it('开关与保留份数落在 app_settings，不新增表', async () => {
    await harness.service.updateConfig({ autoEnabled: true, retentionCount: 3 });

    const raw = await harness.settings.getAll();
    expect(raw['backup.autoEnabled']).toBe(true);
    expect(raw['backup.retentionCount']).toBe(3);
  });
});

describe('BackupService.run', () => {
  it('未配置 WebDAV 时拒绝备份，落成 400 而不是 500', async () => {
    await expect(harness.service.run()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('上传的快照里有 WAL 中尚未 checkpoint 的数据', async () => {
    await harness.service.updateConfig(webdav);
    await new SqliteItemRepository(() => harness.sqlite).create('todo', {
      kind: 'task',
      title: '刚写下还没 checkpoint 的事项',
    });

    const item = await harness.service.run();

    const gz = await harness.latestStore().download(item.name);
    expect(gunzipSync(gz).includes(Buffer.from('刚写下还没 checkpoint 的事项', 'utf8'))).toBe(true);
  });

  it('meta 给每条迁移谱系各记一个水位，而不是一个总版本号', async () => {
    await harness.service.updateConfig(webdav);

    const item = await harness.service.run();

    const watermarks = item.meta?.migrations ?? {};
    expect(Object.keys(watermarks).length).toBeGreaterThan(0);
    for (const table of Object.keys(watermarks)) {
      expect(table.startsWith('__drizzle_migrations')).toBe(true);
    }
  });
});

describe('BackupService 保留策略', () => {
  async function backupTimes(service: BackupService, times: number): Promise<void> {
    for (let index = 0; index < times; index += 1) {
      clock += 1000;
      await service.run();
    }
  }

  it('自动备份开着时超出保留份数就删最旧的', async () => {
    await harness.service.updateConfig({ ...webdav, autoEnabled: true, retentionCount: 2 });

    await backupTimes(harness.service, 4);

    const list = await harness.service.list();
    expect(list).toHaveLength(2);
  });

  it('自动备份关着时一份都不删——自动删除不可逆，不能在背后发生', async () => {
    await harness.service.updateConfig({ ...webdav, autoEnabled: false, retentionCount: 2 });

    await backupTimes(harness.service, 4);

    expect(await harness.service.list()).toHaveLength(4);
  });
});

describe('BackupService 启动时的自动备份', () => {
  it('开关关着就不碰网络', async () => {
    await harness.service.updateConfig(webdav);

    await harness.service.maybeAutoBackup();

    expect(harness.stores).toHaveLength(0);
  });

  it('开着且从没备份过就传一份', async () => {
    await harness.service.updateConfig({ ...webdav, autoEnabled: true });

    await harness.service.maybeAutoBackup();

    expect(await harness.service.list()).toHaveLength(1);
  });

  it('距上次不足 24 小时不重复传', async () => {
    await harness.service.updateConfig({ ...webdav, autoEnabled: true });
    await seedBackup(harness, hoursAgo(23));

    await harness.service.maybeAutoBackup();

    expect(await harness.service.list()).toHaveLength(1);
  });

  it('超过 24 小时再传一份', async () => {
    await harness.service.updateConfig({ ...webdav, autoEnabled: true });
    await seedBackup(harness, hoursAgo(25));

    await harness.service.maybeAutoBackup();

    expect(await harness.service.list()).toHaveLength(2);
  });
});

describe('BackupService.remove', () => {
  it('删掉指定的一份', async () => {
    await harness.service.updateConfig(webdav);
    const item = await harness.service.run();

    await harness.service.remove(item.name);

    expect(await harness.service.list()).toHaveLength(0);
  });
});
