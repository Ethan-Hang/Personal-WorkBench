import { z } from 'zod';
import { IMPORTANCES, ITEM_STATUSES, URGENCIES } from '@workbench/core';

export const TODO_MODULE_ID = 'todo';

export const importanceSchema = z.enum(IMPORTANCES);
export const urgencySchema = z.enum(URGENCIES);

/** 浮动日期 'YYYY-MM-DD'。全天排程用它，绝不转 UTC（spec §6.2）。 */
export const plainDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');

/** UTC ISO8601 时刻，形如 '2026-09-20T11:00:00.000Z'。 */
export const isoInstantSchema = z
  .string()
  .datetime({ precision: 3, message: '时刻须为 UTC ISO8601，形如 2026-09-20T11:00:00.000Z' });

/**
 * core 的 ScheduledTime 在接缝上的镜像（spec §6.3）。
 *
 * 模块间零依赖（铁律 1），所以每个模块各写一份，不从 workbench import——
 * 与 `importanceSchema` 同一回事：core 导出常量与类型，各模块自建 Zod schema。
 *
 * `timed` 分支的颗粒度是**分钟**：服务端会把 start / end 的秒与毫秒截零。
 */
export const scheduledTimeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all-day'), date: plainDateSchema }),
  z.object({
    kind: z.literal('timed'),
    start: isoInstantSchema,
    end: isoInstantSchema.optional(),
  }),
]);
export type ScheduledTimeView = z.infer<typeof scheduledTimeSchema>;

/** 排程入参公用的校验：end 必须晚于 start。 */
function endAfterStart(scheduled: ScheduledTimeView | null | undefined): boolean {
  return (
    scheduled === null ||
    scheduled === undefined ||
    scheduled.kind === 'all-day' ||
    scheduled.end === undefined ||
    scheduled.end > scheduled.start
  );
}

export const createTaskInputSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字'),
    importance: importanceSchema.default('normal'),
    /** 只精确到天的 DDL；服务端补成该本地日 23:59:59.999 的 instant（spec §5.3 决策 ③） */
    dueDate: plainDateSchema.nullable().default(null),
    /**
     * 排程：打算什么时候做。与 dueDate（死线）是两回事（spec §5.3 决策 ①）。
     *
     * 缺省为 `undefined` 时服务端排到**今天全天**，与原有行为一致；
     * 显式传 `null` 则不排程，任务直接进待排程抽屉。
     */
    scheduled: scheduledTimeSchema.nullable().optional(),
  })
  .refine((input) => endAfterStart(input.scheduled), { message: '结束时刻必须晚于开始时刻' });
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字').optional(),
    importance: importanceSchema.optional(),
    dueDate: plainDateSchema.nullable().optional(),
    /** 缺省不动排程；传 null 取消排程。 */
    scheduled: scheduledTimeSchema.nullable().optional(),
  })
  .refine((input) => endAfterStart(input.scheduled), { message: '结束时刻必须晚于开始时刻' });
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const batchIdsInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '请至少选择一项任务'),
});
export type BatchIdsInput = z.infer<typeof batchIdsInputSchema>;

export const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceModule: z.string(),
  status: z.enum(ITEM_STATUSES),
  importance: importanceSchema,
  dueAt: z.string().nullable(),
  /** 排程。日历靠它把任务放到正确的格子与时刻上。 */
  scheduled: scheduledTimeSchema.nullable(),
  urgency: urgencySchema,
  priorityScore: z.number(),
  isImportantQuadrant: z.boolean(),
  isUrgentQuadrant: z.boolean(),
});
export type TaskView = z.infer<typeof taskViewSchema>;

export const todayResponseSchema = z.object({
  /** 本地日期，用于界面显示"今天是哪天" */
  date: z.string(),
  zone: z.string(),
  /** 今日任务，按 priorityScore 降序、dueAt 升序 */
  tasks: z.array(taskViewSchema),
  /** 今日已完成的任务列表 */
  completed: z.array(taskViewSchema).default([]),
  /** 逾期摘要：首页顶部醒目提示，按需展开（原型已确认结论） */
  overdue: z.array(taskViewSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const trashResponseSchema = z.object({
  items: z.array(taskViewSchema),
});
export type TrashResponse = z.infer<typeof trashResponseSchema>;

export const batchCountResponseSchema = z.object({
  count: z.number(),
});
export type BatchCountResponse = z.infer<typeof batchCountResponseSchema>;

/**
 * 路径参数占位符。把它传给下面的路径构造函数，得到的是 Fastify 注册用的模式；
 * 传真实 id 则得到可直接请求的路径。
 */
export const ID_PARAM = ':id';

function segment(value: string): string {
  return value === ID_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**
 */
export const TODO_API = {
  /** GET → TodayResponse */
  today: '/api/todo/today',
  /** POST CreateTaskInput → TaskView（201） */
  tasks: '/api/todo/tasks',
  /** PATCH UpdateTaskInput → TaskView | DELETE → 彻底删除（204） */
  task: (id: string): string => `/api/todo/tasks/${segment(id)}`,
  /** POST → TaskView；标记完成 */
  completeTask: (id: string): string => `/api/todo/tasks/${segment(id)}/complete`,
  /** POST → TaskView；取消完成/重新打开待办 */
  uncompleteTask: (id: string): string => `/api/todo/tasks/${segment(id)}/uncomplete`,
  /** POST → TaskView；软删除至回收站（status = cancelled） */
  trashTask: (id: string): string => `/api/todo/tasks/${segment(id)}/trash`,
  /** POST → TaskView；从回收站恢复（status = todo） */
  restoreTask: (id: string): string => `/api/todo/tasks/${segment(id)}/restore`,
  /** GET → TrashResponse（列出所有回收站项） */
  trash: '/api/todo/trash',
  /** POST BatchIdsInput → BatchCountResponse；批量恢复选中的回收站项 */
  batchRestoreTrash: '/api/todo/trash/batch-restore',
  /** POST BatchIdsInput → BatchCountResponse；批量彻底销毁选中的回收站项 */
  batchDeleteTrash: '/api/todo/trash/batch-delete',
  /** POST → BatchCountResponse；全部恢复回收站项 */
  restoreAllTrash: '/api/todo/trash/restore-all',
  /** POST → BatchCountResponse；清空全部回收站项 */
  clearTrash: '/api/todo/trash/clear',
} as const;
