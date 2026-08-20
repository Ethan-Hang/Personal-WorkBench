/** WebDAV 云操作的领域错误。 */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SyncError';
  }
}

/** 只映射可预期的 WebDAV 错误；未知错误必须继续冒泡。 */
export function toSyncError(err: unknown): SyncError | null {
  const status =
    (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) return new SyncError('WebDAV 凭据无效或无权限', 400);
  if (status === 404) return new SyncError('WebDAV 上的备份目录不存在', 409);
  if (status === 507) return new SyncError('WebDAV 存储配额已满', 409);
  return null;
}
