# 招聘季 — 秋招模块升级为招聘模块 · 设计

日期：2026-08-24
状态：已确认，待转实现计划
相关：`docs/adr/0026-shelved-is-a-column-not-an-outcome.md`、
`docs/superpowers/specs/2026-08-17-personal-workbench-design.md` §14.3

---

## 1. 目标与范围

现在的秋招模块假定「只有一次秋招」：`campus_recruit_applications` 是一张平表，
所有投递平铺在一起。这个假定一旦不成立——你想同时管 2027 秋招、2027 春招和社招——
就没有任何维度能把它们分开：列表混在一起，统计口径更是把秋招与社招的转化率混算，
算出来的数没有意义。

本设计给模块加一层**招聘季**（season），投递归属到某一季，列表与统计按季作用。

**范围内：**

- 新表 `campus_recruit_seasons`，招聘季的增删改与归档
- 投递归属到招聘季（`season_id`），既有投递迁移进一个自动创建的「秋招」
- 投递列表与统计按季过滤，页面顶部一个全局「当前招聘季」切换器
- 把投递移到另一个招聘季
- UI 门面由「秋招」改称「招聘」

**明确不做：**

- **不重命名模块内部标识**：目录 `modules/campus-recruit`、模块 id `campus-recruit`、
  表前缀 `campus_recruit_`、API 前缀 `/api/campus`、路由 `/campus` 全部不变。理由见 §7。
- 不做跨季对比统计（「今年秋招 vs 去年秋招」）
- 不做招聘季模板、不做按日期自动归档
- 不做招聘季级别的权限、共享或导出

## 2. 数据模型

### 2.1 新表 `campus_recruit_seasons`

| 列                          | 类型 | 约束               | 说明                                                    |
| --------------------------- | ---- | ------------------ | ------------------------------------------------------- |
| `id`                        | TEXT | PK                 |                                                         |
| `name`                      | TEXT | NOT NULL，唯一索引 | 「2027 秋招」。重名会让切换器无法分辨，故唯一           |
| `kind`                      | TEXT | NOT NULL，CHECK    | `campus-autumn` / `campus-spring` / `intern` / `social` |
| `start_date`                | TEXT | 可空               | 浮动日期 `YYYY-MM-DD`                                   |
| `end_date`                  | TEXT | 可空               | 浮动日期 `YYYY-MM-DD`                                   |
| `archived_at`               | TEXT | 可空               | UTC 时刻                                                |
| `notes`                     | TEXT | 可空               |                                                         |
| `created_at` / `updated_at` | TEXT | NOT NULL           | 与现有两张表同形                                        |

`start_date` / `end_date` 是**浮动日期，绝不转 UTC**——「秋招从 8 月 1 日开始」在任何
时区都是 8 月 1 日。转 UTC 会让它在某些时区整体偏移一天（时间存储铁律，ADR-0004）。
它们目前只用于展示与排序，不参与任何判定。

### 2.2 `campus_recruit_applications` 加 `season_id`

```sql
ALTER TABLE campus_recruit_applications
  ADD COLUMN season_id TEXT REFERENCES campus_recruit_seasons(id);
```

**这一列在 DB 上可空，非空由应用层保证。** 这是一处刻意的妥协，理由必须留在代码里：

SQLite 的 `ADD COLUMN` 若带 `NOT NULL` 就必须带 `DEFAULT`，而那个 DEFAULT 会**永久留在
schema 里**——将来某处漏传 `seasonId` 不会报错，会静默落进那个 legacy 季，这正是本项目
一直在躲的那类静默错误。要真正的 `NOT NULL` 只能整表重建（12 步 ALTER 流程），
而 `campus_recruit_rounds` 有外键指向这张表，重建的风险远大于收益。

（SQLite 允许 `ADD COLUMN` 带 `REFERENCES`，前提是该列默认为 NULL——正好是这里的形状。）

