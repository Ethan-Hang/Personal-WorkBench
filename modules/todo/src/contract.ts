import { z } from 'zod';
import { IMPORTANCES, ITEM_KINDS, ITEM_STATUSES, URGENCIES } from '@workbench/core';

export const TODO_MODULE_ID = 'todo';

export const importanceSchema = z.enum(IMPORTANCES);
export const urgencySchema = z.enum(URGENCIES);

/** 浮动日期 'YYYY-MM-DD'。全天排程用它，绝不转 UTC（spec §6.2）。 */
export const plainDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');

/**
 * 截止时间 DDL：支持浮动日期 'YYYY-MM-DD'、带时分的 'YYYY-MM-DD HH:mm' 或 UTC ISO8601 字符串。
 */
export const dueDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?)$/,
    '日期格式须为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm',
  );

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

/**
 * 一两行补充说明，不是笔记本。
 *
 * 上限 2000 字够写「记得带身份证」，不够写长文——这是刻意的：备注全量随今日列表
 * 返回，长文会让一张今日页拉出几十 KB。真要写长文时，该做的是拆一个详情端点，
 * 而不是把上限往上调。
 */
const notesSchema = z.string().trim().max(2000, '备注最长 2000 字');

export const createTaskInputSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字'),
    importance: importanceSchema.default('normal'),
    /**
     * 缺省即没有备注。用 .optional() 而非 .default(null) 是因为对 notes 而言
     * undefined 与 null 是同一件事，`.default(null)` 只会逼每个调用方写一句
     * `notes: null` 的噪音（同一 schema 里的 scheduled 同理）。
     * 空串由服务端归一成 null，避免库里出现两种「没有备注」。
     */
    notes: notesSchema.nullable().optional(),
    /** 截止时间：支持 'YYYY-MM-DD' 或带时分的 'YYYY-MM-DD HH:mm'；服务端统一换算为 UTC instant */
    dueDate: dueDateSchema.nullable().default(null),
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
    /** 缺省不动备注；传 null 或空串清空。 */
    notes: notesSchema.nullable().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    /** 缺省不动排程；传 null 取消排程。 */
    scheduled: scheduledTimeSchema.nullable().optional(),
  })
  .refine((input) => endAfterStart(input.scheduled), { message: '结束时刻必须晚于开始时刻' });
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const batchIdsInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '请至少选择一项任务'),
});
export type BatchIdsInput = z.infer<typeof batchIdsInputSchema>;

/* ───────────────────────── 子任务 ───────────────────────── */

export const subtaskViewSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string(),
  done: z.boolean(),
  position: z.number().int(),
});
export type SubtaskView = z.infer<typeof subtaskViewSchema>;

export const createSubtaskInputSchema = z.object({
  title: z.string().trim().min(1, '子任务标题不能为空').max(200, '子任务标题最长 200 字'),
});
export type CreateSubtaskInput = z.infer<typeof createSubtaskInputSchema>;

export const updateSubtaskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '子任务标题不能为空')
    .max(200, '子任务标题最长 200 字')
    .optional(),
  done: z.boolean().optional(),
});
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskInputSchema>;

/** 整条重排：传全部子任务 id 的目标顺序。局部换位在并发下会打架，整条替换不会。 */
export const reorderSubtasksInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '至少要有一个子任务'),
});
export type ReorderSubtasksInput = z.infer<typeof reorderSubtasksInputSchema>;

/* ───────────────────────── 标签 ───────────────────────── */

/**
 * 语义色名，不是十六进制——具体颜色由主题层决定，深浅色主题各自取值。
 * 存 `#f59e0b` 会让标签在深色主题下要么刺眼要么看不见。
 */
export const TAG_COLORS = ['slate', 'red', 'amber', 'green', 'blue', 'violet', 'pink'] as const;
export const tagColorSchema = z.enum(TAG_COLORS);
export type TagColor = z.infer<typeof tagColorSchema>;

export const tagViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: tagColorSchema.nullable(),
});
export type TagView = z.infer<typeof tagViewSchema>;

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1, '标签名不能为空').max(40, '标签名最长 40 字'),
  color: tagColorSchema.nullable().optional(),
});
export type CreateTagInput = z.infer<typeof createTagInputSchema>;

export const updateTagInputSchema = z.object({
  name: z.string().trim().min(1, '标签名不能为空').max(40, '标签名最长 40 字').optional(),
  color: tagColorSchema.nullable().optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>;

/** 整体设置某条待办的标签集合。传空数组即清空。 */
export const setTaskTagsInputSchema = z.object({
  tagIds: z.array(z.string().min(1)),
});
export type SetTaskTagsInput = z.infer<typeof setTaskTagsInputSchema>;

export const tagsResponseSchema = z.object({
  tags: z.array(tagViewSchema),
});
export type TagsResponse = z.infer<typeof tagsResponseSchema>;

/* ───────────────────────── 重复任务 ───────────────────────── */

export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly'] as const;
export const recurrenceFreqSchema = z.enum(RECURRENCE_FREQS);
export type RecurrenceFreq = z.infer<typeof recurrenceFreqSchema>;

/**
 * 物化视野：规则最多提前生成多少天的实例。
 *
 * 90 天足够任何日历视图（区间端点上限本就是 96 天），又不至于让一条「每天」的
 * 规则一次灌进几千条 Item。水位记在 `materializedThrough`，物化是幂等的。
 */
export const MATERIALIZE_HORIZON_DAYS = 90;

export const recurrenceViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  importance: importanceSchema,
  notes: z.string().nullable(),
  freq: recurrenceFreqSchema,
  interval: z.number().int().positive(),
  /** weekly 用：0=周日 … 6=周六。其它 freq 下为 null */
  byWeekday: z.array(z.number().int().min(0).max(6)).nullable(),
  /** monthly 用：几号。其它 freq 下为 null */
  byMonthday: z.number().int().min(1).max(31).nullable(),
  startDate: plainDateSchema,
  untilDate: plainDateSchema.nullable(),
});
export type RecurrenceView = z.infer<typeof recurrenceViewSchema>;

