import {
  deriveUrgency,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  priorityScore,
  scheduledSortKey,
  truncateToMinute,
  type IsoInstant,
  type Item,
  type ModuleContext,
  type ScheduledTime,
} from '@workbench/core';
import type {
  CalendarQuery,
  CalendarResponse,
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
    notes: item.notes ?? null,
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

/**
 * 日历顺序：按排程先后，同时刻时按优先级。
 *
 * 排序键直接用 core 的 `scheduledSortKey`，不在这里重写一遍规则。
 * 它保证 '2026-09-20' < '2026-09-20T09:00:00.000Z'，因此当天的全天事项
 * 天然排在定时事项之前——正是日历应有的顺序（spec §6.3）。
 */
function bySchedule(a: WorkbenchItem, b: WorkbenchItem): number {
  const ka = a.scheduled === null ? '' : scheduledSortKey(a.scheduled);
  const kb = b.scheduled === null ? '' : scheduledSortKey(b.scheduled);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return byPriority(a, b);
}

/** 「还没做完」的四个状态。cancelled 不在其中——它是 todo 的回收站（ADR-0009）。 */
const OPEN_STATUSES = ['inbox', 'todo', 'doing'] as const;

/**
 * 「这条已完成事项算不算今天做完的」。
 *
 * 取数用的 `scheduledOnOrBeforeDate` 是为**未完成**那半边服务的——把拖了几天的旧事项
 * 带到今天，不让它悄悄消失。但同一个条件套在已完成那半边上，会让往日做完的旧事项
 * 永久堆进今日的 completed，今日执行度的分子分母因此一起虚高，且只增不减。
 *
 * 归属一律以 `completedAt` 落在今天的本地日区间为准。历史数据可能没有 `completedAt`
 * （done 却没记完成时刻），那时退回按排程日归属——定时排程已被 `scheduledWithin`
 * 限在今天，只需再判全天排程那一支。
 */
function isCompletedOn(
  item: Item,
  date: string,
  range: { startUtc: IsoInstant; endUtc: IsoInstant },
): boolean {
  if (item.completedAt !== null) {
    return item.completedAt >= range.startUtc && item.completedAt < range.endUtc;
  }
  if (item.scheduled === null) return false;
  return item.scheduled.kind === 'all-day' ? item.scheduled.date === date : true;
}

/**
 * 今日执行舱。**不按 sourceModule 过滤**——把所有模块的事项摆在同一条时间轴上，
 * 正是工作台存在的理由（spec §5.5：日历完全不知道秋招存在）。
 */
export async function listToday(ctx: ModuleContext, opts: ServiceOptions): Promise<TodayResponse> {
  const now = resolveNow(opts);
  const date = localDayOf(now, opts.zone);
  // 本地日边界在应用层换算成 UTC 区间，SQL 只做字符串比较（spec §6.4）
  const range = localDayRange(date, opts.zone);

  // 逾期有两条独立的判据，取并集：
  //   ① DDL 已过（`dueBefore`）——「最晚做完」的那一刻过去了；
  //   ② 排程日已过（`scheduledBeforeDate` / `scheduledBefore`）——「打算哪天做」的那天过去了，人没做。
  // 只认 ① 的话逾期桶实际上恒为空：建待办时不填截止日期是常态，dueAt 绝大多数为 null。
  // ② 的颗粒度刻意是「天」而非「时刻」：今早八点排的事拖到十点还不叫逾期，拖到明天才叫。
  const [dueOverdue, scheduleOverdue] = await Promise.all([
    ctx.items.list({ dueBefore: now, statuses: [...OPEN_STATUSES] }),
    ctx.items.list({
      scheduledBeforeDate: date,
      scheduledBefore: range.startUtc,
      statuses: [...OPEN_STATUSES],
    }),
  ]);
  const overdueItems = [...dueOverdue];
  const seen = new Set(dueOverdue.map((i) => i.id));
  for (const item of scheduleOverdue) {
    if (!seen.has(item.id)) overdueItems.push(item);
  }

  // 只取今天的。前几天没做完的不再混进来——它们已经由上面的判据 ② 进了 overdue，
  // 在那里被显式标成逾期，而不是不声不响地混在今天的排程里。
  const scheduledItems = await ctx.items.list({
    scheduledWithin: range,
    scheduledOnDate: date,
    statuses: [...OPEN_STATUSES],
  });

  const completedItems = (
    await ctx.items.list({
      scheduledWithin: range,
      scheduledOnOrBeforeDate: date,
      statuses: ['done'],
    })
  ).filter((i) => isCompletedOn(i, date, range));

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
 * `scheduleItem(id, { scheduled: null })`。见 ADR-0012「已知限制」。
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
 * 接缝形状 → core 的 ScheduledTime，并把定时分支的颗粒度压到分钟。
 *
 * 截零发生在这里而不是 Zod schema 里：schema 是前后端共用的**形状**描述，
 * 在它上面挂 transform 会让前端 parse 响应时也跟着改数据。归一化是服务端的事。
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

/**
 * 排程：把事项放到某一天、某个时刻，或取消排程退回抽屉。
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

  const updated = await ctx.items.update(id, { scheduled: toScheduledTime(input.scheduled) });
  return toView(updated, now);
}

/**
 * 日历区间取数。`from` / `to` 是本地浮动日期，**含两端**。
 *
 * 两类事项一次取全：全天的按浮动日期区间比字符串，定时的按 UTC 区间比时刻。
 * 时区换算只在这里做一次（`localDayRange`），SQL 层仍然只做字符串比较（spec §6.4）。
 */
export async function listCalendar(
  ctx: ModuleContext,
  query: CalendarQuery,
  opts: ServiceOptions,
): Promise<CalendarResponse> {
  const now = resolveNow(opts);
  const startUtc = localDayRange(query.from, opts.zone).startUtc;
  const endUtc = localDayRange(query.to, opts.zone).endUtc;

  const items = await ctx.items.list({
    scheduledWithin: { startUtc, endUtc },
    scheduledDateBetween: { from: query.from, to: query.to },
    // 回收站里的事项不该出现在日历上；已完成的要显示，划掉也是信息
    statuses: [...OPEN_STATUSES, 'done'],
  });

  return {
    from: query.from,
    to: query.to,
    zone: opts.zone,
    items: items.map((i) => toView(i, now)).sort(bySchedule),
  };
}
