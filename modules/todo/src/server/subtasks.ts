import { nowIso, type ModuleContext } from '@workbench/core';
import type { CreateSubtaskInput, SubtaskView, UpdateSubtaskInput } from '../contract.js';
import { invalid, notFound } from '@workbench/http-kit';
import type { TodoRepository } from './repository.js';
import { toSubtaskView } from './views.js';

/**
 * 子任务：一条待办内部的纯文本检查清单。
 *
 * **刻意不是 core Item**——不能单独排程、不上日历、不进回收站（ADR-0025）。
 * 因此这里全程只碰 todo 自有表，除了「宿主待办是否存在且属于本模块」这一条校验。
 */

/** 宿主必须存在，且必须是本模块的待办——不能给秋招的投影挂子任务。 */
async function assertOwnedItem(ctx: ModuleContext, itemId: string): Promise<void> {
  const item = await ctx.items.getById(itemId);
  if (item === null) throw notFound(`任务不存在：${itemId}`);
  if (item.sourceModule !== ctx.moduleId) {
    throw notFound(`任务不属于 ${ctx.moduleId}：${itemId}`);
  }
}

export async function createSubtask(
  ctx: ModuleContext,
  repo: TodoRepository,
  itemId: string,
  input: CreateSubtaskInput,
): Promise<SubtaskView> {
  await assertOwnedItem(ctx, itemId);
  const now = nowIso();
  const record = {
    id: crypto.randomUUID(),
    itemId,
    title: input.title,
    done: 0,
    position: await repo.nextSubtaskPosition(itemId),
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertSubtask(record);
  return toSubtaskView(record);
}

export async function updateSubtask(
  repo: TodoRepository,
  id: string,
  input: UpdateSubtaskInput,
): Promise<SubtaskView> {
  const changes: { title?: string; done?: number } = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.done !== undefined) changes.done = input.done ? 1 : 0;
  return toSubtaskView(await repo.updateSubtask(id, changes));
}

export async function deleteSubtask(repo: TodoRepository, id: string): Promise<boolean> {
  return repo.deleteSubtask(id);
}

/**
 * 整条重排。传全部子任务 id 的目标顺序，而不是「把 A 移到 B 之前」。
 *
 * 局部换位在两个人同时拖动时会打架——各自基于不同的旧顺序算出新位置，
 * 结果谁都不对。整条替换是幂等的：最后写入的那一份就是最终顺序。
 */
export async function reorderSubtasks(
  ctx: ModuleContext,
  repo: TodoRepository,
  itemId: string,
  ids: string[],
): Promise<SubtaskView[]> {
  await assertOwnedItem(ctx, itemId);
  const existing = await repo.listSubtasksByItemIds([itemId]);
  const known = new Set(existing.map((s) => s.id));

  for (const id of ids) {
    if (!known.has(id)) throw invalid(`子任务不属于该任务：${id}`);
  }
  if (ids.length !== existing.length) {
    throw invalid(`重排必须给出全部 ${existing.length} 个子任务，收到 ${ids.length} 个`);
  }

  for (const [position, id] of ids.entries()) {
    await repo.updateSubtask(id, { position });
  }
  return (await repo.listSubtasksByItemIds([itemId])).map(toSubtaskView);
}
