import {
  TODO_API,
  todayResponseSchema,
  taskViewSchema,
  trashResponseSchema,
  batchCountResponseSchema,
  type CreateTaskInput,
  type TaskView,
  type TodayResponse,
  type TrashResponse,
  type UpdateTaskInput,
} from '../contract.js';
import { apiRequest as request } from '@workbench/ui';

export async function fetchToday(): Promise<TodayResponse> {
  return todayResponseSchema.parse(await request(TODO_API.today));
}

export async function postTask(
  input: Pick<CreateTaskInput, 'title' | 'importance' | 'dueDate'>,
): Promise<TaskView> {
  return taskViewSchema.parse(
    await request(TODO_API.tasks, { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function patchTask(id: string, input: UpdateTaskInput): Promise<TaskView> {
  return taskViewSchema.parse(
    await request(TODO_API.task(id), { method: 'PATCH', body: JSON.stringify(input) }),
  );
}

export async function postComplete(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(TODO_API.completeTask(id), { method: 'POST' }));
}

export async function postUncomplete(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(TODO_API.uncompleteTask(id), { method: 'POST' }));
}

export async function postTrash(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(TODO_API.trashTask(id), { method: 'POST' }));
}

export async function postRestore(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(TODO_API.restoreTask(id), { method: 'POST' }));
}

export async function deleteTaskPermanently(id: string): Promise<void> {
  await request(TODO_API.task(id), { method: 'DELETE' });
}

export async function fetchTrash(): Promise<TrashResponse> {
  return trashResponseSchema.parse(await request(TODO_API.trash));
}

export async function postBatchRestore(ids: string[]): Promise<{ count: number }> {
  return batchCountResponseSchema.parse(
    await request(TODO_API.batchRestoreTrash, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  );
}

export async function postBatchDelete(ids: string[]): Promise<{ count: number }> {
  return batchCountResponseSchema.parse(
    await request(TODO_API.batchDeleteTrash, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  );
}

export async function postRestoreAll(): Promise<{ count: number }> {
  return batchCountResponseSchema.parse(
    await request(TODO_API.restoreAllTrash, { method: 'POST' }),
  );
}

export async function postClearTrash(): Promise<{ count: number }> {
  return batchCountResponseSchema.parse(await request(TODO_API.clearTrash, { method: 'POST' }));
}
