import type { FastifyInstance } from 'fastify';
import {
  LOCAL_BACKUP_API,
  NAME_PARAM,
  localBackupConfigPatchSchema,
} from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { LocalBackupService } from './service.js';

function nameOf(request: { params: unknown }): string {
  const { name } = request.params as { name?: string };
  if (name === undefined || name === '') throw new SyncError('缺少备份文件名', 400);
  return name;
}

/**
 * 本地备份路由。与 `/api/backup/*` 并列而不是并入——两者的配置模型不同
 * （目录 vs 凭据），共用一组端点会得到一个装不下任何一方的形状。
 *
 * 与云端不同的一点：这里**没有「未配置」这个状态**。本地备份永远有一个能用的
 * 落点（未设 targetDir 时是 `data/local/backups`），因此不存在云端那个
 * 「先去设置里填凭据」的前置门槛。
 */
export function registerLocalBackupRoutes(app: FastifyInstance, local: LocalBackupService): void {
  app.get(LOCAL_BACKUP_API.config(), async () => local.getConfig());

  app.put(LOCAL_BACKUP_API.config(), async (request) => {
    const body = localBackupConfigPatchSchema.safeParse(request.body);
    if (!body.success) throw new SyncError('本地备份配置的字段不合法', 400);
    return local.updateConfig(body.data);
  });

  app.post(LOCAL_BACKUP_API.run(), async () => local.run());

  app.get(LOCAL_BACKUP_API.list(), async () => local.list());

  app.delete(LOCAL_BACKUP_API.item(NAME_PARAM), async (request) => {
    await local.remove(nameOf(request));
    return { ok: true };
  });
}
