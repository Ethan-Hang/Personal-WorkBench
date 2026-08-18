# modules/workbench

今日工作台。**零自有表**——不建任何实体，只在 core 的 `Item` 之上提供一个跨模块视图与一个动作（排程）。

写前端只需要读这一页和 `src/contract.ts`，**不需要读 `src/server/`**。

---

## 它和 `modules/todo` 是什么关系

`/api/todo/today` 现在也返回跨模块数据，但那是历史遗留：todo 在主题层那轮顺手兼职了工作台。
**工作台是今日视图的正主**，todo 的那个端点会在前端完成 UI 搬迁后退休。

搬迁期间两个端点并存，各自独立可用，不会互相影响。

| 端点                       | 状态                   |
| -------------------------- | ---------------------- |
| `GET /api/workbench/today` | 正主                   |
| `GET /api/todo/today`      | 待退休，搬迁完成后删除 |

回收站、创建任务、完成/取消完成、编辑——这些**仍然走 todo 的端点**，工作台不接管。
原因见下面「工作台只能排程」。

---

## 三个端点

路径与形状都在 `src/contract.ts`，别把字符串抄进 UI 代码——用 `WORKBENCH_API`。

### 1. 今日视图

```
GET /api/workbench/today
```

```jsonc
{
  "date": "2026-08-18", // 本地日期
  "zone": "Asia/Taipei", // 服务端解析出的时区
  "scheduled": [
    // 今天要做的
    {
      "id": "15af7a76-747c-4540-a6ce-705c6a7c3d2d",
      "title": "冒烟任务",
      "sourceModule": "todo", // 谁创建的
      "kind": "task", // task | event
      "status": "todo",
      "importance": "high",
      "dueAt": null, // 死线，UTC ISO8601 或 null
      "scheduled": { "kind": "all-day", "date": "2026-08-18" },
      "urgency": "none", // overdue|imminent|soon|later|none
      "priorityScore": 20,
      "isImportantQuadrant": true,
      "isUrgentQuadrant": false,
    },
  ],
  "overdue": [], // 逾期摘要：首页顶部，按需展开
  "completed": [], // 今日已完成
}
```

三段都已按 `priorityScore` 降序排好，**前端不需要再排**。同分时有死线的排前面。

**逾期的事项只出现在 `overdue` 里**，不会同时出现在 `scheduled`，不必去重。

前几天没做完的全天事项会被自动带到今天，不会悄悄消失。

### 2. 待排程抽屉

```
GET /api/workbench/unscheduled
→ { "items": [ /* 同上的 WorkbenchItem */ ] }
```

「有 DDL、但还没决定哪天做」的事项。同样已排好序。

⚠️ **它现在会返回空数组，这是事实不是 bug。** 见下面「已知限制」。

### 3. 排程

```
PATCH /api/workbench/items/:id/schedule
```

```jsonc
{ "date": "2026-09-22" }  // 排到那天
{ "date": null }          // 取消排程，退回待排程抽屉
```

返回更新后的单条 `WorkbenchItem`。

| 情况                                      | 响应                    |
| ----------------------------------------- | ----------------------- |
| 成功                                      | `200` + `WorkbenchItem` |
| `date` 带了时刻（`2026-09-20T19:00:00Z`） | `400` + `{ error }`     |
| id 不存在                                 | `404` + `{ error }`     |

**排程只到天。** 服务端焊死，不是 UI 上的软限制——传时刻一定 400。
理由：「拖到某一天」与「拖到某个小时」的交互复杂度差一个量级，后者尚无需求（spec §14.3）。

**排程只写 `scheduled`，绝不碰 `dueAt`。** 死线是客观的，排程是主观意图，
混为一谈是许多 todo 应用排不好程的根因（spec §5.3 决策 ①）。

---

## `scheduled` 字段：两个分支，周日历要用

它是 core `ScheduledTime` 值对象的镜像，`null` 表示未排程：

```ts
{ kind: 'all-day'; date: '2026-09-20' }                              // 全天
{ kind: 'timed'; start: '2026-09-20T11:00:00.000Z'; end?: string }   // 定时
```

