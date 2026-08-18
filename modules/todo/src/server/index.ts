import type { FastifyInstance } from 'fastify';
import type { ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import { registerTodoRoutes } from './routes.js';

export const todoServerModule: ServerModuleDefinition = {
  id: TODO_MODULE_ID,
  // 本模块无自有表，只消费 core Item。迁移机制的首个真实使用者是迭代 5 的秋招模块。
  migrations: [],
  registerRoutes(app: unknown, ctx: ModuleContext) {
    registerTodoRoutes(app as FastifyInstance, ctx);
  },
};

export { createTask, listToday, completeTask } from './service.js';
