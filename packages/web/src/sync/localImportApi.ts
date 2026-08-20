import {
  LOCAL_IMPORT_API,
  localImportAsNewAccountBodySchema,
  localImportAsNewAccountResponseSchema,
  localImportConfirmBodySchema,
  localImportPreflightBodySchema,
  localImportPreflightResponseSchema,
  restoreStateSchema,
  type LocalImportAsNewAccountResponse,
  type LocalImportPreflightResponse,
  type RestoreState,
} from '@workbench/sync/contract';
import { z } from 'zod';

export class LocalImportApiError extends Error {
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
    this.name = 'LocalImportApiError';
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
    throw new LocalImportApiError('网络连接失败，请检查服务是否正常运行', {
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

    throw new LocalImportApiError(formattedMessage, {
      status: res.status,
      requestId,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LocalImportApiError('服务器响应形状不符合契约约定', {
      status: res.status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * 本地导入预检：比对本地文件与当前库差异，检查迁移水位兼容性
 */
export async function preflightLocalImport(
  filePath: string,
  fetchFn: FetchFn = fetch,
): Promise<LocalImportPreflightResponse> {
  const body = localImportPreflightBodySchema.parse({ filePath });
  return request(
    LOCAL_IMPORT_API.preflight(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    localImportPreflightResponseSchema,
    fetchFn,
  );
}

/**
 * 确认导入（方向一：覆盖当前账号）。全服务 503 与五态恢复机从这里开始
 */
export async function confirmLocalImport(
  filePath: string,
  fetchFn: FetchFn = fetch,
): Promise<RestoreState> {
  const body = localImportConfirmBodySchema.parse({ filePath });
  return request(
    LOCAL_IMPORT_API.confirm(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    restoreStateSchema,
    fetchFn,
  );
}

/**
 * 导入为新账号（方向二：建库 + 跑迁移 + 写 accounts.json）。无需预检差异
 */
export async function importAsNewAccount(
  filePath: string,
  displayName: string,
  fetchFn: FetchFn = fetch,
): Promise<LocalImportAsNewAccountResponse> {
  const body = localImportAsNewAccountBodySchema.parse({ filePath, displayName });
  return request(
    LOCAL_IMPORT_API.asNewAccount(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    localImportAsNewAccountResponseSchema,
    fetchFn,
  );
}
