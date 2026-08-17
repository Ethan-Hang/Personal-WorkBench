import { describe, it, expect } from 'vitest';
import type { ServerModuleDefinition } from '@workbench/core';
import { openTestDatabase } from '@workbench/data';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

function fakeModule(id: string, calls: string[]): ServerModuleDefinition {
  return {
    id,
    migrations: [],
    registerRoutes(app, ctx) {
      calls.push(`${id}:${ctx.moduleId}`);
      (app as FastifyInstance).get(`/api/${id}/ping`, async () => ({ from: ctx.moduleId }));
    },
  };
}

describe('buildApp', () => {
  it('暴露健康检查', async () => {
    const { db } = openTestDatabase();
    const app = await buildApp({ db, modules: [] });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('为每个模块调用 registerRoutes，并传入以自身 id 构造的 ModuleContext', async () => {
    const { db } = openTestDatabase();
    const calls: string[] = [];
    const app = await buildApp({
      db,
      modules: [fakeModule('alpha', calls), fakeModule('beta', calls)],
    });

    expect(calls).toEqual(['alpha:alpha', 'beta:beta']);

    const res = await app.inject({ method: 'GET', url: '/api/beta/ping' });
    expect(res.json()).toEqual({ from: 'beta' });
    await app.close();
  });

  it('模块经 ModuleContext 创建的 Item 自动带上自己的 sourceModule', async () => {
    const { db } = openTestDatabase();
    let createdSource = '';
    const probe: ServerModuleDefinition = {
      id: 'probe',
      migrations: [],
      async registerRoutes(_app, ctx) {
        const item = await ctx.items.create(ctx.moduleId, { kind: 'task', title: '探针' });
        createdSource = item.sourceModule;
      },
    };
    const app = await buildApp({ db, modules: [probe] });
    expect(createdSource).toBe('probe');
    await app.close();
  });
});
