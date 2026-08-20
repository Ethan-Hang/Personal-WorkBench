import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import type Database from 'better-sqlite3';
import type { ServerModuleDefinition } from '@workbench/core';
import {
  createDatabaseClient,
  SqliteItemRepository,
  SqliteSettingsRepository,
} from '@workbench/data';
import { registerModules } from './registry.js';
import { GitHubDeviceFlowClient, type GitHubDeviceFlow } from './auth/github-device-flow.js';
import { registerGitHubAuthRoutes } from './auth/routes.js';
import { registerSettingsRoutes } from './settings/routes.js';
import { registerServiceStateGate, ServiceState } from './service-state.js';
import { registerAccountsRoutes } from './accounts/routes.js';
import { registerBackupRoutes } from './backup/routes.js';
import type { BackupService } from './backup/service.js';
import type { RestoreService } from './restore/service.js';
import { registerSyncRoutes } from './sync/routes.js';
import type { GistSyncService } from './sync/service.js';
import type { AccountsService } from './accounts/service.js';

export interface BuildAppOptions {
  getSqlite: () => Database.Database;
  modules: ServerModuleDefinition[];
  githubDeviceFlow?: GitHubDeviceFlow;
  /** 切换账号与恢复共用的全服务状态；不传则恒为 idle。 */
  serviceState?: ServiceState;
  /** 账号服务。不传则不注册账号路由（WORKBENCH_DB 逃生舱下就是这样）。 */
  accounts?: AccountsService;
  /** 备份与恢复。两者成对出现——恢复的数据源就是备份的那个网盘。 */
  backup?: { backup: BackupService; restore: RestoreService };
  /** 设置与凭据的 Gist 同步。 */
  gistSync?: GistSyncService;
  /** 透传给 Fastify。传对象可指定 level 与 file（file 走 pino.destination）。 */
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const db = createDatabaseClient(opts.getSqlite());

  /**
   * 统一错误出口。做两件事：
   *
   * 1. 意料外的错误（5xx）记进日志，附带 Fastify 自动生成的 request.id。
   *    预期内的 4xx（校验失败、找不到）不记为错误——它们是正常的用户输入结果，
   *    记下来只会淹没真正的异常。
   * 2. 响应里带上 requestId，界面据此显示编号。于是「界面上的一句报错」与
   *    「日志里的一整段堆栈」能对上号——这正是本地工具此前缺的那一环。
   *
   * 与 Fastify 文档示例的区别：这里 5xx 也返回真实的 error.message，不做遮蔽。
   * 本应用是本地单用户、无网络暴露（ADR-0001），遮蔽只会让自己排查更难。
   */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, '请求处理失败');
    }

    return reply.code(statusCode).send({ error: error.message, requestId: request.id });
  });

  /**
   * 没有 body 的 POST（立即备份、回退）在浏览器里是 `fetch(url, { method: 'POST' })`，
   * 它不带 `content-type`，Fastify 默认对这种请求回 **415**。
   *
   * `app.inject()` 复现不了这个形状——它连 content-length 都不发，所以服务端测试
   * 一路绿灯而浏览器里必挂。这正是 CLAUDE.md 记着的那个教训的第二次发生。
   */
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body: Buffer, done) => {
    done(null, body.length === 0 ? undefined : body);
  });

  const serviceState = opts.serviceState ?? new ServiceState();
  registerServiceStateGate(app, serviceState);

  app.get('/api/health', async () => ({ ok: true, ...serviceState.current() }));

  registerGitHubAuthRoutes(app, opts.githubDeviceFlow ?? new GitHubDeviceFlowClient());

  // 设置走模块注册表之外的第二条通道：它不属于任何模块，且外壳启动即需要（ADR-0018）。
  registerSettingsRoutes(app, new SqliteSettingsRepository(opts.getSqlite));

  if (opts.accounts !== undefined) registerAccountsRoutes(app, opts.accounts);
  if (opts.backup !== undefined) {
    registerBackupRoutes(app, opts.backup.backup, opts.backup.restore);
  }
  if (opts.gistSync !== undefined) registerSyncRoutes(app, opts.gistSync);

  const items = new SqliteItemRepository(opts.getSqlite);
  await registerModules(app, db, items, opts.modules);

  await app.ready();
  return app;
}
