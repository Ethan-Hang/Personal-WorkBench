# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

本地优先的个人工作台。第一批功能是日历与 todo，此后会持续加入深度定制的领域模块（秋招管理、社招管理等），**需求增长没有终点**。

因此本项目的首要目标不是实现某组功能，而是：**让第 10 个模块的加入成本，与第 2 个模块相同。** 所有架构选择都服务于这一条；遇到取舍时，以它为准。

当前状态：Walking Skeleton 完成，秋招模块已接入，主题层已落地，工作台模块的服务端
已完成。现有三个模块（todo、workbench、campus-recruit）、一层共享设计基座
（`packages/ui`：15 个组件 + 主题上下文 + 图标集）、以及带请求编号的错误追踪。

两次架构考试都过了，且考的是不同的东西：

- **秋招模块**：模块可以有自己的领域实体。core 只多了一个通用的 `delete(moduleId, id)`。
- **工作台模块**：模块也可以**零自有表**（`migrations: []`），纯粹是 core 之上的一个
  视图 + 一个动作。core 只多了一个通用查询维度 `unscheduled`。

**todo 已不再是零自有表模块。** 2026-08 加入子任务 / 标签 / 重复任务，它长出了四张
自有表与一份迁移，模块定义随之从常量导出改为接收 Repository 的工厂函数（与秋招同形）。
三条铁律仍未破：core 一行未改。理由与全部取舍见 `docs/adr/0014`。

**一处仍在的不对称，动 todo 前必须知道：`GET /api/todo/today` 不按 `sourceModule`
过滤**，秋招的事项也会出现在它的结果里；而所有写操作（完成、编辑、回收站、子任务、
标签）只认 `sourceModule === 'todo'` 的项。这个端点已无消费者、待退休，但只要它还在，
这条不对称就还在。

`modules/workbench` 的 UI 搬迁**已经完成**——`packages/web/src/modules.ts` 现在只注册
`workbenchUiModule` 与 `campusRecruitUiModule`，`modules/todo/src/ui/` 已不再挂载
（1380 行的 `TodayPage.tsx` 就此成为死代码）。两个 `today` 端点仍并存：

| 端点                       | 状态                                                 |
| -------------------------- | ---------------------------------------------------- |
| `GET /api/workbench/today` | 正主。跨模块聚合，带 `scheduled` 两分支形状与 `kind` |
| `GET /api/todo/today`      | 待退休。已无消费者，随 itemActions 那一轮一并删除    |

**注意：`modules/todo/src/ui/TodayPage.tsx` 虽已不再挂载，但仍在被改动**
（`1d16a57 时钟组件` 同时改了两份 TodayPage）。**删它之前必须先与对方对齐**，
不要因为「它是死代码」就单方面删。

**不要再往 todo 里加跨模块能力。** 跨模块视图调用源模块写操作的正确机制是 core 的
`itemActions` 能力槽，方案见
`docs/superpowers/specs/2026-08-18-item-actions-registry-design.md`。
`modules/workbench/src/ui/api.ts` 里那 12 条硬编码的 `/api/todo/...` 是待还的债，
文件顶部有 TODO 标注，并已由 lint 规则封住新增（见下）。

## 命令

| 命令                                                                 | 用途                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                                                        | 同时启动后端（:3000）与前端（:5173）。Vite 代理 `/api` 到后端，浏览器只见一个源 |
| `npm run check`                                                      | 提交前跑这个：format:check → typecheck → lint → test，四步全绿才算过            |
| `npm run test`                                                       | 只跑测试                                                                        |
| `npx vitest run <路径>`                                              | 跑单个测试文件，例如 `npx vitest run packages/core/src/time.test.ts`            |
| `npx vitest run -t "<用例名>"`                                       | 按用例名筛选                                                                    |
| `npm run db:generate`                                                | 改完 `packages/data/src/schema.ts` 后生成 core 迁移                             |
| `npx drizzle-kit generate --config modules/<模块>/drizzle.config.ts` | 生成某模块自有表的迁移                                                          |

本地数据在 `data/local/workbench.db`（已 gitignore）。删掉它即可从空库重来。

pre-commit hook 只跑 Prettier（lint-staged），**不跑测试**——测试是 CI 的职责，在 commit 时跑会抑制提交频率。

## 架构

