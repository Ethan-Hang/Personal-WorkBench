import { nowIso, type ModuleContext } from '@workbench/core';
import type { CreateTagInput, TagView, UpdateTagInput } from '../contract.js';
import { conflict, notFound } from './errors.js';
import type { TodoRepository } from './repository.js';
import { toTagView } from './views.js';

/**
 * 标签：**todo 内部概念**，不跨模块（ADR-0014）。
 *
 * 已知代价：工作台今日页看不见也筛不了这些标签。让它跨模块需要标签成为 core 级
 * 概念，秋招的 Item 也要能打——那是另一个量级的改动，本轮明确不做。
 */

/**
 * 标签名归一：trim 后按大小写不敏感去重。
 *
 * 存的是用户输入的原样（「工作」与「Work」各自保留大小写），但「work」与「Work」
 * 视为同一个标签——否则标签列表会慢慢长出一堆只差大小写的孪生项。
 */
function normalizedKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

async function assertNameAvailable(
  repo: TodoRepository,
  name: string,
  exceptId?: string,
): Promise<void> {
  const key = normalizedKey(name);
  const all = await repo.listTags();
  const clash = all.find((t) => normalizedKey(t.name) === key && t.id !== exceptId);
  if (clash !== undefined) throw conflict(`标签已存在：${clash.name}`);
}

export async function listTags(repo: TodoRepository): Promise<TagView[]> {
  return (await repo.listTags()).map(toTagView);
}

export async function createTag(repo: TodoRepository, input: CreateTagInput): Promise<TagView> {
  await assertNameAvailable(repo, input.name);
  const record = {
    id: crypto.randomUUID(),
    name: input.name,
    color: input.color ?? null,
    createdAt: nowIso(),
  };
  await repo.insertTag(record);
  return toTagView(record);
}

export async function updateTag(
  repo: TodoRepository,
  id: string,
  input: UpdateTagInput,
): Promise<TagView> {
  if (input.name !== undefined) await assertNameAvailable(repo, input.name, id);
  const changes: { name?: string; color?: TagView['color'] } = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.color !== undefined) changes.color = input.color;
  return toTagView(await repo.updateTag(id, changes));
}

/** 删标签连带解除所有关联——由 todo_task_tags 的外键 ON DELETE CASCADE 完成。 */
export async function deleteTag(repo: TodoRepository, id: string): Promise<boolean> {
  return repo.deleteTag(id);
}

/**
 * 整体设置某待办的标签集合。传空数组即清空。
 *
 * 与子任务重排同理：整体替换而非「加一个 / 减一个」，并发下才是幂等的。
 */
export async function setTaskTags(
  ctx: ModuleContext,
  repo: TodoRepository,
  itemId: string,
  tagIds: string[],
): Promise<void> {
  const item = await ctx.items.getById(itemId);
  if (item === null) throw notFound(`任务不存在：${itemId}`);
  if (item.sourceModule !== ctx.moduleId) {
    throw notFound(`任务不属于 ${ctx.moduleId}：${itemId}`);
  }

  const known = new Set((await repo.listTags()).map((t) => t.id));
  for (const id of tagIds) {
    if (!known.has(id)) throw notFound(`标签不存在：${id}`);
  }
  await repo.setItemTags(itemId, [...new Set(tagIds)]);
}
