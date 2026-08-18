# 个人工作台 (Personal WorkBench)

本地优先的高性能个人工作台系统。当前已实现日历排程、今日工作台任务生命周期闭环（创建、编辑、排序、完成、取消完成、软删除回收站、彻底销毁）以及全链路平滑动效系统。

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173

服务端在 3000 端口，前端 5173 通过 Vite 代理转发 `/api`，浏览器统一走单一同源。

## 常用命令

| 命令                  | 作用                                                |
| --------------------- | --------------------------------------------------- |
| `npm run dev`         | 同时启动后端与前端                                  |
| `npm run check`       | 格式 + 类型 + lint + 测试（提交前跑这个，必须全绿） |
| `npm run test`        | 运行全部 Vitest 自动化测试 (200+ tests)             |
| `npm run format`      | 使用 Prettier 自动格式化代码                        |
| `npm run db:generate` | 改完 `packages/data/src/schema.ts` 后生成迁移       |

## 数据存储

本地 SQLite 数据库保存在 `data/local/workbench.db`（已在 `.gitignore` 中）。删掉它即可从空库重来。

## 核心交互与体验特性

1. **定制整合型日期选择器 (`DatePicker`)**：
   - 整合输入框与日历 Popper，支持键盘 `YY/MM/DD` 智能掩码直输与日历点击双向同步；
   - 具有失焦合法性校验与即时错误细框提示；
   - 支持智能视口高度感知（底部空间不足时自动向上翻转）与模态弹窗层级提权（`z-[60]`，消除被遮挡问题）。

2. **待办事项全生命周期闭环**：
   - **完成与已完成归集**：完成事项自动进入专属折叠区域，可随时点击一键重新打开；
   - **真实执行度闭环**：今日执行度卡片独立计算 `已完成 / (进行中 + 已完成)` 真实百分比，并由 0 启动缓动插值；
   - **软删除回收站**：复用 `cancelled` 状态（见 `ADR-0009`），支持单项恢复/彻底销毁、多选批量恢复/销毁、全部恢复/清空，并配备撤销 Toast。

3. **高性能 GPU 硬件加速动效体系**：
   - **时序关键帧动效**：待办完成采用纯 CSS `@keyframes taskCompleteGlideOut`（打勾亮起 → `translate3d` 匀速滑出 → 高度坍缩）；
   - **状态隔离**：高频缓动循环封装在 `TodayExecutionCard` 内部，消灭 60fps 全量 React VDOM 重绘与掉帧卡顿；
   - **乐观同步更新**：动效结束瞬间由 `queryClient.setQueryData` 乐观更新本地缓存，彻底消除异步网络回拉延时导致的「瞬间闪现回跳」；
   - **全场景 0 ↔ 1 动效**：逾期警告横幅、待办列表与已完成折叠区在「0 到 1 产生」与「1 到 0 清空」全生命周期均具备平滑展开与折叠离场动效。

## 要改代码先读什么

1. `docs/superpowers/specs/2026-08-17-personal-workbench-design.md` — 架构设计与功能规范
2. `docs/adr/` — 十一条架构决策记录（ADR）。**动 core 之前必读**。其中
   `docs/adr/0005-module-boundaries.md` 记录了三条铁律里唯一 lint 不强制的一条（铁律 3：模块自带迁移与注册项）——这条靠人守，不靠 CI。

## 加一个新模块

1. 在 `modules/<name>/` 建目录，参照 `modules/todo/` 的结构
2. 在 `packages/server/src/index.ts` 的 modules 数组加一项
3. 在 `packages/web/src/modules.ts` 的 uiModules 数组加一项
4. 在该模块的 `package.json` 里声明它自己的依赖：本地工作区包写 `"*"`，
   安装用 `npm install <pkg> -w <workspace>`；运行期真正 import 的进 `dependencies`，
   仅测试或仅类型用途的进 `devDependencies`。见
   `docs/adr/0006-workspace-dependency-declaration.md`
5. 模块自己的迁移放在自己目录下、写进 `ServerModuleDefinition.migrations`，
   **不要放进 core 的集中目录**

三条铁律里，**前两条由 ESLint 强制**，违反会在 `npm run lint` 时报错：

- **模块只能依赖 core，模块之间零依赖** —— import 别的模块或直连 `@workbench/data` 会被拦
- **core 永不感知模块** —— 在 core 里 import 任何外层都会被拦

第三条 **模块自带迁移与注册项** 没有任何自动检查，只能靠人守。把某个模块的迁移搬进 core 的集中目录，lint 和 CI 都不会报错，但「删模块 = 删一个目录 + 删一行注册」这个承诺就此失效。详见 `docs/adr/0005-module-boundaries.md`。

**如果加模块时你发现必须改 `packages/core/`，停下来想清楚**——这通常意味着某个 core 的假设错了，值得记一条新的 ADR。

## 架构决策记录 (ADRs) 索引

- `docs/adr/0001-local-first-architecture.md` — 本地优先架构
- `docs/adr/0002-unified-item-model.md` — 统一 Item 模型
- `docs/adr/0003-derived-urgency.md` — 动态衍生紧迫度
- `docs/adr/0004-time-storage.md` — 时间与时区存储规范
- `docs/adr/0005-module-boundaries.md` — 模块边界铁律
- `docs/adr/0006-workspace-dependency-declaration.md` — 工作区依赖显式声明
- `docs/adr/0007-module-scoped-item-deletion.md` — 模块级数据删除边界
- `docs/adr/0008-module-owned-storage-adapters.md` — 模块自有存储适配器
- `docs/adr/0009-todo-trash-reuses-cancelled-status.md` — 回收站复用 cancelled 状态
- `docs/adr/0010-todo-completion-and-reopen-lifecycle.md` — 待办完成、重开与已完成归集生命周期
- `docs/adr/0011-optimistic-ui-and-hardware-accelerated-animations.md` — 乐观缓存同步与 GPU 动效架构
