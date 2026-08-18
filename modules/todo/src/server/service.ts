import {
  deriveUrgency,
  resolveDueDateUtc,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  truncateToMinute,
  type IsoInstant,
  type Item,
  type ModuleContext,
  type ScheduledTime,
} from '@workbench/core';
import type {
  CreateTaskInput,
  ScheduledTimeView,
  TaskView,
  TodayResponse,
  TrashResponse,
  UpdateTaskInput,
} from '../contract.js';
import { materializeAll } from './recurrences.js';
import type { TodoRepository } from './repository.js';
import { toTaskView, toTaskViews } from './views.js';

export interface ServiceOptions {
  zone: string;
  now?: IsoInstant;
}

function resolveNow(opts: ServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

/**
 * core 的 ScheduledTime ↔ 接缝形状。
 *
 * switch 刻意不带 default：core 将来加第三种排程形态时这里会编译报错，
 * 而不是静默漏掉一个分支（CLAUDE.md 的时间存储约定）。
 */
/**
 * 接缝形状 → core，并把定时分支的颗粒度压到分钟。
 * 截零在服务端做，不挂到 Zod schema 上——schema 是前后端共用的形状描述，
 * 在它上面挂 transform 会让前端 parse 响应时也跟着改数据。
 */
function toScheduledTime(input: ScheduledTimeView | null): ScheduledTime | null {
  if (input === null) return null;
  switch (input.kind) {
    case 'all-day':
      return { kind: 'all-day', date: input.date };
    case 'timed':
      return input.end === undefined
        ? { kind: 'timed', start: truncateToMinute(input.start) }
        : {
            kind: 'timed',
            start: truncateToMinute(input.start),
            end: truncateToMinute(input.end),
          };
  }
}

/** priorityScore 降序；同分时 dueAt 升序（有死线的排前面）。 */
function byPriority(a: TaskView, b: TaskView): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.dueAt === null && b.dueAt === null) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
}

/**
 * 空串归一成 null。
 *
 * 前端清空文本框发出的是 ''，不是 null。不归一的话，库里会同时存在 '' 与 null
 * 两种「没有备注」，此后每一处 notes === null 的判断都会漏掉一半。
 *
 * 归一放在这里而不是 Zod 的 .transform()：transform 会改变 z.infer 推出的类型，
 * 让 notes 从可选变成必填，把现有调用方全部打断。
 */
function normalizeNotes(notes: string | null | undefined): string | null {
  return notes === undefined || notes === '' ? null : notes;
}

const OPEN_STATUSES = ['inbox', 'todo', 'doing'] as const;

export async function createTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  input: CreateTaskInput,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const today = localDayOf(now, opts.zone);

  const item = await ctx.items.create(ctx.moduleId, {
    kind: 'task',
    title: input.title,
    importance: input.importance,
    notes: normalizeNotes(input.notes),
    // 支持纯日期与带时分（或 UTC ISO）的 DDL，统一解析为 UTC instant
    dueAt: input.dueDate === null ? null : resolveDueDateUtc(input.dueDate, opts.zone),
    // 缺省排在今天全天；显式传 null 则不排程，直接进待排程抽屉
    scheduled:
      input.scheduled === undefined
        ? { kind: 'all-day', date: today }
        : toScheduledTime(input.scheduled),
  });

  return toTaskView(item, now, repo);
}

export async function updateTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  input: UpdateTaskInput,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const patch: Parameters<typeof ctx.items.update>[1] = {};

  if (input.title !== undefined) {
    patch.title = input.title;
  }
  if (input.importance !== undefined) {
    patch.importance = input.importance;
  }
  if (input.notes !== undefined) {
    patch.notes = normalizeNotes(input.notes);
  }
  if (input.dueDate !== undefined) {
    patch.dueAt = input.dueDate === null ? null : resolveDueDateUtc(input.dueDate, opts.zone);
  }
  if (input.scheduled !== undefined) {
    patch.scheduled = toScheduledTime(input.scheduled);
  }

  const updated = await ctx.items.update(id, patch);
  return toTaskView(updated, now, repo);
}

