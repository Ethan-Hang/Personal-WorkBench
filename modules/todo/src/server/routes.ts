import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowIso, type ModuleContext } from '@workbench/core';
import { defineRoute, notFound } from '@workbench/http-kit';
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

/**
 * 每种 id 的 400 文案历史上各不相同，这里逐条保留，
 * 以免这次收敛顺手改掉了响应体。
 */
const taskIdRequired = z.object({ id: z.string().min(1, '缺少任务 id') });
const taskIdParams = z.object({ id: z.string().min(1, '任务 id 不合法') });
const subtaskIdParams = z.object({ id: z.string().min(1, '子任务 id 不合法') });
const tagIdParams = z.object({ id: z.string().min(1, '标签 id 不合法') });
const recurrenceIdParams = z.object({ id: z.string().min(1, '规则 id 不合法') });

/**
 * 待办的写操作只认本模块创建的 Item。
 *
 * 这段守卫原先在五个 handler 里各抄一遍；`sourceModule` 不匹配时**回 404 而不是 403**
 * 是刻意的——对调用方来说「不是你的」与「不存在」应当不可区分，
 * 否则这个端点就成了一个探测其他模块 id 是否存在的接口。
 */
async function requireOwnTask(ctx: ModuleContext, id: string): Promise<void> {
  const existing = await ctx.items.getById(id);
  if (existing === null || existing.sourceModule !== ctx.moduleId) {
    throw notFound(`任务不存在：${id}`);
  }
}

