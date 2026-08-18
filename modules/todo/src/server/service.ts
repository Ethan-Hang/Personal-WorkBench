import {
  deriveUrgency,
  resolveDueDateUtc,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  priorityScore,
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
function toScheduledView(scheduled: ScheduledTime | null): ScheduledTimeView | null {
  if (scheduled === null) return null;
  switch (scheduled.kind) {
    case 'all-day':
      return { kind: 'all-day', date: scheduled.date };
    case 'timed':
      return scheduled.end === undefined
        ? { kind: 'timed', start: scheduled.start }
        : { kind: 'timed', start: scheduled.start, end: scheduled.end };
  }
}

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

function toView(item: Item, now: IsoInstant): TaskView {
  const urgency = deriveUrgency(item.dueAt, now);
  return {
    id: item.id,
    title: item.title,
    sourceModule: item.sourceModule,
    kind: item.kind,
    status: item.status,
    importance: item.importance,
    dueAt: item.dueAt,
    scheduled: toScheduledView(item.scheduled),
    urgency,
    priorityScore: priorityScore(item.importance, urgency),
    isImportantQuadrant: isImportantQuadrant(item.importance),
    isUrgentQuadrant: isUrgentQuadrant(urgency),
  };
}

/** priorityScore 降序；同分时 dueAt 升序（有死线的排前面）。 */
function byPriority(a: TaskView, b: TaskView): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.dueAt === null && b.dueAt === null) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
}

const OPEN_STATUSES = ['inbox', 'todo', 'doing'] as const;

export async function createTask(
  ctx: ModuleContext,
  input: CreateTaskInput,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const today = localDayOf(now, opts.zone);

  const item = await ctx.items.create(ctx.moduleId, {
    kind: 'task',
    title: input.title,
    importance: input.importance,
    // 支持纯日期与带时分（或 UTC ISO）的 DDL，统一解析为 UTC instant
    dueAt: input.dueDate === null ? null : resolveDueDateUtc(input.dueDate, opts.zone),
    // 缺省排在今天全天；显式传 null 则不排程，直接进待排程抽屉
    scheduled:
      input.scheduled === undefined
        ? { kind: 'all-day', date: today }
        : toScheduledTime(input.scheduled),
  });

  return toView(item, now);
}

export async function updateTask(
  ctx: ModuleContext,
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
  if (input.dueDate !== undefined) {
    patch.dueAt = input.dueDate === null ? null : resolveDueDateUtc(input.dueDate, opts.zone);
  }
  if (input.scheduled !== undefined) {
    patch.scheduled = toScheduledTime(input.scheduled);
  }

  const updated = await ctx.items.update(id, patch);
  return toView(updated, now);
}

export async function listToday(ctx: ModuleContext, opts: ServiceOptions): Promise<TodayResponse> {
  const now = resolveNow(opts);
  const date = localDayOf(now, opts.zone);
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

  return {
    date,
    zone: opts.zone,
    tasks: scheduled
      .filter((i) => !overdueIds.has(i.id))
      .map((i) => toView(i, now))
      .sort(byPriority),
    overdue: overdueItems.map((i) => toView(i, now)).sort(byPriority),
    completed: completedItems.map((i) => toView(i, now)),
  };
}

export async function completeTask(
  ctx: ModuleContext,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'done', completedAt: now });
  return toView(updated, now);
}

export async function uncompleteTask(
  ctx: ModuleContext,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'todo', completedAt: null });
  return toView(updated, now);
}

export async function trashTask(
  ctx: ModuleContext,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'cancelled' });
  return toView(updated, now);
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
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const existing = await ctx.items.getById(id);
  if (existing === null) {
    throw new Error(`任务不存在：${id}`);
  }
  const updated = await ctx.items.update(id, { status: statusBeforeTrash(existing) });
  return toView(updated, now);
}

export async function deleteTaskPermanently(ctx: ModuleContext, id: string): Promise<boolean> {
  return ctx.items.delete(ctx.moduleId, id);
}

export async function listTrash(ctx: ModuleContext, opts: ServiceOptions): Promise<TrashResponse> {
  const now = resolveNow(opts);
  const items = await ctx.items.list({
    statuses: ['cancelled'],
    sourceModules: [ctx.moduleId],
  });
  return {
    items: items.map((i) => toView(i, now)),
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
