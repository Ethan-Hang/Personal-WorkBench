import { z } from 'zod';

export const WORKBENCH_MODULE_ID = 'workbench';

/**
 * core 的 ScheduledTime 值对象在接缝上的镜像（spec §6.3）。
 * 两个分支必须与 core 保持一致——加第三种形态时这里也要加，
 * 否则服务端能产出前端 parse 不了的形状。
 */
export const scheduledTimeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all-day'), date: z.string() }),
  z.object({ kind: z.literal('timed'), start: z.string(), end: z.string().optional() }),
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
 * 排程只到天，不到时段。
 *
 * 这是 spec §14.3 对周日历的明确限定，在服务端就焊死：给时段留口子，
 * 「拖到某一天」与「拖到某个小时」的交互复杂度差一个量级，而后者尚无需求。
 *
 * `date: null` 表示取消排程，把事项退回待排程抽屉。
 */
export const scheduleInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
    .nullable(),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

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
  /** PATCH ScheduleInput → WorkbenchItem；不存在时 404 */
  schedule: (id: string): string => `/api/workbench/items/${segment(id)}/schedule`,
} as const;
