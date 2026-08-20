# modules/workbench

今日工作台。**零自有表**——不建任何实体，只在 core 的 `Item` 之上提供一个跨模块视图与一个动作（排程）。

写前端只需要读这一页和 `src/contract.ts`，**不需要读 `src/server/`**。

---

## 它和 `modules/todo` 是什么关系

`/api/todo/today` 现在也返回跨模块数据，但那是历史遗留：todo 在主题层那轮顺手兼职了工作台。
**工作台是今日视图的正主**，todo 的那个端点会在前端完成 UI 搬迁后退休。

搬迁期间两个端点并存，各自独立可用，不会互相影响。

| 端点                          | 状态                         |
| ----------------------------- | ---------------------------- |
| `GET /api/workbench/today`    | 正主                         |
| `GET /api/workbench/calendar` | 日历取数，无对应的 todo 端点 |
| `GET /api/todo/today`         | 待退休，搬迁完成后删除       |

回收站、创建任务、完成/取消完成、编辑——这些**仍然走 todo 的端点**，工作台不接管。
原因见下面「工作台只能排程」。

---

## 四个端点

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

### 3. 排程（颗粒度 1 分钟）

```
PATCH /api/workbench/items/:id/schedule
```

入参与 core 的 `ScheduledTime` 同构，三种形态：

```jsonc
// 整天
{ "scheduled": { "kind": "all-day", "date": "2026-09-22" } }

// 定时，end 可缺省
{ "scheduled": {
    "kind": "timed",
    "start": "2026-09-22T07:30:00.000Z",
    "end":   "2026-09-22T08:30:00.000Z"
} }

// 取消排程，退回待排程抽屉
{ "scheduled": null }
```

返回更新后的单条 `WorkbenchItem`。

| 情况                                   | 响应                    |
| -------------------------------------- | ----------------------- |
| 成功                                   | `200` + `WorkbenchItem` |
| `start` / `end` 不是三位毫秒的 UTC ISO | `400` + `{ error }`     |
| `end` 早于或等于 `start`               | `400` + `{ error }`     |
| 未知的 `kind`                          | `400` + `{ error }`     |
| id 不存在                              | `404` + `{ error }`     |

#### 关于时区：`start` / `end` 由你换算

传 **UTC 时刻**，不是本地墙钟时间。浏览器知道用户在哪个时区，服务端只知道自己进程的。

```ts
// 用户在选择器里选了本地 2026-09-22 15:30
const start = new Date(2026, 8, 22, 15, 30).toISOString();
// → '2026-09-22T07:30:00.000Z'（东八区）
```

这与 `dueDate` 传本地 `YYYY-MM-DD`、由服务端补成的做法**刻意不对称**：
一个日期只有一种合理解释（那天的最后一毫秒），一个时刻没有。

#### 关于颗粒度：服务端会把秒截零

发 `07:30:48.512Z`，存下来的是 `07:30:00.000Z`。**不会报错，但会变**——所以写入后
请用响应里的值更新本地缓存，别拿你发出去的那份。乐观更新时尤其注意（ADR-0011）：
自己先 setQueryData 写一个带秒的值，服务端回来的却是截零的，会看到一次跡象。

截零对**三个模块都生效**：todo 的建/改、工作台的排程、秋招的轮次时刻。

**排程只写 `scheduled`，绝不碰 `dueAt`。** 死线是客观的，排程是主观意图，
混为一谈是许多 todo 应用排不好程的根因（spec §5.3 决策 ①）。

### 4. 日历区间

```
GET /api/workbench/calendar?from=2026-09-14&to=2026-09-20
```

用 `calendarPath(from, to)` 拼路径，别手拼查询串。

```jsonc
{
  "from": "2026-09-14",
  "to": "2026-09-20",
  "zone": "Asia/Taipei",
  "items": [/* WorkbenchItem，按排程先后排好序 */],
}
```

- `from` / `to` 是**本地浮动日期，含两端**。周视图传一周，月视图传一个月，同一个端点。
- 一次拿全全天与定时两类，不需要调两次。
- 定时事项按**本地日**归属。上海时间 9/20 早 7 点的会（UTC 是 9/19 23:00）算 9/20，不会漏。
- 已完成的**仍在**日历上（划掉也是信息）；回收站里的不在。
- 未排程的不在（它们在待排程抽屉里）。