export async function listToday(
  ctx: ModuleContext,
  repo: TodoRepository,
  opts: ServiceOptions,
): Promise<TodayResponse> {
  const now = resolveNow(opts);
  const date = localDayOf(now, opts.zone);

  // 每次查今日都把重复规则物化到视野尽头。幂等且便宜（水位挡住已展开的部分），
  // 因此不需要定时任务——本地优先的应用没有常驻调度器可用。
  await materializeAll(ctx, repo, now, opts.zone);
  // 时区换算在应用层完成，SQL 只做字符串比较（spec §6.4）
  const range = localDayRange(date, opts.zone);

  const scheduled = await ctx.items.list({
    scheduledWithin: range,
    scheduledOnOrBeforeDate: date,
    statuses: [...OPEN_STATUSES],
  });

  const overdueItems = await ctx.items.list({
    dueBefore: now,
    statuses: [...OPEN_STATUSES],
  });

  const completedItems = await ctx.items.list({
    scheduledWithin: range,
    scheduledOnOrBeforeDate: date,
    statuses: ['done'],
  });

  const overdueIds = new Set(overdueItems.map((i) => i.id));

  const [tasks, overdue, completed] = await Promise.all([
    toTaskViews(
      scheduled.filter((i) => !overdueIds.has(i.id)),
      now,
      repo,
    ),
    toTaskViews(overdueItems, now, repo),
    toTaskViews(completedItems, now, repo),
  ]);

  return {
    date,
    zone: opts.zone,
    tasks: tasks.sort(byPriority),
    overdue: overdue.sort(byPriority),
    completed,
  };
}

export async function completeTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'done', completedAt: now });
  return toTaskView(updated, now, repo);
}

export async function uncompleteTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'todo', completedAt: null });
  return toTaskView(updated, now, repo);
}

export async function trashTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'cancelled' });
  return toTaskView(updated, now, repo);
}

/**
 * 回收站恢复后的状态由 completedAt 反推。
 * 一律恢复成 'todo' 会让「已完成」这条信息在删除→恢复的往返中静默丢失，
 * 并留下 status='todo' 却带着 completedAt 的自相矛盾记录。
 */
function statusBeforeTrash(item: Item): 'todo' | 'done' {
  return item.completedAt === null ? 'todo' : 'done';
}

export async function restoreTask(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const existing = await ctx.items.getById(id);
  if (existing === null) {
    throw new Error(`任务不存在：${id}`);
  }
  const updated = await ctx.items.update(id, { status: statusBeforeTrash(existing) });
  return toTaskView(updated, now, repo);
}

export async function deleteTaskPermanently(ctx: ModuleContext, id: string): Promise<boolean> {
  return ctx.items.delete(ctx.moduleId, id);
}

export async function listTrash(
  ctx: ModuleContext,
  repo: TodoRepository,
  opts: ServiceOptions,
): Promise<TrashResponse> {
  const now = resolveNow(opts);
  const items = await ctx.items.list({
    statuses: ['cancelled'],
    sourceModules: [ctx.moduleId],
  });
  return {
    items: await toTaskViews(items, now, repo),
  };
}

export async function batchRestoreTrash(ctx: ModuleContext, ids: string[]): Promise<number> {
  let count = 0;
  for (const id of ids) {
    const item = await ctx.items.getById(id);
    if (item && item.sourceModule === ctx.moduleId && item.status === 'cancelled') {
      await ctx.items.update(id, { status: statusBeforeTrash(item) });
      count++;
    }
  }
  return count;
}

export async function batchDeleteTrash(ctx: ModuleContext, ids: string[]): Promise<number> {
  let count = 0;
  for (const id of ids) {
    const deleted = await ctx.items.delete(ctx.moduleId, id);
    if (deleted) count++;
  }
  return count;
}

export async function restoreAllTrash(ctx: ModuleContext): Promise<number> {
  const items = await ctx.items.list({
    statuses: ['cancelled'],
    sourceModules: [ctx.moduleId],
  });
  let count = 0;
  for (const item of items) {
    await ctx.items.update(item.id, { status: statusBeforeTrash(item) });
    count++;
  }
  return count;
}

export async function clearTrash(ctx: ModuleContext): Promise<number> {
  const items = await ctx.items.list({
    statuses: ['cancelled'],
    sourceModules: [ctx.moduleId],
  });
  let count = 0;
  for (const item of items) {
    const deleted = await ctx.items.delete(ctx.moduleId, item.id);
    if (deleted) count++;
  }
  return count;
}
