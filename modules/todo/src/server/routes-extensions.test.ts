import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { SqliteTodoRepository } from '../storage/sqlite-repository.js';
import { createTodoServerModule } from './index.js';

/**
 * 子任务 / 标签 / 重复的 HTTP 层。
 *
 * 重点是**错误码**：这三块的校验放在 service 里（为了能被集成测试直接覆盖），
 * 代价是抛出的错误默认会落到统一错误出口变成 500——那会把「标签重名」这种
 * 普通的用户输入问题报成服务器故障。冒烟时真的踩到过，这些用例把它焊住。
 */

let app: FastifyInstance;
let items: SqliteItemRepository;

beforeEach(async () => {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/todo/migrations');
  items = new SqliteItemRepository(db);
  app = await buildApp({ db, modules: [createTodoServerModule(new SqliteTodoRepository(sqlite))] });
});

async function makeTask(title = '搬家'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/todo/tasks',
    payload: { title, importance: 'normal' },
  });
  return res.json().id as string;
}

describe('子任务 HTTP', () => {
  it('建子任务返回 201', async () => {
    const id = await makeTask();
    const res = await app.inject({
      method: 'POST',
      url: `/api/todo/tasks/${id}/subtasks`,
      payload: { title: '订车' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().position).toBe(0);
  });

  it('空标题 400', async () => {
    const id = await makeTask();
    const res = await app.inject({
      method: 'POST',
      url: `/api/todo/tasks/${id}/subtasks`,
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('给不存在的任务加子任务 404，不是 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks/nope/subtasks',
      payload: { title: '订车' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('给别的模块的 Item 加子任务 404', async () => {
    const campusItem = await items.create('campus-recruit', { kind: 'task', title: '笔试' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/todo/tasks/${campusItem.id}/subtasks`,
      payload: { title: '不该成功' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('改不存在的子任务 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/todo/subtasks/nope',
      payload: { done: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('删不存在的子任务 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/todo/subtasks/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('重排给不全 400，不是 500', async () => {
    const id = await makeTask();
    const a = await app.inject({
      method: 'POST',
      url: `/api/todo/tasks/${id}/subtasks`,
      payload: { title: '订车' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/todo/tasks/${id}/subtasks`,
      payload: { title: '打包' },
    });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/todo/tasks/${id}/subtasks/reorder`,
      payload: { ids: [a.json().id] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('标签 HTTP', () => {
  it('建标签返回 201，列表可见', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tags',
      payload: { name: '生活', color: 'green' },
    });
    expect(res.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/api/todo/tags' });
    expect(list.json().tags.map((t: { name: string }) => t.name)).toEqual(['生活']);
  });

  it('重名 409，不是 500——冒烟时踩到的就是这条', async () => {
    await app.inject({ method: 'POST', url: '/api/todo/tags', payload: { name: '生活' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tags',
      payload: { name: '生活' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('已存在');
  });

  it('大小写不同的重名同样 409', async () => {
    await app.inject({ method: 'POST', url: '/api/todo/tags', payload: { name: 'Work' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tags',
      payload: { name: 'work' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('非法颜色 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tags',
      payload: { name: '生活', color: '#ff0000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('给待办设不存在的标签 404', async () => {
    const id = await makeTask();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/todo/tasks/${id}/tags`,
      payload: { tagIds: ['nope'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('设标签后返回的任务视图带 tags', async () => {
    const id = await makeTask();
    const tag = await app.inject({
      method: 'POST',
      url: '/api/todo/tags',
      payload: { name: '生活' },
    });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/todo/tasks/${id}/tags`,
      payload: { tagIds: [tag.json().id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags.map((t: { name: string }) => t.name)).toEqual(['生活']);
  });

  it('删不存在的标签 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/todo/tags/nope' });
    expect(res.statusCode).toBe(404);
  });
});

describe('重复任务 HTTP', () => {
  it('建每日规则返回 201，今日立刻可见', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/recurrences',
      payload: { title: '喝水', freq: 'daily', startDate: '2020-01-01' },
    });
    expect(res.statusCode).toBe(201);

    const today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.json().tasks.map((t: { title: string }) => t.title)).toContain('喝水');
  });

  it('weekly 不带 byWeekday 400——否则会静默地一天也不生成', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/recurrences',
      payload: { title: '健身', freq: 'weekly', startDate: '2020-01-01' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('星期几');
  });

  it('monthly 不带 byMonthday 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/recurrences',
      payload: { title: '交房租', freq: 'monthly', startDate: '2020-01-01' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('几号');
  });

  it('untilDate 早于 startDate 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/recurrences',
      payload: {
        title: '喝水',
        freq: 'daily',
        startDate: '2026-09-20',
        untilDate: '2026-09-01',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('改不存在的规则 404，不是 500', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/todo/recurrences/nope',
      payload: { title: '改名' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('删不存在的规则 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/todo/recurrences/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('列出规则', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/todo/recurrences',
      payload: { title: '喝水', freq: 'daily', startDate: '2020-01-01' },
    });
    const res = await app.inject({ method: 'GET', url: '/api/todo/recurrences' });
    expect(res.json().recurrences.map((r: { title: string }) => r.title)).toEqual(['喝水']);
  });
});
