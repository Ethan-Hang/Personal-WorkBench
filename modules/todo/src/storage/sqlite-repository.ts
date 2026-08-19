import type Database from 'better-sqlite3';
import { asc, eq, inArray, max } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { notFound } from '../server/errors.js';
import type {
  RecurrenceChanges,
  RecurrenceRecord,
  SubtaskChanges,
  SubtaskRecord,
  TagChanges,
  TagRecord,
  TodoRepository,
} from '../server/repository.js';
import * as schema from './schema.js';
import {
  todoRecurrenceItems,
  todoRecurrences,
  todoSubtasks,
  todoTags,
  todoTaskTags,
} from './schema.js';

/**
 * todo 自有表的 SQLite 适配器。
 *
 * 连接由组合根注入，**不得 import `@workbench/data`**——数据库句柄止步于此，
 * 不向业务代码继续扩散（ADR-0008）。
 */
export class SqliteTodoRepository implements TodoRepository {
  private cached?: {
    connection: Database.Database;
    db: BetterSQLite3Database<typeof schema>;
  };

  constructor(private readonly getSqlite: () => Database.Database) {}

  private get db(): BetterSQLite3Database<typeof schema> {
    const connection = this.getSqlite();
    if (this.cached?.connection !== connection) {
      this.cached = { connection, db: drizzle(connection, { schema }) };
    }
    return this.cached.db;
  }

  /* ─────────── 子任务 ─────────── */

  async listSubtasksByItemIds(itemIds: string[]): Promise<SubtaskRecord[]> {
    if (itemIds.length === 0) return [];
    return this.db
      .select()
      .from(todoSubtasks)
      .where(inArray(todoSubtasks.itemId, itemIds))
      .orderBy(asc(todoSubtasks.position), asc(todoSubtasks.createdAt))
      .all();
  }

  async getSubtask(id: string): Promise<SubtaskRecord | null> {
    return this.db.select().from(todoSubtasks).where(eq(todoSubtasks.id, id)).get() ?? null;
  }

  async insertSubtask(record: SubtaskRecord): Promise<void> {
    this.db.insert(todoSubtasks).values(record).run();
  }

