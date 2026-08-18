# 跨模块视图如何调用源模块的写操作

日期：2026-08-18
状态：设计已确认，待实现
范围：`packages/core`、`modules/todo`、`docs/adr/0014`

> **实施状态（2026-08-18）**：§4.1（补 `kind`）与 §5 的 lint 规则已在分支
> `fix/cross-module-api-seam` 落地，六个必抛的写操作已修复。
> §3 的 `ItemActions` 能力槽、§4.2、§4.3 **延缓**，另开分支。

## 1. 起因

工作台今日页的 UI 搬迁已经完成——`packages/web/src/modules.ts` 现在只注册
`workbenchUiModule` 与 `campusRecruitUiModule`，`modules/todo/src/ui/` 已不再挂载。

但搬迁过程中，`modules/workbench/src/ui/api.ts` 里出现了 **12 条硬编码的
`/api/todo/...` 路径字符串**：

```ts
await request('/api/todo/tasks', { method: 'POST', body: JSON.stringify(input) });
await request(`/api/todo/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST' });
await request('/api/todo/trash/batch-restore', { method: 'POST', body: ... });
```

这破了两条东西：

1. **铁律 1（模块之间零依赖）被字符串绕过。** `eslint.config.js` 的
   `no-restricted-imports` 只能拦 `import`，拦不住裸字符串。lint 全绿，铁律已破。
2. **`contract.ts` 的核心保证失效。** CLAUDE.md 写着端点定义「服务端与客户端共用同一份，
   因此不可能各改一半」。硬编码字符串恰好造出了「各改一半」。

### 1.1 代价已经兑现了

不是理论风险。`workbench` 手抄 todo 的响应形状时抄漏了一个字段：

- `workbenchItemSchema` 要求 `kind: z.enum(['task', 'event'])`（必填）
- todo 的 `toView()` **不产出 `kind`**

于是 `workbenchItemSchema.parse()` 直接抛。受影响的是今日页的六个写操作：
`postTodoTask`、`patchTodoTask`、`postTodoComplete`、`postTodoUncomplete`、
`postTodoTrash`、`postTodoRestore`——新建、编辑、完成、取消完成、软删除、恢复，全部。

已用 Zod `safeParse` 探针在真实 schema 上验证：`success === false`，缺失字段 `kind`。

**而 `npm run check` 是绿的。** 因为两边没有共享的那一份定义，没有任何测试会红。

顺带还有两处同源的损伤：

- `fetchTodoTrash` 与四个批量操作用 `as` 断言，**完全没有运行时校验**——接缝在这里连
  「大声失败」都做不到。
- `TrashItemView` 是在 workbench 里手抄的 todo 形状副本。

## 2. 真正的缺口

今日页是**跨模块聚合视图**。它显示所有模块的 Item，但写操作属于源模块——
ADR-0012 已经把「排程」判给了工作台（不属于任何模块），对称地，「完成」属于源模块。

于是问题是：**一个跨模块视图，如何在不 import 源模块的前提下，调用源模块的写操作？**

这正是注册表要解决的问题，和 `uiModules` 让 web 外壳不必 import 每个模块的路由是同一回事。

### 2.1 被否决的两条路

**让今日页搬到 `packages/web` 外壳。** 铁律 1 管的是模块之间，外壳本来就 import 所有模块，
所以这条技术上成立。否决理由：外壳会变成知道所有模块细节的胖层，第 10 个模块加进来时
今日页还得改一次——**正好适得其反于项目第一目标**（第 10 个模块的加入成本 = 第 2 个）。

**只补 bug 不动架构**（给 `taskView` 补 `kind`、让 workbench UI import todo 的 `contract`
并豁免 lint）。否决理由：那是把铁律 1 从「被字符串绕过」升级成「正式开一个口子」，
且下一个跨模块视图会照抄。

## 3. 方案：`UiModuleDefinition` 的能力槽

### 3.1 core

```ts
// packages/core/src/module.ts

/**
 * 源模块对自己产出的 Item 提供的写操作。
 *
 * 动词全部可选——模块只声明它真正支持的。跨模块视图据此决定渲染哪些按钮，
 * 因此「哪些事项能完成」这个信号不再需要硬编码模块名（ADR-0012 遗留的前置问题）。
 */
