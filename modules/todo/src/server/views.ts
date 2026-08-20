import {
  deriveUrgency,
  isImportantQuadrant,
  isUrgentQuadrant,
  priorityScore,
  type IsoInstant,
  type Item,
  type ScheduledTime,
} from '@workbench/core';
import type { ScheduledTimeView, SubtaskView, TagView, TaskView } from '../contract.js';
import type { SubtaskRecord, TagRecord, TodoRepository } from './repository.js';

/**
 * Item → TaskView 的组装。
 *
 * 子任务、标签、重复归属都在 todo 的自有表里，因此组装需要额外查询。
 * **一律批量取**：三个 `inArray` 查询换掉 3N 次单查，否则一页 50 条待办会打
 * 150 次库。单条路径（如 completeTask）走 `toTaskView`，它内部也走同一条批量路径。
 */

export function toScheduledView(scheduled: ScheduledTime | null): ScheduledTimeView | null {
  if (scheduled === null) return null;
  switch (scheduled.kind) {
    case 'all-day':
      return { kind: 'all-day', date: scheduled.date };
    case 'timed':
      return scheduled.end === undefined
        ? { kind: 'timed', start: scheduled.start }
        : { kind: 'timed', start: scheduled.start, end: scheduled.end };
  }
}

export function toSubtaskView(record: SubtaskRecord): SubtaskView {
  return {
    id: record.id,
    itemId: record.itemId,
    title: record.title,
    done: record.done === 1,
    position: record.position,
  };
}

export function toTagView(record: TagRecord): TagView {
  return { id: record.id, name: record.name, color: record.color };
}

/** 一次把 N 条 Item 组装成 N 条 TaskView。三个批量查询，与 N 无关。 */
export async function toTaskViews(
  items: Item[],
  now: IsoInstant,
  repo: TodoRepository,
): Promise<TaskView[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);

  const [subtaskRows, tagLinks, recurrenceLinks, allTags] = await Promise.all([
    repo.listSubtasksByItemIds(ids),
    repo.listTagIdsByItemIds(ids),
    repo.listRecurrenceIdsByItemIds(ids),
    repo.listTags(),
  ]);

  const subtasksByItem = new Map<string, SubtaskView[]>();
  for (const row of subtaskRows) {
    const list = subtasksByItem.get(row.itemId) ?? [];
    list.push(toSubtaskView(row));
    subtasksByItem.set(row.itemId, list);
  }

  const tagById = new Map(allTags.map((t) => [t.id, toTagView(t)]));
  const tagsByItem = new Map<string, TagView[]>();
  for (const link of tagLinks) {
    const tag = tagById.get(link.tagId);
    if (tag === undefined) continue;
    const list = tagsByItem.get(link.itemId) ?? [];
    list.push(tag);
    tagsByItem.set(link.itemId, list);
  }
  for (const list of tagsByItem.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const recurrenceByItem = new Map(recurrenceLinks.map((l) => [l.itemId, l.recurrenceId]));

  return items.map((item) => {
    const urgency = deriveUrgency(item.dueAt, now);
    return {
      id: item.id,
      title: item.title,
      sourceModule: item.sourceModule,
      kind: item.kind,
      status: item.status,
      importance: item.importance,
      notes: item.notes,
      dueAt: item.dueAt,
      scheduled: toScheduledView(item.scheduled),
      subtasks: subtasksByItem.get(item.id) ?? [],
      tags: tagsByItem.get(item.id) ?? [],
      recurrenceId: recurrenceByItem.get(item.id) ?? null,
      urgency,
      priorityScore: priorityScore(item.importance, urgency),
      isImportantQuadrant: isImportantQuadrant(item.importance),
      isUrgentQuadrant: isUrgentQuadrant(urgency),
    };
  });
}

/** 单条组装。内部走批量路径，避免两份组装逻辑各自漂移。 */
export async function toTaskView(
  item: Item,
  now: IsoInstant,
  repo: TodoRepository,
): Promise<TaskView> {
  const [view] = await toTaskViews([item], now, repo);
  if (view === undefined) throw new Error(`视图组装失败：${item.id}`);
  return view;
}
