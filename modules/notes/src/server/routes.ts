import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { defineRoute } from '@workbench/http-kit';
import {
  ID_PARAM,
  NOTES_API_V1,
  TODO_ID_PARAM,
  batchInputSchema,
  createFolderInputSchema,
  createNoteInputSchema,
  createTodoInputSchema,
  linkTodoInputSchema,
  listNotesQuerySchema,
  updateFolderInputSchema,
  updateNoteInputSchema,
} from '../contract.js';
import type { NoteRepository } from './repository.js';
import {
  createFolder,
  createNote,
  createTodoFromNote,
  deleteFolder,
  deleteNote,
  getNote,
  getStats,
  linkTodo,
  listFolderTree,
  listNotes,
  listTags,
  listTodoLinks,
  purgeTrash,
  runBatch,
  unlinkTodo,
  updateFolder,
  updateNote,
} from './service.js';

const idParams = z.object({ id: z.string().min(1) });
const todoParams = z.object({ id: z.string().min(1), todoId: z.string().min(1) });

/**
 * 便签模块的路由。
 *
 * 注册顺序无关紧要：Fastify 的基数树把静态段排在参数段之前，所以
 * `/api/v1/notes/folders` 不会被 `/api/v1/notes/:id` 抢走。
 *
 * 注意 `trash` 是 **DELETE 且无 body**。浏览器 `fetch` 不带 content-type，
 * Fastify 默认对这种形状回 415，而 `app.inject()` **复现不了**——`buildApp`
 * 已注册接受空 body 的 parser，守卫测试放在客户端传输层（TASK-062）。
 *
 * 校验与错误映射经 `defineRoute`（`@workbench/http-kit`，ADR-0024）统一完成，
 * 本文件因此只剩「路径 ↔ service」的对照关系。
 */
export function registerNotesRoutes(
  app: FastifyInstance,
  repo: NoteRepository,
  ctx: ModuleContext,
): void {
  // ---- 文件夹 ----

  app.get(
    NOTES_API_V1.folders,
    defineRoute({}, () => listFolderTree(repo)),
  );

  app.post(
    NOTES_API_V1.folders,
    defineRoute({ body: createFolderInputSchema, status: 201 }, ({ body }) =>
      createFolder(repo, body),
    ),
  );

  app.patch(
    NOTES_API_V1.folder(ID_PARAM),
    defineRoute({ params: idParams, body: updateFolderInputSchema }, ({ params, body }) =>
      updateFolder(repo, params.id, body),
    ),
  );

  app.delete(
    NOTES_API_V1.folder(ID_PARAM),
    defineRoute({ params: idParams, status: 204 }, ({ params }) => deleteFolder(repo, params.id)),
  );

  // ---- 聚合元数据 ----

  app.get(
    NOTES_API_V1.tags,
    defineRoute({}, () => listTags(repo)),
  );
  app.get(
    NOTES_API_V1.stats,
    defineRoute({}, () => getStats(repo)),
  );

  // ---- 批量管道与回收站 ----

  app.post(
    NOTES_API_V1.batch,
    defineRoute({ body: batchInputSchema }, ({ body }) => runBatch(repo, body.ids, body.action)),
  );

  app.delete(
    NOTES_API_V1.trash,
    defineRoute({}, () => purgeTrash(repo)),
  );

  // ---- 便签 ----

  app.get(
    NOTES_API_V1.notes,
    defineRoute({ query: listNotesQuerySchema }, ({ query }) => listNotes(repo, ctx.items, query)),
  );

  app.post(
    NOTES_API_V1.notes,
    defineRoute({ body: createNoteInputSchema, status: 201 }, ({ body }) =>
      createNote(repo, ctx.items, body),
    ),
  );

  app.get(
    NOTES_API_V1.note(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) => getNote(repo, ctx.items, params.id)),
  );

  app.patch(
    NOTES_API_V1.note(ID_PARAM),
    defineRoute({ params: idParams, body: updateNoteInputSchema }, ({ params, body }) =>
      updateNote(repo, ctx.items, params.id, body),
    ),
  );

  app.delete(
    NOTES_API_V1.note(ID_PARAM),
    defineRoute({ params: idParams, status: 204 }, ({ params }) => deleteNote(repo, params.id)),
  );

  // ---- 待办联动 ----

  app.get(
    NOTES_API_V1.todoLinks(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) => listTodoLinks(repo, ctx.items, params.id)),
  );

  app.post(
    NOTES_API_V1.todoLinks(ID_PARAM),
    defineRoute({ params: idParams, body: linkTodoInputSchema }, ({ params, body }) =>
      linkTodo(repo, ctx.items, params.id, body.todoItemId),
    ),
  );

  app.delete(
    NOTES_API_V1.todoLink(ID_PARAM, TODO_ID_PARAM),
    defineRoute({ params: todoParams, status: 204 }, ({ params }) =>
      unlinkTodo(repo, params.id, params.todoId),
    ),
  );

  // 无 body 也算合法：不传就用便签标题当待办标题。
  // `defineRoute` 缺 body 时按 `{}` 校验，原先手写的 `request.body ?? {}` 因此不再需要。
  app.post(
    NOTES_API_V1.createTodo(ID_PARAM),
    defineRoute(
      { params: idParams, body: createTodoInputSchema, status: 201 },
      ({ params, body }) => createTodoFromNote(repo, ctx.items, ctx.moduleId, params.id, body),
    ),
  );
}
