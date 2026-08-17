import type { IsoInstant, PlainDate } from './time.js';

export type ItemKind = 'task' | 'event';
export type ItemStatus = 'inbox' | 'todo' | 'doing' | 'done' | 'cancelled';
export type Importance = 'high' | 'normal' | 'low';

export const ITEM_KINDS = ['task', 'event'] as const;
export const ITEM_STATUSES = ['inbox', 'todo', 'doing', 'done', 'cancelled'] as const;
export const IMPORTANCES = ['high', 'normal', 'low'] as const;

/**
 * 排程时间（spec §6.3）。
 * 全天事件用浮动日期，绝不转 UTC；定时事件用 UTC instant。
 * 消费者必须穷尽处理两个分支（spec §9 LSP）。
 */
export type ScheduledTime =
  { kind: 'all-day'; date: PlainDate } | { kind: 'timed'; start: IsoInstant; end?: IsoInstant };

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  status: ItemStatus;
  importance: Importance;
  /** DDL，恒为 instant，永不用浮动日期（spec §5.3 决策 ③） */
  dueAt: IsoInstant | null;
  /** 未排程时为 null */
  scheduled: ScheduledTime | null;
  estimateMinutes: number | null;
  /** 迭代 3 引入 Goal 后才会有值 */
  goalId: string | null;
  /** 创建它的模块 id，卸载模块时的清理凭据（spec §5.3 决策 ④） */
  sourceModule: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  completedAt: IsoInstant | null;
}

export const IMPORTANCE_RANK: Record<Importance, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

/**
 * 排序键。两个分支的返回值可直接字典序比较：
 * '2026-09-20' < '2026-09-20T09:00:00.000Z'，故全天事件天然排在当天定时事件之前。
 */
export function scheduledSortKey(s: ScheduledTime): string {
  switch (s.kind) {
    case 'all-day':
      return s.date;
    case 'timed':
      return s.start;
  }
}
