import type { Item, ItemKind, ItemStatus, Importance, ScheduledTime } from './item.js';
import type { IsoInstant } from './time.js';

export interface CreateItemInput {
  kind: ItemKind;
  title: string;
  notes?: string | null;
  status?: ItemStatus;
  importance?: Importance;
  dueAt?: IsoInstant | null;
  scheduled?: ScheduledTime | null;
  estimateMinutes?: number | null;
  goalId?: string | null;
}

export interface UpdateItemPatch {
  title?: string;
  notes?: string | null;
  status?: ItemStatus;
  importance?: Importance;
  dueAt?: IsoInstant | null;
  scheduled?: ScheduledTime | null;
  estimateMinutes?: number | null;
  goalId?: string | null;
  completedAt?: IsoInstant | null;
}

export interface ListItemsQuery {
  /** 排程落在此 UTC 区间内（左闭右开）。由 localDayRange 算出，禁止在 SQL 里换算时区。 */
  scheduledWithin?: { startUtc: IsoInstant; endUtc: IsoInstant };
  /** 全天排程恰为此浮动日期。与 scheduledWithin 同时给出时取并集。 */
  scheduledOnDate?: string;
  /** 全天排程早于或等于此浮动日期。用于把未完成的旧任务带到今天。 */
  scheduledOnOrBeforeDate?: string;
  /** DDL 早于此刻（用于逾期摘要） */
  dueBefore?: IsoInstant;
  statuses?: ItemStatus[];
  sourceModules?: string[];
}

/**
 * core 定义抽象，data 提供实现（spec §9 DIP）。
 * 所有实现必须通过 runItemRepositoryContract 的同一套契约测试（spec §9 LSP）。
 */
export interface ItemRepository {
  create(moduleId: string, input: CreateItemInput): Promise<Item>;
  getById(id: string): Promise<Item | null>;
  update(id: string, patch: UpdateItemPatch): Promise<Item>;
  list(query: ListItemsQuery): Promise<Item[]>;
  /** 模块卸载用：删除某模块产生的全部 Item（spec §5.6），返回删除条数。 */
  deleteBySourceModule(moduleId: string): Promise<number>;
}
