import type { FastifyInstance } from 'fastify';
import {
  ACCOUNT_ID_PARAM,
  ACCOUNTS_API,
  bindGithubBodySchema,
  createAccountBodySchema,
  switchAccountBodySchema,
  updateAccountBodySchema,
} from '@workbench/sync/contract';
import { badRequest } from './errors.js';
import type { AccountsService } from './service.js';

function idOf(request: { params: unknown }): string {
  const { id } = request.params as { id?: string };
  if (id === undefined || id === '') throw badRequest('缺少账号 id');
  return id;
}

/**
 * 账号路由。与设置一样**不经模块注册表**——账号决定开哪个库，外壳启动即需要，
 * ADR-0018 的三条判据全中。
 *
 * 切换会让服务短暂进入 `switching` 态，其余请求在那期间一律 503（见 service-state.ts）。
 */
export function registerAccountsRoutes(app: FastifyInstance, service: AccountsService): void {
  app.get(ACCOUNTS_API.root(), async () => service.list());

  app.post(ACCOUNTS_API.root(), async (request, reply) => {
    const body = createAccountBodySchema.safeParse(request.body);
    if (!body.success) throw badRequest('账号名须为 1–40 个字符');
    return reply.code(201).send(service.create(body.data.displayName));
  });

  app.patch(ACCOUNTS_API.byId(ACCOUNT_ID_PARAM), async (request) => {
    const body = updateAccountBodySchema.safeParse(request.body);
    if (!body.success) throw badRequest('更新入参格式不合法');
    return service.update(idOf(request), body.data);
  });

  app.post(ACCOUNTS_API.active(), async (request) => {
    const body = switchAccountBodySchema.safeParse(request.body);
    if (!body.success) throw badRequest('缺少要切换到的账号 id');
    return service.switchTo(body.data.id);
  });

  app.delete(ACCOUNTS_API.byId(ACCOUNT_ID_PARAM), async (request) => service.remove(idOf(request)));

  app.post(ACCOUNTS_API.bindGithub(ACCOUNT_ID_PARAM), async (request) => {
    const body = bindGithubBodySchema.safeParse(request.body);
    if (!body.success) throw badRequest('绑定方向与 GitHub 身份必须是有效值');
    return service.bindGithub(idOf(request), body.data.github, body.data.direction);
  });

  app.delete(ACCOUNTS_API.github(ACCOUNT_ID_PARAM), async (request) =>
    service.unbindGithub(idOf(request)),
  );
}
