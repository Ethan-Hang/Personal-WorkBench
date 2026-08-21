import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
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
import { toHttp } from './errors.js';
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

function badRequest(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.code(400).send({ error: error.issues[0]?.message ?? '请求不合法' });
}

/**
 * 便签模块的路由。
 *
 * 注册顺序无关紧要：Fastify 的基数树把静态段排在参数段之前，所以
 * `/api/v1/notes/folders` 不会被 `/api/v1/notes/:id` 抢走。
 *
 * 注意 `trash` 是 **DELETE 且无 body**。浏览器 `fetch` 不带 content-type，
 * Fastify 默认对这种形状回 415，而 `app.inject()` **复现不了**——`buildApp`
 * 已注册接受空 body 的 parser，守卫测试放在客户端传输层（TASK-062）。
 */
export function registerNotesRoutes(
  app: FastifyInstance,
  repo: NoteRepository,
  ctx: ModuleContext,
): void {
  // ---- 文件夹 ----

  app.get(NOTES_API_V1.folders, async (_request, reply) => {
    return toHttp(reply, () => listFolderTree(repo));
  });

  app.post(NOTES_API_V1.folders, async (request, reply) => {
    const input = createFolderInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, async () => reply.code(201).send(await createFolder(repo, input.data)));
  });

  app.patch(NOTES_API_V1.folder(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const input = updateFolderInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => updateFolder(repo, params.data.id, input.data));
  });

  app.delete(NOTES_API_V1.folder(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, async () => {
      await deleteFolder(repo, params.data.id);
      return reply.code(204).send();
    });
  });

  // ---- 聚合元数据 ----

  app.get(NOTES_API_V1.tags, async (_request, reply) => toHttp(reply, () => listTags(repo)));
  app.get(NOTES_API_V1.stats, async (_request, reply) => toHttp(reply, () => getStats(repo)));

  // ---- 批量管道与回收站 ----

  app.post(NOTES_API_V1.batch, async (request, reply) => {
    const input = batchInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => runBatch(repo, input.data.ids, input.data.action));
  });

  app.delete(NOTES_API_V1.trash, async (_request, reply) => {
    return toHttp(reply, () => purgeTrash(repo));
  });

  // ---- 便签 ----

  app.get(NOTES_API_V1.notes, async (request, reply) => {
    const query = listNotesQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error);
    return toHttp(reply, () => listNotes(repo, ctx.items, query.data));
  });

  app.post(NOTES_API_V1.notes, async (request, reply) => {
    const input = createNoteInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, async () =>
      reply.code(201).send(await createNote(repo, ctx.items, input.data)),
    );
  });

  app.get(NOTES_API_V1.note(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, () => getNote(repo, ctx.items, params.data.id));
  });

  app.patch(NOTES_API_V1.note(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const input = updateNoteInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => updateNote(repo, ctx.items, params.data.id, input.data));
  });

  app.delete(NOTES_API_V1.note(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, async () => {
      await deleteNote(repo, params.data.id);
      return reply.code(204).send();
    });
  });

  // ---- 待办联动 ----

  app.get(NOTES_API_V1.todoLinks(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, () => listTodoLinks(repo, ctx.items, params.data.id));
  });

  app.post(NOTES_API_V1.todoLinks(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const input = linkTodoInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => linkTodo(repo, ctx.items, params.data.id, input.data.todoItemId));
  });

  app.delete(NOTES_API_V1.todoLink(ID_PARAM, TODO_ID_PARAM), async (request, reply) => {
    const params = todoParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, async () => {
      await unlinkTodo(repo, params.data.id, params.data.todoId);
      return reply.code(204).send();
    });
  });

  app.post(NOTES_API_V1.createTodo(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    // 无 body 也算合法：不传就用便签标题当待办标题
    const input = createTodoInputSchema.safeParse(request.body ?? {});
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, async () =>
      reply
        .code(201)
        .send(await createTodoFromNote(repo, ctx.items, ctx.moduleId, params.data.id, input.data)),
    );
  });
}
