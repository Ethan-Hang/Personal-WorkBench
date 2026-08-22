import { localDayOf, nowIso, type IsoInstant, type ModuleContext } from '@workbench/core';
import {
  MATERIALIZE_HORIZON_DAYS,
  type CreateRecurrenceInput,
  type RecurrenceView,
  type UpdateRecurrenceInput,
} from '../contract.js';
import { notFound } from '@workbench/http-kit';
import { addDays, expandOccurrences, type RecurrenceRule } from './recurrence.js';
import type { RecurrenceRecord, TodoRepository } from './repository.js';

/**
 * 重复任务：**物化策略**。规则本身不是待办，它按需生成真正的 core Item。
 *
 * 选物化而非「1 条 Item + 规则」的理由（ADR-0014）：日历、排程、完成、回收站
 * 全部零改动，core 一行不改。一条重复出来的待办与手工建的待办在系统里完全同形，
 * 因此不需要在每个消费端各写一遍「这条是重复的吗」。
 */

function toRecurrenceView(record: RecurrenceRecord): RecurrenceView {
  return {
    id: record.id,
    title: record.title,
    importance: record.importance,
    notes: record.notes,
    freq: record.freq,
    interval: record.interval,
    byWeekday: record.byWeekday === null ? null : (JSON.parse(record.byWeekday) as number[]),
    byMonthday: record.byMonthday,
    startDate: record.startDate,
    untilDate: record.untilDate,
  };
}

function toRule(record: RecurrenceRecord): RecurrenceRule {
  return {
    freq: record.freq,
    interval: record.interval,
    byWeekday: record.byWeekday === null ? null : (JSON.parse(record.byWeekday) as number[]),
    byMonthday: record.byMonthday,
    startDate: record.startDate,
    untilDate: record.untilDate,
  };
}

/**
 * 把一条规则物化到 `today + MATERIALIZE_HORIZON_DAYS` 为止。
 *
 * **幂等**：已存在的 (recurrenceId, occurrenceDate) 由复合主键挡住，因此本函数
 * 可以在每次 listToday 时无脑调用。水位 `materializedThrough` 只是省掉重复展开，
 * 不是正确性的依赖——即使水位丢了，重跑也不会生成重复实例。
 */
export async function materializeRecurrence(
  ctx: ModuleContext,
  repo: TodoRepository,
  record: RecurrenceRecord,
  now: IsoInstant,
  zone: string,
): Promise<number> {
  const today = localDayOf(now, zone);
  const horizon = addDays(today, MATERIALIZE_HORIZON_DAYS);

  // 从水位的次日开始；没有水位则从规则起始日开始。
  // 起点也不早于今天——补生成过去的实例只会凭空造出一堆逾期待办。
  const fromWatermark =
    record.materializedThrough === null ? record.startDate : addDays(record.materializedThrough, 1);
  const from = fromWatermark < today ? today : fromWatermark;
  if (from > horizon) return 0;

  const dates = expandOccurrences(toRule(record), from, horizon);
  const existing = new Set(
    (await repo.listRecurrenceItems(record.id)).map((r) => r.occurrenceDate),
  );

  let created = 0;
  for (const date of dates) {
    if (existing.has(date)) continue;
    const item = await ctx.items.create(ctx.moduleId, {
      kind: 'task',
      title: record.title,
      importance: record.importance,
      notes: record.notes,
      // 重复只按本地日推进，故一律全天排程——浮动日期绝不转 UTC
      scheduled: { kind: 'all-day', date },
    });
    await repo.linkRecurrenceItem(record.id, date, item.id);
    created++;
  }

  await repo.updateRecurrence(record.id, { materializedThrough: horizon });
  return created;
}

/** 把全部规则物化一遍。listToday 每次调用，因此必须幂等且便宜。 */
export async function materializeAll(
  ctx: ModuleContext,
  repo: TodoRepository,
  now: IsoInstant,
  zone: string,
): Promise<number> {
  let created = 0;
  for (const record of await repo.listRecurrences()) {
    created += await materializeRecurrence(ctx, repo, record, now, zone);
  }
  return created;
}

export async function listRecurrences(repo: TodoRepository): Promise<RecurrenceView[]> {
  return (await repo.listRecurrences()).map(toRecurrenceView);
}

