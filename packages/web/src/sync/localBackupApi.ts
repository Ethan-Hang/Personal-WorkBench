import {
  LOCAL_BACKUP_API,
  backupListItemSchema,
  localBackupConfigPatchSchema,
  localBackupConfigSchema,
  type BackupListItem,
  type LocalBackupConfig,
  type LocalBackupConfigPatch,
} from '@workbench/sync/contract';
import { z } from 'zod';

export class LocalBackupApiError extends Error {
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
    this.name = 'LocalBackupApiError';
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
    throw new LocalBackupApiError('网络连接失败，请检查服务是否正常运行', {
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

    throw new LocalBackupApiError(formattedMessage, {
      status: res.status,
      requestId,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LocalBackupApiError('服务器响应形状不符合契约约定', {
      status: res.status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * 获取本地备份配置（包含 targetDir、resolvedDir、autoEnabled、retentionCount）
 */
export async function fetchLocalBackupConfig(fetchFn: FetchFn = fetch): Promise<LocalBackupConfig> {
  return request(LOCAL_BACKUP_API.config(), { method: 'GET' }, localBackupConfigSchema, fetchFn);
}

/**
 * 更新本地备份配置（保存目标路径、自动快照开关与保留份数）
 */
export async function updateLocalBackupConfig(
  patch: LocalBackupConfigPatch,
  fetchFn: FetchFn = fetch,
): Promise<LocalBackupConfig> {
  const body = localBackupConfigPatchSchema.parse(patch);
  return request(
    LOCAL_BACKUP_API.config(),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    localBackupConfigSchema,
    fetchFn,
  );
}

/**
 * 触发一次立即本地快照
 */
export async function runLocalBackup(fetchFn: FetchFn = fetch): Promise<BackupListItem> {
  return request(LOCAL_BACKUP_API.run(), { method: 'POST' }, backupListItemSchema, fetchFn);
}

/**
 * 获取本地历史快照列表
 */
export async function fetchLocalBackupList(fetchFn: FetchFn = fetch): Promise<BackupListItem[]> {
  return request(
    LOCAL_BACKUP_API.list(),
    { method: 'GET' },
    z.array(backupListItemSchema),
    fetchFn,
  );
}

/**
 * 删除指定的本地备份快照（支持删除完整快照与孤儿分片）
 */
export async function deleteLocalBackup(name: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(
    LOCAL_BACKUP_API.item(name),
    { method: 'DELETE' },
    z.object({ ok: z.boolean() }).optional().or(z.null()).or(z.undefined()),
    fetchFn,
  );
}
