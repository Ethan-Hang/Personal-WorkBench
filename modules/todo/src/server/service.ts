import {
  deriveUrgency,
  endOfLocalDayUtc,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  priorityScore,
  type IsoInstant,
  type Item,
  type ModuleContext,
} from '@workbench/core';
import type {
  CreateTaskInput,
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

function toView(item: Item, now: IsoInstant): TaskView {
  const urgency = deriveUrgency(item.dueAt, now);
  return {
    id: item.id,
    title: item.title,
    sourceModule: item.sourceModule,
    status: item.status,
    importance: item.importance,
    dueAt: item.dueAt,
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
    // 只精确到天的 DDL 补成该本地日最后一毫秒（spec §5.3 决策 ③）
    dueAt: input.dueDate === null ? null : endOfLocalDayUtc(input.dueDate, opts.zone),
    // 新建任务默认排在今天，走全天排程分支
    scheduled: { kind: 'all-day', date: today },
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
    patch.dueAt = input.dueDate === null ? null : endOfLocalDayUtc(input.dueDate, opts.zone);
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

export async function restoreTask(
  ctx: ModuleContext,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'todo' });
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
      await ctx.items.update(id, { status: 'todo' });
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
    await ctx.items.update(item.id, { status: 'todo' });
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
