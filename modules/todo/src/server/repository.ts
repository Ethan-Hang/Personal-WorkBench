import type { Importance } from '@workbench/core';
import type { RecurrenceFreq, TagColor } from '../contract.js';

/**
 * todo 自有表的仓储接口，由 core 之外、模块之内拥有。
 *
 * 接口定义在 server/ 而实现在 storage/：service 只认这个接口，拿不到数据库句柄，
 * 连接由组合根注入（ADR-0008）。storage 的适配器不得 import `@workbench/data`。
 */

export interface SubtaskRecord {
  id: string;
  itemId: string;
  title: string;
  /** SQLite 存 0/1，适配器负责与布尔互转 */
  done: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagRecord {
  id: string;
  name: string;
  color: TagColor | null;
  createdAt: string;
}

export interface RecurrenceRecord {
  id: string;
  title: string;
  importance: Importance;
  notes: string | null;
  freq: RecurrenceFreq;
  interval: number;
  /** JSON 编码的 number[]，仅 weekly 有值 */
  byWeekday: string | null;
  byMonthday: number | null;
  startDate: string;
  untilDate: string | null;
  materializedThrough: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SubtaskChanges = Partial<Pick<SubtaskRecord, 'title' | 'done' | 'position'>>;
export type TagChanges = Partial<Pick<TagRecord, 'name' | 'color'>>;
export type RecurrenceChanges = Partial<
  Pick<RecurrenceRecord, 'title' | 'importance' | 'notes' | 'untilDate' | 'materializedThrough'>
>;

export interface TodoRepository {
  /* ── 子任务 ── */
  listSubtasksByItemIds(itemIds: string[]): Promise<SubtaskRecord[]>;
  getSubtask(id: string): Promise<SubtaskRecord | null>;
  insertSubtask(record: SubtaskRecord): Promise<void>;
  updateSubtask(id: string, changes: SubtaskChanges): Promise<SubtaskRecord>;
  deleteSubtask(id: string): Promise<boolean>;
  /** 某待办下一个可用的 position（现有最大值 + 1，空则 0） */
  nextSubtaskPosition(itemId: string): Promise<number>;
  deleteSubtasksByItemId(itemId: string): Promise<number>;

  /* ── 标签 ── */
  listTags(): Promise<TagRecord[]>;
  getTag(id: string): Promise<TagRecord | null>;
  findTagByName(name: string): Promise<TagRecord | null>;
  insertTag(record: TagRecord): Promise<void>;
  updateTag(id: string, changes: TagChanges): Promise<TagRecord>;
  deleteTag(id: string): Promise<boolean>;
  /** 返回 itemId → tagId[]，供批量组装视图 */
  listTagIdsByItemIds(itemIds: string[]): Promise<Array<{ itemId: string; tagId: string }>>;
  setItemTags(itemId: string, tagIds: string[]): Promise<void>;
  clearItemTags(itemId: string): Promise<void>;

  /* ── 重复 ── */
  listRecurrences(): Promise<RecurrenceRecord[]>;
  getRecurrence(id: string): Promise<RecurrenceRecord | null>;
  insertRecurrence(record: RecurrenceRecord): Promise<void>;
  updateRecurrence(id: string, changes: RecurrenceChanges): Promise<RecurrenceRecord>;
  deleteRecurrence(id: string): Promise<boolean>;
  /** 已物化的实例；用于幂等与「哪条 Item 属于哪条规则」的反查 */
  listRecurrenceItems(
    recurrenceId: string,
  ): Promise<Array<{ occurrenceDate: string; itemId: string }>>;
  linkRecurrenceItem(recurrenceId: string, occurrenceDate: string, itemId: string): Promise<void>;
  listRecurrenceIdsByItemIds(
    itemIds: string[],
  ): Promise<Array<{ itemId: string; recurrenceId: string }>>;
  unlinkRecurrenceItems(itemIds: string[]): Promise<void>;
}