### 分层与依赖方向

```
packages/core     纯领域逻辑，零 IO 依赖，不知道任何模块存在
packages/data     SQLite + Drizzle + 迁移 + 仓储实现
packages/server   Fastify，装配 core + data + 已注册模块
packages/web      React 外壳、导航、主题
modules/*         全栈垂直切片：每个模块含自己的表、迁移、API、service、UI
```

项目内依赖箭头**恒指向内层**：`data → core`，`server → core/data`，`modules → core`。
模块可依赖 React、Zod、Drizzle 等外部库，但不得依赖其他模块或 `@workbench/data`。
core 定义 `ItemRepository` 接口，data 提供实现（DIP）。

### 三条铁律

1. **模块只能依赖 core，模块之间零依赖**
2. **core 永不感知模块**——加十个模块，core 一行不改
3. **模块自带迁移与注册项**——删模块 = 删一个目录 + 删一行注册

**前两条由 `eslint.config.js` 的 `no-restricted-imports` 强制**，违反即 CI 失败，且有回归测试（`packages/core/src/eslint.boundaries.test.ts` 用 ESLint 的 Node API 对真实配置断言，包括「测试文件豁免不会波及生产文件」这一条）。

**但 `no-restricted-imports` 只能拦 `import`，拦不住裸字符串。** 2026-08 工作台今日页
搬迁时，workbench 的 UI 手抄了 12 条 `/api/todo/...` 路径，铁律 1 就此被绕过而 lint 全绿；
手抄的响应形状漏了一个 `kind` 字段，导致六个写操作在生产里必抛。因此另有一条
`no-restricted-syntax` 规则：**`modules/*/src/ui/**` 里禁止以 `/api/` 开头的字符串
字面量与模板字面量**，路径一律来自本模块 `contract.ts` 的常量。作用域限定在 `ui/`
是刻意的——`contract.ts` 里定义路径字面量正是它的职责。

**第三条没有、也不可能有 lint 规则**——它不是 import 约束，而是结构性质，由 `ServerModuleDefinition.migrations` 与注册表的形状保证。把某个模块的迁移搬进 core 的集中目录，lint 和 CI 都不会报错，但「删模块 = 删一个目录」的承诺就此失效。**这是唯一需要人来守的一条。**

### 模块如何接入

模块通过两个注册表接入，各一行：

- 服务端：`packages/server/src/index.ts` 的 `modules` 数组
- 前端：`packages/web/src/modules.ts` 的 `uiModules` 数组

`ModuleDefinition` **刻意拆成 `ServerModuleDefinition` 与 `UiModuleDefinition` 两个接口**——合并会让 web 打包时把 Fastify 拉进浏览器产物，拆分同时也是 ISP 的正确应用。

模块的 service/routes 拿不到数据库句柄，只拿到受限的 `ModuleContext`（仅 `moduleId` +
`items`）与模块自有 Repository。需要自有表时，模块在 storage 目录实现 Repository 的
SQLite 适配器，由 `packages/server/src/index.ts` 组合根注入共享连接。该适配器不得 import
`@workbench/data`，连接不得继续向业务代码扩散。详见 ADR-0008。

`registerRoutes(app: unknown)` 与 `UiRoute.element: unknown` 里的 `unknown` 是**刻意的**：core 不得依赖 Fastify 或 React，类型断言在各自消费侧完成。不要「改进」成具体类型。

### 模块如何扩展数据

模块自建表，以 `item_id` **指向** core 的 `items` 表。外键方向恒为**模块 → core**；core 的建表语句里不存在任何模块名称。表名前缀 = `moduleId` 把连字符换成下划线再加 `_`（`campus-recruit` → `campus_recruit_`）。

模块自有表的 Drizzle schema、迁移、Repository 接口与 SQLite 实现全部放在模块目录内。
`packages/data` 不得出现任何模块表或模块 Repository。

已否决 EAV（万能键值表）：同时牺牲类型安全与查询性能。

联动机制很平淡：模块创建一条 core `Item`，日历查 `Item` 表就看得见——日历完全不知道该模块存在。

### 前后端的接缝

**接缝是每个模块的 `src/contract.ts`，且只有它。** 里面同时放着两样东西：

