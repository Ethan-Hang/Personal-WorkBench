import type { FastifyInstance } from 'fastify';
import type { ItemRepository, ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { runMigrationsFrom, type Db } from '@workbench/data';

/**
 * 模块注册（spec §8）。
 * 每个模块先跑自己的迁移，再注册路由，并只拿到以自身 id 构造的 ModuleContext。
 * 迭代 1 中 todo 模块 migrations 为空数组，此循环空转；机制在此就位，
 * 迭代 5 的秋招模块是第一个真正使用它的模块。
 */
export async function registerModules(
  app: FastifyInstance,
  db: Db,
  items: ItemRepository,
  modules: ServerModuleDefinition[],
): Promise<void> {
  const seen = new Set<string>();

  for (const mod of modules) {
    if (seen.has(mod.id)) {
      throw new Error(`模块 id 重复：${mod.id}`);
    }
    seen.add(mod.id);

    for (const source of mod.migrations) {
      runMigrationsFrom(db, source.folder);
    }

    const ctx: ModuleContext = { moduleId: mod.id, items };
    await mod.registerRoutes(app, ctx);
  }
}
