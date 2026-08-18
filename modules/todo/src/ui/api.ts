import {
  todayResponseSchema,
  taskViewSchema,
  type CreateTaskInput,
  type TaskView,
  type TodayResponse,
} from '../contract.js';

async function request(url: string, init?: RequestInit): Promise<unknown> {
  // 只有真的带 body 时才声明 JSON content-type。Fastify 的默认解析器会以
  // FST_ERR_CTP_EMPTY_JSON_BODY（400）拒绝「声明了 JSON 却没有 body」的请求，
  // 而 complete 请求正是无 body 的。
  const headers = init?.body === undefined ? undefined : { 'Content-Type': 'application/json' };
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = body as { error?: string; requestId?: string };
    const message = payload.error ?? `请求失败（${res.status}）`;
    // 附上服务端的请求编号：界面上这一句报错据此才能和日志里的整段堆栈对上号。
    throw new Error(
      payload.requestId === undefined ? message : `${message}（编号 ${payload.requestId}）`,
    );
  }
  return body;
}

export async function fetchToday(): Promise<TodayResponse> {
  // 用 Zod 校验响应：后端改了形状，这里会立刻报错而不是页面静默变空
  return todayResponseSchema.parse(await request('/api/todo/today'));
}

export async function postTask(
  input: Pick<CreateTaskInput, 'title' | 'importance' | 'dueDate'>,
): Promise<TaskView> {
  return taskViewSchema.parse(
    await request('/api/todo/tasks', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function postComplete(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(`/api/todo/tasks/${id}/complete`, { method: 'POST' }));
}
