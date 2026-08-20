import type { FastifyInstance } from 'fastify';
import type { ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import type { TodoRepository } from './repository.js';
import { registerTodoRoutes } from './routes.js';

/**
 * todo 自此有了自有表（子任务 / 标签 / 重复规则），因此从常量导出改为工厂函数——
 * 仓储由组合根注入，模块本身拿不到数据库句柄（ADR-0008）。
 *
 * `migrations` 里的目录随模块走：删掉 `modules/todo/` 这一个目录，
 * 加上注册表里那一行，模块就完整消失了（铁律 3）。
 */
export function createTodoServerModule(repository: TodoRepository): ServerModuleDefinition {
  return {
    id: TODO_MODULE_ID,
    migrations: [{ folder: 'modules/todo/migrations' }],
    registerRoutes(app: unknown, ctx: ModuleContext) {
      registerTodoRoutes(app as FastifyInstance, ctx, repository);
    },
  };
}

export type { TodoRepository } from './repository.js';
