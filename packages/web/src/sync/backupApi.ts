import {
  SYNC_API,
  RESTORE_API,
  backupConfigPatchSchema,
  backupConfigSchema,
  backupListItemSchema,
  restoreConfirmBodySchema,
  restorePreflightBodySchema,
  restorePreflightResponseSchema,
  restoreStateSchema,
  type BackupConfig,
  type BackupConfigPatch,
  type BackupListItem,
  type RestorePreflightResponse,
  type RestoreState,
} from '@workbench/sync/contract';
import { z } from 'zod';

export class BackupApiError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  readonly state?: RestoreState['state'];
  readonly step?: string;

  constructor(
    message: string,
    options?: {
      status?: number;
      requestId?: string;
      state?: RestoreState['state'];
      step?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'BackupApiError';
    this.status = options?.status;
    this.requestId = options?.requestId;
    this.state = options?.state;
    this.step = options?.step;
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
    throw new BackupApiError('网络连接失败，请检查服务是否正常运行', {
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
    const state =
      typeof errorBody.state === 'string' ? (errorBody.state as RestoreState['state']) : undefined;
    const step = typeof errorBody.step === 'string' ? errorBody.step : undefined;

    const formattedMessage = requestId
      ? `${serverMessage}（请求编号 ${requestId}）`
      : serverMessage;

    throw new BackupApiError(formattedMessage, {
      status: res.status,
      requestId,
      state,
      step,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new BackupApiError('服务器响应形状不符合契约约定', {
      status: res.status,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * 获取 WebDAV 备份配置（password 读接口永远不回传）
 */
export async function fetchBackupConfig(fetchFn: FetchFn = fetch): Promise<BackupConfig> {
  return request(SYNC_API.backupConfig(), { method: 'GET' }, backupConfigSchema, fetchFn);
}

/**
 * 更新 WebDAV 备份配置与自动备份开关
 */
export async function updateBackupConfig(
  patch: BackupConfigPatch,
  fetchFn: FetchFn = fetch,
): Promise<BackupConfig> {
  const body = backupConfigPatchSchema.parse(patch);
  return request(
    SYNC_API.backupConfig(),
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    backupConfigSchema,
    fetchFn,
  );
}

/**
 * 触发立即快照并上传至 WebDAV
 */
export async function runBackup(fetchFn: FetchFn = fetch): Promise<BackupListItem> {
  return request(SYNC_API.backupRun(), { method: 'POST' }, backupListItemSchema, fetchFn);
}

/**
 * 获取云端 WebDAV 备份列表
 */
export async function fetchBackupList(fetchFn: FetchFn = fetch): Promise<BackupListItem[]> {
  return request(SYNC_API.backupList(), { method: 'GET' }, z.array(backupListItemSchema), fetchFn);
}

/**
 * 删除指定云端备份文件
 */
export async function deleteBackup(name: string, fetchFn: FetchFn = fetch): Promise<void> {
  await request(
    SYNC_API.backupItem(name),
    { method: 'DELETE' },
    z.object({ ok: z.boolean() }).optional().or(z.null()).or(z.undefined()),
    fetchFn,
  );
}

/**
 * 恢复预检：下载元数据、比对迁移水位并生成行级与模块计数差异报告
 */
export async function preflightRestore(
  name: string,
  fetchFn: FetchFn = fetch,
): Promise<RestorePreflightResponse> {
  const body = restorePreflightBodySchema.parse({ name });
  return request(
    RESTORE_API.preflight(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    restorePreflightResponseSchema,
    fetchFn,
  );
}

/**
 * 确认恢复：进入 restoring 恢复态并执行热切换
 */
export async function confirmRestore(
  name: string,
  fetchFn: FetchFn = fetch,
): Promise<RestoreState> {
  const body = restoreConfirmBodySchema.parse({ name });
  return request(
    RESTORE_API.confirm(),
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
 * 手动回退恢复
 */
export async function rollbackRestore(fetchFn: FetchFn = fetch): Promise<RestoreState> {
  return request(RESTORE_API.rollback(), { method: 'POST' }, restoreStateSchema, fetchFn);
}

/**
 * 查询恢复状态机当前状态
 */
export async function fetchRestoreState(fetchFn: FetchFn = fetch): Promise<RestoreState> {
  return request(RESTORE_API.state(), { method: 'GET' }, restoreStateSchema, fetchFn);
}
