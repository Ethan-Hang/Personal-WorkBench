import type { FastifyInstance } from 'fastify';
import type { ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { WORKBENCH_MODULE_ID } from '../contract.js';
import { registerWorkbenchRoutes } from './routes.js';

/**
 * 工作台：**零自有表**的模块。
 *
 * 它不建任何实体，只在 core 的 Item 之上提供一个跨模块视图与一个动作（排程）。
 * 秋招模块验证了「模块可以有自己的领域实体」；本模块验证另一半——
 * 模块也可以纯粹是 core 之上的视图，`migrations` 为空数组同样是合法形态。
 */
export const workbenchServerModule: ServerModuleDefinition = {
  id: WORKBENCH_MODULE_ID,
  migrations: [],
  registerRoutes(app: unknown, ctx: ModuleContext) {
    registerWorkbenchRoutes(app as FastifyInstance, ctx);
  },
};

export { listToday, listUnscheduled, scheduleItem } from './service.js';
export type { ServiceOptions } from './service.js';
