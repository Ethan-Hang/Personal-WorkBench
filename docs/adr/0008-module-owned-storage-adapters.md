# 0008. 模块自有存储适配器由组合根注入

日期：2026-08-17
状态：已接受

## 背景

`ServerModuleDefinition.migrations` 允许模块创建自有表，但当前 `ModuleContext` 只有
`moduleId + items`。这足够支撑无自有表的 todo，却无法让秋招模块读写投递与轮次。

三种直接补法都有问题：给 core 增加通用 `ModuleDatabase` 会迫使 core 定义数据库抽象；
把模块 Repository 放入 `packages/data` 会让 data 感知具体模块；让 service/routes 直接取得
共享数据库句柄则会把基础设施能力扩散到业务代码。

## 决策

每个需要自有表的模块：

1. 在模块内定义领域 Repository 接口、Drizzle schema、迁移与 SQLite 实现。
2. SQLite 实现只通过模块 schema 访问带模块前缀的表，不 import `@workbench/data`。
3. `packages/server/src/index.ts` 作为组合根，把已打开的 SQLite 连接交给模块适配器，再将
   Repository 注入模块工厂。
4. `ModuleContext` 不增加数据库句柄；service/routes 只依赖 core 能力与模块自有 Repository。
5. lint 将 SQLite/Drizzle 依赖限制在模块 storage 目录，避免连接向业务代码扩散。

## 后果

- core 与 data 都不感知具体模块；模块的表、迁移和实现仍可随模块目录一并删除。
- storage 适配器是可信基础设施边界。共享 SQLite 连接物理上能执行裸 SQL，因此表命名空间
  隔离无法完全由 TypeScript 证明；窄文件范围、schema 化访问和 lint 共同降低越界面。
- `ServerModuleDefinition` 与 `ModuleContext` 保持稳定。服务端注册从常量变成带 Repository
  参数的模块工厂，但仍只占注册表中的一项。
- 该模式可被后续自有表模块重复使用，但不提前抽取通用 Repository 基类或自制数据库 API。
