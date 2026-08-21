import type { FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { HABIT_MODULE_ID } from '../contract.js';
import type { HabitRepository } from './repository.js';
import { registerHabitRoutes } from './routes.js';

/**
 * 习惯模块的服务端定义。
 *
 * `registerRoutes` **收到 `ModuleContext` 却不使用它**——这不是疏漏，是这个模块的
 * 定义性质：习惯不投影成 core Item，因此它有自有表却零 core Item（ADR-0023）。
 * 秋招证明了模块可有自有实体，工作台证明了模块可零自有表，习惯补上第三格。
 */
export function createHabitServerModule(repository: HabitRepository): ServerModuleDefinition {
  return {
    id: HABIT_MODULE_ID,
    migrations: [{ folder: 'modules/habit/migrations' }],
    registerRoutes(app: unknown) {
      registerHabitRoutes(app as FastifyInstance, repository);
    },
  };
}

export type { HabitRepository } from './repository.js';
