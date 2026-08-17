# 秋招管理模块 — 设计

日期：2026-08-17
状态：已确认，待转实现计划
前置依赖：**共享设计基座**（色彩/间距 token + 基础原语）须先落地，本模块的两个页面直接用它编写

---

## 1. 定位

秋招投递的全流程跟踪：从录入公司、网申截止提醒，到各轮面试排期与结果，直到 Offer 或出局，并给出漏斗转化率。

参考来源是用户现有的 Excel 模板（`docs/adr/嵌入式秋招投递管理表(2).xlsx`，四张分表：投递总表 / 面试复盘表 / 岗位收集表 / 数据统计）。**Excel 中的数据是模板示例，非真实记录**，因此不做导入功能。

本模块同时是**整个架构的检验**：spec §14.2 与 ADR-0002 都把它列为首次以"外部模块"身份接入一个 core 完全没预料过的领域。顺利即架构成立。

## 2. 前提约束

| 约束       | 取值                                            | 来源   |
| ---------- | ----------------------------------------------- | ------ |
| 数据来源   | Excel 为模板示例，**不做导入**                  | 已确认 |
| 首版范围   | 投递管理 + 数据统计；**面试复盘与岗位收集推迟** | 已确认 |
| 轮次建模   | 任意多轮，一轮一条记录                          | 已确认 |
| 当前状态   | **派生，不存储**                                | 已确认 |
| 泡池子阈值 | **90 天**                                       | 已确认 |
| 优先级映射 | S/A → high，B → normal，C → low                 | 已确认 |

## 3. 核心张力与方案选择

**张力**：投递记录是一个长期存在的有状态实体（一条记录活三个月，从待投递走到 Offer），而 core 只有 `Item`（一件有时间的具体事）与 `Goal`。投递记录哪个都不是。

这正是 ADR-0002 写明的检验点：「若某个模块的领域实在无法映射到 Item，则需要重新评估本决策」。

### 采用方案：模块自有实体 + 只投影"有时间的事"

模块的表是领域真相；core `Item` 是它在时间轴上的投影。core 对秋招一无所知。

### 否决的方案

**投递记录本身做成 core Item** —— 会扭曲 core：`Item.status` 是 `inbox/todo/doing/done/cancelled`，装不下 `泡池子/OC/Offer/我拒了`。硬塞的结果要么给 core 加秋招专用状态（违反铁律 2），要么在模块里维护状态映射表（两个真相来源，重蹈 Excel 覆辙）。

**给 core 增加"长期实体"概念** —— 这是改 core 去适配模块，恰是 ADR-0002 判定为"假设错了"的信号。一个模块有需求不构成证据。

## 4. 数据模型

### 4.1 `campus_recruit_applications`

```
id                 text pk
company            text not null       position   text not null
company_type       text                industry   text        city  text
channel            text                referral   text
priority           text                S | A | B | C
apply_deadline     text                网申截止（UTC instant）
applied_at         text                投递日期（instant，null = 未投递）
outcome            text                null | offer | oc | rejected | declined | shelved
outcome_at         text
salary             text                offer 后填，自由文本（"14k·15薪"）
link               text                notes  text
deadline_item_id   text                → items.id，投影出去的截止任务
created_at, updated_at
```

`company_type` / `industry` / `city` / `channel` 为**自由文本**，不做枚举——Excel 中它们本就自由填写，枚举只会在遇到未预料的值时卡住用户。

### 4.2 `campus_recruit_rounds`

```
id                 text pk
application_id     text not null       → campus_recruit_applications.id
kind               text not null       assessment | written | technical | hr | other
name               text not null       自由文本："一面" / "交叉面" / "主管面"
scheduled_at       text                instant，null = 知道有这轮但未约时间
format             text                视频/电话/现场/线上
duration_min       integer
outcome            text not null       pending | passed | failed
outcome_at         text
notes              text
item_id            text                → items.id，投影出去的日程事件
created_at, updated_at
```

**`kind` 与 `name` 分离**是统计得以成立的前提：任意多轮之后，"进入一面"无法靠名称判断（可能写作"技术一面""交叉面""主管面"）。`kind` 在用户选择常见轮次名时**自动带出默认值**，但它是**存储字段而非持续派生**——选定即固定，不存在"这个值是算的还是改的"的歧义。

### 4.3 表名前缀

按 spec §5.4 规则：`campus-recruit` → 前缀 `campus_recruit_`。外键方向恒为**模块 → core**。

## 5. 状态派生

不存储 `status`，按下列顺序计算：

