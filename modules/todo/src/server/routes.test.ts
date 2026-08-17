import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { todoServerModule } from './index.js';

async function makeApp(): Promise<FastifyInstance> {
  const { db } = openTestDatabase();
  return buildApp({ db, modules: [todoServerModule] });
}

describe('todo HTTP 接口', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await makeApp();
  });

  it('POST /api/todo/tasks 创建任务并回传视图', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '写周报', importance: 'high' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('写周报');
    expect(body.importance).toBe('high');
    expect(typeof body.priorityScore).toBe('number');
  });

  it('POST /api/todo/tasks 对空标题返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
  });

  it('GET /api/todo/today 返回今天的任务', async () => {
    await app.inject({ method: 'POST', url: '/api/todo/tasks', payload: { title: 'A' } });
    await app.inject({ method: 'POST', url: '/api/todo/tasks', payload: { title: 'B' } });

    const res = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('POST /api/todo/tasks/:id/complete 完成任务后它不再出现在今日列表', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '做完它' },
    });
    const id = created.json().id;

    const done = await app.inject({ method: 'POST', url: `/api/todo/tasks/${id}/complete` });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('done');

    const today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.json().tasks).toHaveLength(0);
  });

  it('完成不存在的任务返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/todo/tasks/nope/complete' });
    expect(res.statusCode).toBe(404);
  });
});
