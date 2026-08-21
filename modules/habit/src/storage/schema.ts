import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { FREQ_KINDS } from '../contract.js';

/**
 * habit 模块的自有表。表名前缀 = moduleId 把连字符换成下划线再加 `_`（此处即 `habit_`）。
 *
 * **两张表里没有一个 `item_id`。** 这是习惯与 todo、秋招的根本差别：习惯不投影成
 * core Item，因此「外键方向恒为模块 → core」这条铁律在这里表现为「一条外键都不需要」
 * （ADR-0023）。习惯是第一个「有自有表、但零 core Item」的模块。
 */
export const habitDefinitions = sqliteTable(
  'habit_definitions',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    notes: text('notes'),
    /** 布尔习惯即 1 —— 不做两套模型，勾一下等于把 value 加到 1 */
    targetValue: integer('target_value').notNull().default(1),
    /** '分钟' / '杯'，纯展示 */
    unit: text('unit'),
    freqKind: text('freq_kind').notNull(),
    /** '1,3,5'，ISO 周几（1=周一）。仅 weekdays 频率使用 */
    weekdays: text('weekdays'),
    /** 仅 weekly-count 频率使用 */
    weeklyCount: integer('weekly_count'),
    /**
     * **浮动日期** `YYYY-MM-DD`。「从哪天起算」是日历概念，转 UTC 会在某些时区
     * 整体偏一天。
     */
    startDate: text('start_date').notNull(),
    /**
     * **UTC 时刻**，NULL = 启用中。与 `start_date` 刻意不同类型：
     * 「什么时候按下归档」是真实时刻，不是日历日。
     */
    archivedAt: text('archived_at'),
    /** 语义色名（如 'amber'），不是十六进制——具体颜色由主题层决定 */
    colorToken: text('color_token'),
    /** 卡片内排序位，从 0 起。不设唯一约束——重排时会短暂重复 */
    position: integer('position').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check('ck_habit_definitions_target', sql`${table.targetValue} >= 1`),
    check('ck_habit_definitions_position', sql`${table.position} >= 0`),
    // 用 sql.raw 而非模板插值：`sql`${kind}`` 会绑定成参数，DDL 里就会出现
    // `IN (?, ?, ?)`，建表语句拿不到真实取值。
    check(
      'ck_habit_definitions_freq',
      sql.raw(`freq_kind IN (${FREQ_KINDS.map((kind) => `'${kind}'`).join(', ')})`),
    ),
    check(
      'ck_habit_definitions_weekly_count',
      sql`${table.weeklyCount} IS NULL OR (${table.weeklyCount} BETWEEN 1 AND 7)`,
    ),
    index('idx_habit_definitions_archived_at').on(table.archivedAt),
  ],
);

/**
 * 打卡记录：**只存真的发生过的打卡**。没打卡的日子不占一行（ADR-0023 §2）。
 *
 * 复合主键 `(habit_id, date)` 让打卡天然幂等——连点五次不会造出五行，
 * 与 `todo_recurrence_items` 是同一个把戏。
 */
export const habitCheckins = sqliteTable(
  'habit_checkins',
  {
    habitId: text('habit_id').notNull(),
    /** **浮动日期** `YYYY-MM-DD`，绝不转 UTC */
    date: text('date').notNull(),
    value: integer('value').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.habitId, table.date] }),
    check('ck_habit_checkins_value', sql`${table.value} >= 0`),
    index('idx_habit_checkins_date').on(table.date),
  ],
);