const recurrenceShape = {
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字'),
  importance: importanceSchema.default('normal'),
  notes: notesSchema.nullable().optional(),
  freq: recurrenceFreqSchema,
  interval: z.number().int().positive('间隔必须是正整数').max(52, '间隔过大').default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).min(1).nullable().optional(),
  byMonthday: z.number().int().min(1).max(31).nullable().optional(),
  startDate: plainDateSchema,
  untilDate: plainDateSchema.nullable().optional(),
};

/**
 * `freq` 决定哪个 by* 字段是必需的。不校验的话，一条 weekly 规则不带 byWeekday
 * 会静默地一天也生成不出来——症状是「建了重复任务但什么都没发生」。
 */
export const createRecurrenceInputSchema = z
  .object(recurrenceShape)
  .refine((v) => v.freq !== 'weekly' || (v.byWeekday !== null && v.byWeekday !== undefined), {
    message: '每周重复必须指定星期几',
  })
  .refine((v) => v.freq !== 'monthly' || (v.byMonthday !== null && v.byMonthday !== undefined), {
    message: '每月重复必须指定几号',
  })
  .refine((v) => v.untilDate === null || v.untilDate === undefined || v.untilDate >= v.startDate, {
    message: '结束日期不得早于开始日期',
  });
export type CreateRecurrenceInput = z.infer<typeof createRecurrenceInputSchema>;

export const updateRecurrenceInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字').optional(),
  importance: importanceSchema.optional(),
  notes: notesSchema.nullable().optional(),
  untilDate: plainDateSchema.nullable().optional(),
});
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceInputSchema>;

export const recurrencesResponseSchema = z.object({
  recurrences: z.array(recurrenceViewSchema),
});
export type RecurrencesResponse = z.infer<typeof recurrencesResponseSchema>;

/* ───────────────────────── 任务视图 ───────────────────────── */

export const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceModule: z.string(),
  /**
   * core Item 的种类。跨模块视图（工作台今日页、日历）靠它区分任务与事件，
   * 因此它是接缝的必填字段而非可选装饰。
   */
  kind: z.enum(ITEM_KINDS).default('task'),
  status: z.enum(ITEM_STATUSES),
  importance: importanceSchema,
  /** 一两行补充说明。无备注时为 null，绝不为空串。 */
  notes: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** 排程。日历靠它把任务放到正确的格子与时刻上。 */
  scheduled: scheduledTimeSchema.nullable(),
  /** 子任务，按 position 升序。无子任务时为空数组，不是 null。 */
  subtasks: z.array(subtaskViewSchema),
  /** 标签，按名称升序。todo 内部概念，工作台看不到（ADR-0014）。 */
  tags: z.array(tagViewSchema),
  /** 由哪条重复规则物化而来；手工建的任务为 null。 */
  recurrenceId: z.string().nullable(),
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

  /* ── 子任务 ── */
  /** POST CreateSubtaskInput → SubtaskView（201）；给某条待办加子任务 */
  subtasks: (itemId: string): string => `/api/todo/tasks/${segment(itemId)}/subtasks`,
  /** PUT ReorderSubtasksInput → SubtaskView[]；整条重排某待办的子任务 */
  reorderSubtasks: (itemId: string): string =>
    `/api/todo/tasks/${segment(itemId)}/subtasks/reorder`,
  /** PATCH UpdateSubtaskInput → SubtaskView | DELETE → 204 */
  subtask: (id: string): string => `/api/todo/subtasks/${segment(id)}`,

  /* ── 标签 ── */
  /** GET → TagsResponse | POST CreateTagInput → TagView（201） */
  tags: '/api/todo/tags',
  /** PATCH UpdateTagInput → TagView | DELETE → 204（连带解除所有关联） */
  tag: (id: string): string => `/api/todo/tags/${segment(id)}`,
  /** PUT SetTaskTagsInput → TaskView；整体设置某待办的标签集合 */
  taskTags: (itemId: string): string => `/api/todo/tasks/${segment(itemId)}/tags`,

  /* ── 重复任务 ── */
  /** GET → RecurrencesResponse | POST CreateRecurrenceInput → RecurrenceView（201） */
  recurrences: '/api/todo/recurrences',
  /**
   * PATCH UpdateRecurrenceInput → RecurrenceView
   * | DELETE → 204（删规则并清掉未来**未完成**的实例，已完成的历史保留）
   */
  recurrence: (id: string): string => `/api/todo/recurrences/${segment(id)}`,
} as const;
