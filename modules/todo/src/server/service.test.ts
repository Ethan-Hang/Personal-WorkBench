import { describe, it, expect, beforeEach } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { TODO_MODULE_ID } from '../contract.js';
import { createTask, listToday, completeTask } from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z'; // 上海时间 9/20 10:00

function makeCtx(): ModuleContext {
  const { db } = openTestDatabase();
  return { moduleId: TODO_MODULE_ID, items: new SqliteItemRepository(db) };
}

describe('createTask', () => {
  let ctx: ModuleContext;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('创建的任务默认排在今天', async () => {
    const task = await createTask(
      ctx,
      { title: '写周报', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).toContain(task.id);
  });

  it('dueDate 被补成该本地日的最后一毫秒（spec §5.3 决策 ③）', async () => {
    const task = await createTask(
      ctx,
      { title: '有死线', importance: 'high', dueDate: '2026-09-20' },
      { zone: SH, now: NOW },
    );
    expect(task.dueAt).toBe('2026-09-20T15:59:59.999Z');
  });

  it('无 dueDate 时 urgency 为 none（spec §7.4）', async () => {
    const task = await createTask(
      ctx,
      { title: '无死线', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.urgency).toBe('none');
  });
});

describe('listToday', () => {
  let ctx: ModuleContext;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('返回本地日期与时区', async () => {
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.date).toBe('2026-09-20');
    expect(today.zone).toBe(SH);
  });

  it('按 priorityScore 降序排列', async () => {
    await createTask(
      ctx,
      { title: '低', importance: 'low', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      { title: '高', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      { title: '中', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );

    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.title)).toEqual(['高', '中', '低']);
  });

  it('逾期任务进 overdue 而不进 tasks', async () => {
    await createTask(
      ctx,
      { title: '早就该做完', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.overdue.map((t) => t.title)).toEqual(['早就该做完']);
    expect(today.tasks.map((t) => t.title)).not.toContain('早就该做完');
  });

  it('前几天未完成的任务会被带到今天', async () => {
    const YESTERDAY = '2026-09-19T02:00:00.000Z';
    await createTask(
      ctx,
      { title: '昨天没做完', importance: 'normal', dueDate: null },
      { zone: SH, now: YESTERDAY },
    );

    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.title)).toContain('昨天没做完');
  });

  it('已完成的任务不出现在 overdue 中', async () => {
    const task = await createTask(
      ctx,
      { title: '逾期但已完成', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, task.id, { zone: SH, now: NOW });
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.overdue).toHaveLength(0);
  });
});

describe('completeTask', () => {
  it('把状态置为 done 并写入 completedAt', async () => {
    const ctx = makeCtx();
    const task = await createTask(
      ctx,
      { title: '做完它', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const done = await completeTask(ctx, task.id, { zone: SH, now: NOW });
    expect(done.status).toBe('done');

    const stored = await ctx.items.getById(task.id);
    expect(stored!.completedAt).toBe(NOW);
  });

  it('对不存在的 id 抛错', async () => {
    const ctx = makeCtx();
    await expect(completeTask(ctx, 'nope', { zone: SH, now: NOW })).rejects.toThrow();
  });
});
