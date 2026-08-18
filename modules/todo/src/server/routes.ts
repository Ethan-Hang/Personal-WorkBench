import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import {
  ID_PARAM,
  TODO_API,
  batchIdsInputSchema,
  createTaskInputSchema,
  updateTaskInputSchema,
} from '../contract.js';
import {
  batchDeleteTrash,
  batchRestoreTrash,
  clearTrash,
  completeTask,
  createTask,
  deleteTaskPermanently,
  listToday,
  listTrash,
  restoreAllTrash,
  restoreTask,
  trashTask,
  uncompleteTask,
  updateTask,
  type ServiceOptions,
} from './service.js';

/** 迭代 1 用系统时区；跨时区支持见 spec §6.5 的已知限制。 */
function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerTodoRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  // 1. 获取今日执行舱任务
  app.get(TODO_API.today, async () => listToday(ctx, opts()));

  // 2. 创建新待办
  app.post(TODO_API.tasks, async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const task = await createTask(ctx, parsed.data, opts());
    return reply.code(201).send(task);
  });

  // 3. 编辑待办 (PATCH)
  app.patch(TODO_API.task(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    const parsed = updateTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }

    const updated = await updateTask(ctx, params.data.id, parsed.data, opts());
    return reply.send(updated);
  });

  // 4. 完成任务
  app.post(TODO_API.completeTask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return completeTask(ctx, params.data.id, opts());
  });

  // 5. 取消完成/重新打开任务
  app.post(TODO_API.uncompleteTask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return uncompleteTask(ctx, params.data.id, opts());
  });

  // 6. 移至回收站（软删除）
  app.post(TODO_API.trashTask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return trashTask(ctx, params.data.id, opts());
  });

  // 7. 从回收站恢复
  app.post(TODO_API.restoreTask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return restoreTask(ctx, params.data.id, opts());
  });

  // 8. 彻底删除
  app.delete(TODO_API.task(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const deleted = await deleteTaskPermanently(ctx, params.data.id);
    if (!deleted) {
      return reply.code(404).send({ error: `任务不存在或无法删除：${params.data.id}` });
    }

    return reply.code(204).send();
  });

  // 9. 回收站列表
  app.get(TODO_API.trash, async () => listTrash(ctx, opts()));

  // 10. 批量恢复回收站项
  app.post(TODO_API.batchRestoreTrash, async (request, reply) => {
    const parsed = batchIdsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const count = await batchRestoreTrash(ctx, parsed.data.ids);
    return { count };
  });

  // 11. 批量彻底删除回收站项
  app.post(TODO_API.batchDeleteTrash, async (request, reply) => {
    const parsed = batchIdsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const count = await batchDeleteTrash(ctx, parsed.data.ids);
    return { count };
  });

  // 12. 全部恢复回收站项
  app.post(TODO_API.restoreAllTrash, async () => {
    const count = await restoreAllTrash(ctx);
    return { count };
  });

  // 13. 清空回收站
  app.post(TODO_API.clearTrash, async () => {
    const count = await clearTrash(ctx);
    return { count };
  });
}
