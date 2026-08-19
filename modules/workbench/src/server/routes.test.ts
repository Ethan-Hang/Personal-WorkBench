import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { WORKBENCH_API, calendarPath } from '../contract.js';
import { workbenchServerModule } from './index.js';

let app: FastifyInstance;
/** 直接建 Item 模拟「别的模块」，工作台自己不产生事项。 */
let items: SqliteItemRepository;

beforeEach(async () => {
  const { sqlite } = openTestDatabase();
  const getSqlite = () => sqlite;
  items = new SqliteItemRepository(getSqlite);
  app = await buildApp({ getSqlite, modules: [workbenchServerModule] });
});

describe('workbench HTTP 接口', () => {
  it('GET /api/workbench/today 汇总各模块的事项', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '写周报',
      scheduled: { kind: 'all-day', date: new Date().toISOString().slice(0, 10) },
    });

    const res = await app.inject({ method: 'GET', url: WORKBENCH_API.today });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.date).toBe('string');
    expect(typeof body.zone).toBe('string');
    expect(Array.isArray(body.scheduled)).toBe(true);
    expect(Array.isArray(body.overdue)).toBe(true);
    expect(Array.isArray(body.completed)).toBe(true);
  });

  it('GET /api/workbench/unscheduled 返回待排程事项', async () => {
    await items.create('todo', { kind: 'task', title: '还没排' });

    const res = await app.inject({ method: 'GET', url: WORKBENCH_API.unscheduled });

    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { title: string }) => i.title)).toEqual(['还没排']);
  });

  it('PATCH schedule 给事项排到某一天', async () => {
    const item = await items.create('todo', { kind: 'task', title: '排我' });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: { scheduled: { kind: 'all-day', date: '2026-09-22' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scheduled).toEqual({ kind: 'all-day', date: '2026-09-22' });
  });

  it('PATCH schedule 能排其他模块的事项，不返回 403/404', async () => {
    const item = await items.create('campus-recruit', { kind: 'event', title: '某公司笔试' });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: { scheduled: { kind: 'all-day', date: '2026-09-22' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().sourceModule).toBe('campus-recruit');
  });

  it('PATCH schedule 传 null 取消排程', async () => {
    const item = await items.create('todo', {
      kind: 'task',
      title: '退回抽屉',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: { scheduled: null },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scheduled).toBeNull();
  });

  it('PATCH schedule 排到具体时刻，颗粒度到分钟', async () => {
    const item = await items.create('todo', { kind: 'task', title: '下午三点半开会' });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: {
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T07:30:00.000Z',
          end: '2026-09-20T08:30:00.000Z',
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scheduled).toEqual({
      kind: 'timed',
      start: '2026-09-20T07:30:00.000Z',
      end: '2026-09-20T08:30:00.000Z',
    });
  });

  it('PATCH schedule 拒绝把日期当成时刻传', async () => {
    const item = await items.create('todo', { kind: 'task', title: '形状错了' });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: { scheduled: { kind: 'timed', start: '2026-09-20' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
  });

  it('PATCH schedule 拒绝 end 早于 start', async () => {
    const item = await items.create('todo', { kind: 'task', title: '时光倒流' });

    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule(item.id),
      payload: {
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T08:30:00.000Z',
          end: '2026-09-20T07:30:00.000Z',
        },
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('PATCH schedule 对不存在的事项返回 404 而不是 500', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: WORKBENCH_API.schedule('does-not-exist'),
      payload: { scheduled: { kind: 'all-day', date: '2026-09-22' } },
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /api/workbench/calendar 返回区间内的事项', async () => {
    await items.create('campus-recruit', {
      kind: 'event',
      title: '笔试',
      scheduled: { kind: 'timed', start: '2026-09-17T11:00:00.000Z' },
    });

    const res = await app.inject({
      method: 'GET',
      url: calendarPath('2026-09-14', '2026-09-20'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.from).toBe('2026-09-14');
    expect(body.to).toBe('2026-09-20');
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(['笔试']);
  });

  it('GET calendar 对 from 晚于 to 返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: calendarPath('2026-09-21', '2026-09-20'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET calendar 对过长区间返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: calendarPath('2026-01-01', '2026-12-31'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET calendar 缺参数返回 400', async () => {
    const res = await app.inject({ method: 'GET', url: WORKBENCH_API.calendar });
    expect(res.statusCode).toBe(400);
  });
});
