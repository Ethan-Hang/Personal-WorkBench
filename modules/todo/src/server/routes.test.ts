import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { SqliteTodoRepository } from '../storage/sqlite-repository.js';
import { createTodoServerModule } from './index.js';

async function makeApp(): Promise<FastifyInstance> {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/todo/migrations');
  const getSqlite = () => sqlite;
  return buildApp({
    getSqlite,
    modules: [createTodoServerModule(new SqliteTodoRepository(getSqlite))],
  });
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

  it('PATCH /api/todo/tasks/:id 更新任务', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '待修改' },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/todo/tasks/${id}`,
      payload: { title: '已修改', importance: 'high' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('已修改');
    expect(res.json().importance).toBe('high');
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

  it('POST /api/todo/tasks/:id/complete 完成与取消完成任务', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '做完它' },
    });
    const id = created.json().id;

    const done = await app.inject({ method: 'POST', url: `/api/todo/tasks/${id}/complete` });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('done');

    let today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.json().tasks).toHaveLength(0);
    expect(today.json().completed).toHaveLength(1);

    // 取消完成
    const undone = await app.inject({ method: 'POST', url: `/api/todo/tasks/${id}/uncomplete` });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().status).toBe('todo');

    today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.json().tasks).toHaveLength(1);
    expect(today.json().completed).toHaveLength(0);
  });

  it('软删除、批量恢复、批量删除与全部恢复流程', async () => {
    const c1 = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '任务1' },
    });
    const c2 = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '任务2' },
    });
    const id1 = c1.json().id;
    const id2 = c2.json().id;

    // 软删除
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id1}/trash` });
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id2}/trash` });

    // 批量恢复
    const batchRestoreRes = await app.inject({
      method: 'POST',
      url: '/api/todo/trash/batch-restore',
      payload: { ids: [id1, id2] },
    });
    expect(batchRestoreRes.statusCode).toBe(200);
    expect(batchRestoreRes.json().count).toBe(2);

    // 重新软删除
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id1}/trash` });
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id2}/trash` });

    // 全部恢复
    const restoreAllRes = await app.inject({
      method: 'POST',
      url: '/api/todo/trash/restore-all',
    });
    expect(restoreAllRes.statusCode).toBe(200);
    expect(restoreAllRes.json().count).toBe(2);

    // 再次软删除并批量删除
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id1}/trash` });
    await app.inject({ method: 'POST', url: `/api/todo/tasks/${id2}/trash` });

    const batchDeleteRes = await app.inject({
      method: 'POST',
      url: '/api/todo/trash/batch-delete',
      payload: { ids: [id1] },
    });
    expect(batchDeleteRes.statusCode).toBe(200);
    expect(batchDeleteRes.json().count).toBe(1);

    const listTrashRes = await app.inject({ method: 'GET', url: '/api/todo/trash' });
    expect(listTrashRes.json().items).toHaveLength(1);
    expect(listTrashRes.json().items[0].id).toBe(id2);
  });

  it('完成不存在的任务返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/todo/tasks/nope/complete' });
    expect(res.statusCode).toBe(404);
  });

  it('完成其他模块的 Item 返回 404', async () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/todo/migrations');
    const getSqlite = () => sqlite;
    const items = new SqliteItemRepository(getSqlite);
    const campusItem = await items.create('campus-recruit', {
      kind: 'task',
      title: '投递 星云科技 固件工程师',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    const todoApp = await buildApp({
      getSqlite,
      modules: [createTodoServerModule(new SqliteTodoRepository(getSqlite))],
    });

    const res = await todoApp.inject({
      method: 'POST',
      url: `/api/todo/tasks/${campusItem.id}/complete`,
    });

    expect(res.statusCode).toBe(404);
  });
});
