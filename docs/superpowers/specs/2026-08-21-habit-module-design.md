# 今日习惯模块 — 设计

日期：2026-08-21
状态：已确认，待转实现计划
相关：`docs/adr/0023-habits-are-not-core-items.md`

---

## 1. 目标与范围

首页 `modules/workbench/src/ui/TodayPage.tsx:1670` 与周历侧栏
`modules/workbench/src/ui/CalendarPage.tsx:1194` 各有一块「今日习惯」占位，目前是写死的
假数据。本设计把它换成真实模块。

**范围内：** 习惯的增删改归档、打卡与补卡、连续天数与完成率、一个习惯一级页面
（含热力图）、两处卡片接入。

**明确不做：**

- 习惯不进周日历、不进今日事项聚合、不参与排程（理由见 ADR-0023）
- 不做提醒 / 通知（本地优先应用没有常驻进程）
- 不做习惯分组、不做与目标模块的联动（目标模块尚未设计，等它落地后再谈）
- 不抽取 todo 的 `recurrence.ts` 到 core 复用（见 §4.3）

## 2. 模块形态

`moduleId = 'habit'`，表前缀 `habit_`。目录结构照 `modules/campus-recruit` 同形：

```
modules/habit/
  drizzle.config.ts
  migrations/0000_habit.sql
  src/
    contract.ts               唯一接缝：端点路径 + Zod 形状
    server/
      frequency.ts            纯函数：该做吗 / 进度 / streak
      frequency.test.ts
      repository.ts           HabitRepository 接口（由 core 之外的模块自己拥有）
      service.ts              领域校验与编排
      errors.ts               DomainError + toHttp
      routes.ts
      index.ts                createHabitServerModule(repo)
    storage/
      schema.ts               Drizzle schema
      sqlite-repository.ts    不得 import @workbench/data
    ui/
      api.ts                  传输层，路径一律来自 contract.ts
      HabitsPage.tsx          一级页面
      components/TodayHabitCard.tsx   两处卡片共用
      index.tsx               habitUiModule
```

接入是各一行：`packages/server/src/index.ts` 的 `modules` 数组、
`packages/web/src/modules.ts` 的 `uiModules` 数组。模块定义是**接收 Repository 的工厂函数**
（与 todo、秋招同形），组合根注入共享连接。

习惯模块是第一个**有自有表、但零 core Item** 的模块——它拿到 `ModuleContext` 后
根本不碰 `ctx.items`。

## 3. 数据模型

两张表，没有第三张。

### `habit_definitions`

| 列                          | 类型                       | 说明                                                  |
| --------------------------- | -------------------------- | ----------------------------------------------------- |
| `id`                        | TEXT PK                    |                                                       |
| `name`                      | TEXT NOT NULL              | 应用层做重名校验（大小写敏感等值比较）                |
| `notes`                     | TEXT NULL                  |                                                       |
| `target_value`              | INTEGER NOT NULL DEFAULT 1 | 布尔习惯即 1                                          |
| `unit`                      | TEXT NULL                  | `'分钟'` / `'杯'`，纯展示                             |
| `freq_kind`                 | TEXT NOT NULL              | `daily` \| `weekdays` \| `weekly-count`               |
| `weekdays`                  | TEXT NULL                  | `'1,3,5'`，ISO 周几（1=周一）。仅 `weekdays` 用       |
| `weekly_count`              | INTEGER NULL               | 仅 `weekly-count` 用                                  |
| `start_date`                | TEXT NOT NULL              | **浮动日期** `YYYY-MM-DD`                             |
| `archived_at`               | TEXT NULL                  | **UTC 时刻**。NULL = 启用中                           |
| `color_token`               | TEXT NULL                  | 语义色名，不是十六进制——具体颜色由主题层决定          |
| `position`                  | INTEGER NOT NULL           | 卡片内排序，从 0 起。不设唯一约束（重排时会短暂重复） |
| `created_at` / `updated_at` | TEXT NOT NULL              | UTC 时刻                                              |

CHECK 约束：`target_value >= 1`、`position >= 0`、
`freq_kind IN ('daily','weekdays','weekly-count')`、
`weekly_count IS NULL OR (weekly_count BETWEEN 1 AND 7)`。

### `habit_checkins`

| 列                          | 类型             | 说明                      |
| --------------------------- | ---------------- | ------------------------- |
| `habit_id`                  | TEXT NOT NULL    |                           |
| `date`                      | TEXT NOT NULL    | **浮动日期** `YYYY-MM-DD` |
| `value`                     | INTEGER NOT NULL | 布尔习惯恒为 1            |
| `created_at` / `updated_at` | TEXT NOT NULL    | UTC 时刻                  |

