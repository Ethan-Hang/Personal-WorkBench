import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, type SQL } from 'drizzle-orm';
import {
  nowIso,
  type CreateItemInput,
  type Item,
  type ItemRepository,
  type ListItemsQuery,
  type ScheduledTime,
  type UpdateItemPatch,
} from '@workbench/core';
import type { Db } from './db.js';
import { items } from './schema.js';

type Row = typeof items.$inferSelect;

/** 行 → ScheduledTime。is_all_day 决定 scheduled_start 的解释（spec §6.3）。 */
function toScheduled(row: Row): ScheduledTime | null {
  if (row.scheduledStart === null) return null;
  if (row.isAllDay) return { kind: 'all-day', date: row.scheduledStart };
  return row.scheduledEnd === null
    ? { kind: 'timed', start: row.scheduledStart }
    : { kind: 'timed', start: row.scheduledStart, end: row.scheduledEnd };
}

/** ScheduledTime → 列值。switch 穷尽两分支，漏一个即编译失败。 */
function fromScheduled(s: ScheduledTime | null): {
  isAllDay: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
} {
  if (s === null) return { isAllDay: false, scheduledStart: null, scheduledEnd: null };
  switch (s.kind) {
    case 'all-day':
      return { isAllDay: true, scheduledStart: s.date, scheduledEnd: null };
    case 'timed':
      return { isAllDay: false, scheduledStart: s.start, scheduledEnd: s.end ?? null };
  }
}

function toItem(row: Row): Item {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    status: row.status,
    importance: row.importance,
    dueAt: row.dueAt,
    scheduled: toScheduled(row),
    estimateMinutes: row.estimateMinutes,
    goalId: row.goalId,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export class SqliteItemRepository implements ItemRepository {
  constructor(private readonly db: Db) {}

  async create(moduleId: string, input: CreateItemInput): Promise<Item> {
    const now = nowIso();
    const sched = fromScheduled(input.scheduled ?? null);
    const row = this.db
      .insert(items)
      .values({
        id: randomUUID(),
        kind: input.kind,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status ?? 'todo',
        importance: input.importance ?? 'normal',
        dueAt: input.dueAt ?? null,
        isAllDay: sched.isAllDay,
        scheduledStart: sched.scheduledStart,
        scheduledEnd: sched.scheduledEnd,
        estimateMinutes: input.estimateMinutes ?? null,
        goalId: input.goalId ?? null,
        sourceModule: moduleId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      .returning()
      .get();
    return toItem(row);
  }

  async getById(id: string): Promise<Item | null> {
    const row = this.db.select().from(items).where(eq(items.id, id)).get();
    return row === undefined ? null : toItem(row);
  }

  async update(id: string, patch: UpdateItemPatch): Promise<Item> {
    const values: Partial<typeof items.$inferInsert> = { updatedAt: nowIso() };

    if (patch.title !== undefined) values.title = patch.title;
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.importance !== undefined) values.importance = patch.importance;
    if (patch.dueAt !== undefined) values.dueAt = patch.dueAt;
    if (patch.estimateMinutes !== undefined) values.estimateMinutes = patch.estimateMinutes;
    if (patch.goalId !== undefined) values.goalId = patch.goalId;
    if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;
    if (patch.scheduled !== undefined) {
      const sched = fromScheduled(patch.scheduled);
      values.isAllDay = sched.isAllDay;
      values.scheduledStart = sched.scheduledStart;
      values.scheduledEnd = sched.scheduledEnd;
    }

    const row = this.db.update(items).set(values).where(eq(items.id, id)).returning().get();
    if (row === undefined) throw new Error(`Item 不存在：${id}`);
    return toItem(row);
  }

  async list(query: ListItemsQuery): Promise<Item[]> {
    const conditions: SQL[] = [];

    // 排程条件：定时区间 与 全天日期 取并集
    const scheduleAlternatives: SQL[] = [];
    if (query.scheduledWithin !== undefined) {
      scheduleAlternatives.push(
        and(
          eq(items.isAllDay, false),
          gte(items.scheduledStart, query.scheduledWithin.startUtc),
          lt(items.scheduledStart, query.scheduledWithin.endUtc),
        )!,
      );
    }
    if (query.scheduledOnDate !== undefined) {
      scheduleAlternatives.push(
        and(eq(items.isAllDay, true), eq(items.scheduledStart, query.scheduledOnDate))!,
      );
    }
    if (query.scheduledOnOrBeforeDate !== undefined) {
      scheduleAlternatives.push(
        and(eq(items.isAllDay, true), lte(items.scheduledStart, query.scheduledOnOrBeforeDate))!,
      );
    }
    if (query.scheduledDateBetween !== undefined) {
      // 'YYYY-MM-DD' 的字典序等于日期序，含两端即 >= from AND <= to
      scheduleAlternatives.push(
        and(
          eq(items.isAllDay, true),
          gte(items.scheduledStart, query.scheduledDateBetween.from),
          lte(items.scheduledStart, query.scheduledDateBetween.to),
        )!,
      );
    }
    if (scheduleAlternatives.length === 1) conditions.push(scheduleAlternatives[0]!);
    if (scheduleAlternatives.length > 1) conditions.push(or(...scheduleAlternatives)!);

    // 未排程是一个独立的交集条件，不并入上面的排程并集
    if (query.unscheduled === true) {
      conditions.push(isNull(items.scheduledStart));
    }

    if (query.dueBefore !== undefined) {
      // isNotNull 是冗余的（SQL 中 NULL < x 结果为 NULL，本就不会命中），
      // 但写出来让"无 DDL 的任务永远不算逾期"这条语义在代码里显式可见
      conditions.push(and(isNotNull(items.dueAt), lt(items.dueAt, query.dueBefore))!);
    }
    if (query.statuses !== undefined && query.statuses.length > 0) {
      conditions.push(inArray(items.status, query.statuses));
    }
    if (query.sourceModules !== undefined && query.sourceModules.length > 0) {
      conditions.push(inArray(items.sourceModule, query.sourceModules));
    }

    const rows =
      conditions.length === 0
        ? this.db.select().from(items).all()
        : this.db
            .select()
            .from(items)
            .where(and(...conditions))
            .all();

    return rows.map(toItem);
  }

  async delete(moduleId: string, id: string): Promise<boolean> {
    const deleted = this.db
      .delete(items)
      .where(and(eq(items.id, id), eq(items.sourceModule, moduleId)))
      .returning({ id: items.id })
      .get();
    return deleted !== undefined;
  }

  async deleteBySourceModule(moduleId: string): Promise<number> {
    const deleted = this.db
      .delete(items)
      .where(eq(items.sourceModule, moduleId))
      .returning({ id: items.id })
      .all();
    return deleted.length;
  }
}
