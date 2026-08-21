import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { NOTE_STATUSES } from '../contract.js';

/**
 * notes 模块的自有表。表名前缀 = moduleId 把连字符换成下划线再加 `_`（此处即 `notes_`）。
 *
 * 外键方向恒为**模块 → core**：只有 `notes_todo_links.todo_item_id` 指向 core 的
 * `items`，core 的建表语句里不存在任何模块名称（spec §5.4）。
 */

/**
 * 文件夹树。**无限级**：靠 `parent_id` 自引用，不存路径也不存深度。
 *
 * 存路径（materialized path）会让「重命名一个中间节点」变成一次全子树重写；
 * 便签量级下，把整棵树读进内存再组装反而更简单也更不容易写错。环的防护在
 * service 层（移动前先算祖先链），SQL 层管不了。
 */
export const notesFolders = sqliteTable(
  'notes_folders',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** 父文件夹 id，NULL = 顶级。自引用外键，删除策略由 service 决定（子项上移） */
    parentId: text('parent_id'),
    /** 自定义 Emoji/图标，纯展示 */
    icon: text('icon').notNull().default('📁'),
    /** 语义色名，不是十六进制 */
    color: text('color'),
    /** 同一父节点下的排序位，从 0 起。不设唯一约束——重排时会短暂重复 */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check('ck_notes_folders_sort_order', sql`${table.sortOrder} >= 0`),
    index('idx_notes_folders_parent_id').on(table.parentId),
  ],
);

/**
 * 便签主表。
 *
 * 三个字段值得单独说：
 *
 * - `revision`：乐观锁。编辑器是**防抖自动保存**的，同一条便签在两个标签页里
 *   同时开着并不罕见；没有它，后写的一方会静默覆盖先写的一方，而两边都看不到
 *   任何异常。写入时带上读到的 revision，对不上就 409。
 * - `excerpt`：正文去标记后的前 120 字符，**冗余存储**。卡片流一屏几十张卡，
 *   现算摘要要把每条便签的完整 Markdown 都读出来再解析；这里用一列换掉那次全表读。
 * - `metadata`：JSON 扩展槽，只放编辑器偏好（光标位置、折叠状态这类）。
 *   **不放任何需要被查询的东西**——那是 EAV 的入口，本项目已明确否决（spec §5.5）。
 *
 * 时间列全部是 **UTC ISO8601 时刻**（`Z` 后缀 + 三位毫秒）。便签里没有任何
 * 「浮动日期」概念：创建/修改/进回收站都是真实发生的时刻，不是日历日。
 */
export const notesRecords = sqliteTable(
  'notes_records',
  {
    id: text('id').primaryKey(),
    /** 关联 notes_folders.id，NULL = 未分类。文件夹被删时由 service 改写，不靠级联 */
    folderId: text('folder_id'),
    /** 乐观锁版本号，每次内容更新 +1 */
    revision: integer('revision').notNull().default(1),
    title: text('title').notNull().default(''),
    /** 完整 Markdown 原文 */
    content: text('content').notNull().default(''),
    /** 纯文本摘要，由 service 从 content 派生 */
    excerpt: text('excerpt').notNull().default(''),
    color: text('color').notNull().default('yellow'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('active'),
    /** JSON 扩展槽，只放编辑器偏好，不放可查询字段 */
    metadata: text('metadata').notNull().default('{}'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    /** 进回收站的时刻；status 不为 trashed 时恒为 NULL */
    trashedAt: text('trashed_at'),
  },
  (table) => [
    // 用 sql.raw 而非模板插值：`sql`${status}`` 会绑定成参数，DDL 里就会出现
    // `IN (?, ?, ?)`，建表语句拿不到真实取值。
    check(
      'ck_notes_records_status',
      sql.raw(`status IN (${NOTE_STATUSES.map((status) => `'${status}'`).join(', ')})`),
    ),
    check('ck_notes_records_revision', sql`${table.revision} >= 1`),
    // 颜色**刻意不加 CHECK**：主题层加一个色名不该需要一次数据库迁移。
    // 取值由 contract 的 Zod 在接缝处挡住，那里改一行就够了。
    index('idx_notes_records_folder_id').on(table.folderId),
    index('idx_notes_records_status_updated_at').on(table.status, table.updatedAt),
    index('idx_notes_records_pinned').on(table.isPinned),
  ],
);

/**
 * 标签：**便签内部概念**，不跨模块。
 *
 * 与 todo 的标签刻意各存一份：跨模块标签需要标签成为 core 级概念（ADR-0014
 * 已就同一问题做过一次决定）。这里的标签直接挂在便签上，没有独立的标签实体表——
 * 标签的全部属性就是它的名字，抽一张主表只会多一次 JOIN。
 */
export const notesTags = sqliteTable(
  'notes_tags',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notesRecords.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    // 同一条便签上同名标签只能有一个；跨便签重名当然允许
    unique('uq_notes_tags_note_name').on(table.noteId, table.name),
    index('idx_notes_tags_name').on(table.name),
  ],
);

/**
 * 便签 ↔ 待办的关联。
 *
 * `todo_item_id` 指向 **core 的 `items`**，不是 todo 模块的任何一张表——
 * 便签不知道 todo 模块存在，它只知道 core 有 Item（铁律 1）。因此这张表
 * 既能关联 todo 派发出的事项，也能关联任何其他模块的 Item。
 *
 * `ON DELETE CASCADE` 是承重的：Item 被源模块彻底删除后，留下的链接会指向一个
 * 查不到的 id，UI 上就成了点不开的死链。
 */
export const notesTodoLinks = sqliteTable(
  'notes_todo_links',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notesRecords.id, { onDelete: 'cascade' }),
    /** 指向 core items.id。FK 在迁移 SQL 里手写，见 migrations/0000_notes.sql */
    todoItemId: text('todo_item_id').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    unique('uq_notes_todo_links_note_item').on(table.noteId, table.todoItemId),
    index('idx_notes_todo_links_item_id').on(table.todoItemId),
  ],
);
