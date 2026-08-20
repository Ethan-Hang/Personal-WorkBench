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
  /**
   * 全天排程落在此浮动日期区间内（**含两端**）。与上面三个排程条件取并集。
   * 日历的周 / 月视图靠它 + `scheduledWithin` 一次拿全全天与定时两类事项。
   * 浮动日期不转 UTC（spec §6.2），所以这里是纯字符串比较，与 `scheduledWithin` 的时刻区间不同。
   */
  scheduledDateBetween?: { from: string; to: string };
  /**
   * 只取尚未排程的 Item（`scheduled === null`）。
   * 与其他条件取**交集**，不参与上面三个排程条件的并集——
   * 「未排程」与「排在某时段」互斥，同时给出必然空结果。
   * `false` 与缺省同义：不施加任何过滤。
   */
  unscheduled?: boolean;
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
  /** 删除调用模块拥有的单条 Item；不存在或不属于调用方均返回 false。 */
  delete(moduleId: string, id: string): Promise<boolean>;
  /** 模块卸载用：删除某模块产生的全部 Item（spec §5.6），返回删除条数。 */
  deleteBySourceModule(moduleId: string): Promise<number>;
}