- **端点路径**（`TODO_API` / `WORKBENCH_API` / `CAMPUS_API`）：路径构造函数传 `ID_PARAM` 得到 Fastify 注册模式，
  传真实 id 得到转义后的请求路径。服务端与客户端共用同一份，因此不可能各改一半。
  `WORKBENCH_API` 三个：今日视图、待排程抽屉、排程（PATCH）。
  `TODO_API` 现有 26 个端点：今日视图、创建、编辑（PATCH）、完成 / 取消完成、
  软删除 / 恢复 / 彻底删除、回收站的列表与四个批量操作，外加子任务四个、标签五个、
  重复规则四个。
- **请求/响应形状**（Zod schema）：服务端用它校验入参，客户端用它 `.parse()` 校验响应。
  后端改了形状，前端会在接缝处大声失败，而不是页面静默变空。

由此得出一条对协作重要的性质：**写前端只需要读 `contract.ts`，不需要读 `src/server/`。**
反向也成立——UI 层从不 import `server/`（可用 grep 验证）。

已知缺口，动前端前值得知道：

- **UI 没有任何自动化测试**：Vitest 的 `include` 刻意不收集 `.tsx`。这在只有一个页面时是对的
  取舍，页面多起来后就是没有安全网——改坏渲染 CI 依然全绿。要改这条策略请先更新本文件。
  **注意页面数已达 5**（今日、秋招投递、秋招统计、设置、关于），设计文档 §10 给 Playwright
  定的引入门槛是「页面达 3 个以上」——这条门槛已经越过，但尚未动手。
- **前端不能脱离后端运行**：没有 mock 层，`npm run dev:web` 单跑所有请求都会失败。
- **传输层每个模块各写一份** `request()`：修一次要改 N 遍。第三个模块出现时再考虑抽取，
  那时才知道它们真正共享多少。

## 会咬人的约定

### 时间存储

三类时间，三种存法，**混用是本类应用最经典的事故来源**：

- **时刻（instant）**：UTC ISO8601 文本（`2026-09-20T11:00:00.000Z`）。字典序等于时间序，SQL 可直接 `ORDER BY`/`BETWEEN`。`Z` 后缀与三位毫秒是承重的，不是美观问题。
- **浮动日期**：全天排程存 `YYYY-MM-DD`，**绝不转 UTC**。转了会在某些时区整体偏移一天（RFC 5545 区分 DATE 与 DATE-TIME 正是为此）。
- **`due_at` 恒为时刻**，永不用浮动日期。UI 只选到天时，由服务端补成该本地日最后一毫秒。

数据库用**一组列 + `is_all_day` 标记**（而非两组列）；类型安全由 core 的 `ScheduledTime` discriminated union 保证。处理它的 `switch` **不要加 `default` 分支**——没有 default，将来加第三种形态时 TypeScript 会直接编译报错。

**禁止在 SQL 里做时区转换。** 本地日边界一律在应用层用 `localDayRange()` 换算成 UTC 区间再查询，SQL 只做字符串比较。

已知限制：不存每记录时区，跨时区旅行时旧排程会显示偏移。见 `docs/adr/0004-time-storage.md`。

### 排程：跨模块，颗粒度 1 分钟

`scheduled`（打算哪天做）属于使用者，不属于创建事项的模块。所以工作台的排程
端点**不校验 `sourceModule`**，可以给任何模块的 Item 排程。

作为交换，**工作台不提供任何其他跨模块写操作**：不完成、不编辑、不删除。
秋招的 Item 是 `reconcileAllProjections` 生成的投影，绕过秋招把它置为 `done`，
下次对账会覆盖回去——症状是「点了完成，刷新又变回来」。
**「完成」属于源模块的领域语义，「排程」不属于任何模块。**

**排程的颗粒度是 1 分钟，且由服务端保证。** 入参与 core 的 `ScheduledTime` 同构：
`{ scheduled: { kind: 'all-day', date } | { kind: 'timed', start, end? } | null }`。

写入前一律经 `truncateToMinute` 把秒与毫秒截零，**三个模块都适用**（todo 的建/改、
workbench 的排程、campus-recruit 的轮次时刻）。不截的后果是同一分钟里出现多个不相等的
排程值，日历上就成了肉眼看不出差别的重叠块。

