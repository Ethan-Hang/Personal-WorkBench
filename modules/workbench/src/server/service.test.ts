import { describe, it, expect, beforeEach } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { WORKBENCH_MODULE_ID } from '../contract.js';
import { listToday, listUnscheduled, scheduleItem } from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z'; // 上海时间 9/20 10:00
const OPTS = { zone: SH, now: NOW };

let ctx: ModuleContext;
/** 工作台自己不建 Item；测试里由「别的模块」建，正是它要聚合的东西。 */
let items: SqliteItemRepository;

beforeEach(() => {
  const { db } = openTestDatabase();
  items = new SqliteItemRepository(db);
  ctx = { moduleId: WORKBENCH_MODULE_ID, items };
});

describe('listToday 跨模块聚合', () => {
  it('把不同模块的事项摆在同一条时间轴上', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '写周报',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.create('campus-recruit', {
      kind: 'event',
      title: '某公司笔试',
      scheduled: { kind: 'timed', start: '2026-09-20T11:00:00.000Z' },
    });

    const today = await listToday(ctx, OPTS);

    expect(today.date).toBe('2026-09-20');
    expect(today.zone).toBe(SH);
    expect(today.scheduled.map((i) => i.title).sort()).toEqual(['写周报', '某公司笔试']);
    // 来源模块必须原样透出——工作台不吞掉它，前端要靠它区分展示
    expect(today.scheduled.map((i) => i.sourceModule).sort()).toEqual(['campus-recruit', 'todo']);
  });

  it('scheduled 保留 core 的两个分支形状', async () => {
    await items.create('campus-recruit', {
      kind: 'event',
      title: '面试',
      scheduled: { kind: 'timed', start: '2026-09-20T11:00:00.000Z' },
    });
    const today = await listToday(ctx, OPTS);
    expect(today.scheduled[0]?.scheduled).toEqual({
      kind: 'timed',
      start: '2026-09-20T11:00:00.000Z',
    });
  });

  it('按 priorityScore 降序', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '低',
      importance: 'low',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.create('todo', {
      kind: 'task',
      title: '高',
      importance: 'high',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const today = await listToday(ctx, OPTS);
    expect(today.scheduled.map((i) => i.title)).toEqual(['高', '低']);
  });

  it('逾期事项进 overdue 而不进 scheduled', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '早该做完',
      dueAt: '2026-09-01T00:00:00.000Z',
      scheduled: { kind: 'all-day', date: '2026-09-01' },
    });

    const today = await listToday(ctx, OPTS);
    expect(today.overdue.map((i) => i.title)).toEqual(['早该做完']);
    expect(today.scheduled).toHaveLength(0);
  });

  it('前几天未完成的全天事项被带到今天', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '拖了两天',
      scheduled: { kind: 'all-day', date: '2026-09-18' },
    });

    const today = await listToday(ctx, OPTS);
    expect(today.scheduled.map((i) => i.title)).toEqual(['拖了两天']);
  });

  it('已完成的进 completed，不进 scheduled 也不进 overdue', async () => {
    const done = await items.create('todo', {
      kind: 'task',
      title: '已完成',
      dueAt: '2026-09-01T00:00:00.000Z',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.update(done.id, { status: 'done', completedAt: NOW });

    const today = await listToday(ctx, OPTS);
    expect(today.completed.map((i) => i.title)).toEqual(['已完成']);
    expect(today.scheduled).toHaveLength(0);
    expect(today.overdue).toHaveLength(0);
  });

  it('回收站里的事项（cancelled）不出现在任何一段里', async () => {
    const trashed = await items.create('todo', {
      kind: 'task',
      title: '已删除',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.update(trashed.id, { status: 'cancelled' });

    const today = await listToday(ctx, OPTS);
    expect([...today.scheduled, ...today.overdue, ...today.completed]).toHaveLength(0);
  });
});

describe('listUnscheduled 待排程抽屉', () => {
  it('只收未排程且未完成的事项', async () => {
    await items.create('todo', { kind: 'task', title: '还没决定哪天做', scheduled: null });
    await items.create('todo', {
      kind: 'task',
      title: '已排今天',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const drawer = await listUnscheduled(ctx, OPTS);
    expect(drawer.items.map((i) => i.title)).toEqual(['还没决定哪天做']);
  });

  it('排除已完成与回收站里的事项', async () => {
    const done = await items.create('todo', { kind: 'task', title: '完成了', scheduled: null });
    await items.update(done.id, { status: 'done', completedAt: NOW });
    const trashed = await items.create('todo', { kind: 'task', title: '删了', scheduled: null });
    await items.update(trashed.id, { status: 'cancelled' });

    const drawer = await listUnscheduled(ctx, OPTS);
    expect(drawer.items).toHaveLength(0);
  });

  it('跨模块，且按 priorityScore 降序', async () => {
    await items.create('todo', { kind: 'task', title: '普通', importance: 'normal' });
    await items.create('campus-recruit', { kind: 'task', title: '要紧', importance: 'high' });

    const drawer = await listUnscheduled(ctx, OPTS);
    expect(drawer.items.map((i) => i.title)).toEqual(['要紧', '普通']);
  });
});

describe('scheduleItem', () => {
  it('给事项排到某一天，走全天分支', async () => {
    const item = await items.create('todo', { kind: 'task', title: '排一下' });

    const view = await scheduleItem(ctx, item.id, { date: '2026-09-22' }, OPTS);

    expect(view.scheduled).toEqual({ kind: 'all-day', date: '2026-09-22' });
    expect((await items.getById(item.id))?.scheduled).toEqual({
      kind: 'all-day',
      date: '2026-09-22',
    });
  });

  it('能给其他模块的事项排程——这正是工作台存在的意义（ADR-0010）', async () => {
    const item = await items.create('campus-recruit', { kind: 'task', title: '投递截止' });

    const view = await scheduleItem(ctx, item.id, { date: '2026-09-21' }, OPTS);

    expect(view.sourceModule).toBe('campus-recruit');
    expect(view.scheduled).toEqual({ kind: 'all-day', date: '2026-09-21' });
  });

  it('date 为 null 时取消排程，事项退回待排程抽屉', async () => {
    const item = await items.create('todo', {
      kind: 'task',
      title: '不做了先放着',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const view = await scheduleItem(ctx, item.id, { date: null }, OPTS);
    expect(view.scheduled).toBeNull();

    const drawer = await listUnscheduled(ctx, OPTS);
    expect(drawer.items.map((i) => i.title)).toEqual(['不做了先放着']);
  });

  it('排程不改动 dueAt——死线与「打算哪天做」是两件事（spec §5.3 决策 ①）', async () => {
    const item = await items.create('todo', {
      kind: 'task',
      title: '有死线',
      dueAt: '2026-09-25T15:59:59.999Z',
    });

    const view = await scheduleItem(ctx, item.id, { date: '2026-09-21' }, OPTS);
    expect(view.dueAt).toBe('2026-09-25T15:59:59.999Z');
  });

  it('对不存在的 id 抛错', async () => {
    await expect(scheduleItem(ctx, 'nope', { date: '2026-09-21' }, OPTS)).rejects.toThrow();
  });
});
