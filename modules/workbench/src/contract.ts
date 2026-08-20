import { z } from 'zod';

export const WORKBENCH_MODULE_ID = 'workbench';

/** 浮动日期 'YYYY-MM-DD'。全天排程用它，绝不转 UTC（spec §6.2）。 */
export const plainDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');

/** UTC ISO8601 时刻，形如 '2026-09-20T11:00:00.000Z'。三位毫秒与 Z 后缀是承重的。 */
export const isoInstantSchema = z
  .string()
  .datetime({ precision: 3, message: '时刻须为 UTC ISO8601，形如 2026-09-20T11:00:00.000Z' });

/**
 * core 的 ScheduledTime 值对象在接缝上的镜像（spec §6.3）。
 * 两个分支必须与 core 保持一致——加第三种形态时这里也要加，
 * 否则服务端能产出前端 parse 不了的形状。
 *
 * `timed` 分支的颗粒度是**分钟**：服务端会把 `start` / `end` 的秒与毫秒截零。
 */
export const scheduledTimeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all-day'), date: plainDateSchema }),
  z.object({
    kind: z.literal('timed'),
    start: isoInstantSchema,
    /** 结束时刻，可缺省。缺省时日历按自身默认时长绘制。 */
    end: isoInstantSchema.optional(),
  }),
]);
export type ScheduledTimeView = z.infer<typeof scheduledTimeSchema>;

export const workbenchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** 产生这条事项的模块。工作台把所有模块的事项摆在同一条时间轴上。 */
  sourceModule: z.string(),
  kind: z.enum(['task', 'event']),
  status: z.enum(['inbox', 'todo', 'doing', 'done', 'cancelled']),
  importance: z.enum(['high', 'normal', 'low']),
  notes: z.string().nullable().default(null),
  dueAt: z.string().nullable(),
  scheduled: scheduledTimeSchema.nullable(),
  urgency: z.enum(['none', 'later', 'soon', 'imminent', 'overdue']),
  priorityScore: z.number(),
  isImportantQuadrant: z.boolean(),
  isUrgentQuadrant: z.boolean(),
});
export type WorkbenchItem = z.infer<typeof workbenchItemSchema>;

export const todayResponseSchema = z.object({
  /** 本地日期 YYYY-MM-DD */
  date: z.string(),
  zone: z.string(),
  /** 今日排程（含此前未完成、被带到今天的全天事项），按 priorityScore 降序 */
  scheduled: z.array(workbenchItemSchema),
  /** 逾期摘要：首页顶部按需展开（原型已确认结论） */
  overdue: z.array(workbenchItemSchema),
  /** 今日已完成 */
  completed: z.array(workbenchItemSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const unscheduledResponseSchema = z.object({
  items: z.array(workbenchItemSchema),
});
export type UnscheduledResponse = z.infer<typeof unscheduledResponseSchema>;

/**
 * 排程入参。两种形态，与 core 的 `ScheduledTime` 同构：
 *
 * - `{ scheduled: { kind: 'all-day', date } }`      整天
 * - `{ scheduled: { kind: 'timed', start, end? } }` 定时，**颗粒度到分钟**
 * - `{ scheduled: null }`                           取消排程，退回待排程抽屉
 *
 * `start` / `end` 是 UTC 时刻，由前端把本地墙钟时间换算好再发——它知道用户在哪个时区，
 * 服务端只知道自己进程的时区。服务端会把秒与毫秒截零，因此颗粒度是分钟这件事
 * 由服务端保证，而不是靠前端自觉。
 */
export const scheduleInputSchema = z
  .object({
    scheduled: scheduledTimeSchema.nullable(),
  })
  .refine(
    (input) =>
      input.scheduled === null ||
      input.scheduled.kind === 'all-day' ||
      input.scheduled.end === undefined ||
      input.scheduled.end > input.scheduled.start,
    { message: '结束时刻必须晚于开始时刻' },
  );
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/** 日历区间一次最多取多少天。防止一个请求把整库拉出来。 */
export const CALENDAR_MAX_DAYS = 96;

/**
 * 日历区间查询。`from` / `to` 是**本地浮动日期，含两端**。
 * 周视图传一周，月视图传一个月，用同一个端点。
 */
export const calendarQuerySchema = z
  .object({
    from: plainDateSchema,
    to: plainDateSchema,
  })
  .refine((q) => q.from <= q.to, { message: 'from 不得晚于 to' })
  .refine(
    (q) =>
      (Date.parse(`${q.to}T00:00:00.000Z`) - Date.parse(`${q.from}T00:00:00.000Z`)) / 86_400_000 <
      CALENDAR_MAX_DAYS,
    { message: `区间最多 ${CALENDAR_MAX_DAYS} 天` },
  );
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarResponseSchema = z.object({
  from: plainDateSchema,
  to: plainDateSchema,
  zone: z.string(),
  /** 区间内全部模块的事项，含全天与定时两类。按排程先后排序。 */
  items: z.array(workbenchItemSchema),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

/**
 * 路径参数占位符。传给下面的路径构造函数得到 Fastify 注册模式；
 * 传真实 id 则得到可直接请求的路径。
 */
export const ID_PARAM = ':id';

function segment(value: string): string {
  return value === ID_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**。
 *
 * 注意 `modules/todo` 现在也有一个 `/api/todo/today`。两者短暂并存：
 * 工作台是它的正主，todo 的那个会在前端完成 UI 搬迁后退休。
 * 详见 docs/parallel-development.md §5。
 */
export const WORKBENCH_API = {
  /** GET → TodayResponse */
  today: '/api/workbench/today',
  /** GET → UnscheduledResponse（有 DDL 但还没决定哪天做的事项） */
  unscheduled: '/api/workbench/unscheduled',
  /** GET（Fastify 注册用；请求路径用下面的 calendarPath） → CalendarResponse */
  calendar: '/api/workbench/calendar',
  /** PATCH ScheduleInput → WorkbenchItem；不存在时 404 */
  schedule: (id: string): string => `/api/workbench/items/${segment(id)}/schedule`,
} as const;

/** 带查询串的日历请求路径。`from` / `to` 含两端。 */
export function calendarPath(from: string, to: string): string {
  const query = new URLSearchParams({ from, to });
  return `${WORKBENCH_API.calendar}?${query.toString()}`;
}
