import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectionHolder,
  createDatabaseClient,
  runCoreMigrations,
  SqliteSettingsRepository,
} from '@workbench/data';
import {
  LOCAL_BACKUP_API,
  backupListItemSchema,
  localBackupConfigSchema,
} from '@workbench/sync/contract';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { LocalBackupService } from './service.js';

const temporaryDirectories: string[] = [];
const openApps: FastifyInstance[] = [];
const openHolders: ConnectionHolder[] = [];

async function buildLocalBackupApp(): Promise<FastifyInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-local-backup-routes-'));
  temporaryDirectories.push(dataDir);
  const dbPath = join(dataDir, 'accounts', 'local-default', 'workbench.db');
  const holder = new ConnectionHolder();
  openHolders.push(holder);
  runCoreMigrations(createDatabaseClient(holder.open(dbPath)));

  const localBackup = new LocalBackupService({
    settings: new SqliteSettingsRepository(() => holder.current()),
    getSqlite: () => holder.current(),
    accountId: () => 'local-default',
    dataDir,
    device: '测试机',
    appVersion: '0.0.0',
  });

  const app = await buildApp({ getSqlite: () => holder.current(), modules: [], localBackup });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of openApps.splice(0)) await app.close();
  for (const holder of openHolders.splice(0)) holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('本地备份路由', () => {
  it('配置的响应形状与契约一致', async () => {
    const app = await buildLocalBackupApp();

    const res = await app.inject({ method: 'GET', url: LOCAL_BACKUP_API.config() });

    expect(res.statusCode).toBe(200);
    expect(() => localBackupConfigSchema.parse(res.json())).not.toThrow();
  });

  it('没有配置任何 WebDAV 凭据也能直接备份——这正是本地通道存在的理由', async () => {
    const app = await buildLocalBackupApp();

    const res = await app.inject({ method: 'POST', url: LOCAL_BACKUP_API.run() });

    expect(res.statusCode).toBe(200);
    expect(() => backupListItemSchema.parse(res.json())).not.toThrow();
  });

  it('列表的响应形状与契约一致', async () => {
    const app = await buildLocalBackupApp();
    await app.inject({ method: 'POST', url: LOCAL_BACKUP_API.run() });

    const res = await app.inject({ method: 'GET', url: LOCAL_BACKUP_API.list() });

    expect(res.statusCode).toBe(200);
    expect(() => z.array(backupListItemSchema).parse(res.json())).not.toThrow();
    expect(res.json()).toHaveLength(1);
  });

  it('目录不存在 → 400 且带请求编号，而不是 500', async () => {
    const app = await buildLocalBackupApp();

    const res = await app.inject({
      method: 'PUT',
      url: LOCAL_BACKUP_API.config(),
      payload: { targetDir: join(tmpdir(), 'wb-nope-xyz-does-not-exist') },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it('配置字段不合法 → 400，不静默忽略', async () => {
    const app = await buildLocalBackupApp();

    const res = await app.inject({
      method: 'PUT',
      url: LOCAL_BACKUP_API.config(),
      payload: { retentionCount: 0 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('删除后列表变空', async () => {
    const app = await buildLocalBackupApp();
    const created = await app.inject({ method: 'POST', url: LOCAL_BACKUP_API.run() });
    const { name } = created.json() as { name: string };

    const res = await app.inject({ method: 'DELETE', url: LOCAL_BACKUP_API.item(name) });

    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: LOCAL_BACKUP_API.list() })).json()).toEqual([]);
  });

  it('删一个名字不合法的备份 → 400，路径穿越不能落到 500', async () => {
    const app = await buildLocalBackupApp();

    const res = await app.inject({
      method: 'DELETE',
      url: LOCAL_BACKUP_API.item('../../etc/passwd'),
    });

    expect(res.statusCode).toBe(400);
  });

  it('没装配 LocalBackupService 时不注册这些路由，而不是 500', async () => {
    const holder = new ConnectionHolder();
    openHolders.push(holder);
    const dataDir = mkdtempSync(join(tmpdir(), 'workbench-local-backup-off-'));
    temporaryDirectories.push(dataDir);
    runCoreMigrations(createDatabaseClient(holder.open(join(dataDir, 'workbench.db'))));
    const app = await buildApp({ getSqlite: () => holder.current(), modules: [] });
    openApps.push(app);

    const res = await app.inject({ method: 'GET', url: LOCAL_BACKUP_API.config() });

    expect(res.statusCode).toBe(404);
  });
});
