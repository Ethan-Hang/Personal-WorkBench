import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  LOCAL_IMPORT_API,
  localImportAsNewAccountBodySchema,
  localImportConfirmBodySchema,
  localImportPreflightBodySchema,
} from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { LocalBackupService } from '../local-backup/service.js';
import type { RestoreService } from '../restore/service.js';
import type { LocalImportService } from './service.js';

/**
 * 本地文件导入的路由（TASK-046）。
 *
 * 预检**刻意不在 service-state 的白名单里**：它自己不进忙碌态，但别人正在恢复时
 * 它应该被 503 挡住——那一刻库随时会被换掉，算出来的差异下一秒就作废。
 */
export function registerLocalImportRoutes(
  app: FastifyInstance,
  restore: RestoreService,
  asNewAccount?: LocalImportService,
  localBackup?: LocalBackupService,
): void {
  async function resolveFilePath(rawPath: string): Promise<string> {
    if (existsSync(rawPath)) return rawPath;
    if (localBackup !== undefined) {
      const config = await localBackup.getConfig();
      const candidate = join(config.resolvedDir, rawPath);
      if (existsSync(candidate)) return candidate;
    }
    return rawPath;
  }

  app.post(LOCAL_IMPORT_API.preflight(), async (request) => {
    const body = localImportPreflightBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少要导入的文件路径', 400);
    const filePath = await resolveFilePath(body.data.filePath);
    return restore.preflightLocalFile(filePath);
  });

  /**
   * 确认导入 = 覆盖当前账号（TASK-047）。走的就是恢复那台五态机：回退点、
   * 显式删 `-wal`/`-shm`、断电续命全部复用，这里只是把入参从备份名换成文件路径。
   *
   * 全服务 503 从这里才开始。界面在此之后靠 `/api/restore/state`（在白名单里）
   * 看进度，靠 `/api/restore/rollback` 回退。
   */
  app.post(LOCAL_IMPORT_API.confirm(), async (request) => {
    const body = localImportConfirmBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少要导入的文件路径', 400);
    const filePath = await resolveFilePath(body.data.filePath);
    return restore.confirm(filePath);
  });

  if (asNewAccount === undefined) return;

  /**
   * 导入方向二：建一个新账号（TASK-048）。**不需要先预检**——它一个现有文件
   * 都不动，没有「会覆盖什么」可给用户看，兼容性由服务自己判。
   */
  app.post(LOCAL_IMPORT_API.asNewAccount(), async (request) => {
    const body = localImportAsNewAccountBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少文件路径或新账号的名字', 400);
    const filePath = await resolveFilePath(body.data.filePath);
    const account = await asNewAccount.importAsNewAccount(filePath, body.data.displayName);
    return { id: account.id, displayName: account.displayName };
  });
}
