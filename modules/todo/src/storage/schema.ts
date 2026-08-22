import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { RECURRENCE_FREQS } from '../contract.js';

/**
 * todo 模块的自有表。表名前缀 = moduleId 把连字符换成下划线再加 `_`（此处即 `todo_`）。
 *
 * 外键方向恒为**模块 → core**：这里的 `item_id` 指向 core 的 `items`，
 * 而 core 的建表语句里不存在任何模块名称（spec §5.4）。
 */

/**
 * 子任务：纯文本勾选项。
 *
 * **刻意不是 core Item。** 子任务不能单独排程、不上日历、不进回收站——
 * 它只是一条待办内部的检查清单。做成 Item 需要 core 长出 `parentId`，
 * 那是改 core，代价远大于收益（ADR-0025）。
 */
export const todoSubtasks = sqliteTable(
  'todo_subtasks',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull(),
    title: text('title').notNull(),
    /** SQLite 无布尔类型，0/1 存储 */
    done: integer('done').notNull().default(0),
    /** 同一条待办内的排序位，从 0 开始。不设唯一约束——重排时会短暂重复 */
    position: integer('position').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check('ck_todo_subtasks_done', sql`${table.done} IN (0, 1)`),
    check('ck_todo_subtasks_position', sql`${table.position} >= 0`),
    index('idx_todo_subtasks_item_id').on(table.itemId),
  ],
);

/**
 * 标签：**todo 内部概念**，不跨模块。
 *
 * 这条是刻意选的（ADR-0025）：跨模块标签需要标签成为 core 级概念，
 * 秋招的 Item 也要能打标签。代价是工作台今日页看不见也筛不了 todo 的标签——
 * 那需要 workbench 感知 todo 的标签，破铁律 1。
 */
export const todoTags = sqliteTable(
  'todo_tags',
  {
    id: text('id').primaryKey(),
    /** 大小写敏感的唯一名。归一在应用层做，SQL 只做等值比较 */
    name: text('name').notNull().unique(),
    /** 语义色名（如 'amber'），不是十六进制——具体颜色由主题层决定 */
    color: text('color'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [index('idx_todo_tags_name').on(table.name)],
);

/** 待办与标签的多对多关联。复合主键天然去重。 */
export const todoTaskTags = sqliteTable(
  'todo_task_tags',
  {
    itemId: text('item_id').notNull(),
    tagId: text('tag_id')
      .notNull()
      .references(() => todoTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index('idx_todo_task_tags_tag_id').on(table.tagId),
  ],
);

/**
 * 重复规则。**物化策略**：规则本身不是待办，它按需生成真正的 core Item。
 *
 * 选物化而非「1 条 Item + 规则」的理由（ADR-0025）：日历、排程、完成、回收站
 * 全部零改动，core 一行不改。代价是改规则要回写未来实例，以及需要一个物化水位。
 */
export const todoRecurrences = sqliteTable(
  'todo_recurrences',
  {
    id: text('id').primaryKey(),
    /** 生成出来的待办用这些字段 */
    title: text('title').notNull(),
    importance: text('importance').notNull().default('normal'),
    notes: text('notes'),

    freq: text('freq', { enum: RECURRENCE_FREQS }).notNull(),
    /** 每 N 个周期一次。1 = 每周，2 = 每两周 */
    interval: integer('interval').notNull().default(1),
    /** weekly 用：JSON 数组，0=周日 … 6=周六，如 "[1,3,5]" */
    byWeekday: text('by_weekday'),
    /** monthly 用：几号。超出当月天数的月份跳过（2/31 不存在就不生成） */
    byMonthday: integer('by_monthday'),

    /** 浮动日期，绝不转 UTC。重复只按本地日推进 */
    startDate: text('start_date').notNull(),
    /** 含此日；null 表示无限重复 */
    untilDate: text('until_date'),
    /** 已物化到哪一天（含）。null 表示还没物化过 */
    materializedThrough: text('materialized_through'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check('ck_todo_recurrences_freq', sql`${table.freq} IN ('daily', 'weekly', 'monthly')`),
    check('ck_todo_recurrences_interval', sql`${table.interval} > 0`),
    check(
      'ck_todo_recurrences_monthday',
      sql`${table.byMonthday} IS NULL OR (${table.byMonthday} >= 1 AND ${table.byMonthday} <= 31)`,
    ),
  ],
);

/**
 * 物化出来的实例与规则的关联。
 *
 * 单独一张表而不是往 core 的 items 加列——**core 永不感知模块**（铁律 2）。
 * 复合唯一（recurrence_id, occurrence_date）挡住重复物化：物化是幂等的，
 * 因为它会在每次 listToday 时被触发。
 */
export const todoRecurrenceItems = sqliteTable(
  'todo_recurrence_items',
  {
    recurrenceId: text('recurrence_id')
      .notNull()
      .references(() => todoRecurrences.id, { onDelete: 'cascade' }),
    /** 该实例属于哪一个本地日，浮动日期 */
    occurrenceDate: text('occurrence_date').notNull(),
    itemId: text('item_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recurrenceId, table.occurrenceDate] }),
    index('idx_todo_recurrence_items_item_id').on(table.itemId),
  ],
);