非空由三处共同保证：`createApplicationInputSchema` 里 `seasonId` 必填；service 在写入前
校验该季存在（不存在回 404）；`ApplicationRecord.seasonId` 的 TS 类型是 `string` 而非
`string | null`。**理由写进迁移文件顶部与 `storage/schema.ts` 的列注释**，否则下一个人
会以为这是漏写。

### 2.3 迁移 0003 的三步顺序

顺序是承重的：

1. `CREATE TABLE campus_recruit_seasons`
2. `INSERT` 一条**固定 id** 的「秋招」（`kind = 'campus-autumn'`）
3. `ALTER TABLE ... ADD COLUMN season_id` 后 `UPDATE ... SET season_id = '<那个固定 id>'`

固定 id 而不是随机 UUID，是为了让这份迁移在任何库上跑出同样的结果——迁移是纯 SQL，
没有生成 UUID 的能力，而确定性也让「两台机器的库能不能对得上」这个问题有答案。

`0001` 那次已经留下了 snapshot，因此本次 `npm run db:generate` 能正常产出增量 diff，
不会重演 `0001` 那种「生成整份 CREATE TABLE」的情况（CLAUDE.md「模块迁移各记各账」）。
生成物仍需人眼过一遍：回填那两步 drizzle-kit 不会替你写。

## 3. 契约与端点

接缝仍然只有 `modules/campus-recruit/src/contract.ts`。

### 3.1 招聘季的四个新端点

| 端点                             | 说明                                            |
| -------------------------------- | ----------------------------------------------- |
| `GET /api/campus/seasons`        | 列出全部（含已归档），每条带 `applicationCount` |
| `POST /api/campus/seasons`       | 新建。名称重复 → 409                            |
| `PATCH /api/campus/seasons/:id`  | 改名 / 改类型 / 改起止 / `archived: boolean`    |
| `DELETE /api/campus/seasons/:id` | 见 §4 的两条拒绝规则                            |

`archived` 是布尔意图，落成哪个时刻由服务端决定——与 `shelved` 同形（ADR-0026）。
再次归档不刷新 `archived_at`：「从哪天起不再看它」才是有用的那个信息。

### 3.2 现有端点的变化

- `GET /api/campus/applications?seasonId=` — **可选**，省略即全部季
- `GET /api/campus/stats?seasonId=` — **可选**，省略即全部季
- `createApplicationInputSchema` 加 `seasonId`（**必填**）
- `updateApplicationInputSchema` 加 `seasonId`（可选）——这就是「移动到别的招聘季」
- `ApplicationView` 加 `seasonId` 与 `seasonName`

`seasonId` 可选而不是必填，是因为有个真实的跨季消费者：`packages/web/src/App.tsx` 的
命令面板（⌘K）搜的是全部投递。改成必填会让全局搜索只能搜到当前季，那是退步。
作为交换，**统计页恒传** `seasonId`，所以「秋招与社招混算转化率」这种没有意义的口径
不会在界面上出现。

`seasonName` 冗余在视图里而不是让前端自己关联，是因为跨季模式（命令面板、全部季列表）
下每条结果都要显示它属于哪一季；只给 id 等于把 join 推给每个消费者。

`computeStats` 一行不用改——它本来就是对「传进来的这批投递」算的，服务端按季过滤后
口径自动正确。

## 4. 归档与删除的语义

**归档只是 UI 概念，不改变任何数据行为。** 已归档的季默认不出现在切换器里（折在
「显示已归档」之后），但它的投递照旧投影成 core `Item`，日历与今日照旧显示。

理由：归档若同时停止投影，等于「整理了一下界面」把日历上的面试悄悄删了。
面试时间是客观事实，不因为你把某一季收起来而消失。

**删除招聘季在两种情况下拒绝（409，经 `@workbench/http-kit` 的 `conflict`）：**

1. **季里还有投递** → 提示先把投递移走或删掉。**不做级联删除**：一个下拉里的误点不该
   带走几十条投递及其全部轮次。这与刚落地的「撤回投递」是同一条原则——宁可让操作失败
   并提示下一步，也不悄悄丢用户录进去的数据。
2. **它是最后一个未归档的季** → 删了就没有地方放新投递了。

