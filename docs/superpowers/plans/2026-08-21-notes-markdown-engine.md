# Typora 级富 Markdown 扩展解析与多容器渲染引擎实现计划（TASK-063）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 为便签模块（modules/notes）实现 Typora 级富 Markdown 解析与多容器渲染引擎，支持 GFM 标准、11 类 Plume 扩展容器、行内富文本增强、KaTeX 公式、Mermaid 图表、媒体嵌入与 TOC 大纲解析。

**Architecture:** 采用本地优先、纯 TypeScript 与 React 的分层设计。包含词法与 AST 解析器、行内标记解析器、TOC 提取器、纯本地矢量二维码生成器与全套 React 交互渲染组件。

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, @workbench/ui, Vitest.

**Spec:** docs/superpowers/specs/2026-08-21-notes-module-design.md §4

## Global Constraints

- 模块间零依赖：modules/notes 仅依赖 @workbench/core 与共享基座，严禁依赖 @workbench/data 或其他业务模块。
- Core 零感知：不修改 packages/core。
- 本地优先与离线安全：所有扩展指令与二维码生成均为纯本地计算，无外网依赖。

---

### Task 1: 声明模块 UI 依赖与 AST 类型定义

**Files:**

- Modify: modules/notes/package.json
- Create: modules/notes/src/ui/markdown/types.ts

- [ ] **Step 1: 在 modules/notes/package.json 中配置 UI 依赖与导出**
- [ ] **Step 2: 创建 AST 节点类型与容器指令定义 ypes.ts**

---

### Task 2: 实现行内扩展解析器（Inline Parser）

**Files:**

- Create: modules/notes/src/ui/markdown/inlineParser.ts
- Test: modules/notes/src/ui/markdown/inlineParser.test.ts

- [ ] *_Step 1: 编写行内扩展语法解析测试用例（高亮 ==、刮刮乐 !!、Badge、图标 :icon:、双链 [[ ]]、行内公式 $、缩写 *[abbr]）*_
- [ ] **Step 2: 实现 parseInlineTokens 与节点构建**
- [ ] **Step 3: 验证所有行内解析测试全绿**

---

### Task 3: 实现块级 Markdown 与 11 类 Plume 容器解析器（Block Parser）

**Files:**

- Create: modules/notes/src/ui/markdown/parser.ts
- Test: modules/notes/src/ui/markdown/parser.test.ts

- [ ] **Step 1: 编写块级与多容器解析测试用例（tip/card/steps/file-tree/tabs/timeline/chat/qrcode/collapse/window/flex/embeds/mermaid/math）**
- [ ] **Step 2: 实现 parseMarkdown 块级解析引擎**
- [ ] **Step 3: 验证块级解析器测试全绿**

---

### Task 4: 实现 TOC 大纲提取器与本地矢量二维码生成器

**Files:**

- Create: modules/notes/src/ui/markdown/toc.ts
- Create: modules/notes/src/ui/markdown/qrcode.ts
- Test: modules/notes/src/ui/markdown/toc.test.ts
- Test: modules/notes/src/ui/markdown/qrcode.test.ts

- [ ] **Step 1: 编写 TOC 提取与唯一 slug 算法单测**
- [ ] **Step 2: 实现 xtractToc**
- [ ] **Step 3: 编写本地矢量二维码 SVG 生成器与单测**
- [ ] **Step 4: 运行测试确保全绿**

---

### Task 5: 构建 React 渲染器与交互组件体系

**Files:**

- Create: modules/notes/src/ui/markdown/renderer.tsx
- Create: modules/notes/src/ui/markdown/index.ts
- Create: modules/notes/src/ui/index.tsx
- Test: modules/notes/src/ui/markdown/renderer.test.ts

- [ ] **Step 1: 编写 React 渲染器组件单测（Tab 切换、Collapse 折叠、Code 复制、双链点击等）**
- [ ] **Step 2: 实现 NoteMarkdownViewer 及所有富文本与容器渲染子组件**
- [ ] **Step 3: 导出模块 UI 入口 modules/notes/src/ui/index.tsx**
- [ ] **Step 4: 运行组件测试验证全绿**

---

### Task 6: 完整质量校验、飞书 Bitable 状态与依赖流转

- [ ] **Step 1: 运行全局全链路检查
      pm run check**
- [ ] **Step 2: Git 提交并提取 8 位 Commit Hash**
- [ ] **Step 3: 通过 Feishu CLI 更新 TASK-063 状态为「待测试」并写入 Hash**
- [ ] **Step 4: 将下游 TASK-064 状态由「阻塞」更新为「待办」，并更新任务备注**
