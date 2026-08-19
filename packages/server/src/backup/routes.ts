import type { FastifyInstance } from 'fastify';
import {
  NAME_PARAM,
  SYNC_API,
  backupConfigPatchSchema,
  RESTORE_API,
  restoreConfirmBodySchema,
  restorePreflightBodySchema,
} from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { BackupService } from './service.js';
import type { RestoreService } from '../restore/service.js';

function nameOf(request: { params: unknown }): string {
  const { name } = request.params as { name?: string };
  if (name === undefined || name === '') throw new SyncError('缺少备份文件名', 400);
  return name;
}

/**
 * 备份与恢复路由。与设置、账号一样走模块注册表之外的第二条通道（ADR-0018）。
 *
 * `/api/restore/*` 在 service-state 的白名单里：恢复进行时其余请求一律 503，
 * 但恢复自身的状态查询与回退必须还能打得通，否则界面就成了一块没有出口的遮罩。
 */
export function registerBackupRoutes(
  app: FastifyInstance,
  backup: BackupService,
  restore: RestoreService,
): void {
  app.get(SYNC_API.backupConfig(), async () => backup.getConfig());

  app.put(SYNC_API.backupConfig(), async (request) => {
    const body = backupConfigPatchSchema.safeParse(request.body);
    if (!body.success) throw new SyncError('WebDAV 配置的字段不合法', 400);
    return backup.updateConfig(body.data);
  });

  app.post(SYNC_API.backupRun(), async () => backup.run());

  app.get(SYNC_API.backupList(), async () => backup.list());

  app.delete(SYNC_API.backupItem(NAME_PARAM), async (request) => {
    await backup.remove(nameOf(request));
    return { ok: true };
  });

  app.post(RESTORE_API.preflight(), async (request) => {
    const body = restorePreflightBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少要预检的备份名', 400);
    return restore.preflight(body.data.name);
  });

  app.post(RESTORE_API.confirm(), async (request) => {
    const body = restoreConfirmBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少要恢复的备份名', 400);
    return restore.confirm(body.data.name);
  });

  app.post(RESTORE_API.rollback(), async () => restore.rollback());

  app.get(RESTORE_API.state(), async () => restore.current());
}
