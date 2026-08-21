import type { FreqKind } from '../contract.js';

/**
 * 一条习惯规则在存储中的形态。
 *
 * `weekdays` 在这一层已经是 `number[]`——CSV 的存法是 SQLite 的实现细节，
 * 不该泄漏到 service 与 UI。
 */
export interface HabitRecord {
  id: string;
  name: string;
  notes: string | null;
  targetValue: number;
  unit: string | null;
  freqKind: FreqKind;
  weekdays: number[] | null;
  weeklyCount: number | null;
  startDate: string;
  archivedAt: string | null;
  colorToken: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** 创建时由 service 决定的字段（id、position 已定好；时间戳由存储层补）。 */
export interface HabitDraft {
  id: string;
  name: string;
  notes?: string | null;
  targetValue: number;
  unit?: string | null;
  freqKind: FreqKind;
  weekdays?: number[] | null;
  weeklyCount?: number | null;
  startDate: string;
  colorToken?: string | null;
  position: number;
}

export type HabitChanges = Partial<Omit<HabitRecord, 'id' | 'createdAt' | 'updatedAt'>>;

/** 一条打卡。刻意不带 id——`(habitId, date)` 就是它的身份。 */
export interface CheckinRecord {
  date: string;
  value: number;
}

/**
 * 习惯模块自有的仓储接口，由模块拥有、由 storage 目录提供 SQLite 适配器（ADR-0008）。
 *
 * 注意这里**没有任何 core Item 的影子**：习惯不投影成 Item，因此不需要 `ItemRepository`。
 */
export interface HabitRepository {
  listHabits(options: { includeArchived: boolean }): Promise<HabitRecord[]>;
  getHabit(id: string): Promise<HabitRecord | null>;
  findHabitByName(name: string): Promise<HabitRecord | null>;
  createHabit(draft: HabitDraft): Promise<HabitRecord>;
  updateHabit(id: string, changes: HabitChanges): Promise<HabitRecord | null>;
  archiveHabit(id: string, archivedAt: string): Promise<HabitRecord | null>;
  unarchiveHabit(id: string): Promise<HabitRecord | null>;
  /** 连带清空该习惯的全部打卡 */
  deleteHabit(id: string): Promise<boolean>;
  maxPosition(): Promise<number>;

  /** 含两端 */
  listCheckins(habitId: string, from: string, to: string): Promise<CheckinRecord[]>;
  /** 今日视图一次查完多个习惯，避免 N+1 */
  listCheckinsFor(
    habitIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, CheckinRecord[]>>;
  /** 按 `(habitId, date)` 幂等 upsert */
  upsertCheckin(habitId: string, date: string, value: number): Promise<CheckinRecord>;
  deleteCheckin(habitId: string, date: string): Promise<boolean>;
}
