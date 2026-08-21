# 便签模块架构与设计规范（Notes Module Design Specification）

- **作者**：Ethan-Hang & Antigravity
- **日期**：2026-08-21
- **关联需求**：TASK-042（便签板块需求）
- **拆解子任务**：TASK-060 ~ TASK-067
- **模块路径**：`modules/notes/`

---

## 1. 背景与目标

为本地优先个人工作台新增独立一级业务模块 **便签（Notes）**。
深度对标 Typora 写作体验与 WPS 便签卡片流，支持 VuePress Plume / Obsidian 级高级 Markdown 扩展、无限级树状文件夹管理、右侧可折叠大纲目录（TOC）、全格式导出（PNG 长图/PDF/Markdown/HTML），并与工作台待办系统（Todo）实现双向无缝联动。

### 核心设计原则（三铁律）

1. **模块间零依赖**：`modules/notes` 仅依赖 `@workbench/core`，不直接 import 任何其他模块或 `@workbench/data`。
2. **Core 零感知**：Core 领域层无需做侵入式修改。
3. **自包含迁移与组合根接入**：模块自带独立 Drizzle Schema、迁移脚本与仓储实现，分别在 `packages/server` 与 `packages/web` 组合根以一行代码接入。

---

## 2. 数据模型设计（SQLite + Drizzle）

所有数据表前缀为 `notes_`，定义于 `modules/notes/src/storage/schema.ts`。

### 2.1 文件夹表（`notes_folders`）

```typescript
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const notesFolders = sqliteTable('notes_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'), // 父文件夹 ID，null 为顶级
  icon: text('icon').default('📁'), // 自定义 Emoji/图标
  color: text('color'), // 文件夹标识色
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull(), // UTC ISO8601
  updatedAt: text('updated_at').notNull(),
});
```

### 2.2 便签主表（`notes_records`）

```typescript
export const notesRecords = sqliteTable('notes_records', {
  id: text('id').primaryKey(),
  folderId: text('folder_id'), // 关联 notes_folders.id，null 为未分类
  revision: integer('revision').default(1).notNull(), // 乐观锁与并发控制
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''), // 完整 Markdown 原文
  excerpt: text('excerpt').notNull().default(''), // 纯文本前 120 字符摘要
  color: text('color').notNull().default('yellow'), // yellow | green | blue | purple | pink | gray
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false).notNull(),
  status: text('status').notNull().default('active'), // active | archived | trashed
  metadata: text('metadata').notNull().default('{}'), // JSON 扩展槽（存储编辑器偏好、光标位置等）
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  trashedAt: text('trashed_at'),
});
```

### 2.3 标签与待办关联表（`notes_tags`, `notes_todo_links`）

```typescript
export const notesTags = sqliteTable('notes_tags', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull(), // 关联 notes_records.id
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const notesTodoLinks = sqliteTable('notes_todo_links', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull(), // 关联 notes_records.id
  todoItemId: text('todo_item_id').notNull(), // 指向 Core items.id
  createdAt: text('created_at').notNull(),
});
```

---

## 3. 版本化 API 契约设计（`NOTES_API_V1`）

定义于 `modules/notes/src/contract.ts`：

```typescript
export const NOTES_API_V1 = {
  // 便签 CRUD 与查询
  notes: '/api/v1/notes',
  note: (id: string) => `/api/v1/notes/${encodeURIComponent(id)}`,

  // 文件夹树与操作
  folders: '/api/v1/notes/folders',
  folder: (id: string) => `/api/v1/notes/folders/${encodeURIComponent(id)}`,

  // 批量操作管道
  batch: '/api/v1/notes/batch',

  // 聚合元数据
  tags: '/api/v1/notes/tags',
  stats: '/api/v1/notes/stats',

  // 导出接口
  export: (id: string) => `/api/v1/notes/${encodeURIComponent(id)}/export`,

  // 待办联动
  todoLinks: (id: string) => `/api/v1/notes/${encodeURIComponent(id)}/todos`,
  todoLink: (id: string, todoId: string) =>
    `/api/v1/notes/${encodeURIComponent(id)}/todos/${encodeURIComponent(todoId)}`,
  createTodo: (id: string) => `/api/v1/notes/${encodeURIComponent(id)}/create-todo`,
};
```

---

## 4. Typora 级富 Markdown 扩展语法引擎

支持标准的 GFM 以及 VuePress Plume / Obsidian 扩展规范：

