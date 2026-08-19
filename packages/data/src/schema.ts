import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { IMPORTANCES, ITEM_KINDS, ITEM_STATUSES } from '@workbench/core';

/**
 * core 的统一事项表（spec §5.2）。
 * 时间列全部为 TEXT：instant 存 UTC ISO8601，全天排程存浮动日期 YYYY-MM-DD（spec §6）。
 * 注意：这里没有任何模块的名字 —— core 永不感知模块（spec §4.2 铁律 2）。
 */
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ITEM_KINDS }).notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('todo'),
    importance: text('importance', { enum: IMPORTANCES }).notNull().default('normal'),
    /** DDL，恒为 UTC ISO8601 instant */
    dueAt: text('due_at'),
    /** 1 时 scheduled_start 存浮动日期，0 时存 UTC instant */
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    scheduledStart: text('scheduled_start'),
    scheduledEnd: text('scheduled_end'),
    estimateMinutes: integer('estimate_minutes'),
    /** 迭代 3 引入 goals 表后再加外键约束 */
    goalId: text('goal_id'),
    sourceModule: text('source_module').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    completedAt: text('completed_at'),
  },
  (t) => [
    index('idx_items_scheduled_start').on(t.scheduledStart),
    index('idx_items_due_at').on(t.dueAt),
    index('idx_items_status').on(t.status),
    index('idx_items_source_module').on(t.sourceModule),
  ],
);

/**
 * 应用级设置（core 的第二张表）。
 *
 * KV 而非固定单行宽表：设置项是增长最快的东西，宽表意味着每加一项都要 db:generate。
 * 代价是 SQL 层无类型——可接受，因为设置永远整表读取、由 core 的 codec 解析，
 * 从不参与 SQL 层的筛选或排序。
 *
 * 这与已否决的 EAV 不冲突：那条针对的是**业务实体**的万能键值表。
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  /** JSON.stringify 后的值。'"dark"' / 'false' / '"Asia/Shanghai"' */
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