  async updateSubtask(id: string, changes: SubtaskChanges): Promise<SubtaskRecord> {
    const row = this.db
      .update(todoSubtasks)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(todoSubtasks.id, id))
      .returning()
      .get();
    if (row === undefined) throw notFound(`子任务不存在：${id}`);
    return row;
  }

  async deleteSubtask(id: string): Promise<boolean> {
    return this.db.delete(todoSubtasks).where(eq(todoSubtasks.id, id)).returning().all().length > 0;
  }

  async nextSubtaskPosition(itemId: string): Promise<number> {
    const row = this.db
      .select({ maxPos: max(todoSubtasks.position) })
      .from(todoSubtasks)
      .where(eq(todoSubtasks.itemId, itemId))
      .get();
    return row?.maxPos === null || row?.maxPos === undefined ? 0 : row.maxPos + 1;
  }

  async deleteSubtasksByItemId(itemId: string): Promise<number> {
    return this.db.delete(todoSubtasks).where(eq(todoSubtasks.itemId, itemId)).returning().all()
      .length;
  }

  /* ─────────── 标签 ─────────── */

  async listTags(): Promise<TagRecord[]> {
    return this.db.select().from(todoTags).orderBy(asc(todoTags.name)).all() as TagRecord[];
  }

  async getTag(id: string): Promise<TagRecord | null> {
    return (this.db.select().from(todoTags).where(eq(todoTags.id, id)).get() as TagRecord) ?? null;
  }

  async findTagByName(name: string): Promise<TagRecord | null> {
    return (
      (this.db.select().from(todoTags).where(eq(todoTags.name, name)).get() as TagRecord) ?? null
    );
  }

  async insertTag(record: TagRecord): Promise<void> {
    this.db.insert(todoTags).values(record).run();
  }

  async updateTag(id: string, changes: TagChanges): Promise<TagRecord> {
    const row = this.db
      .update(todoTags)
      .set(changes)
      .where(eq(todoTags.id, id))
      .returning()
      .get() as TagRecord | undefined;
    if (row === undefined) throw notFound(`标签不存在：${id}`);
    return row;
  }

  async deleteTag(id: string): Promise<boolean> {
    return this.db.delete(todoTags).where(eq(todoTags.id, id)).returning().all().length > 0;
  }

  async listTagIdsByItemIds(itemIds: string[]): Promise<Array<{ itemId: string; tagId: string }>> {
    if (itemIds.length === 0) return [];
    return this.db
      .select({ itemId: todoTaskTags.itemId, tagId: todoTaskTags.tagId })
      .from(todoTaskTags)
      .where(inArray(todoTaskTags.itemId, itemIds))
      .all();
  }

  async setItemTags(itemId: string, tagIds: string[]): Promise<void> {
    this.db.delete(todoTaskTags).where(eq(todoTaskTags.itemId, itemId)).run();
    if (tagIds.length === 0) return;
    this.db
      .insert(todoTaskTags)
      .values(tagIds.map((tagId) => ({ itemId, tagId })))
      .run();
  }

  async clearItemTags(itemId: string): Promise<void> {
    this.db.delete(todoTaskTags).where(eq(todoTaskTags.itemId, itemId)).run();
  }

  /* ─────────── 重复 ─────────── */

  async listRecurrences(): Promise<RecurrenceRecord[]> {
    return this.db
      .select()
      .from(todoRecurrences)
      .orderBy(asc(todoRecurrences.createdAt))
      .all() as RecurrenceRecord[];
  }

  async getRecurrence(id: string): Promise<RecurrenceRecord | null> {
    return (
      (this.db
        .select()
        .from(todoRecurrences)
        .where(eq(todoRecurrences.id, id))
        .get() as RecurrenceRecord) ?? null
    );
  }

  async insertRecurrence(record: RecurrenceRecord): Promise<void> {
    this.db.insert(todoRecurrences).values(record).run();
  }

  async updateRecurrence(id: string, changes: RecurrenceChanges): Promise<RecurrenceRecord> {
    const row = this.db
      .update(todoRecurrences)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(eq(todoRecurrences.id, id))
      .returning()
      .get() as RecurrenceRecord | undefined;
    if (row === undefined) throw notFound(`重复规则不存在：${id}`);
    return row;
  }

  async deleteRecurrence(id: string): Promise<boolean> {
    return (
      this.db.delete(todoRecurrences).where(eq(todoRecurrences.id, id)).returning().all().length > 0
    );
  }

  async listRecurrenceItems(
    recurrenceId: string,
  ): Promise<Array<{ occurrenceDate: string; itemId: string }>> {
    return this.db
      .select({
        occurrenceDate: todoRecurrenceItems.occurrenceDate,
        itemId: todoRecurrenceItems.itemId,
      })
      .from(todoRecurrenceItems)
      .where(eq(todoRecurrenceItems.recurrenceId, recurrenceId))
      .orderBy(asc(todoRecurrenceItems.occurrenceDate))
      .all();
  }

  async linkRecurrenceItem(
    recurrenceId: string,
    occurrenceDate: string,
    itemId: string,
  ): Promise<void> {
    this.db.insert(todoRecurrenceItems).values({ recurrenceId, occurrenceDate, itemId }).run();
  }

  async listRecurrenceIdsByItemIds(
    itemIds: string[],
  ): Promise<Array<{ itemId: string; recurrenceId: string }>> {
    if (itemIds.length === 0) return [];
    return this.db
      .select({
        itemId: todoRecurrenceItems.itemId,
        recurrenceId: todoRecurrenceItems.recurrenceId,
      })
      .from(todoRecurrenceItems)
      .where(inArray(todoRecurrenceItems.itemId, itemIds))
      .all();
  }

  async unlinkRecurrenceItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    this.db.delete(todoRecurrenceItems).where(inArray(todoRecurrenceItems.itemId, itemIds)).run();
  }
}