`start` / `end` 是 **UTC 时刻，由前端换算好再发**——它知道用户在哪个时区，服务端只知道
自己进程的时区。这与 `dueDate` 传本地 `YYYY-MM-DD` 由服务端补成的做法**刻意不对称**：
日期只有一种合理解释，时刻没有。

排程只写 `scheduled`，**绝不碰 `due_at`**。

日历取数用 `GET /api/workbench/calendar?from=&to=`（本地浮动日期，含两端，上限 96 天）。

一条现存的坑：**手动给秋招 Item 排程，重启会回弹**（对账覆盖）。这是正确行为——
笔试时间是客观事实，不是「我打算什么时候做」。但**周日历 UI 开工前必须先解决
「前端怎么知道哪些能拖」这个信号**，且不能靠硬编码模块名。详见 ADR-0012。

### 重复任务：物化，不是规则求值

`todo_recurrences` 存规则，但**规则本身不是待办**——它按需生成真正的 core `Item`，
关联记在 `todo_recurrence_items`。因此一条重复出来的待办与手工建的待办**在系统里完全
同形**，日历、排程、完成、回收站都不需要知道「重复」这个概念存在。

三条会咬人的性质：

- **物化在 `listToday` 里顺手触发**，不是定时任务——本地优先的应用没有常驻调度器。
  因此它必须幂等且便宜：`(recurrence_id, occurrence_date)` 是复合主键，重复跑不会
  产生重复实例。`materialized_through` 只是省掉重复展开的优化，**不是正确性的依赖**。
- **视野 90 天**（`MATERIALIZE_HORIZON_DAYS`），且**不补生成过去**。新建一条
  `startDate` 在半年前的规则不会凭空造出一百多条逾期待办。
- **删规则时清未完成的实例、保留已完成的**。分界线是「完成与否」而不是「过去/未来」。

规则的展开是纯函数（`server/recurrence.ts`，零 IO，21 条单测），全程只操作浮动日期，
**绝不转 UTC**。「每月 31 号」在没有 31 号的月份**整月跳过**——不顺延也不回退。

### 模块迁移各记各账

drizzle 的迁移器用**一张表里的一个全局水位**判断某条迁移该不该跑。所有模块共用
`__drizzle_migrations` 时，先跑的模块只要时间戳更新，**后跑模块的迁移会被静默跳过**——
没有报错，只有后续查询时的 `no such table`。2026-08 加 todo 自有表时真踩到了。

`runMigrationsFrom` 因此按目录派生专属记账表。回归测试在
`packages/data/src/module-migrations.test.ts`。**新增带迁移的模块时不要合并这些表。**

### 领域错误要落成 4xx

三个新子系统的校验放在 service 而非 route（为了能被集成测试直接覆盖），代价是抛出的
错误默认会落到统一错误出口变成 **500**——冒烟时标签重名就报成了服务器故障。
`modules/todo/src/server/errors.ts` 的 `DomainError` + `toHttp` 是那座桥。
**未知错误必须继续冒泡**，否则拿不到请求编号也进不了日志。

### 回收站借用了 `cancelled`

todo 的回收站是软删除，落地方式是把 `status` 置为 core 的 `cancelled`。**`cancelled` 的
含义因此变成依模块而定**：在 todo 里它表示「在回收站中」，不再是「已取消」。

两条随之而来的规则：

- 软删除**不清 `completedAt`**，恢复时的状态由它反推（有值 → `done`，无值 → `todo`）。
  一律恢复成 `todo` 会静默丢掉「已完成」，并留下 `status='todo'` 却带着 `completedAt`
  的自相矛盾记录。
- `listTrash` 按 `sourceModules: [ctx.moduleId]` 过滤，所以其他模块用 `cancelled`
  表达自己的语义不会污染 todo 的回收站。

理由与代价见 `docs/adr/0009-todo-trash-reuses-cancelled-status.md`。
**这不是可以照抄的模式**——下一个模块若也想借用 core 的枚举值表达自己的概念，先读那一条。

### 优先级

`importance` 手动存储；**`urgency` 与 `priorityScore` 是派生的，永不入库**。手工维护的紧急度必然腐化——没人会回头逐条更新。阈值是 core 里的具名常量（`IMMINENT_HOURS` / `SOON_HOURS`）。

已接受的取舍：**没有 DDL 就不算紧急**。

### 工作区依赖