| 情况                                 | 响应                |
| ------------------------------------ | ------------------- |
| 缺 `from` / `to` 或格式不对          | `400` + `{ error }` |
| `from` 晚于 `to`                     | `400` + `{ error }` |
| 区间超过 `CALENDAR_MAX_DAYS`（96）天 | `400` + `{ error }` |

---

## `scheduled` 字段：两个分支，日历要用

它是 core `ScheduledTime` 值对象的镜像，`null` 表示未排程：

```ts
{ kind: 'all-day'; date: '2026-09-20' }                              // 全天
{ kind: 'timed'; start: '2026-09-20T11:00:00.000Z'; end?: string }   // 定时
```

**全天用浮动日期，绝不转 UTC。** 「9月20日」在任何时区都是9月20日；转了会在某些时区
整体偏移一天。定时则是 UTC 时刻，要转成本地时区显示。

`end` 缺省时表示「没说多久」，日历自己定默认时长画。

处理它的 `switch` **不要加 `default` 分支**——没有 default，将来 core 加第三种形态时
TypeScript 会直接编译报错，而不是静默漏掉。

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
const calendarKey = (from: string, to: string) => ['workbench', 'calendar', from, to] as const;
```

排程成功后**三个都要失效**——排程会让事项在「今日」、「抽屉」与「日历某一格」
之间移动。日历用 `['workbench', 'calendar']` 前缀批量失效即可，不必逐个区间算。

---

## 已知限制

### 一、待排程抽屉暂时没有数据源

抽屉现在有两个数据源：

- `PATCH .../schedule` 传 `{ scheduled: null }`（把已排的退回抽屉）；
- **`POST /api/todo/tasks` 传 `scheduled: null`**（先收集、不排期）。

注意 `scheduled` 字段在 todo 建任务时**缺省与显式 null 不同**：不传仍然排到今天全天
（保持原有行为），传 `null` 才是不排程。

秋招的投影仍然总带着客观时间，不会进抽屉。

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

## 周历指挥台（CalendarPage）UI 实现

工作台模块提供全功能的周历视图（路由 `/calendar`），核心能力包括：

1. **周范围计算与导航**：
   - ISO 周计算 (`weekUtils.ts`)，支持跨年边界、任意年份周数推算与起止范围；
   - 快捷键支持：`←` 上一周、`→` 下一周、`T` 回到本周；
   - 年周快速切换浮层（4 列矩阵、支持鼠标滚轮在年份栏纯净横向滚动、点击窗口外部自动关闭）；
   - 定位日期锁定周（输入或选择任意日期立即跳转并高亮该日）。

2. **视口自适应与零外层滚动**：
   - 采用纯 Flexbox 容器布局，外层浏览器窗口始终无滚动条；
   - 24 小时时间轴（`flex-1 min-h-0`）自动填满屏幕剩余纵向高度并独立滚动；
   - 包含实时当前时间红线（每 10 秒刷新并精准定位）。

3. **全天栏高度自由调节（Splitter Resizer）**：
   - 全天栏与时间轴之间配备高灵敏度拖拽调节分割条；
   - 支持在 `44px ~ 260px` 之间自由拖拽，高度持久化至 `localStorage`；
   - 双击分割条可在 `64px`（默认）与 `130px`（展开）之间快捷切换；
   - 单日全天单元格超出时支持内部独立垂直滚动。

4. **左右键行为分流与跨模块深度联动**：
   - **左键单击**：打开事项详情弹窗，查看完整信息与所属模块；秋招事项提供一键直达链接（`/campus?targetItemId=...`），跳转至秋招页面自动定位并原地展开该企业全套面试流程；
   - **右键单击**：直接打开专属排期弹窗，快捷调整全天/定时时段或移入未排程抽屉；
   - **长标题跑马灯**：`ScrollableTitle` 组件在鼠标悬停时自动平滑滚动显示完整文字。

---

## 相关文档

- `src/contract.ts` — 端点与 Zod schema，唯一的接缝
- `docs/adr/0012-scheduling-is-a-cross-module-capability.md` — 排程作为跨模块能力的理由
- `docs/adr/0017-weekly-calendar-viewport-containment-and-all-day-resizing.md` — 周历视口锁定与全天栏调节规范
- `docs/parallel-development.md` — 目录归属、分支规则、UI 搬迁的交接点
- 设计文档 §5.3（死线 vs 排程）、§6（时间存储）、§14.3（剩余工作流）
