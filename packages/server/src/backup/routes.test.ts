import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectionHolder,
  JsonFileBackend,
  SecretStore,
  createDatabaseClient,
  runCoreMigrations,
  SqliteSettingsRepository,
  type WebdavCredentials,
} from '@workbench/data';
import {
  RESTORE_API,
  SYNC_API,
  backupConfigSchema,
  backupListItemSchema,
  restorePreflightResponseSchema,
  restoreStateSchema,
} from '@workbench/sync/contract';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { ServiceState } from '../service-state.js';
import { RestoreService } from '../restore/service.js';
import { BackupService, type BackupStore } from './service.js';
import type { BackupListItem, BackupMeta } from '@workbench/sync/contract';

const temporaryDirectories: string[] = [];
const openApps: FastifyInstance[] = [];
const openHolders: ConnectionHolder[] = [];

class MemoryStore implements BackupStore {
  readonly data = new Map<string, Buffer>();
  readonly metas = new Map<string, BackupMeta>();

  async upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void> {
    this.data.set(name, gz);
    this.metas.set(name, meta);
  }

  async list(): Promise<BackupListItem[]> {
    return [...this.data.keys()]
      .sort()
      .reverse()
      .map((name) => ({
        name,
        complete: true,
        meta: this.metas.get(name) ?? null,
      }));
  }

  async remove(name: string): Promise<void> {
    this.data.delete(name);
    this.metas.delete(name);
  }

  async download(name: string): Promise<Buffer> {
    const gz = this.data.get(name);
    if (gz === undefined) throw new Error(`没有这份备份：${name}`);
    return gz;
  }
}

const webdav: WebdavCredentials = {
  url: 'https://dav.example.com/dav/',
  username: 'me',
  password: 's3cret',
};

async function buildBackupApp(): Promise<FastifyInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-backup-routes-'));
  temporaryDirectories.push(dataDir);
  const dbPath = join(dataDir, 'accounts', 'local-default', 'workbench.db');
  const holder = new ConnectionHolder();
  openHolders.push(holder);
  const migrate = (sqlite: Parameters<typeof createDatabaseClient>[0]) =>
    runCoreMigrations(createDatabaseClient(sqlite));
  migrate(holder.open(dbPath));

  const store = new MemoryStore();
  const state = new ServiceState();
  const backup = new BackupService({
    credentials: new SecretStore(new JsonFileBackend(dataDir)),
    settings: new SqliteSettingsRepository(() => holder.current()),
    getSqlite: () => holder.current(),
    accountId: () => 'local-default',
    dataDir,
    device: '测试机',
    appVersion: '0.0.0',
    createStore: () => store,
  });
  const restore = new RestoreService({
    holder,
    state,
    dataDir,
    dbPath: () => dbPath,
    source: backup,
    migrate,
    moduleIds: [],
  });

  const app = await buildApp({
    getSqlite: () => holder.current(),
    modules: [],
    serviceState: state,
    backup: { backup, restore },
  });
  openApps.push(app);
  return app;
}

async function configure(app: FastifyInstance): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: SYNC_API.backupConfig(),
    payload: webdav,
  });
  expect(res.statusCode).toBe(200);
}

afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
  for (const holder of openHolders.splice(0)) holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('备份路由', () => {
  it('配置的响应形状与契约一致，且不含密码', async () => {
    const app = await buildBackupApp();
    await configure(app);

    const res = await app.inject({ method: 'GET', url: SYNC_API.backupConfig() });

    expect(res.statusCode).toBe(200);
    expect(() => backupConfigSchema.parse(res.json())).not.toThrow();
    expect(res.body).not.toContain(webdav.password);
  });

  it('未配置就备份 → 400，而不是 500', async () => {
    const app = await buildBackupApp();

    const res = await app.inject({ method: 'POST', url: SYNC_API.backupRun() });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it('备份 → 列表 → 删除走完一圈', async () => {
    const app = await buildBackupApp();
    await configure(app);

    const run = await app.inject({ method: 'POST', url: SYNC_API.backupRun() });
    expect(run.statusCode).toBe(200);
    const created = backupListItemSchema.parse(run.json());

    const list = await app.inject({ method: 'GET', url: SYNC_API.backupList() });
    expect(z.array(backupListItemSchema).parse(list.json())).toHaveLength(1);

    const removed = await app.inject({
      method: 'DELETE',
      url: SYNC_API.backupItem(created.name),
    });
    expect(removed.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: SYNC_API.backupList() });
    expect(after.json()).toEqual([]);
  });
});

describe('恢复路由', () => {
  it('预检的响应形状与契约一致', async () => {
    const app = await buildBackupApp();
    await configure(app);
    const run = await app.inject({ method: 'POST', url: SYNC_API.backupRun() });
    const created = backupListItemSchema.parse(run.json());

    const res = await app.inject({
      method: 'POST',
      url: RESTORE_API.preflight(),
      payload: { name: created.name },
    });

    expect(res.statusCode).toBe(200);
    expect(() => restorePreflightResponseSchema.parse(res.json())).not.toThrow();
  });

  it('状态查询的响应形状与契约一致，且默认是 idle', async () => {
    const app = await buildBackupApp();

    const res = await app.inject({ method: 'GET', url: RESTORE_API.state() });

    expect(res.statusCode).toBe(200);
    expect(restoreStateSchema.parse(res.json()).state).toBe('idle');
  });

  it('备份 → 改数据 → 预检 → 确认，改动被恢复回去', async () => {
    const app = await buildBackupApp();
    await configure(app);
    const run = await app.inject({ method: 'POST', url: SYNC_API.backupRun() });
    const created = backupListItemSchema.parse(run.json());

    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.palette': 'ocean' } },
    });
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json()).toMatchObject({
      settings: { 'theme.palette': 'ocean' },
    });

    await app.inject({
      method: 'POST',
      url: RESTORE_API.preflight(),
      payload: { name: created.name },
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: RESTORE_API.confirm(),
      payload: { name: created.name },
    });

    expect(confirmed.statusCode).toBe(200);
    expect(restoreStateSchema.parse(confirmed.json()).state).toBe('idle');
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json()).toMatchObject({
      settings: { 'theme.palette': 'warm' },
    });
  });

  it('没预检就确认 → 409', async () => {
    const app = await buildBackupApp();
    await configure(app);

    const res = await app.inject({
      method: 'POST',
      url: RESTORE_API.confirm(),
      payload: { name: '2026-08-19T10-00-00-000Z.db.gz' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('没有回退点时回退 → 409', async () => {
    const app = await buildBackupApp();

    const res = await app.inject({ method: 'POST', url: RESTORE_API.rollback() });

    expect(res.statusCode).toBe(409);
  });
});