export function registerTodoRoutes(
  app: FastifyInstance,
  ctx: ModuleContext,
  repo: TodoRepository,
): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  // 1. 获取今日执行舱任务
  app.get(TODO_API.today, async () => listToday(ctx, repo, opts()));

  // 2. 创建新待办
  app.post(
    TODO_API.tasks,
    defineRoute({ body: createTaskInputSchema, status: 201 }, ({ body }) =>
      createTask(ctx, repo, body, opts()),
    ),
  );

  // 3. 编辑待办 (PATCH)
  app.patch(
    TODO_API.task(ID_PARAM),
    defineRoute(
      { params: taskIdRequired, body: updateTaskInputSchema },
      async ({ params, body }) => {
        await requireOwnTask(ctx, params.id);
        return updateTask(ctx, repo, params.id, body, opts());
      },
    ),
  );

  // 4. 完成任务
  app.post(
    TODO_API.completeTask(ID_PARAM),
    defineRoute({ params: taskIdRequired }, async ({ params }) => {
      await requireOwnTask(ctx, params.id);
      return completeTask(ctx, repo, params.id, opts());
    }),
  );

  // 5. 取消完成/重新打开任务
  app.post(
    TODO_API.uncompleteTask(ID_PARAM),
    defineRoute({ params: taskIdRequired }, async ({ params }) => {
      await requireOwnTask(ctx, params.id);
      return uncompleteTask(ctx, repo, params.id, opts());
    }),
  );

  // 6. 移至回收站（软删除）
  app.post(
    TODO_API.trashTask(ID_PARAM),
    defineRoute({ params: taskIdRequired }, async ({ params }) => {
      await requireOwnTask(ctx, params.id);
      return trashTask(ctx, repo, params.id, opts());
    }),
  );

  // 7. 从回收站恢复
  app.post(
    TODO_API.restoreTask(ID_PARAM),
    defineRoute({ params: taskIdRequired }, async ({ params }) => {
      await requireOwnTask(ctx, params.id);
      return restoreTask(ctx, repo, params.id, opts());
    }),
  );

  // 8. 彻底删除
  app.delete(
    TODO_API.task(ID_PARAM),
    defineRoute({ params: taskIdRequired, status: 204 }, async ({ params }) => {
      const deleted = await deleteTaskPermanently(ctx, params.id);
      if (!deleted) throw notFound(`任务不存在或无法删除：${params.id}`);
    }),
  );

  // 9. 回收站列表
  app.get(TODO_API.trash, async () => listTrash(ctx, repo, opts()));

  // 10. 批量恢复回收站项
  app.post(
    TODO_API.batchRestoreTrash,
    defineRoute({ body: batchIdsInputSchema }, async ({ body }) => ({
      count: await batchRestoreTrash(ctx, body.ids),
    })),
  );

  // 11. 批量彻底删除回收站项
  app.post(
    TODO_API.batchDeleteTrash,
    defineRoute({ body: batchIdsInputSchema }, async ({ body }) => ({
      count: await batchDeleteTrash(ctx, body.ids),
    })),
  );

  // 12. 全部恢复回收站项
  app.post(TODO_API.restoreAllTrash, async () => ({ count: await restoreAllTrash(ctx) }));

  // 13. 清空回收站
  app.post(TODO_API.clearTrash, async () => ({ count: await clearTrash(ctx) }));

  /* ─────────────── 子任务 ─────────────── */

  // 14. 给待办加子任务
  app.post(
    TODO_API.subtasks(ID_PARAM),
    defineRoute(
      { params: taskIdParams, body: createSubtaskInputSchema, status: 201 },
      ({ params, body }) => createSubtask(ctx, repo, params.id, body),
    ),
  );

  // 15. 整条重排某待办的子任务
  app.put(
    TODO_API.reorderSubtasks(ID_PARAM),
    defineRoute({ params: taskIdParams, body: reorderSubtasksInputSchema }, ({ params, body }) =>
      reorderSubtasks(ctx, repo, params.id, body.ids),
    ),
  );

  // 16. 改子任务（标题 / 勾选）
  app.patch(
    TODO_API.subtask(ID_PARAM),
    defineRoute({ params: subtaskIdParams, body: updateSubtaskInputSchema }, ({ params, body }) =>
      updateSubtask(repo, params.id, body),
    ),
  );

  // 17. 删子任务
  app.delete(
    TODO_API.subtask(ID_PARAM),
    defineRoute({ params: subtaskIdParams, status: 204 }, async ({ params }) => {
      const deleted = await deleteSubtask(repo, params.id);
      if (!deleted) throw notFound('子任务不存在');
    }),
  );

  /* ─────────────── 标签 ─────────────── */

  // 18. 列出全部标签
  app.get(TODO_API.tags, async () => ({ tags: await listTags(repo) }));

  // 19. 建标签
  app.post(
    TODO_API.tags,
    defineRoute({ body: createTagInputSchema, status: 201 }, ({ body }) => createTag(repo, body)),
  );

  // 20. 改标签
  app.patch(
    TODO_API.tag(ID_PARAM),
    defineRoute({ params: tagIdParams, body: updateTagInputSchema }, ({ params, body }) =>
      updateTag(repo, params.id, body),
    ),
  );

  // 21. 删标签（连带解除全部关联，由外键 CASCADE 完成）
  app.delete(
    TODO_API.tag(ID_PARAM),
    defineRoute({ params: tagIdParams, status: 204 }, async ({ params }) => {
      const deleted = await deleteTag(repo, params.id);
      if (!deleted) throw notFound('标签不存在');
    }),
  );

  // 22. 整体设置某待办的标签集合
  app.put(
    TODO_API.taskTags(ID_PARAM),
    defineRoute(
      { params: taskIdParams, body: setTaskTagsInputSchema },
      async ({ params, body }) => {
        await setTaskTags(ctx, repo, params.id, body.tagIds);
        const item = await ctx.items.getById(params.id);
        if (item === null) throw notFound('任务不存在');
        return toTaskView(item, nowIso(), repo);
      },
    ),
  );

  /* ─────────────── 重复任务 ─────────────── */

  // 23. 列出重复规则
  app.get(TODO_API.recurrences, async () => ({ recurrences: await listRecurrences(repo) }));

  // 24. 建重复规则（建完立刻物化一次）
  app.post(
    TODO_API.recurrences,
    defineRoute({ body: createRecurrenceInputSchema, status: 201 }, ({ body }) =>
      createRecurrence(ctx, repo, body, resolveZone()),
    ),
  );

  // 25. 改重复规则（只改往后的部分，见 recurrences.ts 的说明）
  app.patch(
    TODO_API.recurrence(ID_PARAM),
    defineRoute(
      { params: recurrenceIdParams, body: updateRecurrenceInputSchema },
      ({ params, body }) => updateRecurrence(ctx, repo, params.id, body, nowIso(), resolveZone()),
    ),
  );

  // 26. 删重复规则（清未完成的实例，保留已完成的历史）
  app.delete(
    TODO_API.recurrence(ID_PARAM),
    defineRoute({ params: recurrenceIdParams, status: 204 }, async ({ params }) => {
      const deleted = await deleteRecurrence(ctx, repo, params.id);
      if (!deleted) throw notFound('重复规则不存在');
    }),
  );
}
