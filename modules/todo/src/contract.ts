import { z } from 'zod';
import { IMPORTANCES, ITEM_STATUSES, URGENCIES } from '@workbench/core';

export const TODO_MODULE_ID = 'todo';

export const importanceSchema = z.enum(IMPORTANCES);
export const urgencySchema = z.enum(URGENCIES);

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字'),
  importance: importanceSchema.default('normal'),
  /** 只精确到天的 DDL；服务端补成该本地日 23:59:59.999 的 instant（spec §5.3 决策 ③） */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
    .nullable()
    .default(null),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceModule: z.string(),
  status: z.enum(ITEM_STATUSES),
  importance: importanceSchema,
  dueAt: z.string().nullable(),
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
  /** 逾期摘要：首页顶部醒目提示，按需展开（原型已确认结论） */
  overdue: z.array(taskViewSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

/**
 * 路径参数占位符。把它传给下面的路径构造函数，得到的是 Fastify 注册用的模式；
 * 传真实 id 则得到可直接请求的路径。
 */
export const ID_PARAM = ':id';

function segment(value: string): string {
  return value === ID_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**——
 * 路径不再在 routes.ts 与 api.ts 各写一遍、各改一半。
 *
 * 前端需要知道的一切都在本文件：端点在这里，请求/响应形状在上面的 Zod schema。
 * 不必为了写界面去读服务端代码。
 */
export const TODO_API = {
  /** GET → TodayResponse */
  today: '/api/todo/today',
  /** POST CreateTaskInput → TaskView（201） */
  tasks: '/api/todo/tasks',
  /** POST → TaskView；不存在或不属于本模块时 404 */
  completeTask: (id: string): string => `/api/todo/tasks/${segment(id)}/complete`,
} as const;
