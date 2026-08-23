import type { FastifyInstance } from 'fastify';
import type { ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { NOTES_MODULE_ID } from '../contract.js';
import type { NoteRepository } from './repository.js';
import { registerNotesRoutes } from './routes.js';

/**
 * 便签模块的服务端定义。
 *
 * 接收 Repository 的工厂函数（与 todo、秋招、习惯同形）：模块自有表的 SQLite
 * 适配器由组合根构造并注入，模块本身拿不到数据库句柄（ADR-0008）。
 *
 * 它用到 `ModuleContext` 的 `items`——但**便签不投影成 Item**。core 的
 * `ItemRepository` 只在「一键派发待办」与「读取关联待办的快照」两处出现，
 * 其余全部走自有表。
 */
export function createNotesServerModule(repository: NoteRepository): ServerModuleDefinition {
  return {
    id: NOTES_MODULE_ID,
    migrations: [{ folder: 'modules/notes/migrations' }],
    registerRoutes(app: unknown, ctx: ModuleContext) {
      registerNotesRoutes(app as FastifyInstance, repository, ctx);
    },
  };
}

export type {
  FolderChanges,
  FolderDraft,
  FolderRecord,
  ListNotesQuery,
  NoteChanges,
  NoteDraft,
  NotePage,
  NoteRecord,
  NoteRepository,
  TagUsage,
  TodoLinkRecord,
} from './repository.js';
