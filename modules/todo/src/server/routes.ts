import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowIso, type ModuleContext } from '@workbench/core';
import {
  ID_PARAM,
  TODO_API,
  batchIdsInputSchema,
  createRecurrenceInputSchema,
  createSubtaskInputSchema,
  createTagInputSchema,
  createTaskInputSchema,
  reorderSubtasksInputSchema,
  setTaskTagsInputSchema,
  updateRecurrenceInputSchema,
  updateSubtaskInputSchema,
  updateTagInputSchema,
  updateTaskInputSchema,
} from '../contract.js';
import {
  createRecurrence,
  deleteRecurrence,
  listRecurrences,
  updateRecurrence,
} from './recurrences.js';
import { createSubtask, deleteSubtask, reorderSubtasks, updateSubtask } from './subtasks.js';
import { createTag, deleteTag, listTags, setTaskTags, updateTag } from './tags.js';
import { toHttp } from './errors.js';
import type { TodoRepository } from './repository.js';
import { toTaskView } from './views.js';
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

export function registerTodoRoutes(
  app: FastifyInstance,
  ctx: ModuleContext,
  repo: TodoRepository,
): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  // 1. 获取今日执行舱任务
  app.get(TODO_API.today, async () => listToday(ctx, repo, opts()));

  // 2. 创建新待办
  app.post(TODO_API.tasks, async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const task = await createTask(ctx, repo, parsed.data, opts());
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

    const updated = await updateTask(ctx, repo, params.data.id, parsed.data, opts());
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

    return completeTask(ctx, repo, params.data.id, opts());
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

    return uncompleteTask(ctx, repo, params.data.id, opts());
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

    return trashTask(ctx, repo, params.data.id, opts());
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

    return restoreTask(ctx, repo, params.data.id, opts());
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
  app.get(TODO_API.trash, async () => listTrash(ctx, repo, opts()));

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

  /* ─────────────── 子任务 ─────────────── */

  // 14. 给待办加子任务
  app.post(TODO_API.subtasks(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '任务 id 不合法' });
    const parsed = createSubtaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, async () =>
      reply.code(201).send(await createSubtask(ctx, repo, params.data.id, parsed.data)),
    );
  });

  // 15. 整条重排某待办的子任务
  app.put(TODO_API.reorderSubtasks(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '任务 id 不合法' });
    const parsed = reorderSubtasksInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, () => reorderSubtasks(ctx, repo, params.data.id, parsed.data.ids));
  });

  // 16. 改子任务（标题 / 勾选）
  app.patch(TODO_API.subtask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '子任务 id 不合法' });
    const parsed = updateSubtaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, () => updateSubtask(repo, params.data.id, parsed.data));
  });

  // 17. 删子任务
  app.delete(TODO_API.subtask(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '子任务 id 不合法' });
    const deleted = await deleteSubtask(repo, params.data.id);
    if (!deleted) return reply.code(404).send({ error: '子任务不存在' });
    return reply.code(204).send();
  });

  /* ─────────────── 标签 ─────────────── */

  // 18. 列出全部标签
  app.get(TODO_API.tags, async () => ({ tags: await listTags(repo) }));

  // 19. 建标签
  app.post(TODO_API.tags, async (request, reply) => {
    const parsed = createTagInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, async () => reply.code(201).send(await createTag(repo, parsed.data)));
  });

  // 20. 改标签
  app.patch(TODO_API.tag(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '标签 id 不合法' });
    const parsed = updateTagInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, () => updateTag(repo, params.data.id, parsed.data));
  });

  // 21. 删标签（连带解除全部关联，由外键 CASCADE 完成）
  app.delete(TODO_API.tag(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '标签 id 不合法' });
    const deleted = await deleteTag(repo, params.data.id);
    if (!deleted) return reply.code(404).send({ error: '标签不存在' });
    return reply.code(204).send();
  });

  // 22. 整体设置某待办的标签集合
  app.put(TODO_API.taskTags(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '任务 id 不合法' });
    const parsed = setTaskTagsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, async () => {
      await setTaskTags(ctx, repo, params.data.id, parsed.data.tagIds);
      const item = await ctx.items.getById(params.data.id);
      if (item === null) return reply.code(404).send({ error: '任务不存在' });
      return toTaskView(item, nowIso(), repo);
    });
  });

  /* ─────────────── 重复任务 ─────────────── */

  // 23. 列出重复规则
  app.get(TODO_API.recurrences, async () => ({ recurrences: await listRecurrences(repo) }));

  // 24. 建重复规则（建完立刻物化一次）
  app.post(TODO_API.recurrences, async (request, reply) => {
    const parsed = createRecurrenceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, async () =>
      reply.code(201).send(await createRecurrence(ctx, repo, parsed.data, resolveZone())),
    );
  });

  // 25. 改重复规则（只改往后的部分，见 recurrences.ts 的说明）
  app.patch(TODO_API.recurrence(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '规则 id 不合法' });
    const parsed = updateRecurrenceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    return toHttp(reply, () =>
      updateRecurrence(ctx, repo, params.data.id, parsed.data, nowIso(), resolveZone()),
    );
  });

  // 26. 删重复规则（清未完成的实例，保留已完成的历史）
  app.delete(TODO_API.recurrence(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: '规则 id 不合法' });
    const deleted = await deleteRecurrence(ctx, repo, params.data.id);
    if (!deleted) return reply.code(404).send({ error: '重复规则不存在' });
    return reply.code(204).send();
  });
}
