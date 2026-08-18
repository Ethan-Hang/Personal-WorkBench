# 0009. todo 回收站复用 core 的 cancelled 状态

日期：2026-08-18
状态：已接受

## 背景

todo 模块需要回收站：删除是软删除，可恢复，也可彻底销毁。真实使用中误删是常态，
「删掉就没了」对承载个人真实待办的工具而言代价过高。

core 的 `ItemStatus` 有五个取值 `inbox | todo | doing | done | cancelled`，其中
`cancelled` 至今没有任何模块使用。三条路：

- **给 core 加状态或列**（`trashed` 状态，或 `deleted_at` 列）：改动 core 的 Item 模型，
  而回收站是 todo 的产品决定，不是跨模块共享的概念。日历、秋招都不需要它。
- **模块自建软删除表**：todo 建 `todo_trashed_items(item_id)`。语义最干净，但 todo 至今
  零自有表，为一个布尔值引入一张表、一套迁移与一个 Repository 实现，代价明显偏高。
- **复用 `cancelled`**：零改动。

## 决策

**复用 `cancelled`，语义在 todo 模块内被解释为「在回收站中」。**

- `trashTask` 只改 `status`，**不清 `completedAt`**；
- 恢复时状态由 `completedAt` 反推（有值 → `done`，无值 → `todo`），而非一律恢复成 `todo`；
- `listTrash` 按 `sourceModules: [ctx.moduleId]` 过滤，只收本模块的项。

第二条是本 ADR 的承重部分。一律恢复成 `todo` 会让「已完成」这条信息在删除→恢复的往返中
静默丢失，并在库里留下 `status='todo'` 却带着 `completedAt` 的自相矛盾记录。

## 后果

- **todo 从此无法表达真正的「取消」。** 这被接受：todo 的产品语义里，「不做了」与「删掉」
  本就是同一个动作。
- **其他模块不受影响。** 秋招若用 `cancelled` 表达「这家挂了」，因 `listTrash` 按
  `sourceModule` 过滤，不会出现在 todo 的回收站里。反过来，todo 的回收站项会出现在任何
  不按状态过滤的跨模块查询中——目前没有这样的查询。
- **`cancelled` 的含义从此依模块而定，不再全局统一。** 这是本决策的真实代价：core 的
  状态词汇表被模块局部重新解释了一次。可以接受，但**不应成为惯例**——下一个模块若也想
  借用 core 的枚举值表达自己的概念，先回来读这一条。
- 将来若确实需要在 todo 里区分「取消」与「已删除」，补法是模块自有的软删除表，配一次
  `cancelled → 新表` 的数据迁移。属于纯增量，不推翻既有数据。
