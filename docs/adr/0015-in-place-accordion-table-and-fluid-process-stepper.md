# ADR-0015: In-Place Accordion Table with Sticky Pinned Header and Fluid Process Stepper

## Status

Accepted

## Context

在「秋招求职工作台」（`modules/campus-recruit`）的高频操作场景中，求职者需要管理几十家甚至上百家目标企业的投递、笔试、多轮面试与录取结果。
传统的侧滑抽屉（Slide-over Drawer）和弹窗模态（Modal）存在以下交互瓶颈：

1. **割裂上下文**：侧滑抽屉遮挡了当前列表的上下行对比与定位，频繁点开/关闭造成视觉跳跃；
2. **滚动迷失**：当展开多项详情或浏览长列表时，表头与搜索/筛选控制区随整页滚出视口，用户无法感知当前列含义，且无法就地进行筛选或批量操作；
3. **流程进展不直观**：纯表格或纯抽屉形式难以一眼纵览从「网申投递 → 笔试测评 → 各轮面试 → 终局录取」的全生命周期推进程度；
4. **侧边栏下沉问题**：当主内容高度被大量展开内容撑长（>2000px）时，传统 static/flex 侧边栏会导致底部的系统设置与状态掉出视口。

## Decision

我们决定确立以下 UI 交互与架构规范：

### 1. 原地向下平滑展开（In-Place Accordion with GPU Transition）

- 投递记录默认以高密度表格行展示，点击行任意区域均可直接原地向下平滑展开详情面板；
- 采用 CSS Grid `grid-template-rows: 0fr ↔ 1fr` 结合 `opacity` 与 `will-change` 实现 60fps 硬件加速高度过渡动效；
- 展开后默认处于**全量信息查看态（Full Profile View）**，结构化呈现全部 12+ 字段（企业、岗位、优先级、状态、地点、渠道、内推人/码、截止日、投递时间、薪资、JD 链接、完整备忘录）；
- 点击「修改档案」原地平滑切换为行内编辑表单，保存后无缝切回全量卡片。

### 2. 固定吸顶控制区与联动表头（Sticky Pinned Header & Table Columns）

- 将页面标题（PageHeader）、综合工具栏（搜索框 / 状态分类 Tabs / 优先级过滤 / 排序 / 记新投递）以及表格列头（`[全部展开/全部收起]` | 目标企业与岗位 | 城市/渠道 | 最新轮次进度 | 截止/投递 | 操作）统一放置在 `sticky top-14 z-20` 的毛玻璃吸顶容器中；
- 无论列表滚动多深，用户始终能看到列头含义，并可随时进行搜索、过滤、排序与批量展开/收起。

### 3. 自适应动态流转推进图（Fluid Dynamic Hiring Process Stepper）

- 在展开面板顶部提供横向流转推进图：
  - 覆盖 `网申投递 → 各轮次面试/笔试/简历初筛 → 录用终局` 全流程阶段；
  - 节点类型包含 `简历初筛`（`screening`）、`测评`（`assessment`）、`笔试`（`written`）、`专业面`（`technical`）、`HR面`（`hr`）及 `其他`（`other`）；
  - 节点间采用自适应伸缩连接线（`flex-1 min-w-3`），根据视口宽度动态拉伸填充，比例对称；
  - 采用极简几何序号徽标（`1`, `2`, `3`...）、SVG 状态图标与专业文字（如 `正式录用 (Offer)`、`已通过`、`止步于此轮`），严禁使用装饰性 Emoji 表情。

### 4. 侧边栏屏幕视口锁定（Viewport-Locked Sticky Sidebar）

- 在 `AppShell` 中将侧边栏设为 `sm:sticky sm:top-0 sm:h-screen sm:shrink-0`，使侧边栏高度严格限制在屏幕视口内，中间导航区域独立纵向滚动（`overflow-y-auto`），底部设置与数据库状态始终固定在屏幕左下角。

## Consequences

- **Positive**:
  - 用户可在表格主屏上完成 100% 的查看、流转状态跟踪、轮次添加与档案编辑，无须在多个抽屉/弹窗间来回切换；
  - 视觉流转阶段直观明了，一目了然看清每一家企业的当前卡点与推进百分比；
  - 长列表滚动时核心交互控件始终唾手可得，体验流畅高级。
- **Negative**:
  - `ApplicationTableRow` 与 `HiringProcessStepper` 需要精确管理行展开状态、轮次排序与派生状态计算，但已通过 Vitest 全量单元测试保障健壮性。