**全天用浮动日期，绝不转 UTC。** 「9月20日」在任何时区都是9月20日；转了会在某些时区
整体偏移一天。定时则是 UTC 时刻，要转成本地时区显示。

处理它的 `switch` **不要加 `default` 分支**——没有 default，将来 core 加第三种形态时
TypeScript 会直接编译报错，而不是静默漏掉。

排程端点写入的**恒为 `all-day` 分支**；`timed` 只会从秋招这类模块的投影里来。

---

## 工作台只能排程，不能完成 / 编辑 / 删除

这不是没做完，是刻意的边界（ADR-0012）。

秋招的事项是 `reconcileAllProjections` 生成的**投影**。绕过秋招把它置为 `done`，
下次对账会覆盖回去，症状是「点了完成，刷新又变回来」。

> **「完成」属于源模块的领域语义，「排程」不属于任何模块。**

所以：跨模块只开放 `schedule` 一个动作。todo 事项的完成、编辑、回收站仍走 `TODO_API`。

---

## 前端还需要自己建的东西

后端只交了 `contract.ts`，以下都还没有：

- **传输层 `src/ui/api.ts`。** 可照抄 `modules/todo/src/ui/api.ts` 的 `request()`
  ——它处理了 204、错误消息里的请求编号，以及「无 body 的请求不得声明 JSON content-type」
  这条曾漏掉一个 400 的教训。

  但这已经是**第三个模块**了，`CLAUDE.md` 里那句「第三个模块出现时再考虑抽取」到期了。
  抽不抽由前端定。

- **`src/ui/` 与 `UiModuleDefinition`**，以及 `packages/web/src/modules.ts` 里的注册行。
  目前工作台在前端注册表里不存在。

- **响应校验**：`todayResponseSchema.parse(...)` / `unscheduledResponseSchema.parse(...)`
  / `workbenchItemSchema.parse(...)`。后端改了形状，前端会在接缝处大声失败，
  而不是页面静默变空。

### queryKey 建议

```ts
const TODAY_KEY = ['workbench', 'today'] as const;
const UNSCHEDULED_KEY = ['workbench', 'unscheduled'] as const;
```

排程成功后**两个都要失效**——排程会让事项在「今日」与「抽屉」之间移动。

---

## 已知限制

### 一、待排程抽屉暂时没有数据源

两个既有模块建 Item 时都会填上 `scheduled`——todo 默认排今天，秋招投影带着客观时间。
所以抽屉的现实数据源目前**只有** `PATCH .../schedule` 传 `{ date: null }`。

要让抽屉有内容，补法在别处：todo 的创建支持「先收集、不排期」，或工作台自己提供快速收集。
都是纯增量，等有需求再做。

### 二、秋招事项的排程会被对账覆盖

手动给秋招的笔试排程，**服务器重启后会回弹**。

这是正确行为，不是缺陷：笔试 9/20 19:00 是 HR 定的客观时刻，不是「我打算什么时候做」，
本就不该被工作台改。

**但周日历 UI 开工前必须先解决「前端怎么知道哪些格子能拖」这个信号**，
而且不能靠硬编码 `sourceModule === 'todo'`——那等于工作台知道了别的模块存在，破铁律 1。
可能的形态是给 core 加一个通用标记（由创建模块声明「这条的时间是客观事实」），届时另记 ADR。

### 三、响应里没有 `canEdit`

工作台不知道哪个模块允许编辑——那是各模块自己的规则。它只透出 `sourceModule`。

`TodayPage.tsx` 里那些散布的 `task.sourceModule === TODO_MODULE_ID` 判断，
正解是给 `UiModuleDefinition` 加一个能力声明，由**前端注册表**回答，而不是后端算好塞进响应。

---

## 相关文档

- `src/contract.ts` — 端点与 Zod schema，唯一的接缝
- `docs/adr/0012-scheduling-is-a-cross-module-capability.md` — 上面每条边界的完整理由
- `docs/parallel-development.md` — 目录归属、分支规则、UI 搬迁的交接点
- 设计文档 §5.3（死线 vs 排程）、§6（时间存储）、§14.3（剩余工作流）