| 顺序 | 条件                                                   | 状态                           |
| ---- | ------------------------------------------------------ | ------------------------------ |
| 1    | `outcome = offer`                                      | Offer                          |
| 2    | `outcome = oc`                                         | OC（口头 offer）               |
| 3    | `outcome = declined`                                   | 我拒了                         |
| 4    | `outcome = rejected` **或任一轮次 `outcome = failed`** | 已挂（有轮次时附带"挂在一面"） |
| 5    | `applied_at` 为空                                      | 待投递                         |
| 6    | 无任何轮次，且 `now - applied_at > SHELVED_DAYS`       | 泡池子                         |
| 7    | 无任何轮次                                             | 已投递                         |
| 8    | 其余                                                   | 流程中 · 最新一轮名            |

**「已挂」的两个来源不会冲突**：标记某轮 `failed` 与将投递标为 `rejected` 都推出"已挂"，二者指向同一状态，因此不存在 Excel 那种"状态说 Offer、统计说仍在一面"的矛盾。前者额外提供**挂在哪一轮**的信息，而那正是统计所需。

**「最新一轮」排序**：有时间的按时间降序，无时间的排最后。故"一面已过、二面未约时间"显示为"二面"。

**`SHELVED_DAYS = 90`**，定义为模块内的具名常量。泡池子采用派生而非手动标记，理由与 ADR-0003 的 urgency 一致：手动状态无人回头更新。

## 6. 投影与联动

### 6.1 投影规则

| 模块中的事实 | 投影为                                                         | 触发条件             |
| ------------ | -------------------------------------------------------------- | -------------------- |
| 网申截止     | `kind=task`，`due_at`=截止，title「投递 {company} {position}」 | 填写截止日期且未投递 |
| 某轮时间     | `kind=event`，`scheduled` 定时，title「{company} {name}」      | 填写该轮时间         |

其余字段（公司类型、行业、内推码、薪资）**一律不投影**——它们不是有时间的事。

`importance` 由 `priority` 映射：S/A → high，B → normal，C → low。四档压三档仅损失在 Item 一侧；模块列表页仍按 S/A/B/C 排序。

### 6.2 联动行为

| 动作                                     | Item 变化                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| 填写投递日期                             | 截止任务标记 `done`                                  |
| 某轮标记 `failed`，或投递标记 `rejected` | 该投递**所有未来的、未完成的** Item 标记 `cancelled` |
| 投递标记 `declined`                      | 同上                                                 |
| 某轮标记 `passed`                        | 该轮 Item 标记 `done`，不影响其他                    |
| 删除某轮                                 | 删除其 Item                                          |
| 删除整条投递                             | 级联删除全部轮次及其 Item                            |

第二条是关键：**出局后日历上不应再挂着该公司的面试**，否则幽灵条目会迅速摧毁用户对日历的信任。使用 `cancelled` 而非删除，是因为记录本身要留作统计——挂在哪一轮是重要数据。

## 7. 架构发现：今日工作台是跨模块视图

设计投影行为时发现：**秋招的 Item 不会出现在今日工作台**，因为 `listToday` 带有 `sourceModules: [ctx.moduleId]` 过滤。

该过滤在迭代 1 正确（当时只有一个模块），但它暴露了更根本的问题：**「今日工作台」不是 todo 的功能，而是整个应用对所有 Item 的首页视图**。spec 的产品结论写的是"今日执行舱：聚焦今天 + 当前任务"，从不是"todo 的列表页"。将其实现于 `modules/todo` 内是迭代 1 单模块时的取巧。

### 决定的最小改法（不新建模块、不动 core）

1. `listToday` 去除 `sourceModules` 过滤，查询全部 Item
2. `TaskView` 增加 `sourceModule` 字段，供 UI 判断归属
3. **非 todo 的条目在今日工作台上只读**——显示标题与来源标签，无勾选框

第 3 条是关键：勾掉一条秋招的"网申截止"在语义上是"我投了"，属于秋招的动作而非"把 Item 标完成"。让 todo 的端点去改秋招的数据，恰会被 `sourceModule` 归属校验拦下（拦得正确）。正确做法是不提供勾选框，用户到秋招页面填写投递日期，截止任务自动消失。

**不引入 `itemDecorators`**：只读显示已解决"看不见"的问题；深度跳转是锦上添花，留待真正需要时（spec §8.3 已注明其为纯增量）。

## 8. 统计口径

| 指标                         | 口径                                       |
| ---------------------------- | ------------------------------------------ |
| 总数 / 待投递 / 已投递       | 由 `applied_at` 与派生状态得出             |
| 进入笔试测评 / 技术面 / HR面 | 存在对应 `kind` 的轮次                     |
| OC + Offer / 已挂 / 泡池子   | 派生状态                                   |
| 投递 → 笔试测评              | 有 `assessment\|written` 轮的数 ÷ 已投递数 |
| 投递 → 技术面                | 有 `technical` 轮的数 ÷ 已投递数           |
| 技术面 → Offer               | (offer + oc) 数 ÷ 有 `technical` 轮的数    |
| **挂在哪一轮的分布**         | 按 `failed` 轮次的 `kind` 分组计数         |

