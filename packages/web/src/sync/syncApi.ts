import {
  GIST_SYNC_API,
  syncPushBodySchema,
  syncStatusSchema,
  syncUnlockBodySchema,
  type SyncPushBody,
  type SyncStatus,
  type SyncUnlockBody,
} from '@workbench/sync/contract';
import { z } from 'zod';

export class SyncApiError extends Error {
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    options?: {
      status?: number;
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'SyncApiError';
    this.status = options?.status;
    this.requestId = options?.requestId;
  }
}

type FetchFn = typeof fetch;

async function request<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  fetchFn: FetchFn = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(input, init);
  } catch (err) {
    throw new SyncApiError('网络连接失败，请检查服务是否正常运行', {
      cause: err,
    });
  }

  const text = await res.text();
  let json: unknown = null;
  if (text.trim().length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
  }

  if (!res.ok) {
    const errorBody =
      typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const serverMessage =
      typeof errorBody.error === 'string'
        ? errorBody.error
        : typeof errorBody.message === 'string'
          ? errorBody.message
          : `HTTP ${res.status}`;
    const requestId = typeof errorBody.requestId === 'string' ? errorBody.requestId : undefined;

    const formattedMessage = requestId
      ? `${serverMessage}（请求编号 ${requestId}）`
      : serverMessage;

    throw new SyncApiError(formattedMessage, {
      status: res.status,
      requestId,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new SyncApiError('服务器响应形状不符合契约约定', {
      status: res.status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * 获取 Gist 设置同步与凭据加密状态
 */
export async function fetchSyncStatus(fetchFn: FetchFn = fetch): Promise<SyncStatus> {
  return request(GIST_SYNC_API.status(), { method: 'GET' }, syncStatusSchema, fetchFn);
}

/**
 * 输入口令解锁同步（若支持系统保管库且 remember 为 true，口令将持久化至系统保管库）
 */
export async function unlockSync(
  body: SyncUnlockBody,
  fetchFn: FetchFn = fetch,
): Promise<SyncStatus> {
  const parsedBody = syncUnlockBodySchema.parse(body);
  return request(
    GIST_SYNC_API.unlock(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsedBody),
    },
    syncStatusSchema,
    fetchFn,
  );
}

/**
 * 将本地设置与 WebDAV 凭据加密推送至云端 Gist
 * @param options force 为 true 时强制覆写云端（解决冲突时使用）
 */
export async function pushSync(
  options: SyncPushBody = {},
  fetchFn: FetchFn = fetch,
): Promise<SyncStatus> {
  const parsedBody = syncPushBodySchema.parse(options);
  return request(
    GIST_SYNC_API.push(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsedBody),
    },
    syncStatusSchema,
    fetchFn,
  );
}

/**
 * 从云端 Gist 拉取已同步的设置与 WebDAV 凭据并覆写本地
 */
export async function pullSync(fetchFn: FetchFn = fetch): Promise<SyncStatus> {
  return request(GIST_SYNC_API.pull(), { method: 'POST' }, syncStatusSchema, fetchFn);
}
