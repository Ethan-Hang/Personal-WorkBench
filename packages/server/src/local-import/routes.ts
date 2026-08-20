import type { FastifyInstance } from 'fastify';
import { LOCAL_IMPORT_API, localImportPreflightBodySchema } from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { RestoreService } from '../restore/service.js';

/**
 * 本地文件导入的路由（TASK-046）。
 *
 * 预检**刻意不在 service-state 的白名单里**：它自己不进忙碌态，但别人正在恢复时
 * 它应该被 503 挡住——那一刻库随时会被换掉，算出来的差异下一秒就作废。
 */
export function registerLocalImportRoutes(app: FastifyInstance, restore: RestoreService): void {
  app.post(LOCAL_IMPORT_API.preflight(), async (request) => {
    const body = localImportPreflightBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少要导入的文件路径', 400);
    return restore.preflightLocalFile(body.data.filePath);
  });
}