**PRIMARY KEY `(habit_id, date)`** —— 与 `todo_recurrence_items` 同一个把戏：
打卡天然幂等，连点五次不会造出五行。索引 `idx_habit_checkins_date` 供热力图按区间查。

### 三条承重性质

1. **两张表里没有一个 `item_id`。** 这是习惯与前两个模块的根本差别，也是它零 core
   改动的直接原因。「外键方向恒为模块→core」这条铁律在这里表现为「一条外键都不需要」。
2. **同一张表里同时用上两类时间。** `start_date` 是浮动日期（「从哪天起算」是日历概念，
   转 UTC 会在某些时区整体偏一天）；`archived_at` 是 UTC 时刻（「什么时候按下归档」是
   真实时刻）。这不是随手混用，是 CLAUDE.md 时间三分法的直接落地。
3. **`freq_kind` 在 TypeScript 侧是 discriminated union**，处理它的 `switch`
   **不加 `default` 分支**——将来加第四种频率时 TypeScript 会直接编译报错。

### 归档与删除

- **归档**：`archived_at` 置为当前时刻。不再出现在今日卡片，历史打卡全部保留且可回看，
  可重新启用。
- **彻底删除**：真删两张表的行，需二次确认。

**刻意不借用 todo 那套 `cancelled` 软删除**：ADR-0009 已明言那不是可照抄的模式；
何况习惯不是 Item，借不到 core 的状态枚举。

## 4. 派生逻辑

### 4.1 `frequency.ts` — 纯函数，零 IO

对标 todo 的 `server/recurrence.ts`：全程只操作浮动日期，**绝不转 UTC**。三个导出：

**`isDueOn(habit, date): boolean`**

| `freqKind`     | 规则                                                            |
| -------------- | --------------------------------------------------------------- |
| `daily`        | `date >= startDate` 即该做                                      |
| `weekdays`     | 再要求 `date` 的 ISO 周几落在 `weekdays` 里                     |
| `weekly-count` | **恒为 true**——「每周三次」不指定哪天，每天都可以做，进度按周算 |

**`progressFor(habit, date, checkins): { current, target }`**

- `daily` / `weekdays`：当天 `value` vs `targetValue`
- `weekly-count`：本周（**周一起算**）已达标的天数 vs `weeklyCount`

**`streakOf(habit, checkins, today): number`**

- `daily`：从今天往回，连续的每一天都达标
- `weekdays`：**只看该做的日子**。周二没打卡不算断——否则「一三五健身」的 streak
  永远是 1
- `weekly-count`：连续达标的**周数**，不是天数

**今天还没到晚上，不算断。** streak 从「昨天」起回溯，今天达标则额外 +1。
否则每天早上一睁眼 streak 就归零。

`startDate` 之前的日子一律不算漏。

### 4.2 本地日期由前端提供

服务端拿不到时区（`ModuleContext` 只有 `moduleId` + `items`，时区在 `app_settings`），
因此算不出「今天是几号」。

**所有涉及「今天」的请求都由前端携带本地日期**：读取用 `?date=`，写操作的 body 同时带
`date`（操作哪一天）与 `clientToday`（客户端本地今日）。服务端用 `clientToday` 校验
补卡窗口：`date` 必须落在 `[clientToday - 6, clientToday]`，否则 400。

理由与被否决的替代方案见 ADR-0023 §3。一句话版本：**前端知道用户在哪个时区，
服务端只知道自己进程的时区**——这与排程的 `start` / `end` 由前端换算成 UTC 再发
是同一条道理。

### 4.3 不抽取 todo 的重复引擎

todo 的 `recurrence.ts` 处理的是「每月 31 号在没有 31 号的月份整月跳过」这类日历规则，
并绑着 core Item 的物化与水位。习惯只有三种频率、不生成 Item、没有物化。

现在把两者抽到 core 会造出一个同时服务两种不同语义的抽象，是过早合并；而且铁律 1
禁止模块间依赖，所以「让习惯 import todo」从一开始就不在选项里。**两边各写各的，
各自有测试。** 若将来第三个模块也需要展开日历规则，那时才有足够信息判断该抽什么。

## 5. 契约

`modules/habit/src/contract.ts` 是唯一接缝：端点路径构造函数（传 `ID_PARAM` 得到
Fastify 注册模式，传真实 id 得到转义后的请求路径）+ Zod 形状。服务端用它校验入参，
客户端用它 `.parse()` 校验响应。

