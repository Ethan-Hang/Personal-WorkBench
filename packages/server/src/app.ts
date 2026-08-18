import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { SqliteItemRepository, type Db } from '@workbench/data';
import { registerModules } from './registry.js';

export interface BuildAppOptions {
  db: Db;
  modules: ServerModuleDefinition[];
  /** 透传给 Fastify。传对象可指定 level 与 file（file 走 pino.destination）。 */
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

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

  app.get('/api/health', async () => ({ ok: true }));

  const items = new SqliteItemRepository(opts.db);
  await registerModules(app, opts.db, items, opts.modules);

  await app.ready();
  return app;
}
