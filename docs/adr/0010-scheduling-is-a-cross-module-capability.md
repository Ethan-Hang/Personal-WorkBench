# 0010. 排程是跨模块能力，归工作台所有

日期：2026-08-18
状态：已接受

## 背景

`modules/workbench` 要接管今日视图与排程。它有三条性质与既有模块不同：

- **零自有表**（`migrations: []`）。它不建实体，只在 core 的 Item 之上提供一个视图与一个动作。
- **不按 `sourceModule` 过滤**。把所有模块的事项摆在同一条时间轴上，正是它存在的理由。
- **要写别的模块创建的 Item**。给秋招的笔试排程，是「周日历」这条工作流的前提。

第三条撞上一个既有事实：`ItemRepository.update(id, patch)` **没有归属校验**——不像
`delete(moduleId, id)`。ADR-0007 已经点名过这件事，但把它留作「意外允许」，未作决定。

同时，待排程抽屉要查「`scheduled` 为空」的事项，而 core 的 `ListItemsQuery` 没有这一维。
按 CLAUDE.md 的规矩，加模块时发现必须改 core，要停下来想清楚。

## 决策

### 一、排程不做归属校验，但工作台**只**能排程

`scheduled` 回答的是「我打算什么时候做」——它属于使用者，不属于创建事项的模块。
因此工作台可以给任何模块的 Item 排程，不校验 `sourceModule`。

作为交换，**工作台不提供任何其他跨模块写操作**：不完成、不编辑、不删除。理由是具体的：
秋招的 Item 是 `reconcileAllProjections` 生成的投影，工作台若绕过秋招把它置为 `done`，
下次对账会覆盖回去，症状是「点了完成，刷新又变回来」。**「完成」属于源模块的领域语义，
「排程」不属于任何模块。** 这条线就画在这里。

### 二、`ListItemsQuery` 增加 `unscheduled?: boolean`

```ts
unscheduled?: boolean;   // 只取 scheduled === null 的 Item
```

与其他条件取**交集**，不并入三个排程条件的并集（「未排程」与「排在某时段」互斥）。
`false` 与缺省同义。所有 Repository 实现必须通过新增的三条契约测试（15 → 18 条）。

这次 core 改动不构成 CLAUDE.md 所说的「core 的假设错了」：加的是通用查询维度，
不含任何模块知识，core 依然不知道 workbench 存在。

### 三、排程只到天

`PATCH /api/workbench/items/:id/schedule` 的入参是 `{ date: 'YYYY-MM-DD' | null }`，
写入恒为 `ScheduledTime` 的 `all-day` 分支。`null` 表示取消排程，退回抽屉。

在服务端就焊死，而非只在 UI 上限制：给时段留口子，「拖到某一天」与「拖到某个小时」的
交互复杂度差一个量级，而后者尚无需求（spec §14.3）。

排程只写 `scheduled`，**绝不碰 `dueAt`**。死线是客观的，排程是主观意图，混为一谈是许多
todo 应用排不好程的根因（spec §5.3 决策 ①）。

## 后果

### 已知限制一：投影型 Item 的排程会被对账覆盖

秋招的 `projectionMatches` 把 `scheduled` 算进比对，不一致就覆盖回秋招自己的数据；
`reconcileAllProjections` 每次服务器启动都跑。所以手动给秋招 Item 排程，**重启即回弹**。

**这是正确行为，不是缺陷。** 笔试 9/20 19:00 是 HR 定的客观时刻，不是「我打算什么时候做」，
本就不该被工作台改。它属于 spec §5.3 决策 ① 里 `due_at` 那一侧的东西，只是占用了
`scheduled` 的列。

真正待解的是**前端怎么知道哪些能拖**。工作台不能靠 `sourceModule === 'todo'` 判断——
那等于它知道了 todo 存在，破铁律 1。本次刻意不解决：现在没有任何 UI 会去拖秋招的 Item，
提前设计锁机制是对未来的猜测（spec §8.4 保持接口最小）。

**周日历 UI 开工时必须先解决这个信号。** 可能的形态是 core 加一个通用标记
（如 `scheduleLocked`，由创建模块声明「这条的时间是客观事实」），届时另记 ADR。

### 已知限制二：待排程抽屉暂时缺数据源

两个既有模块建 Item 时都会填上 `scheduled`——todo 默认排今天，秋招投影带着客观时间。
所以抽屉的现实数据源目前只有 `schedule(id, { date: null })` 这一条。

补法在别处：todo 的创建支持「先收集、不排期」，或工作台自己提供快速收集。都是纯增量。

### 其他

- **`update` 仍无归属校验。** 本 ADR 只把「排程可以跨模块」这一条变成明写的决定，
  没有扩大范围。其他写操作的归属检查仍由各模块在自己的路由里做（todo 就是这么做的）。
- **`/api/todo/today` 与 `/api/workbench/today` 短暂并存。** 前者会在前端完成 UI 搬迁后
  退休，见 `docs/parallel-development.md` §5。
- **零自有表的模块是合法形态。** 秋招验证了「模块可以有自己的领域实体」，工作台验证另一半：
  模块也可以纯粹是 core 之上的视图。`ServerModuleDefinition` 两种都不用改。