最后一项是 Excel 无法产出的：固定四列的表格只知道"没进下一轮"，而本模型知道**死在哪个环节**。这直接服务于 Excel 使用说明中那句"转化率低于同期均值时优先补对应环节"——技术面挂得多就练面试，投递后连笔试都少就改简历。

分母为零时转化率显示为"—"而非 `NaN` 或 `0%`。

## 9. core 变更：`ItemRepository.delete`

模块需要删除单条 Item（删除录错的投递、取消的面试轮次），而现有接口只有 `deleteBySourceModule`（整模块卸载用）。

```ts
create(moduleId: string, input: CreateItemInput): Promise<Item>
delete(moduleId: string, id: string): Promise<boolean>   // 新增
```

**带 `moduleId` 而非裸 `delete(id)`**，与 `create` 对称。删除比更新危险，因此让归属成为签名的一部分：秋招在类型层面即删不掉 todo 的 Item，符合项目"让边界够不着，而不是只是不许碰"的一贯做法。返回 `boolean` 表示是否实际删除（不存在或不属于调用方均返回 `false`，不抛错）。

配套：契约套件增加两条用例（删自己的 → `true` 且确已删除；删他人的 → `false` 且对方仍在）、SQLite 实现、以及一条 **ADR-0007** 记录"core 首次因模块需求变更，为何不构成架构失败"。

**为何不算失败**：ADR-0002 的失败信号是"Item 模型装不下该领域"，而 Item 装得下；这只是缺少一个常规 CRUD 操作，任何第二个模块都会同样需要，且是纯增量——接口加一个方法，不推翻任何既有内容。

## 10. 模块结构

与 `modules/todo` 同构——这本身即是架构主张的验证：

```
modules/campus-recruit/
├── package.json          自行声明依赖（ADR-0006）
├── migrations/           ⭐ 自有迁移，不进 core 集中目录
└── src/
    ├── contract.ts       Zod schema，前后端共用
    ├── server/
    │   ├── index.ts      campusRecruitServerModule
    │   ├── service.ts    投递/轮次增删改 + 状态派生 + 投影联动
    │   ├── stats.ts      统计查询
    │   └── routes.ts
    └── ui/
        ├── index.tsx     campusRecruitUiModule，挂载 /campus
        ├── ApplicationsPage.tsx
        └── StatsPage.tsx
```

**这是 `ServerModuleDefinition.migrations` 首次真正被使用**——迭代 1 中 todo 传空数组，注册表的迁移循环一直空转。本模块将证明该机制可用。

## 11. 测试策略

沿用既有分层，重点在两处纯逻辑：

| 测什么         | 怎么测                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **状态派生**   | 纯函数；8 条规则逐条覆盖 + 优先级顺序（同时有 offer 与 failed 轮时应为 Offer）+ 90 天边界                                   |
| **统计口径**   | 纯函数；给定投递与轮次数组算出各指标，含除零                                                                                |
| **投影联动**   | `:memory:` 真实库集成测试：填投递日期 → 截止 Item 变 `done`；标 `failed` → 未来 Item 变 `cancelled`；删投递 → Item 确已删除 |
| **跨模块隔离** | ⭐ 秋招创建的 Item 带 `source_module='campus-recruit'`；秋招删不掉 todo 的 Item                                             |

最后一项是本迭代最有价值的测试：它首次以**两个真实模块**实证边界，而非依靠单模块加 lint 规则推断。

## 12. YAGNI 清单（明确不做）

| 不做                             | 何时重新评估                                 |
| -------------------------------- | -------------------------------------------- |
| Excel 导入                       | 用户改用真实数据且已积累在表格中时           |
| 面试复盘（被问的问题、复盘思路） | 下一轮；与本模块数据模型正交                 |
| 岗位收集表（JD 暂存箱）          | 下一轮；是漏斗的上游入口                     |
| `itemDecorators` 深度跳转        | 只读显示不够用时                             |
| 提醒/通知                        | 需要主动推送时；当前依赖今日工作台的被动展示 |
| 多轮次模板（"大厂标准五轮"）     | 重复录入成为负担时                           |

## 13. 已知限制

1. **今日工作台上的秋招条目只读**，需跳转到秋招页面操作。深度链接见 §7。
2. **`kind` 默认值靠名称猜测**，用户选择自定义轮次名时需手动确认 `kind`，否则统计会落入"其他"。
3. **泡池子 90 天阈值**在秋招季（约 8–11 月）内几乎不会触发，实际上该状态在首个秋招季中近乎不可达。这是用户的明确选择——让"泡池子"只在真正凉透时才亮。若使用中觉得迟钝，改一个常量即可。
