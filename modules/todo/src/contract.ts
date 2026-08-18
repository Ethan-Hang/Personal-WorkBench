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

export const updateTaskInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字').optional(),
  importance: importanceSchema.optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
    .nullable()
    .optional(),
});
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
