import { describe, it, expect, beforeEach } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { WORKBENCH_MODULE_ID } from '../contract.js';
import { listCalendar, listToday, listUnscheduled, scheduleItem } from './service.js';

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

    const view = await scheduleItem(
      ctx,
      item.id,
      { scheduled: { kind: 'all-day', date: '2026-09-22' } },
      OPTS,
    );

    expect(view.scheduled).toEqual({ kind: 'all-day', date: '2026-09-22' });
    expect((await items.getById(item.id))?.scheduled).toEqual({
      kind: 'all-day',
      date: '2026-09-22',
    });
  });

  it('能给其他模块的事项排程——这正是工作台存在的意义（ADR-0012）', async () => {
    const item = await items.create('campus-recruit', { kind: 'task', title: '投递截止' });

    const view = await scheduleItem(
      ctx,
      item.id,
      { scheduled: { kind: 'all-day', date: '2026-09-21' } },
      OPTS,
    );

    expect(view.sourceModule).toBe('campus-recruit');
    expect(view.scheduled).toEqual({ kind: 'all-day', date: '2026-09-21' });
  });

  it('date 为 null 时取消排程，事项退回待排程抽屉', async () => {
    const item = await items.create('todo', {
      kind: 'task',
      title: '不做了先放着',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const view = await scheduleItem(ctx, item.id, { scheduled: null }, OPTS);
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

    const view = await scheduleItem(
      ctx,
      item.id,
      { scheduled: { kind: 'all-day', date: '2026-09-21' } },
      OPTS,
    );
    expect(view.dueAt).toBe('2026-09-25T15:59:59.999Z');
  });

  it('对不存在的 id 抛错', async () => {
    await expect(
      scheduleItem(ctx, 'nope', { scheduled: { kind: 'all-day', date: '2026-09-21' } }, OPTS),
    ).rejects.toThrow();
  });
});

describe('scheduleItem 分钟级颗粒度', () => {
  it('排到具体时刻，保留 start 与 end', async () => {
    const item = await items.create('todo', { kind: 'task', title: '开会' });

    const view = await scheduleItem(
      ctx,
      item.id,
      {
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T07:30:00.000Z',
          end: '2026-09-20T08:30:00.000Z',
        },
      },
      OPTS,
    );

    expect(view.scheduled).toEqual({
      kind: 'timed',
      start: '2026-09-20T07:30:00.000Z',
      end: '2026-09-20T08:30:00.000Z',
    });
  });

  it('秒与毫秒被截零——颗粒度由服务端保证', async () => {
    const item = await items.create('todo', { kind: 'task', title: '带秒的输入' });

    const view = await scheduleItem(
      ctx,
      item.id,
      {
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T07:30:48.512Z',
          end: '2026-09-20T08:30:59.999Z',
        },
      },
      OPTS,
    );

    expect(view.scheduled).toEqual({
      kind: 'timed',
      start: '2026-09-20T07:30:00.000Z',
      end: '2026-09-20T08:30:00.000Z',
    });
  });

  it('end 可缺省', async () => {
    const item = await items.create('todo', { kind: 'task', title: '不知道多久' });

    const view = await scheduleItem(
      ctx,
      item.id,
      { scheduled: { kind: 'timed', start: '2026-09-20T07:30:00.000Z' } },
      OPTS,
    );

    expect(view.scheduled).toEqual({ kind: 'timed', start: '2026-09-20T07:30:00.000Z' });
  });

  it('定时改回全天，end 不会残留', async () => {
    const item = await items.create('todo', { kind: 'task', title: '改成全天' });
    await scheduleItem(
      ctx,
      item.id,
      {
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T07:30:00.000Z',
          end: '2026-09-20T08:30:00.000Z',
        },
      },
      OPTS,
    );

    const view = await scheduleItem(
      ctx,
      item.id,
      { scheduled: { kind: 'all-day', date: '2026-09-20' } },
      OPTS,
    );

    expect(view.scheduled).toEqual({ kind: 'all-day', date: '2026-09-20' });
  });
});

describe('listCalendar 区间取数', () => {
  it('一次拿全全天与定时两类，含区间两端', async () => {
    await items.create('todo', {
      kind: 'task',
      title: '区间起点全天',
      scheduled: { kind: 'all-day', date: '2026-09-14' },
    });
    await items.create('campus-recruit', {
      kind: 'event',
      title: '周中笔试',
      scheduled: { kind: 'timed', start: '2026-09-17T11:00:00.000Z' },
    });
    await items.create('todo', {
      kind: 'task',
      title: '区间终点全天',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.create('todo', {
      kind: 'task',
      title: '区间外',
      scheduled: { kind: 'all-day', date: '2026-09-21' },
    });

    const cal = await listCalendar(ctx, { from: '2026-09-14', to: '2026-09-20' }, OPTS);

    expect(cal.from).toBe('2026-09-14');
    expect(cal.to).toBe('2026-09-20');
    expect(cal.items.map((i) => i.title)).toEqual(['区间起点全天', '周中笔试', '区间终点全天']);
  });

  it('同一天的全天事项排在定时事项之前（spec §6.3）', async () => {
    await items.create('campus-recruit', {
      kind: 'event',
      title: '上午面试',
      scheduled: { kind: 'timed', start: '2026-09-20T01:00:00.000Z' },
    });
    await items.create('todo', {
      kind: 'task',
      title: '全天事项',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const cal = await listCalendar(ctx, { from: '2026-09-20', to: '2026-09-20' }, OPTS);
    expect(cal.items.map((i) => i.title)).toEqual(['全天事项', '上午面试']);
  });

  it('已完成的仍在日历上，回收站里的不在', async () => {
    const done = await items.create('todo', {
      kind: 'task',
      title: '已完成',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.update(done.id, { status: 'done', completedAt: NOW });
    const trashed = await items.create('todo', {
      kind: 'task',
      title: '已删除',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
    await items.update(trashed.id, { status: 'cancelled' });

    const cal = await listCalendar(ctx, { from: '2026-09-20', to: '2026-09-20' }, OPTS);
    expect(cal.items.map((i) => i.title)).toEqual(['已完成']);
  });

  it('未排程的不出现在日历上', async () => {
    await items.create('todo', { kind: 'task', title: '还没排' });

    const cal = await listCalendar(ctx, { from: '2026-09-01', to: '2026-09-30' }, OPTS);
    expect(cal.items).toHaveLength(0);
  });

  it('定时事项按本地日归属，跨 UTC 日界不会漏', async () => {
    // 上海 9/20 07:00 = UTC 9/19 23:00，按 UTC 天算会落到 19 号
    await items.create('campus-recruit', {
      kind: 'event',
      title: '早上七点的会',
      scheduled: { kind: 'timed', start: '2026-09-19T23:00:00.000Z' },
    });

    const cal = await listCalendar(ctx, { from: '2026-09-20', to: '2026-09-20' }, OPTS);
    expect(cal.items.map((i) => i.title)).toEqual(['早上七点的会']);
  });
});
