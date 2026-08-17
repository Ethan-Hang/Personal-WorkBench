# 0007. ItemRepository 提供带模块归属的单条删除

日期：2026-08-17
状态：已接受

## 背景

首个自有实体模块需要删除录错的截止任务与面试事件。现有 `ItemRepository` 只有
`deleteBySourceModule(moduleId)`，它用于卸载整个模块，不能安全删除单条 Item。

直接增加 `delete(id)` 会让任何模块只要取得 ID 就能删除其他模块的 Item。删除比读取和
更新更难恢复，应把归属校验放进 Repository 签名，而不是依赖每个调用方记得先检查。

## 决策

增加：

```ts
delete(moduleId: string, id: string): Promise<boolean>
```

只有 `source_module = moduleId` 时才删除并返回 `true`。Item 不存在或属于其他模块时返回
`false`，不泄露两种情况的差别，也不抛错。

所有 Repository 实现必须通过相同契约：删除自己的 Item 成功；删除其他模块的 Item 失败，
且目标仍存在。

## 后果

- 模块能清理单条投影，同时无法误删其他模块的数据。
- core 因第二个真实模块增加一个通用 CRUD 能力，但 Item 模型与模块边界均未改变；这不构成
  ADR-0002 所说的架构失败。
- 已有 `update(id, patch)` 仍需调用方先校验 `sourceModule`。若后续模块反复需要更新归属保护，
  再单独评估是否把 `moduleId` 加入更新签名；本 ADR 不顺手扩大范围。
