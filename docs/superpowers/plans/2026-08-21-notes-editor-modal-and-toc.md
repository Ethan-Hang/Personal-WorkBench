# 沉浸式便签编辑器、快捷格式工具栏、右侧可折叠大纲 TOC 与实时防抖自动保存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现沉浸式便签编辑器、快捷格式工具栏、右侧可折叠大纲 TOC、500ms 实时防抖自动落库及待办/标签/色彩/置顶全套元数据联动。

**Architecture:** 组件分层设计：`NoteFormatToolbar` 提供 Markdown 语法插入与快捷键辅助；`NoteOutlineToc` 基于 `extractToc` 与视口监听实现带 Scroll Spy 的层级目录；`NoteEditor` 聚合编辑/分栏/阅读三视图并管理 500ms 防抖保存状态机；`NoteEditorModal` 包装弹窗与沉浸全屏。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-notes-module-design.md §5`

## Global Constraints

- 遵循模块三铁律：仅依赖 `@workbench/core` 与 `@workbench/ui`。
- 修改正文必须附带 `revision` 乐观锁；409 冲突时保护本地草稿。
- 自动保存防抖时间严格为 500ms，支持 Ctrl+S 立即保存与卸载/关闭时 flush。

---

### Task 1: 格式化工具栏与 Markdown 文本操作辅助函数 (`NoteFormatToolbar`)

**Files:**

- Create: `modules/notes/src/ui/components/NoteFormatToolbar.tsx`
- Test: `modules/notes/src/ui/components/NoteFormatToolbar.test.ts`

**Interfaces:**

- Produces: `NoteFormatToolbar`, `applyMarkdownFormat`, `getFormatSnippet`

- [ ] **Step 1: 编写格式化辅助函数测试**
- [ ] **Step 2: 实现 `NoteFormatToolbar.tsx` 及格式包裹/插入逻辑**
- [ ] **Step 3: 运行测试验证通过**

---

### Task 2: 右侧可折叠大纲目录 (`NoteOutlineToc`)

**Files:**

- Create: `modules/notes/src/ui/components/NoteOutlineToc.tsx`
- Test: `modules/notes/src/ui/components/NoteOutlineToc.test.ts`

**Interfaces:**

- Produces: `NoteOutlineToc`, `calculateActiveHeadingId`

- [ ] **Step 1: 编写大纲组件及层级/激活项计算测试**
- [ ] **Step 2: 实现 `NoteOutlineToc.tsx`（层级缩进、折叠控制、平滑跳转、Scroll Spy 监听）**
- [ ] **Step 3: 运行测试验证通过**

---

### Task 3: 沉浸式便签编辑器与防抖自动保存 (`NoteEditor` & `NoteEditorModal`)

**Files:**

- Create: `modules/notes/src/ui/components/NoteEditor.tsx`
- Create: `modules/notes/src/ui/components/NoteEditorModal.tsx`
- Test: `modules/notes/src/ui/components/NoteEditor.test.ts`
- Modify: `modules/notes/src/ui/index.tsx`

**Interfaces:**

- Produces: `NoteEditor`, `NoteEditorModal`, `computeNoteStats`, `formatReadingTime`

- [ ] **Step 1: 编写编辑器状态与统计计算测试**
- [ ] **Step 2: 实现 `NoteEditor.tsx` 与 `NoteEditorModal.tsx`**
- [ ] **Step 3: 更新 `modules/notes/src/ui/index.tsx` 统一导出**
- [ ] **Step 4: 运行全量测试验证**

---

### Task 4: 飞书多维表格数据回填与依赖解锁

- [ ] **Step 1: 运行 `npm run check` 四步全绿**
- [ ] **Step 2: 提交代码并记录 8 位 Commit Hash**
- [ ] **Step 3: 调用 lark-cli 将 TASK-064 状态更新为「待测试」并写入 Hash 与备注**
- [ ] **Step 4: 调用 lark-cli 将依赖任务 TASK-065 与 TASK-066 状态从「阻塞」更新为「待办」并更新备注**