| 端点                                                       | 用途                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/habit/today?date=`                               | 今日卡片：每个启用中习惯的 `dueToday` / `progress` / `streak` |
| `GET /api/habit/habits?includeArchived=`                   | 习惯页管理列表                                                |
| `POST /api/habit/habits`                                   | 创建                                                          |
| `PATCH /api/habit/habits/:id`                              | 编辑（含改频率）                                              |
| `POST /api/habit/habits/:id/archive`                       | 归档                                                          |
| `POST /api/habit/habits/:id/unarchive`                     | 恢复                                                          |
| `DELETE /api/habit/habits/:id`                             | 彻底删除（连历史）                                            |
| `GET /api/habit/habits/:id/history?from=&to=`              | 热力图数据，含两端，上限 366 天                               |
| `PUT /api/habit/habits/:id/checkins/:date`                 | 打卡 / 改数值。body 带 `value` 与 `clientToday`。幂等 upsert  |
| `DELETE /api/habit/habits/:id/checkins/:date?clientToday=` | 取消打卡                                                      |

### 三处要提前避开的坑

1. **`archive` / `unarchive` 是无 body 的 POST。** 浏览器 `fetch(url, {method:'POST'})`
   不带 `content-type`，Fastify 默认回 **415**，而 `app.inject()` **复现不了这个形状**。
   `buildApp` 已注册接受空 body 的 content type parser，所以这条路是通的——但守卫测试
   必须放在客户端传输层（照 `modules/todo/src/ui/api.test.ts`），不是 inject。
2. **UI 层禁止出现 `/api/` 开头的字符串字面量**，`eslint.config.js` 的
   `no-restricted-syntax` 会拦。路径一律从 `contract.ts` 的常量来。
3. **领域校验放 service 层**（为了能被集成测试直接覆盖），因此必须经
   `errors.ts` 的 `DomainError` + `toHttp` 落成 4xx，否则重名会报成 500。
   **未知错误必须继续冒泡**，否则拿不到请求编号也进不了日志。

### 迁移

`modules/habit/migrations/`，由 `runMigrationsFrom` 按目录派生**专属记账表**。
**不要合并进别的模块的 `__drizzle_migrations`**——drizzle 用一张表里的一个全局水位判断
迁移该不该跑，合并后本模块的迁移会被静默跳过，症状是后续查询时 `no such table`。

## 6. UI

### 6.1 今日习惯卡片

`components/TodayHabitCard.tsx`，**同一个组件用于两处**，不抄两份：

- 首页 `TodayPage.tsx:1670` 的「今日习惯」Panel
- 周历侧栏 `CalendarPage.tsx:1194` 的今日习惯预览

只显示 `dueToday === true` 且未归档的习惯。布尔习惯点一下即打卡；有目标值的习惯
点开小步进器调数值。打卡走**乐观更新**（照 ADR-0011），失败回滚并提示——
不做「界面已改、库里没改」的假成功。

### 6.2 习惯页 `/habits`

一级页面，`habitUiModule.nav` 加一项。三块内容：

1. 习惯列表：增删改、归档 / 恢复、拖拽排序
2. 每个习惯的热力图：点格子可补卡，**7 天窗口外的格子不可点**（禁用态，不是点了报错）
3. streak、本周 / 本月完成率

现成设计基座直接用：`text-habit`、`IconFlame`、`Chip`、`ProgressBar`、`Panel`。

## 7. 测试

| 层             | 投入                                                |
| -------------- | --------------------------------------------------- |
| `frequency.ts` | 接近全覆盖，TDD                                     |
| 迁移           | 必测                                                |
| service        | 关键路径，`:memory:` SQLite 跑真实集成              |
| UI             | 不测渲染细节（Vitest 的 `include` 刻意不收 `.tsx`） |

`frequency.ts` 的重点用例：

- 一三五习惯周二没打卡，streak 不断
- `weekly-count` 跨周边界结算正确
- `startDate` 之前的日子不算漏
- 今天还没打卡，streak 仍显示昨天为止的连续数
- 三个 `freqKind` 分支的 `switch` 无 `default`

service 的重点用例：

- 补卡窗口边界：第 7 天可、第 8 天 400
- 同一天重复打卡幂等，只有一行
- 归档后不出现在 `GET /today`，但历史仍可查
- 彻底删除连带清空该习惯的全部打卡
- 重名创建落成 400 而不是 500

## 8. 已知限制

- **习惯不能被拖到日历上排时间。** 「晚上八点复盘」这类有固定时段的习惯只能另建 todo。
  若这个需求真的出现，正确做法是给单个习惯加「同时生成 Item」开关，而不是推翻 ADR-0023。
- **`clientToday` 可被伪造。** 单人本地应用里不构成威胁模型，是契约里诚实标注的
  不对称，不是疏漏。
- **streak 与完成率每次扫一段历史。** 单人数据量下不是问题。真的慢了就加索引或缓存，
  **不要**因此回头去物化每日实例。
- **不记每记录时区**，与 core 的已知限制一致（ADR-0004）：跨时区旅行时，旅途中那几天的
  「本地日」由当时的前端判定，事后不再重算。
