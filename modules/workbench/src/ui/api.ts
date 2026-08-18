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
}

export interface UpdateTodoInput {
  title?: string;
  importance?: 'high' | 'normal' | 'low';
  dueDate?: string | null;
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
  return workbenchItemSchema.parse(
    await request('/api/todo/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function patchTodoTask(id: string, input: UpdateTodoInput): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(`/api/todo/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

export async function postTodoComplete(id: string): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(`/api/todo/tasks/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
    }),
  );
}

export async function postTodoUncomplete(id: string): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(`/api/todo/tasks/${encodeURIComponent(id)}/uncomplete`, {
      method: 'POST',
    }),
  );
}

export async function postTodoTrash(id: string): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(`/api/todo/tasks/${encodeURIComponent(id)}/trash`, {
      method: 'POST',
    }),
  );
}

export async function postTodoRestore(id: string): Promise<WorkbenchItem> {
  return workbenchItemSchema.parse(
    await request(`/api/todo/tasks/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    }),
  );
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
