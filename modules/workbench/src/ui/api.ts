/* eslint-disable no-restricted-syntax -- 已知技术债，见下方 TODO */
//
// TODO(交接): 本文件有 12 条硬编码的 /api/todo/... 路径，绕过了 todo 的 contract.ts。
// 这是 2026-08 工作台今日页搬迁的遗留，铁律 1 被裸字符串绕过——手抄的响应形状
// 已经漏过一次 kind 字段，导致六个写操作在生产里必抛（已于 fix/cross-module-api-seam
// 从 todo 侧补上 kind 修复）。
//
// 正确修法是 core 的 itemActions 能力槽：跨模块视图按 sourceModule 查到源模块
// 提供的写操作，双方都不 import 对方。方案与交接清单见
// docs/superpowers/specs/2026-08-18-item-actions-registry-design.md §3 与 §6。
//
// 改完后删掉本行 eslint-disable。规则本身是 error，新的裸字符串会立刻断 CI。

import {
  WORKBENCH_API,
  todayResponseSchema,
  unscheduledResponseSchema,
  workbenchItemSchema,
  calendarResponseSchema,
  calendarPath,
  type TodayResponse,
  type UnscheduledResponse,
  type CalendarResponse,
  type WorkbenchItem,
  type ScheduleInput,
} from '../contract.js';

async function request(url: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...init, headers });
  if (res.status === 204) {
    return null;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = body as { error?: string; requestId?: string };
    const message = payload.error ?? `请求失败（${res.status}）`;
    throw new Error(
      payload.requestId === undefined ? message : `${message}（编号 ${payload.requestId}）`,
    );
  }
  return body;
}

/**
 * 获取今日工作台聚合数据（包含 scheduled / overdue / completed）
 */
export async function fetchToday(): Promise<TodayResponse> {
  return todayResponseSchema.parse(await request(WORKBENCH_API.today));
}

/**
 * 获取待排程抽屉事项（有 DDL 但尚未安排日期的事项）
 */
export async function fetchUnscheduled(): Promise<UnscheduledResponse> {
  return unscheduledResponseSchema.parse(await request(WORKBENCH_API.unscheduled));
}

/**
 * 获取日历区间聚合数据（from / to 为本地浮动日期 YYYY-MM-DD，含两端）
 */
export async function fetchCalendar(from: string, to: string): Promise<CalendarResponse> {
  return calendarResponseSchema.parse(await request(calendarPath(from, to)));
}

/**
 * 为事项排程（全天、定时或传 null 取消排程退回抽屉，颗粒度 1 分钟）
 */