每个 `packages/*` 与 `modules/*` 都必须在自己的 `package.json` 里声明它实际 import 的东西。本地包写 `"*"`，安装用 `npm install <pkg> -w <workspace>`，**不得**装到根 manifest 靠 hoisting 生效。

运行期真正 import 的进 `dependencies`，仅测试或仅类型用途的进 `devDependencies`——例如 `modules/todo` 把 `@workbench/data` 列为 devDependency，在 manifest 层面诚实表达了「测试可用真实数据库、生产代码不许碰数据层」。

例外：仅由根 npm script 调用的 CLI（如 `drizzle-kit`）留在根 devDependencies。

### 前端样式

Tailwind 是 **v4**：`@tailwindcss/vite` 插件 + CSS 里 `@import 'tailwindcss'`，**没有 `tailwind.config.js`，也没有 PostCSS 配置**（跟 v3 完全不同，别按记忆造配置文件）。

`packages/web/src/index.css` 里的 `@source "../../../modules";` 是必需的——Tailwind 的自动扫描以 Vite root 为界，删掉它每个模块的 UI 都会没有样式，而且**没有任何报错**。

## 测试策略

分层投入，**不设覆盖率门槛**：

| 层            | 投入                                               |
| ------------- | -------------------------------------------------- |
| core 领域逻辑 | 接近全覆盖，TDD                                    |
| data 迁移     | 必测——唯一「写错会毁掉真实数据」的地方             |
| 模块 service  | 关键路径，TDD，用 `:memory:` SQLite 跑真实集成测试 |
| UI            | 只做少量冒烟，**不测 React 渲染细节**              |

明确不做：**不 mock 数据库**（`:memory:` 建库是毫秒级的）、不测组件渲染细节、不设覆盖率指标。Vitest 的 `include` 刻意不收集 `.tsx`。

`ItemRepository` 的行为契约在 `packages/core/src/testing/item-repository-contract.ts`（15 个用例），由 core 拥有、由实现方运行。**任何新的 Repository 实现都必须原样通过它**（LSP）。

有个真实教训值得记住：`app.inject({ method, url })` 不带任何 header，跑的是浏览器**永远不会发出**的请求形状——曾因此漏掉一个 400。涉及请求形状的守卫要放在客户端传输层（见 `modules/todo/src/ui/api.test.ts`）。

## 改代码前先读

1. `docs/parallel-development.md` — **两人并行时先读这页**：目录归属、分支规则、交接点
2. `docs/superpowers/specs/2026-08-17-personal-workbench-design.md` — 架构设计与全部取舍理由
3. `docs/adr/` — 十四条架构决策记录。**动 core 之前必读**，其中 `0005-module-boundaries.md` 记着那条 lint 管不住、只能靠人守的铁律

**如果加模块时你发现必须改 `packages/core/`，停下来想清楚**——这通常意味着某个 core 的假设错了，值得记一条新的 ADR，而不是顺手改掉。

`prototype-workbench/` 是已归档的抛弃式 UI 原型，其 `NOTES.md` 记录了已确认的产品结论（导航主线、逾期摘要按需展开、视觉方向），仅作参考，代码不延用。

## 后续工作：工作流，不是迭代序号

**「迭代 1..6」这套线性编号已停止使用。** 秋招模块（原迭代 5）已完成，架构考试通过；
设计基座（原迭代 4 的一部分）也已提前落地。实际执行顺序早就不是编号顺序，而编号一旦与
现实脱节就会持续误导——曾有一个叫 `feat/iteration-1-walking-skeleton` 的分支（现已修复），里面装着
秋招模块和设计基座。**迭代号会漂移，功能名不会。**

剩余工作改为有归属、有依赖的工作流：主题层（前端）、工作台模块（后端）、周日历 UI、
目标页、以及习惯 / 每日总结 / 社招。完整表格见主设计文档 §14.3。

## 两人并行开发

`main` 是主干，分支从 `main` 切，**按功能命名、不带迭代号**（`feat/theme-layer`，不是 `feat/iteration-2`）。

目录归属、交接点与踩踏规避顺序见 **`docs/parallel-development.md`**——开工前先读那一页。
一句话版本：**交接点只有 `modules/*/src/contract.ts`**，改它等于改契约、会影响对方；
其余目录各改各的。
