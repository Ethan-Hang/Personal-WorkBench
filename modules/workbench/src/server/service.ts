import {
  deriveUrgency,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  priorityScore,
  type IsoInstant,
  type Item,
  type ModuleContext,
  type ScheduledTime,
} from '@workbench/core';
import type {
  ScheduleInput,
  ScheduledTimeView,
  TodayResponse,
  UnscheduledResponse,
  WorkbenchItem,
} from '../contract.js';

export interface ServiceOptions {
  zone: string;
  now?: IsoInstant;
}

function resolveNow(opts: ServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

/**
 * core 的 ScheduledTime → 接缝形状。
 *
 * switch 刻意不带 default：core 将来加第三种排程形态时，这里会编译报错，
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

function toView(item: Item, now: IsoInstant): WorkbenchItem {
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
function byPriority(a: WorkbenchItem, b: WorkbenchItem): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.dueAt === null && b.dueAt === null) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
}

/** 「还没做完」的四个状态。cancelled 不在其中——它是 todo 的回收站（ADR-0009）。 */
const OPEN_STATUSES = ['inbox', 'todo', 'doing'] as const;

/**
 * 今日执行舱。**不按 sourceModule 过滤**——把所有模块的事项摆在同一条时间轴上，
 * 正是工作台存在的理由（spec §5.5：日历完全不知道秋招存在）。
 */
export async function listToday(ctx: ModuleContext, opts: ServiceOptions): Promise<TodayResponse> {
  const now = resolveNow(opts);
  const date = localDayOf(now, opts.zone);
  // 本地日边界在应用层换算成 UTC 区间，SQL 只做字符串比较（spec §6.4）
  const range = localDayRange(date, opts.zone);

  const overdueItems = await ctx.items.list({
    dueBefore: now,
    statuses: [...OPEN_STATUSES],
  });

  const scheduledItems = await ctx.items.list({
    scheduledWithin: range,
    // 前几天没做完的全天事项被带到今天，不会悄悄消失
    scheduledOnOrBeforeDate: date,
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
    // 逾期的只在 overdue 里出现一次，避免同一条事项在页面上出现两遍
    scheduled: scheduledItems
      .filter((i) => !overdueIds.has(i.id))
      .map((i) => toView(i, now))
      .sort(byPriority),
    overdue: overdueItems.map((i) => toView(i, now)).sort(byPriority),
    completed: completedItems.map((i) => toView(i, now)).sort(byPriority),
  };
}

/**
 * 待排程抽屉：还没决定哪天做的事项（spec §5.3 决策 ①）。
 *
 * 注意：目前两个既有模块建 Item 时都会填上 scheduled——todo 默认排今天，
 * 秋招投影带着客观时间——所以抽屉的现实数据源只有本模块的
 * `scheduleItem(id, { date: null })`。见 ADR-0012「已知限制」。
 */
export async function listUnscheduled(
  ctx: ModuleContext,
  opts: ServiceOptions,
): Promise<UnscheduledResponse> {
  const now = resolveNow(opts);
  const items = await ctx.items.list({
    unscheduled: true,
    statuses: [...OPEN_STATUSES],
  });

  return { items: items.map((i) => toView(i, now)).sort(byPriority) };
}

/**
 * 排程：把事项放到某一天，或取消排程退回抽屉。
 *
 * **不校验 sourceModule** —— 排程是跨模块能力，这正是工作台的意义（ADR-0012）。
 * 只写 scheduled，绝不碰 dueAt：死线是客观的，排程是主观意图，
 * 混为一谈是许多 todo 应用排不好程的根因（spec §5.3 决策 ①）。
 */
export async function scheduleItem(
  ctx: ModuleContext,
  id: string,
  input: ScheduleInput,
  opts: ServiceOptions,
): Promise<WorkbenchItem> {
  const now = resolveNow(opts);

  const existing = await ctx.items.getById(id);
  if (existing === null) {
    throw new Error(`事项不存在：${id}`);
  }

  // 排程只到天：写入恒为 all-day 分支（spec §14.3）
  const scheduled: ScheduledTime | null =
    input.date === null ? null : { kind: 'all-day', date: input.date };

  const updated = await ctx.items.update(id, { scheduled });
  return toView(updated, now);
}