export interface ItemActions {
  complete?(id: string): Promise<void>;
  uncomplete?(id: string): Promise<void>;
  /** 从视图中移除。软删还是硬删由源模块自己决定，core 不关心。 */
  remove?(id: string): Promise<void>;
}

export interface UiModuleDefinition {
  id: string;
  title: string;
  nav: NavEntry[];
  routes: UiRoute[];
  /** 无自有 Item 或不允许外部写的模块可省略。 */
  itemActions?: ItemActions;
}

/** 按 Item 的 sourceModule 找到对应的写操作。找不到返回 undefined。 */
export function itemActionsFor(
  modules: readonly UiModuleDefinition[],
  sourceModule: string,
): ItemActions | undefined;
```

`itemActionsFor` 放在 core 而不是各视图自己写循环，是为了让「找不到 → undefined →
不渲染按钮」成为一处的行为，而不是 N 个视图各自实现一遍。

### 3.2 为什么是 `remove` 而不是 `trash` / `restore`

ADR-0009 明写：todo 的回收站借用 `cancelled` 状态**不是可以照抄的模式**。把 `trash`
写进 core 就是把 todo 的领域概念焊进 core，破铁律 2。

`remove` 只表达「把这条从视图里拿掉」。todo 内部实现成软删进回收站；别的模块可以实现成
硬删、归档或别的什么。core 不需要知道回收站存在。

### 3.3 为什么这一轮不放 `update`

编辑要传 patch，而 todo 的端点收本地 `dueDate`（`YYYY-MM-DD`）、core 的 `Item` 存
`dueAt`（UTC instant）。这个换算该落在谁身上需要单独想清楚，且与 CLAUDE.md
「日期只有一种合理解释、由服务端补成末毫秒」那条不对称约定相关。

这一轮不放。编辑入口暂由 workbench 保留现状（补上 `kind` 后它是可用的），
后续单独一轮处理。

### 3.4 为什么回收站的五个端点不进能力槽

回收站是 todo 自己的领域概念（ADR-0009），它应该是 **todo 自己的 route**，
而不是 workbench 页面里的一个弹窗。这一轮不动它——`todoUiModule` 的
`routes` 保持为空，回收站页面的归属留给后续。

## 4. todo 侧的改动

### 4.1 补 `kind`（这一步同时修好那六个写操作）

- `contract.ts`：`taskViewSchema` 加 `kind: z.enum(ITEM_KINDS)`
- `service.ts`：`toView()` 输出 `kind: item.kind`

**关键性质：不碰 `modules/workbench` 任何一个文件，那六个写操作立刻恢复。**
因为 `workbenchItemSchema.parse` 缺的正是这一个字段。修 bug 与改架构在这里不冲突。

这个改动本身也独立站得住：core 的 `Item` 有 `kind`，todo 的视图漏掉它没有理由。

### 4.2 注册 `itemActions`

`modules/todo/src/ui/api.ts` 已经是一份完整的客户端，**每个端点都走
`TODO_API` 常量、每个响应都过 Zod**——正是 workbench 手抄时该用却没用的那份。
`itemActions` 直接架在它上面：

```ts
// modules/todo/src/ui/index.tsx
export const todoUiModule: UiModuleDefinition = {
  id: TODO_MODULE_ID,
  title: '待办',
  nav: [],
  routes: [],
  itemActions: {
    complete: async (id) => void (await postComplete(id)),
    uncomplete: async (id) => void (await postUncomplete(id)),
    // 「移除」在 todo 里的含义是软删进回收站（ADR-0009）
    remove: async (id) => void (await postTrash(id)),
  },
};
```

`todoUiModule` 已经是 `nav: []` / `routes: []` 的无页面形态，不需要改形状。

### 4.3 退休 `GET /api/todo/today` 与死代码

已无任何消费者（workbench UI 用的是 `/api/workbench/today`），满足 CLAUDE.md
写明的退休条件。删除：

| 目标                                     | 说明                              |
| ---------------------------------------- | --------------------------------- |
| `contract.ts` 的 `TODO_API.today`        | **交接点**，见 §6                 |
| `contract.ts` 的 `todayResponseSchema`   | 及其类型                          |
| `routes.ts` 的 `app.get(TODO_API.today)` | 路由注册                          |
| `service.ts` 的 `listToday`              | 及其测试                          |
| `ui/api.ts` 的 `fetchToday`              | 及其测试                          |
| `ui/TodayPage.tsx`                       | 1380 行死代码，已不被任何地方引用 |

## 5. 明确不做

- ~~**禁裸字符串 `/api/<别的模块>/` 的 lint 规则**：本轮不落。~~
  **已于 2026-08-18 落地**（分支 `fix/cross-module-api-seam`）：`eslint.config.js`
  用 `no-restricted-syntax` 拦住 `modules/*/src/ui/**` 里以 `/api/` 开头的字符串
  字面量与模板字面量，级别 `error`。实测精确命中 12 处、零误伤。workbench 那 12 条
  已知违规用文件级 `eslint-disable` + TODO 显式标出，不阻塞对方。
  **对方改用 `itemActions` 后需删掉那条 disable。**
- `ItemActions.update`（见 §3.3）
- 回收站页面归属（见 §3.4）
- workbench UI 那 12 处调用的改写（归对方，见 §6）

## 6. 交接点

**改了 `modules/todo/src/contract.ts` = 改了契约**，按 `docs/parallel-development.md`
这会影响对方。本轮对 todo 契约的改动有两处：

| 改动                            | 对 workbench UI 的影响                                 |
| ------------------------------- | ------------------------------------------------------ |
| `taskViewSchema` 加 `kind`      | **修复性**。六个写操作从「必抛」变成可用，无需对方配合 |
| 删 `TODO_API.today` 及其 schema | 无影响。已确认 workbench UI 不引用                     |

对方需要做的（不阻塞本轮）：

1. 把 `todoUiModule` 加回 `packages/web/src/modules.ts` 的 `uiModules`
   （它是 `nav: []` / `routes: []`，不会多出导航项）
2. 今日页的完成 / 取消完成 / 移除三个动作改走 `itemActionsFor(uiModules, item.sourceModule)`
3. 删掉 `modules/workbench/src/ui/api.ts` 里对应的硬编码函数
4. 编辑与回收站暂留现状

## 7. 测试

按 CLAUDE.md 的分层策略：

- **core**：`itemActionsFor` 的单测——命中、未命中、模块未声明 `itemActions`
- **todo service**：`toView` 输出 `kind` 的断言；`listToday` 相关用例随端点一并删除
- **todo contract**：`taskViewSchema` 接受带 `kind` 的形状
- **回归护栏**：一条断言 todo 的 `taskViewSchema` 产出的形状能通过 workbench 的
  `workbenchItemSchema`——**这正是本次 bug 逃逸的那道缝**。

  这条测试要同时 import 两个模块的 contract。落在
  `packages/server/src/cross-module-contract.test.ts`：server 是组合根，
  它本就合法地依赖所有模块（`index.ts` 已经这么做），因此这里不需要任何豁免，
  也不会给模块目录开先例。放进 `modules/*` 再靠测试文件豁免虽然能过 lint，
  但那是拿豁免掩盖一次真实的跨模块依赖，与本文档要解决的问题同源。

- UI 仍不做渲染测试（Vitest 的 `include` 不收 `.tsx`）

验收：`npm run check` 四步全绿。

## 8. ADR

新增 `docs/adr/0014-item-actions-as-a-ui-registry-capability.md`，记录：

- 跨模块视图调用源模块写操作的机制
- 为什么是 `remove` 而不是 `trash`（与 ADR-0009 的关系）
- 为什么这次必须改 `packages/core`——CLAUDE.md 说遇到这种要停下来想清楚。
  结论是 core 加的是**通用概念**（`complete` / `remove` 对应 core `Item` 已有的
  `status` 与 `completedAt`），不是任何模块的领域词汇，铁律 2 未破。
- 顺带解开 ADR-0012 的前置问题：「前端怎么知道哪些能拖 / 能完成」的信号，
  就是 `itemActions` 里有没有那个动词——秋招的投影 Item 不注册 `complete`，
  UI 自然不显示完成按钮，「点了完成、刷新又变回来」不再可能发生。
- 待补的 lint 规则（§5）