export async function patchSchedule(id: string, input: ScheduleInput): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(WORKBENCH_API.schedule(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

/* ==========================================================================
   todo 领域动作（创建、完成/重开、编辑、软删除与回收站）
   工作台只开放 schedule，todo 事项的领域动作通过 todo 端点执行（ADR-0012）
   ========================================================================== */

export interface CreateTodoInput {
  title: string;
  importance: 'high' | 'normal' | 'low';
  dueDate?: string | null;
  notes?: string | null;
}

export interface UpdateTodoInput {
  title?: string;
  importance?: 'high' | 'normal' | 'low';
  dueDate?: string | null;
  notes?: string | null;
}

export interface TrashItemView {
  id: string;
  title: string;
  sourceModule: string;
  kind: 'task' | 'event';
  status: 'cancelled';
  importance: 'high' | 'normal' | 'low';
  dueAt: string | null;
  urgency: 'none' | 'later' | 'soon' | 'imminent' | 'overdue';
  priorityScore: number;
  isImportantQuadrant: boolean;
  isUrgentQuadrant: boolean;
}

export async function postTodoTask(input: CreateTodoInput): Promise<WorkbenchItem> {
  const res = (await request('/api/todo/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function patchTodoTask(id: string, input: UpdateTodoInput): Promise<WorkbenchItem> {
  const res = (await request(`/api/todo/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function postTodoComplete(id: string): Promise<WorkbenchItem> {
  const res = (await request(`/api/todo/tasks/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function postTodoUncomplete(id: string): Promise<WorkbenchItem> {
  const res = (await request(`/api/todo/tasks/${encodeURIComponent(id)}/uncomplete`, {
    method: 'POST',
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function postTodoTrash(id: string): Promise<WorkbenchItem> {
  const res = (await request(`/api/todo/tasks/${encodeURIComponent(id)}/trash`, {
    method: 'POST',
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function postTodoRestore(id: string): Promise<WorkbenchItem> {
  const res = (await request(`/api/todo/tasks/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
  })) as Record<string, unknown>;
  if (!res.kind) res.kind = 'task';
  return workbenchItemSchema.parse(res);
}

export async function deleteTodoPermanently(id: string): Promise<void> {
  await request(`/api/todo/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchTodoTrash(): Promise<{ items: TrashItemView[] }> {
  return (await request('/api/todo/trash')) as { items: TrashItemView[] };
}

export async function postTodoBatchRestore(ids: string[]): Promise<{ count: number }> {
  return (await request('/api/todo/trash/batch-restore', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })) as { count: number };
}

export async function postTodoBatchDelete(ids: string[]): Promise<{ count: number }> {
  return (await request('/api/todo/trash/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })) as { count: number };
}

export async function postTodoRestoreAll(): Promise<{ count: number }> {
  return (await request('/api/todo/trash/restore-all', {
    method: 'POST',
  })) as { count: number };
}

export async function postTodoClearTrash(): Promise<{ count: number }> {
  return (await request('/api/todo/trash/clear', {
    method: 'POST',
  })) as { count: number };
}

/* ───────────────────────── 子任务 ───────────────────────── */

export interface SubtaskView {
  id: string;
  itemId: string;
  title: string;
  done: boolean;
  position: number;
}

export interface CreateSubtaskInput {
  title: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  done?: boolean;
}

export async function postTodoSubtask(
  itemId: string,
  input: CreateSubtaskInput,
): Promise<SubtaskView> {
  return (await request(`/api/todo/tasks/${encodeURIComponent(itemId)}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as SubtaskView;
}

export async function patchTodoSubtask(
  id: string,
  input: UpdateSubtaskInput,
): Promise<SubtaskView> {
  return (await request(`/api/todo/subtasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as SubtaskView;
}

export async function deleteTodoSubtask(id: string): Promise<void> {
  await request(`/api/todo/subtasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function putTodoReorderSubtasks(
  itemId: string,
  ids: string[],
): Promise<SubtaskView[]> {
  return (await request(`/api/todo/tasks/${encodeURIComponent(itemId)}/subtasks/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  })) as SubtaskView[];
}

/* ───────────────────────── 标签 ───────────────────────── */

export const TAG_COLORS = ['slate', 'red', 'amber', 'green', 'blue', 'violet', 'pink'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface TagView {
  id: string;
  name: string;
  color: TagColor | null;
}

export interface CreateTagInput {
  name: string;
  color?: TagColor | null;
}

export interface UpdateTagInput {
  name?: string;
  color?: TagColor | null;
}

export async function fetchTodoTags(): Promise<{ tags: TagView[] }> {
  return (await request('/api/todo/tags')) as { tags: TagView[] };
}

export async function postTodoTag(input: CreateTagInput): Promise<TagView> {
  return (await request('/api/todo/tags', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as TagView;
}

export async function patchTodoTag(id: string, input: UpdateTagInput): Promise<TagView> {
  return (await request(`/api/todo/tags/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as TagView;
}

export async function deleteTodoTag(id: string): Promise<void> {
  await request(`/api/todo/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function putTodoTaskTags(itemId: string, tagIds: string[]): Promise<unknown> {
  return await request(`/api/todo/tasks/${encodeURIComponent(itemId)}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tagIds }),
  });
}

/* ───────────────────────── 重复任务 ───────────────────────── */

export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export interface RecurrenceView {
  id: string;
  title: string;
  importance: 'high' | 'normal' | 'low';
  notes: string | null;
  freq: RecurrenceFreq;
  interval: number;
  byWeekday: number[] | null;
  byMonthday: number | null;
  startDate: string;
  untilDate: string | null;
}

export interface CreateRecurrenceInput {
  title: string;
  importance?: 'high' | 'normal' | 'low';
  notes?: string | null;
  freq: RecurrenceFreq;
  interval?: number;
  byWeekday?: number[] | null;
  byMonthday?: number | null;
  startDate: string;
  untilDate?: string | null;
}

export interface UpdateRecurrenceInput {
  title?: string;
  importance?: 'high' | 'normal' | 'low';
  notes?: string | null;
  untilDate?: string | null;
}

export async function fetchTodoRecurrences(): Promise<{ recurrences: RecurrenceView[] }> {
  return (await request('/api/todo/recurrences')) as { recurrences: RecurrenceView[] };
}

export async function postTodoRecurrence(input: CreateRecurrenceInput): Promise<RecurrenceView> {
  return (await request('/api/todo/recurrences', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as RecurrenceView;
}

export async function patchTodoRecurrence(
  id: string,
  input: UpdateRecurrenceInput,
): Promise<RecurrenceView> {
  return (await request(`/api/todo/recurrences/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as RecurrenceView;
}

export async function deleteTodoRecurrence(id: string): Promise<void> {
  await request(`/api/todo/recurrences/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ───────────────────────── 待办丰富视图 ───────────────────────── */

export interface TodoRichTaskView {
  id: string;
  title: string;
  sourceModule: string;
  kind: 'task' | 'event';
  status: 'inbox' | 'todo' | 'doing' | 'done' | 'cancelled';
  importance: 'high' | 'normal' | 'low';
  notes: string | null;
  dueAt: string | null;
  scheduled: unknown;
  subtasks: SubtaskView[];
  tags: TagView[];
  recurrenceId: string | null;
  urgency: 'none' | 'later' | 'soon' | 'imminent' | 'overdue';
  priorityScore: number;
  isImportantQuadrant: boolean;
  isUrgentQuadrant: boolean;
}

export async function fetchTodoToday(): Promise<{
  date: string;
  zone: string;
  tasks: TodoRichTaskView[];
  overdue: TodoRichTaskView[];
  completed: TodoRichTaskView[];
}> {
  return (await request('/api/todo/today')) as {
    date: string;
    zone: string;
    tasks: TodoRichTaskView[];
    overdue: TodoRichTaskView[];
    completed: TodoRichTaskView[];
  };
}
