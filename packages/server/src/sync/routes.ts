import type { FastifyInstance } from 'fastify';
import { GIST_SYNC_API, syncPushBodySchema, syncUnlockBodySchema } from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { GistSyncService } from './service.js';

/**
 * Gist 同步路由。与设置、账号、备份一样走模块注册表之外的第二条通道（ADR-0018）。
 *
 * `/api/sync/*` **不在 service-state 的白名单里**：换库或恢复进行时同步照样该被挡住，
 * 它读的正是那张随时可能被换掉的库。
 */
export function registerSyncRoutes(app: FastifyInstance, service: GistSyncService): void {
  app.get(GIST_SYNC_API.status(), async () => service.status());

  app.post(GIST_SYNC_API.unlock(), async (request) => {
    const body = syncUnlockBodySchema.safeParse(request.body);
    if (!body.success) throw new SyncError('缺少同步口令', 400);
    await service.unlock(body.data.passphrase, body.data.remember ?? false);
    return service.status();
  });

  app.post(GIST_SYNC_API.push(), async (request) => {
    const body = syncPushBodySchema.safeParse(request.body ?? {});
    await service.push({ force: body.success ? (body.data.force ?? false) : false });
    return service.status();
  });

  app.post(GIST_SYNC_API.pull(), async () => {
    await service.pull();
    return service.status();
  });
}
