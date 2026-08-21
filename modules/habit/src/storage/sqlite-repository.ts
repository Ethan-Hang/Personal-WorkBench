import type Database from 'better-sqlite3';
import { and, asc, between, eq, inArray, isNull, max } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FreqKind } from '../contract.js';
import type {
  CheckinRecord,
  HabitChanges,
  HabitDraft,
  HabitRecord,
  HabitRepository,
} from '../server/repository.js';
import * as schema from './schema.js';
import { habitCheckins, habitDefinitions } from './schema.js';

type HabitRow = typeof habitDefinitions.$inferSelect;

function nowInstant(): string {
  return new Date().toISOString();
}

/** `'1,3,5'` ↔ `[1,3,5]`。CSV 是存储细节，不泄漏到 service 与 UI。 */
function parseWeekdays(raw: string | null): number[] | null {
  if (!raw) return null;
  const parsed = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day));
  return parsed.length > 0 ? parsed : null;
}

function serializeWeekdays(weekdays: number[] | null | undefined): string | null {
  return weekdays && weekdays.length > 0 ? weekdays.join(',') : null;
}

function toRecord(row: HabitRow): HabitRecord {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    targetValue: row.targetValue,
    unit: row.unit,
    freqKind: row.freqKind as FreqKind,
    weekdays: parseWeekdays(row.weekdays),
    weeklyCount: row.weeklyCount,
    startDate: row.startDate,
    archivedAt: row.archivedAt,
    colorToken: row.colorToken,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 习惯模块的 SQLite 适配器。
 *
 * **不得 import `@workbench/data`**（ADR-0008）：连接由组合根注入，
 * 不继续向业务代码扩散。
 */
export class SqliteHabitRepository implements HabitRepository {
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

  async listHabits({ includeArchived }: { includeArchived: boolean }): Promise<HabitRecord[]> {
    const query = this.db.select().from(habitDefinitions);
    const rows = includeArchived
      ? query.orderBy(asc(habitDefinitions.position), asc(habitDefinitions.id)).all()
      : query
          .where(isNull(habitDefinitions.archivedAt))
          .orderBy(asc(habitDefinitions.position), asc(habitDefinitions.id))
          .all();
    return rows.map(toRecord);
  }

  async getHabit(id: string): Promise<HabitRecord | null> {
    const row = this.db.select().from(habitDefinitions).where(eq(habitDefinitions.id, id)).get();
    return row ? toRecord(row) : null;
  }

  async findHabitByName(name: string): Promise<HabitRecord | null> {
    const row = this.db
      .select()
      .from(habitDefinitions)
      .where(eq(habitDefinitions.name, name))
      .get();
    return row ? toRecord(row) : null;
  }

  async createHabit(draft: HabitDraft): Promise<HabitRecord> {
    const timestamp = nowInstant();
    const row = this.db
      .insert(habitDefinitions)
      .values({
        id: draft.id,
        name: draft.name,
        notes: draft.notes ?? null,
        targetValue: draft.targetValue,
        unit: draft.unit ?? null,
        freqKind: draft.freqKind,
        weekdays: serializeWeekdays(draft.weekdays),
        weeklyCount: draft.weeklyCount ?? null,
        startDate: draft.startDate,
        archivedAt: null,
        colorToken: draft.colorToken ?? null,
        position: draft.position,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
    return toRecord(row);
  }

  async updateHabit(id: string, changes: HabitChanges): Promise<HabitRecord | null> {
    const patch: Partial<typeof habitDefinitions.$inferInsert> = { updatedAt: nowInstant() };
    if (changes.name !== undefined) patch.name = changes.name;
    if (changes.notes !== undefined) patch.notes = changes.notes;
    if (changes.targetValue !== undefined) patch.targetValue = changes.targetValue;
    if (changes.unit !== undefined) patch.unit = changes.unit;
    if (changes.freqKind !== undefined) patch.freqKind = changes.freqKind;
    if (changes.weekdays !== undefined) patch.weekdays = serializeWeekdays(changes.weekdays);
    if (changes.weeklyCount !== undefined) patch.weeklyCount = changes.weeklyCount;
    if (changes.startDate !== undefined) patch.startDate = changes.startDate;
    if (changes.archivedAt !== undefined) patch.archivedAt = changes.archivedAt;
    if (changes.colorToken !== undefined) patch.colorToken = changes.colorToken;
    if (changes.position !== undefined) patch.position = changes.position;

    const row = this.db
      .update(habitDefinitions)
      .set(patch)
      .where(eq(habitDefinitions.id, id))
      .returning()
      .get();
    return row ? toRecord(row) : null;
  }

  async archiveHabit(id: string, archivedAt: string): Promise<HabitRecord | null> {
    return this.updateHabit(id, { archivedAt });
  }

  async unarchiveHabit(id: string): Promise<HabitRecord | null> {
    return this.updateHabit(id, { archivedAt: null });
  }

  async deleteHabit(id: string): Promise<boolean> {
    // 打卡表没有外键约束（习惯不投影成 Item，两张表都不指向 core），
    // 因此级联要在这里显式做掉，否则会留下查不到主人的孤儿打卡。
    this.db.delete(habitCheckins).where(eq(habitCheckins.habitId, id)).run();
    const removed = this.db
      .delete(habitDefinitions)
      .where(eq(habitDefinitions.id, id))
      .returning()
      .get();
    return removed !== undefined;
  }

  async maxPosition(): Promise<number> {
    const row = this.db
      .select({ value: max(habitDefinitions.position) })
      .from(habitDefinitions)
      .get();
    return row?.value ?? -1;
  }

  async listCheckins(habitId: string, from: string, to: string): Promise<CheckinRecord[]> {
    return this.db
      .select({ date: habitCheckins.date, value: habitCheckins.value })
      .from(habitCheckins)
      .where(and(eq(habitCheckins.habitId, habitId), between(habitCheckins.date, from, to)))
      .orderBy(asc(habitCheckins.date))
      .all();
  }

  async listCheckinsFor(
    habitIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, CheckinRecord[]>> {
    const grouped = new Map<string, CheckinRecord[]>();
    if (habitIds.length === 0) return grouped;

    const rows = this.db
      .select({
        habitId: habitCheckins.habitId,
        date: habitCheckins.date,
        value: habitCheckins.value,
      })
      .from(habitCheckins)
      .where(and(inArray(habitCheckins.habitId, habitIds), between(habitCheckins.date, from, to)))
      .orderBy(asc(habitCheckins.habitId), asc(habitCheckins.date))
      .all();

    for (const row of rows) {
      const bucket = grouped.get(row.habitId) ?? [];
      bucket.push({ date: row.date, value: row.value });
      grouped.set(row.habitId, bucket);
    }
    return grouped;
  }

  async upsertCheckin(habitId: string, date: string, value: number): Promise<CheckinRecord> {
    const timestamp = nowInstant();
    const row = this.db
      .insert(habitCheckins)
      .values({ habitId, date, value, createdAt: timestamp, updatedAt: timestamp })
      .onConflictDoUpdate({
        target: [habitCheckins.habitId, habitCheckins.date],
        set: { value, updatedAt: timestamp },
      })
      .returning({ date: habitCheckins.date, value: habitCheckins.value })
      .get();
    return row;
  }

  async deleteCheckin(habitId: string, date: string): Promise<boolean> {
    const removed = this.db
      .delete(habitCheckins)
      .where(and(eq(habitCheckins.habitId, habitId), eq(habitCheckins.date, date)))
      .returning({ date: habitCheckins.date })
      .get();
    return removed !== undefined;
  }
}
