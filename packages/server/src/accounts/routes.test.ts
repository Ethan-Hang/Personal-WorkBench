import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AccountsStore,
  ConnectionHolder,
  createDatabaseClient,
  resolveActiveDatabase,
  runCoreMigrations,
} from '@workbench/data';
import { ACCOUNTS_API, accountsResponseSchema } from '@workbench/sync/contract';
import { buildApp } from '../app.js';
import { ServiceState } from '../service-state.js';
import { AccountsService } from './service.js';

const temporaryDirectories: string[] = [];
const openApps: FastifyInstance[] = [];
const openHolders: ConnectionHolder[] = [];

async function buildAccountsApp(): Promise<FastifyInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-accounts-routes-'));
  temporaryDirectories.push(dataDir);
  const active = resolveActiveDatabase({ dataDir });
  const holder = new ConnectionHolder();
  openHolders.push(holder);
  holder.open(active.dbPath);
  const migrate = (sqlite: Parameters<typeof createDatabaseClient>[0]) =>
    runCoreMigrations(createDatabaseClient(sqlite));
  migrate(holder.current());
  const state = new ServiceState();
  const app = await buildApp({
    getSqlite: () => holder.current(),
    modules: [],
    serviceState: state,
    accounts: new AccountsService({ store: new AccountsStore(dataDir), holder, state, migrate }),
  });
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

describe('账号路由', () => {
  it('列表的响应形状与契约一致', async () => {
    const app = await buildAccountsApp();

    const res = await app.inject({ method: 'GET', url: ACCOUNTS_API.root() });

    expect(res.statusCode).toBe(200);
    expect(() => accountsResponseSchema.parse(res.json())).not.toThrow();
  });

  it('新建 → 切换 → 解绑 → 删除走完一圈', async () => {
    const app = await buildAccountsApp();

    const created = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.root(),
      payload: { displayName: '工作' },
    });
    expect(created.statusCode).toBe(201);
    const workId = accountsResponseSchema
      .parse(created.json())
      .accounts.find((account) => account.displayName === '工作')?.id;
    expect(workId).toBeDefined();

    const switched = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.active(),
      payload: { id: workId },
    });
    expect(switched.statusCode).toBe(200);
    expect(accountsResponseSchema.parse(switched.json()).activeId).toBe(workId);

    const back = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.active(),
      payload: { id: 'local-default' },
    });
    expect(back.statusCode).toBe(200);

    const removed = await app.inject({ method: 'DELETE', url: ACCOUNTS_API.byId(workId!) });
    expect(removed.statusCode).toBe(200);
    expect(accountsResponseSchema.parse(removed.json()).accounts).toHaveLength(1);
  });

  it('绑定与解绑 GitHub（支持携带 credential）', async () => {
    const app = await buildAccountsApp();

    const bound = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.bindGithub('local-default'),
      payload: {
        direction: 'local-to-cloud',
        github: { login: 'Ethan-Hang', userId: 12345 },
        credential: {
          accessToken: 'ghu_fake_token',
          tokenType: 'bearer',
          scope: 'gist',
        },
      },
    });
    expect(bound.statusCode).toBe(200);
    expect(accountsResponseSchema.parse(bound.json()).accounts[0]?.kind).toBe('github');

    const unbound = await app.inject({
      method: 'DELETE',
      url: ACCOUNTS_API.github('local-default'),
    });
    expect(unbound.statusCode).toBe(200);
    expect(accountsResponseSchema.parse(unbound.json()).accounts[0]?.kind).toBe('local');
  });

  it('切到不存在的账号落成 404，带请求编号', async () => {
    const app = await buildAccountsApp();

    const res = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.active(),
      payload: { id: '查无此人' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ requestId: expect.any(String) });
  });

  it('入参不合法落成 400，而不是 500', async () => {
    const app = await buildAccountsApp();

    const res = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.root(),
      payload: { displayName: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('绑定方向必须是两个已知值之一', async () => {
    const app = await buildAccountsApp();

    const res = await app.inject({
      method: 'POST',
      url: ACCOUNTS_API.bindGithub('local-default'),
      payload: { direction: '随便', github: { login: 'Ethan-Hang', userId: 12345 } },
    });

    expect(res.statusCode).toBe(400);
  });

  it('PATCH 更新账号显示名称与头像', async () => {
    const app = await buildAccountsApp();

    const patchRes = await app.inject({
      method: 'PATCH',
      url: ACCOUNTS_API.byId('local-default'),
      payload: {
        displayName: '自定义昵称',
        avatar: 'data:image/png;base64,sample',
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const parsed = accountsResponseSchema.parse(patchRes.json());
    const account = parsed.accounts.find((a) => a.id === 'local-default');
    expect(account?.displayName).toBe('自定义昵称');
    expect(account?.avatar).toBe('data:image/png;base64,sample');
  });
});