## 5. 前端

### 5.1 门面改名

侧边栏「秋招投递 / 秋招统计」→「投递管理 / 招聘统计」，页面标题「招聘管理」。
`packages/web/src/pages/SettingsPage.tsx:499` 那段模块说明同步改文案，并顺手修一个既有
错误：那里把表名写作 `campus_recruit_events`，实际叫 `campus_recruit_rounds`。

### 5.2 切换器

`SeasonSwitcher` 放进秋招页现有的 sticky 工具栏，投递页与统计页共用。
当前季存 localStorage，沿用同文件里 `VIEW_MODE_STORAGE_KEY` 的先例——它是页面局部
状态而非用户设置，不该占 `app_settings` 那张 KV 表（判据见 ADR-0018）。
首次进入取第一个未归档季。

### 5.3 招聘季管理

做成 Modal（新建 / 改名 / 归档 / 删除），**不新增页面**。页面已经 5 个，而 `.tsx` 是零
测试覆盖的（Vitest 的 `include` 刻意不收集 `.tsx`），再加一页只会放大那个缺口。

### 5.4 其余三处

- 新建投递弹窗标题带上当前季名——归属可见，但不必每次选
- 抽屉与行内编辑表单加「移动到其他招聘季」
- 命令面板结果里，非当前季的投递标出季名

### 5.5 一条与直觉不符、必须写进文档的性质

**日历与今日工作台不跟着切换器走。** 秋招的轮次与截止日投影成 core `Item`，
而日历是跨模块聚合、不认招聘季——你在招聘页切到「社招」，日历上照样显示秋招的面试。

这是正确的（排程属于使用者，投影属于源模块），但和「切换器」的直觉不一致，
因此要写进 CLAUDE.md，否则下次会被当成 bug 报。

## 6. 测试

| 层      | 覆盖                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| service | 季的 CRUD；重名 409；删除的两条拒绝各一条；归档不影响投影；列表与统计按季过滤；创建投递时 `seasonId` 不存在回 404；移动投递改季 |
| routes  | 端点级冒烟，含两种 409                                                                                                          |
| 迁移    | 新库跑完迁移后默认季存在                                                                                                        |
| UI      | 不测（现有策略）                                                                                                                |

**一块测不到的地方，先说清楚**：「旧库回填」没法用 `:memory:` 新库覆盖——新库里根本没有
旧数据。能测的只有「迁移后默认季存在」。真正的回填要在本地真实库上人工验收一次
（`data/local/accounts/local-default/workbench.db`，现有投递应全部落进「秋招」）。

**必须人工验收的三处 UI**：切换器、招聘季管理弹窗、移动投递。

## 7. 为什么不重命名模块内部标识

「改成招聘模块」听上去应当把 `campus-recruit` 一路改成 `recruit`。本设计刻意不做，
理由是代价与收益严重不对等：

- **迁移账本会换名**。`runMigrationsFrom` 按目录名派生记账表
  （`packages/data/src/db.ts:53`，`__drizzle_migrations_<slug>`）。目录一改，账本变成空表，
  四份迁移会在已有库上从头重跑，`table already exists`。
- **已存的 core `Item` 带着 `sourceModule = 'campus-recruit'`**，要一次数据改写；
  `packages/web/src/App.tsx` 里的跳转判断也依赖这个字符串。
- **备份与恢复的水位**按每条迁移谱系记录（`packages/sync`），改名会让旧备份的水位对不上
  新代码，触发「备份比代码新 → 拒绝」那条保护。
- 包名 `@workbench/module-campus-recruit`、API 前缀、路由 `/campus`、你的书签。

换来的只是「名字更准」。用户能看到的名字由 §5.1 的文案解决，不需要动这些。
**代价是名实不符**：代码里叫 `campus-recruit`，界面上叫「招聘管理」。这条要写进
CLAUDE.md，否则下一个人（或下一次的我）会以为文案写错了。

若将来仍要改名，它是一条独立的技术债任务，前置条件是先写出迁移账本的兼容方案。