export async function createRecurrence(
  ctx: ModuleContext,
  repo: TodoRepository,
  input: CreateRecurrenceInput,
  zone: string,
  now: IsoInstant = nowIso(),
): Promise<RecurrenceView> {
  const stamp = nowIso();
  const record: RecurrenceRecord = {
    id: crypto.randomUUID(),
    title: input.title,
    importance: input.importance,
    notes: input.notes === undefined || input.notes === '' ? null : input.notes,
    freq: input.freq,
    interval: input.interval,
    byWeekday:
      input.byWeekday === null || input.byWeekday === undefined
        ? null
        : JSON.stringify([...new Set(input.byWeekday)].sort((a, b) => a - b)),
    byMonthday: input.byMonthday ?? null,
    startDate: input.startDate,
    untilDate: input.untilDate ?? null,
    materializedThrough: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await repo.insertRecurrence(record);
  // 建完立刻物化一次，否则「建了重复任务但今天什么都没出现」
  await materializeRecurrence(ctx, repo, record, now, zone);
  return toRecurrenceView(record);
}

/**
 * 改规则。
 *
 * **只改「往后」的部分**：标题、重要度、备注、截止日。freq / interval / by* /
 * startDate 不可改——改了就得回收并重算全部未来实例，那与「删掉重建」没有区别，
 * 但多一整套容易出错的对账逻辑。要改节奏就删了重建。
 *
 * 已物化的未来实例会跟着改标题与重要度；已完成的历史实例不动。
 */
export async function updateRecurrence(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
  input: UpdateRecurrenceInput,
  now: IsoInstant,
  zone: string,
): Promise<RecurrenceView> {
  const existing = await repo.getRecurrence(id);
  if (existing === null) throw notFound(`重复规则不存在：${id}`);

  const changes: Parameters<typeof repo.updateRecurrence>[1] = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.importance !== undefined) changes.importance = input.importance;
  if (input.notes !== undefined) changes.notes = input.notes === '' ? null : input.notes;
  if (input.untilDate !== undefined) changes.untilDate = input.untilDate;

  const updated = await repo.updateRecurrence(id, changes);

  const today = localDayOf(now, zone);
  const links = await repo.listRecurrenceItems(id);
  const future = links.filter((l) => l.occurrenceDate >= today);

  // 同步未来实例的内容
  if (input.title !== undefined || input.importance !== undefined || input.notes !== undefined) {
    for (const link of future) {
      const item = await ctx.items.getById(link.itemId);
      if (item === null || item.status === 'done') continue;
      await ctx.items.update(link.itemId, {
        ...(input.title !== undefined ? { title: updated.title } : {}),
        ...(input.importance !== undefined ? { importance: updated.importance } : {}),
        ...(input.notes !== undefined ? { notes: updated.notes } : {}),
      });
    }
  }

  // 缩短了 untilDate：砍掉超出的未来实例（已完成的保留，那是真发生过的历史）
  if (updated.untilDate !== null) {
    const doomed = future.filter((l) => l.occurrenceDate > (updated.untilDate as string));
    await removeInstances(ctx, repo, doomed);
  }

  return toRecurrenceView(updated);
}

/** 删掉未完成的实例并解除关联。已完成的实例保留——它是真发生过的历史。 */
async function removeInstances(
  ctx: ModuleContext,
  repo: TodoRepository,
  links: Array<{ occurrenceDate: string; itemId: string }>,
): Promise<void> {
  const removable: string[] = [];
  for (const link of links) {
    const item = await ctx.items.getById(link.itemId);
    if (item === null) {
      removable.push(link.itemId);
      continue;
    }
    if (item.status === 'done') continue;
    await ctx.items.delete(ctx.moduleId, link.itemId);
    removable.push(link.itemId);
  }
  await repo.unlinkRecurrenceItems(removable);
}

/**
 * 删规则：清掉今天及以后**未完成**的实例，保留已完成的历史。
 *
 * 一律全删会让「上周确实做过的三次」凭空消失；一律全留则会在日历上留下一串
 * 无主的未来待办。分界线放在「完成与否」而不是「过去未来」——昨天没做的那条
 * 该跟着规则一起消失。
 */
export async function deleteRecurrence(
  ctx: ModuleContext,
  repo: TodoRepository,
  id: string,
): Promise<boolean> {
  const existing = await repo.getRecurrence(id);
  if (existing === null) return false;

  await removeInstances(ctx, repo, await repo.listRecurrenceItems(id));
  return repo.deleteRecurrence(id);
}
