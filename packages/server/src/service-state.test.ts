import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from './app.js';
import { ServiceState } from './service-state.js';

async function appWith(state: ServiceState, modules: ServerModuleDefinition[] = []) {
  const { sqlite } = openTestDatabase();
  return buildApp({ getSqlite: () => sqlite, modules, serviceState: state });
}

describe('ServiceState', () => {
  it('起始是 idle，enter / reset 之间来回', () => {
    const state = new ServiceState();
    expect(state.current()).toEqual({ state: 'idle' });
    expect(state.isBusy()).toBe(false);

    state.enter('switching', '切换到「工作」');
    expect(state.current()).toEqual({ state: 'switching', step: '切换到「工作」' });
    expect(state.isBusy()).toBe(true);

    state.reset();
    expect(state.current()).toEqual({ state: 'idle' });
  });

  it('拒绝在忙碌时再进入另一个忙碌态', () => {
    const state = new ServiceState();
    state.enter('switching');
    expect(() => state.enter('restoring')).toThrow('switching');
  });
});

describe('服务状态拦截', () => {
  it('idle 时业务请求照常通过', async () => {
    const app = await appWith(new ServiceState());
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('忙碌时业务请求一律 503，并带上 state 与 step', async () => {
    const state = new ServiceState();
    const app = await appWith(state);
    state.enter('switching', '正在切换账号');

    const res = await app.inject({ method: 'GET', url: '/api/settings' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ state: 'switching', step: '正在切换账号' });
    await app.close();
  });

  it('健康检查在忙碌时仍然可达，并报出当前状态', async () => {
    const state = new ServiceState();
    const app = await appWith(state);
    state.enter('switching', '正在切换账号');

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, state: 'switching', step: '正在切换账号' });
    await app.close();
  });

  it('恢复流程的路由也在白名单里——切换与恢复共用同一道闸', async () => {
    const state = new ServiceState();
    const restoreRoutes: ServerModuleDefinition = {
      id: 'restore-stub',
      migrations: [],
      async registerRoutes(app) {
        (app as FastifyInstance).get('/api/restore/state', async () => state.current());
      },
    };
    const app = await appWith(state, [restoreRoutes]);
    state.enter('restoring', 'swap');

    const res = await app.inject({ method: 'GET', url: '/api/restore/state' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
