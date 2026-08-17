import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { SqliteItemRepository, type Db } from '@workbench/data';
import { registerModules } from './registry.js';

export interface BuildAppOptions {
  db: Db;
  modules: ServerModuleDefinition[];
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  app.get('/api/health', async () => ({ ok: true }));

  const items = new SqliteItemRepository(opts.db);
  await registerModules(app, opts.db, items, opts.modules);

  await app.ready();
  return app;
}