1. **容器指令（`::: directive [title]`）**：
   - `::: tip`, `::: warning`, `::: danger`, `::: note`, `::: info`, `::: details`
   - `::: card title="..." link="..." icon="..."`
   - `::: steps`（分步教程）
   - `::: file-tree`（目录树渲染）
   - `::: tabs` / `::: code-tree`（多选项卡代码组）
   - `::: timeline`（垂直时间线）
   - `::: chat`（双向对话气泡）
   - `::: qrcode [内容]`（实时矢量二维码）
   - `::: collapse title="..."`（手风琴折叠）
   - `::: window title="..."`（macOS 拟态窗口）
   - `::: flex`（多列响应式排版）
2. **行内语法增强**：
   - `==马克笔高亮==`
   - `!!刮刮乐隐秘文本!!`
   - `*[术语]: 解释`（内容注释缩写）
   - `<Badge text="..." type="..." />`
   - `:icon:lucide:rocket:`（Iconify 海量矢量图标）
   - `[[双链便签]]`（Obsidian 兼容）
3. **图表与媒体**：
   - KaTeX 数学公式（`$inline$` 与 `$$block$$`）
   - Mermaid 图表（流程图、时序图、甘特图、脑图等）
   - 资源嵌入：`::: bilibili [bvid]`、`::: youtube [id]`、`::: pdf [url]`

---

## 5. UI/UX 布局与核心交互

1. **双视图体系**：
   - **自适应变高瀑布流（Masonry Grid）**：固定列宽（280px~320px），卡片高度根据正文/代码/图表内容自适应延展，错落有致。
   - **经典横条列表（Classic List View）**：高密度紧凑清单，方便快速批量检索管理。
2. **便签主题色彩**：
   - 经典便签黄（`yellow`）、薄荷浅绿（`green`）、晴空浅蓝（`blue`）、淡薰衣草紫（`purple`）、樱花淡粉（`pink`）、柔和素灰（`gray`）。
3. **右侧可折叠大纲（TOC）**：
   - 自动解析 H1~H6 标题，生成带层级缩进的可视化大纲。
   - 带有 `IntersectionObserver` 滚动监听高亮（Scroll Spy）与平滑滚动跳转。
4. **多格式导出引擎**：
   - 导出为 PNG 高清长图分享卡片。
   - 导出为分页排版优化的 PDF 文档。
   - 导出为 UTF-8 `.md` 文件与离线单文件 HTML。
5. **待办联动**：
   - 便签内快速关联已有 Todo，并展示完成状态。
   - 一键将便签内容转化为带有回链的 Todo 事项。

---

## 6. 飞书多维表格子任务拆解矩阵

| 任务编号     | 任务标题                                                                            | 归属 | 优先级 | 初始状态                           |
| :----------- | :---------------------------------------------------------------------------------- | :--- | :----- | :--------------------------------- |
| **TASK-060** | 便签数据建模、多级文件夹树、Drizzle Schema、迁移与 SQLite 仓储层                    | 后端 | P1-高  | **待办**                           |
| **TASK-061** | 便签与文件夹业务 Service、版本化路由 (`/api/v1/notes`)、批量管道与集成测试          | 后端 | P1-高  | **阻塞** (依赖 TASK-060)           |
| **TASK-062** | 前端 API 传输层 SDK、Zod 契约校验与防 415 守卫测试                                  | 前端 | P1-高  | **阻塞** (依赖 TASK-061)           |
| **TASK-063** | Typora 级富 Markdown 扩展解析与多容器渲染引擎                                       | 前端 | P1-高  | **阻塞** (依赖 TASK-062)           |
| **TASK-064** | 沉浸式便签编辑器、快捷格式工具栏、右侧可折叠大纲 TOC 与实时防抖自动保存             | 前端 | P1-高  | **阻塞** (依赖 TASK-063)           |
| **TASK-065** | 多级文件夹树侧栏、双视图体系（自适应多尺寸瀑布流 + 经典条状列表）、便签卡片流与筛选 | 前端 | P1-高  | **阻塞** (依赖 TASK-064)           |
| **TASK-066** | 多格式导出引擎（PNG 高清长图、PDF 文档、Markdown 源文件、独立 HTML）                | 前端 | P2-中  | **阻塞** (依赖 TASK-064)           |
| **TASK-067** | 便签与待办（Todo）双向联动打通、主导航挂载与全流程端到端集成验证                    | 全栈 | P1-高  | **阻塞** (依赖 TASK-065, TASK-066) |
