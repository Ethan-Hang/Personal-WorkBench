# 跨模块接缝修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好工作台今日页六个必抛的写操作，并落地一条 lint 规则，让「模块 UI 里出现裸的 `/api/` 字符串」从此断 CI。

**Architecture:** 两件事，同一个根因。bug 是 `modules/workbench/src/ui/api.ts` 手抄 todo 的响应形状时漏了 `kind`；修法是在 **todo 侧**补 `kind`（core 的 `Item` 本就有这个字段，todo 的视图漏掉它没有理由），因此不碰 workbench 一个生产文件就能修好。lint 规则则封住手抄这条路本身：`modules/*/src/ui/**` 的生产代码里禁止任何以 `/api/` 开头的字符串字面量与模板字面量，路径必须来自本模块 `contract.ts` 的常量。

**Tech Stack:** TypeScript、Zod v4、Vitest、ESLint 9 flat config、Fastify 5

**Spec:** `docs/superpowers/specs/2026-08-18-item-actions-registry-design.md`

> ⚠️ **本计划只做 spec 的 §4.1 与 §5 的第一条。** spec 的主体方案（§3 core 的
> `ItemActions` 能力槽、§4.2 todo 注册 actions、§4.3 退休 `/api/todo/today`）
> **本轮延缓**，另开分支。本计划落地后，spec §5「明确不做」里关于 lint 规则的那条
> 不再成立，需一并改写（Task 4）。

## Global Constraints

- **分支**：`fix/cross-module-api-seam`，**从 `feat/theme-layer` 切**，不从 `main` 切。
  `main` 上没有 `modules/workbench`（落后 10 个提交），从它切出来无法复现本 bug。
  这是对 CLAUDE.md「分支从 `main` 切」的一次有理由的偏离。
- **不得修改 `modules/workbench/src/ui/` 下的任何生产逻辑。** 该目录归对方。
  唯一允许的触碰是 Task 3 在 `api.ts` 顶部加一条 `eslint-disable` 注释，不动任何一行代码。
- **时间三分法**（CLAUDE.md）：instant 用 UTC ISO8601 带 `Z` 与三位毫秒；浮动日期用
  `YYYY-MM-DD` 绝不转 UTC。本计划不新增时间处理，但改到的 fixture 必须守这条。
- **`ScheduledTime` 的 `switch` 不加 `default` 分支**——没有 default，将来加第三种形态时
  TypeScript 会直接编译报错。
- **验收命令**：`npm run check`（format:check → typecheck → lint → test，四步全绿才算过）。
- **不测 React 渲染细节**，Vitest 的 `include` 刻意不收集 `.tsx`。
- 每个 workspace 必须在自己的 `package.json` 里声明它实际 import 的东西，本地包写 `"*"`，
  **不得**靠根 manifest 的 hoisting 生效（ADR-0006）。

---

### Task 0: 开分支

**Files:** 无

- [ ] **Step 1: 确认工作区干净、且在 `feat/theme-layer` 上**

```bash
git status --short
git branch --show-current
```

Expected：`git status --short` 无输出；当前分支为 `feat/theme-layer`。
若有未提交改动，先停下来问人，**不要 stash 或丢弃**。

- [ ] **Step 2: 切分支**

```bash
git switch -c fix/cross-module-api-seam
git branch --show-current
```

Expected：输出 `fix/cross-module-api-seam`。

---

### Task 1: todo 的 `taskView` 补 `kind`（修好六个写操作）

**Files:**

- Modify: `modules/todo/src/contract.ts` — `taskViewSchema`
- Modify: `modules/todo/src/server/service.ts` — `toView()`
- Test: `modules/todo/src/contract.test.ts`
- Test: `modules/todo/src/server/service.test.ts`

**Interfaces:**

- Consumes: core 的 `ITEM_KINDS`（`['task', 'event'] as const`，已由
  `packages/core/src/item.ts` 导出）与 `Item.kind: ItemKind`
- Produces: `TaskView` 类型新增必填字段 `kind: 'task' | 'event'`。
  Task 2 的跨模块回归测试依赖这个字段存在。

**背景（实现者必读）：** `modules/workbench/src/ui/api.ts` 用 workbench 的
`workbenchItemSchema.parse()` 去解析 todo 端点的响应。`workbenchItemSchema` 要求
`kind` 必填，而 todo 的 `toView()` 不产出它，于是六个写操作
（`postTodoTask` / `patchTodoTask` / `postTodoComplete` / `postTodoUncomplete` /
`postTodoTrash` / `postTodoRestore`）在 parse 处必抛。补上 `kind` 即修复，
**不需要改 workbench 任何一行**。

- [ ] **Step 1: 写失败的 contract 测试**

在 `modules/todo/src/contract.test.ts` 末尾追加：

```ts
describe('taskViewSchema 的 kind 字段', () => {
  it('接受带 kind 的形状', () => {
    const parsed = taskViewSchema.parse({
      id: 'a',
      title: '写周报',
      sourceModule: 'todo',
      kind: 'task',
      status: 'todo',
      importance: 'normal',
      dueAt: null,
      scheduled: { kind: 'all-day', date: '2026-08-18' },
      urgency: 'none',
      priorityScore: 1,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    });
    expect(parsed.kind).toBe('task');
  });

  it('缺少 kind 时拒绝——这正是六个写操作曾经必抛的那道缝', () => {
    const withoutKind = {
      id: 'a',
      title: '写周报',
      sourceModule: 'todo',
      status: 'todo',
      importance: 'normal',
      dueAt: null,
      scheduled: null,
      urgency: 'none',
      priorityScore: 1,
      isImportantQuadrant: false,
      isUrgentQuadrant: false,
    };
    expect(taskViewSchema.safeParse(withoutKind).success).toBe(false);
  });
});
```

该文件当前从 `./contract.js` 只取了 `ID_PARAM` / `TODO_API` / `batchIdsInputSchema` /
`createTaskInputSchema` / `updateTaskInputSchema`。**把 `taskViewSchema` 加进这个 import
列表**（按字母序插在 `createTaskInputSchema` 之后）。`describe` / `it` / `expect` 已从
`vitest` 引入，无需改动。

- [ ] **Step 2: 跑测试确认它失败**

```bash
npx vitest run modules/todo/src/contract.test.ts -t "kind"
```

Expected：FAIL。第一条因 `kind` 是未知键被剥掉、`parsed.kind` 为 `undefined` 而失败；
第二条因缺 `kind` 仍能通过校验（`success === true`）而失败。

- [ ] **Step 3: 在 contract 里加 `kind`**

`modules/todo/src/contract.ts`：把 `ITEM_KINDS` 加进顶部那行 core 的 import——

```ts
import { IMPORTANCES, ITEM_KINDS, ITEM_STATUSES, URGENCIES } from '@workbench/core';
```

再在 `taskViewSchema` 里 `sourceModule` 之后插入：

```ts
  /**
   * core Item 的种类。跨模块视图（工作台今日页、日历）靠它区分任务与事件，
   * 因此它是接缝的必填字段而非可选装饰。
   */
  kind: z.enum(ITEM_KINDS),
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run modules/todo/src/contract.test.ts -t "kind"
```

Expected：2 passed。

- [ ] **Step 5: 跑 todo 的 service 测试，看它红在哪**

```bash
npx vitest run modules/todo/src/server/service.test.ts
```

Expected：可能仍全绿（service 测试多数直接断言字段而非过 schema），
也可能有类型/断言失败。**无论哪种，都继续 Step 6**——生产代码此刻还没产出 `kind`。

- [ ] **Step 6: 写失败的 service 测试**

在 `modules/todo/src/server/service.test.ts` 的 `describe('createTask', ...)` 块内
（该块已有 `let ctx: ModuleContext;` 与 `beforeEach(() => { ctx = makeCtx(); });`），
追加一条用例：

```ts
it('产出的视图带 kind，工作台靠它区分任务与事件', async () => {
  const task = await createTask(
    ctx,
    { title: '写周报', importance: 'normal', dueDate: null },
    { zone: SH, now: NOW },
  );
  expect(task.kind).toBe('task');
});
```

`SH`（`'Asia/Shanghai'`）与 `NOW`（`'2026-09-20T02:00:00.000Z'`）是该文件顶部已有的
模块级常量，**直接用，不要新造**。该文件没有名为 `opts` 的变量——`ServiceOptions`
一律内联传入，照上面的写法。

- [ ] **Step 7: 跑测试确认它失败**

```bash
npx vitest run modules/todo/src/server/service.test.ts -t "带 kind"
```

Expected：FAIL，`expected undefined to be 'task'`。

- [ ] **Step 8: 让 `toView` 输出 `kind`**

`modules/todo/src/server/service.ts` 的 `toView()`，在 `sourceModule` 之后插入一行：

```ts
    kind: item.kind,
```

- [ ] **Step 9: 跑 todo 全量测试**

```bash
npx vitest run modules/todo
```

Expected：全部 passed。

- [ ] **Step 10: 提交**

```bash
git add modules/todo/src/contract.ts modules/todo/src/contract.test.ts \
        modules/todo/src/server/service.ts modules/todo/src/server/service.test.ts
git commit -m "$(cat <<'EOF'
fix(todo): taskView 补 kind，修复工作台今日页六个必抛的写操作

modules/workbench/src/ui/api.ts 用 workbenchItemSchema.parse() 解析 todo
端点的响应，而该 schema 要求 kind 必填、todo 的 toView() 不产出它。于是
新建 / 编辑 / 完成 / 取消完成 / 软删除 / 恢复六个操作在 parse 处必抛。

补 kind 的正确落点是 todo：core 的 Item 本就有这个字段，todo 的视图漏掉
它没有理由。因此不需要改 workbench 任何一行生产代码。

根因是 workbench UI 手抄了 todo 的响应形状而非共用 contract.ts，
下一个提交落地的 lint 规则封的就是这条路。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 跨模块形状回归测试

**Files:**

- Create: `packages/server/src/cross-module-contract.test.ts`
- Modify: `packages/server/package.json` — 补 `@workbench/module-workbench` 依赖

**Interfaces:**

- Consumes: Task 1 产出的 `TaskView.kind`；`@workbench/module-todo/contract` 的
  `taskViewSchema`；`@workbench/module-workbench/contract` 的 `workbenchItemSchema`
- Produces: 无（纯守卫）

**为什么落在 `packages/server`（实现者必读）：** 这条测试要同时 import 两个模块的
contract。`packages/server` 是组合根，它本就合法地依赖所有模块（`src/index.ts` 已经
这么做），因此这里不需要任何 lint 豁免，也不会给 `modules/*` 开先例。放进 `modules/*`
再靠测试文件豁免虽然能过 lint，但那是拿豁免掩盖一次真实的跨模块依赖，与本计划要
解决的问题同源。

**顺带修一处 ADR-0006 违规：** `packages/server/src/index.ts` 第 7 行 import 了
`@workbench/module-workbench`，但 `package.json` 的 `dependencies` 里没有它，
靠 npm workspace 的 hoisting 才没炸。本 Task 一并补上。

- [ ] **Step 1: 补 workspace 依赖声明**

```bash
npm install @workbench/module-workbench@* -w @workbench/server
```

Expected：`packages/server/package.json` 的 `dependencies` 里出现
`"@workbench/module-workbench": "*"`。

若该命令因本地包解析失败，改为手工编辑 `packages/server/package.json`，
在 `dependencies` 里 `"@workbench/module-todo": "*",` 之后插入一行
`"@workbench/module-workbench": "*",`，再跑 `npm install`。

- [ ] **Step 2: 写失败的回归测试**

创建 `packages/server/src/cross-module-contract.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { taskViewSchema } from '@workbench/module-todo/contract';
import { workbenchItemSchema } from '@workbench/module-workbench/contract';

/**
 * 工作台今日页会拿 workbenchItemSchema 去解析 todo 端点返回的 TaskView。
 * 两个 schema 由两个模块各自维护（铁律 1：模块间零依赖），因此谁都不会
 * 因为对方改了形状而编译报错——2026-08 就是这样漏掉了一个 kind 字段，
 * 让六个写操作在生产里必抛，而 npm run check 全绿。
 *
 * 这条测试是那道缝的守卫。它放在 packages/server 而不是任一模块内：
 * server 是组合根，本就合法地依赖所有模块，因此不需要 lint 豁免。
 */
describe('跨模块接缝：todo 的 TaskView 能被工作台消费', () => {
  const todoTaskView = {
    id: 'item-1',
    title: '写周报',
    sourceModule: 'todo',
    kind: 'task',
    status: 'todo',
    importance: 'normal',
    dueAt: null,
    scheduled: { kind: 'all-day', date: '2026-08-18' },
    urgency: 'none',
    priorityScore: 1,
    isImportantQuadrant: false,
    isUrgentQuadrant: false,
  };

  it('todo 的 taskViewSchema 认这个形状', () => {
    expect(taskViewSchema.safeParse(todoTaskView).success).toBe(true);
  });

  it('工作台的 workbenchItemSchema 也认——两个 schema 没有分叉', () => {
    const result = workbenchItemSchema.safeParse(todoTaskView);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('定时排程分支同样两边都认', () => {
    const timed = {
      ...todoTaskView,
      scheduled: { kind: 'timed', start: '2026-08-18T01:00:00.000Z' },
    };
    expect(taskViewSchema.safeParse(timed).success).toBe(true);
    expect(workbenchItemSchema.safeParse(timed).success).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
npx vitest run packages/server/src/cross-module-contract.test.ts
```

Expected：3 passed（Task 1 已经补好了 `kind`）。

**若第二条失败**，说明两个 schema 还有别的分叉——把 `result.error.issues` 的输出贴出来，
**停下来问人**，不要自行改动 workbench 的 schema（那是对方的文件）。

- [ ] **Step 4: 验证这条守卫真的会红（反向验证）**

临时把测试 fixture 里的 `kind: 'task',` 那一行注释掉，重跑：

```bash
npx vitest run packages/server/src/cross-module-contract.test.ts
```

Expected：FAIL，且失败信息里能看到缺 `kind` 的 issue。

**看到失败后把注释还原**，重跑确认回到 3 passed。
这一步是在证明守卫不是永真断言——没有它，这条测试可能什么都没守住。

- [ ] **Step 5: 提交**

```bash
git add packages/server/src/cross-module-contract.test.ts packages/server/package.json package-lock.json
git commit -m "$(cat <<'EOF'
test(server): 守住 todo 与工作台之间的形状接缝

两个模块各自维护自己的 Zod schema（铁律 1），谁都不会因为对方改了形状而
编译报错。上一个提交修的 kind 缺失就是这样逃逸的：六个写操作在生产里
必抛，而 npm run check 全绿。

守卫落在 packages/server 而非任一模块内——server 是组合根，本就合法地
依赖所有模块，因此不需要 lint 豁免，也不给 modules/* 开先例。

顺带补上 packages/server 对 module-workbench 的依赖声明：src/index.ts
早就 import 它，却只靠 workspace hoisting 生效，违反 ADR-0006。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: lint 规则——模块 UI 里禁止裸的 `/api/` 字符串

**Files:**

- Modify: `eslint.config.js` — 新增一个 flat config 块 + 测试豁免块补一行
- Modify: `packages/core/src/eslint.boundaries.test.ts` — 新增两条断言
- Modify: `modules/workbench/src/ui/api.ts` — **仅在文件顶部加注释，不动任何一行代码**

**Interfaces:**

- Consumes: 无
- Produces: 无

**规则设计（实现者必读）：** 规则只作用于 `modules/*/src/ui/**` 的**生产**代码。
那里不该出现任何以 `/api/` 开头的字符串——路径一律来自本模块 `contract.ts` 导出的
常量（`TODO_API` / `WORKBENCH_API` / `CAMPUS_API`）。这个作用域的好处是规则不需要
知道「当前文件属于哪个模块」：contract.ts 里定义路径字面量是合法的，它不在 `ui/` 下。

已实测过作用面，规则落地后命中如下：

| 文件                                        | 裸 `/api/` 数 | 处理                  |
| ------------------------------------------- | ------------- | --------------------- |
| `modules/workbench/src/ui/api.ts`           | 12            | 文件级 disable + TODO |
| `modules/workbench/src/ui/api.test.ts`      | 4             | 测试豁免（断言 URL）  |
| `modules/campus-recruit/src/ui/api.test.ts` | 8             | 测试豁免（断言 URL）  |
| `modules/todo/src/ui/api.ts`                | 0             | 本就走 `TODO_API`     |

即：规则精确命中唯一的真实违规，不误伤。

- [ ] **Step 1: 写失败的规则测试**

在 `packages/core/src/eslint.boundaries.test.ts` 的主 `describe` 块内追加：

```ts
it('模块 UI 不得出现裸的 /api/ 字符串字面量', async () => {
  const messages = await messagesFor(
    'modules/probe/src/ui/api.ts',
    "export const p = '/api/other/things';\n",
  );
  expect(messages.join('\n')).toContain('模块 UI 不得硬编码 API 路径');
});

it('模板字面量同样被拦——bug 就是从模板字面量那侧漏进来的', async () => {
  const messages = await messagesFor(
    'modules/probe/src/ui/api.ts',
    'export const p = (id: string) => `/api/other/things/${id}`;\n',
  );
  expect(messages.join('\n')).toContain('模块 UI 不得硬编码 API 路径');
});

it('contract.ts 里定义路径字面量是合法的——规则只管 ui/', async () => {
  const messages = await messagesFor(
    'modules/probe/src/contract.ts',
    "export const API = { today: '/api/probe/today' };\n",
  );
  expect(messages.join('\n')).not.toContain('模块 UI 不得硬编码 API 路径');
});

it('测试文件豁免：断言 fetch 收到的 URL 是正当用法', async () => {
  const messages = await messagesFor(
    'modules/probe/src/ui/api.test.ts',
    "const url = '/api/other/things';\n",
  );
  expect(messages.join('\n')).not.toContain('模块 UI 不得硬编码 API 路径');
});
```

- [ ] **Step 2: 跑测试确认前两条失败**

```bash
npx vitest run packages/core/src/eslint.boundaries.test.ts
```

Expected：前两条 FAIL（规则还不存在，`messages` 里没有那句话）；后两条 PASS（空断言，
此刻本就不含该消息）。**后两条现在通过不代表它们没用**——它们防的是规则写得过宽。

- [ ] **Step 3: 加规则**

`eslint.config.js`：在「packages/ui 是纯展示层」那个块**之后**、测试豁免块**之前**，
插入新块：

```js
  // 模块 UI 只能经 contract.ts 的常量拿路径（spec §7 前后端的接缝）。
  //
  // 这条规则补的是 no-restricted-imports 的盲区：它只能拦 import，拦不住裸字符串。
  // 2026-08 工作台今日页搬迁时，workbench 的 UI 手抄了 12 条 /api/todo/... 路径，
  // 铁律 1 就此被字符串绕过——lint 全绿，而手抄的响应形状漏了一个 kind 字段，
  // 六个写操作在生产里必抛。见 docs/superpowers/specs/2026-08-18-item-actions-registry-design.md。
  //
  // 作用域限定在 ui/ 是刻意的：contract.ts 里定义路径字面量正是它的职责，
  // 规则因此不需要知道「当前文件属于哪个模块」。
  {
    files: ['modules/*/src/ui/**/*.ts', 'modules/*/src/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\/api\\//]',
          message:
            '模块 UI 不得硬编码 API 路径。路径必须来自本模块 contract.ts 导出的常量——' +
            '服务端注册与前端调用共用同一份，才不会各改一半。跨模块调用请见 ADR-0005。',
        },
        {
          selector: 'TemplateElement[value.raw=/^\\/api\\//]',
          message:
            '模块 UI 不得硬编码 API 路径。路径必须来自本模块 contract.ts 导出的常量——' +
            '服务端注册与前端调用共用同一份，才不会各改一半。跨模块调用请见 ADR-0005。',
        },
      ],
    },
  },
```

再在最后那个测试豁免块的 `rules` 里补一行（与既有的两行并列）：

```js
      'no-restricted-syntax': 'off',
```

并把该块上方的注释补一句：

```js
// 测试文件放宽。
// no-restricted-imports 必须在此关掉：测试要造真实的 :memory: 库，
// 必然 import @workbench/data（spec §12.2 不 mock 数据库）。
// no-restricted-syntax 同理：传输层测试要断言 fetch 收到的 URL 字面量，
// 那是这类测试唯一有意义的断言对象（见 modules/todo/src/ui/api.test.ts）。
// 本块置于最后，flat config 后者覆盖前者。
```

- [ ] **Step 4: 跑规则测试确认四条全过**

```bash
npx vitest run packages/core/src/eslint.boundaries.test.ts
```

Expected：全部 passed。

若模板字面量那条仍失败，说明 ESLint 的选择器属性正则没匹配上。改用
`TemplateElement[value.cooked=/^\\/api\\//]` 再试，并把最终生效的那个写进配置。
**两个选择器都试不通就停下来问人**，不要放弃对模板字面量的拦截——bug 正是从那侧漏进来的。

- [ ] **Step 5: 跑全仓 lint，看规则命中了谁**

```bash
npm run lint
```

Expected：**FAIL**，且报错全部集中在 `modules/workbench/src/ui/api.ts`，共 12 处。
若还报到别的生产文件，说明规则过宽，回 Step 3 收窄作用域。

- [ ] **Step 6: 给已知的 12 处打显式豁免**

`modules/workbench/src/ui/api.ts` **文件最顶部**（在所有 import 之前）插入：

```ts
/* eslint-disable no-restricted-syntax -- 已知技术债，见下方 TODO */
//
// TODO(交接): 本文件有 12 条硬编码的 /api/todo/... 路径，绕过了 todo 的 contract.ts。
// 这是 2026-08 工作台今日页搬迁的遗留，铁律 1 被裸字符串绕过——手抄的响应形状
// 已经漏过一次 kind 字段，导致六个写操作在生产里必抛。
//
// 正确修法是 core 的 itemActions 能力槽：跨模块视图按 sourceModule 查到源模块
// 提供的写操作，双方都不 import 对方。方案与交接清单见
// docs/superpowers/specs/2026-08-18-item-actions-registry-design.md §3 与 §6。
//
// 改完后删掉本行 eslint-disable。规则本身是 error，新的裸字符串会立刻断 CI。
```

**只加注释，不动任何一行代码。** 这个文件归对方。

- [ ] **Step 7: 确认 lint 转绿**

```bash
npm run lint
```

Expected：无输出、退出码 0。

- [ ] **Step 8: 确认规则对新违规仍有牙（反向验证）**

```bash
printf "export const p = '/api/other/x';\n" > modules/todo/src/ui/__probe.ts
npm run lint; echo "退出码: $?"
rm -f modules/todo/src/ui/__probe.ts
```

Expected：报错指向 `modules/todo/src/ui/__probe.ts`，退出码非 0。
删掉探针文件后再跑一次 `npm run lint` 应回到绿。

**这一步不能跳过。** Step 7 的绿有可能是 disable 注释写得过宽把规则整个关掉了造成的，
只有这一步能区分「规则有牙且债被标出」与「规则被注释废掉」。

- [ ] **Step 9: 提交**

```bash
git add eslint.config.js packages/core/src/eslint.boundaries.test.ts modules/workbench/src/ui/api.ts
git commit -m "$(cat <<'EOF'
lint: 禁止模块 UI 硬编码 API 路径

no-restricted-imports 只能拦 import，拦不住裸字符串——工作台今日页搬迁时
workbench 的 UI 就此手抄了 12 条 /api/todo/... 路径，铁律 1 被绕过而 lint
全绿。手抄的响应形状漏了一个 kind 字段，六个写操作在生产里必抛。

新规则用 no-restricted-syntax 拦住 modules/*/src/ui/** 里以 /api/ 开头的
字符串字面量与模板字面量。作用域限定在 ui/ 是刻意的：contract.ts 里定义
路径字面量正是它的职责，规则因此不需要知道当前文件属于哪个模块。

测试文件豁免：传输层测试要断言 fetch 收到的 URL 字面量，那是这类测试
唯一有意义的断言对象。

已知的 12 处用一条文件级 disable + TODO 显式标出，指向 itemActions 能力槽
的方案与交接清单，不阻塞对方手头的活。规则本身是 error——新的裸字符串
会立刻断 CI。

eslint.boundaries.test.ts 加四条断言：字面量拦得住、模板字面量拦得住、
contract.ts 不误伤、测试文件豁免生效。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 更新过期文档

**Files:**

- Modify: `CLAUDE.md` — 「当前状态」段与两个 `today` 端点并存的表
- Modify: `docs/superpowers/specs/2026-08-18-item-actions-registry-design.md` — §5

**Interfaces:** 无

**背景（实现者必读）：** CLAUDE.md 有两处已被现实推翻：

1. 写着「`modules/workbench` 的服务端已经建好，**但 UI 还没搬**」——实际
   `packages/web/src/modules.ts` 现在只注册 `workbenchUiModule` 与
   `campusRecruitUiModule`，todo 的 UI 已不再挂载，搬迁已完成。
2. 那张「两个 `today` 端点并存」的表把 `/api/todo/today` 标为「待退休：前端完成 UI
   搬迁后删除」——退休条件已满足，但**本轮不删**（延缓到 itemActions 那一轮）。

**不要顺手把 `/api/todo/today` 删掉。** 那是下一轮的范围。

- [ ] **Step 1: 改 CLAUDE.md 的「当前状态」段**

把这段：

```
`modules/workbench` 的服务端已经建好，**但 UI 还没搬**。两个 `today` 端点因此并存：
```

改为：

```
`modules/workbench` 的 UI 搬迁**已经完成**——`packages/web/src/modules.ts` 现在只注册
`workbenchUiModule` 与 `campusRecruitUiModule`，`modules/todo/src/ui/` 已不再挂载
（1380 行的 `TodayPage.tsx` 就此成为死代码）。两个 `today` 端点仍并存：
```

- [ ] **Step 2: 改那张表的第二行**

把：

```
| `GET /api/todo/today`      | 待退休。前端完成 UI 搬迁后删除                       |
```

改为：

```
| `GET /api/todo/today`      | 待退休。已无消费者，随 itemActions 那一轮一并删除     |
```

- [ ] **Step 3: 改「在搬迁完成前」那句**

把：

```
**在搬迁完成前，不要再往 todo 里加跨模块能力**——每加一条，搬迁就多一分成本。
```

改为：

```
**不要再往 todo 里加跨模块能力。** 跨模块视图调用源模块写操作的正确机制是 core 的
`itemActions` 能力槽，方案见
`docs/superpowers/specs/2026-08-18-item-actions-registry-design.md`。
`modules/workbench/src/ui/api.ts` 里那 12 条硬编码的 `/api/todo/...` 是待还的债，
文件顶部有 TODO 标注。
```

- [ ] **Step 4: 改 spec 的 §5**

在 `docs/superpowers/specs/2026-08-18-item-actions-registry-design.md` 里，
把 §5「明确不做」的第一条整条替换为：

```markdown
- ~~**禁裸字符串 `/api/<别的模块>/` 的 lint 规则**：本轮不落。~~
  **已于 2026-08-18 落地**（分支 `fix/cross-module-api-seam`）：
  `eslint.config.js` 用 `no-restricted-syntax` 拦住 `modules/*/src/ui/**` 里以
  `/api/` 开头的字符串字面量与模板字面量，级别 `error`。workbench 那 12 条已知违规
  用文件级 `eslint-disable` + TODO 显式标出，不阻塞对方。
  **对方改用 `itemActions` 后需删掉那条 disable。**
```

并在 §1 之前加一行状态说明：

```markdown
> **实施状态（2026-08-18）**：§4.1（补 `kind`）与 §5 的 lint 规则已在分支
> `fix/cross-module-api-seam` 落地。§3 的 `ItemActions` 能力槽、§4.2、§4.3 延缓，
> 另开分支。
```

- [ ] **Step 5: 跑 format 检查**

```bash
npm run format:check
```

Expected：通过。若 Prettier 报某个 md 文件需要重排，跑 `npx prettier --write <文件>` 后继续。

- [ ] **Step 6: 提交**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-18-item-actions-registry-design.md
git commit -m "$(cat <<'EOF'
docs: 修正被现实推翻的两处状态描述

CLAUDE.md 写着工作台的 UI「还没搬」，但 packages/web/src/modules.ts 现在
只注册 workbenchUiModule 与 campusRecruitUiModule，todo 的 UI 已不再挂载，
搬迁其实已经完成，1380 行的 TodayPage.tsx 就此成为死代码。

/api/todo/today 的退休条件（前端完成搬迁）已满足，但本轮不删——延缓到
itemActions 那一轮，表格里改为如实记录。

spec §5 关于 lint 规则「本轮不落」的那条已不成立，改写为已落地，并注明
workbench 那条 eslint-disable 的删除条件。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 全量验收

**Files:** 无

- [ ] **Step 1: 跑完整检查**

```bash
npm run check
```

Expected：format:check → typecheck → lint → test，**四步全绿**。

任何一步红都不要用 `--force`、不要跳过、不要改测试去迁就实现。红在哪就停在哪，
把输出贴出来。

- [ ] **Step 2: 确认没有碰不该碰的文件**

```bash
git diff --stat feat/theme-layer...HEAD
```

Expected：改动文件应当恰好是这些，没有别的——

```
CLAUDE.md
docs/superpowers/plans/2026-08-18-cross-module-api-seam-fix.md
docs/superpowers/specs/2026-08-18-item-actions-registry-design.md
eslint.config.js
modules/todo/src/contract.test.ts
modules/todo/src/contract.ts
modules/todo/src/server/service.test.ts
modules/todo/src/server/service.ts
modules/workbench/src/ui/api.ts
package-lock.json
packages/core/src/eslint.boundaries.test.ts
packages/server/package.json
packages/server/src/cross-module-contract.test.ts
```

- [ ] **Step 3: 确认对 workbench 的改动只有注释**

```bash
git diff feat/theme-layer...HEAD -- modules/workbench/
```

Expected：只有新增行，且全部是注释（`//` 或 `/* */`）。**没有任何一行代码被改动。**
若出现代码改动，回退那部分——那个目录归对方。

- [ ] **Step 4: 对真实服务器冒烟**

```bash
npm run dev
```

在另一个终端：

```bash
curl -s -X POST http://127.0.0.1:3000/api/todo/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"冒烟：验证 kind","importance":"normal","dueDate":null}' | head -c 400
```

Expected：201，响应 JSON 里**含 `"kind":"task"`**。

这一步验的是 Task 1 的真实效果。单测能过但端到端形状不对的情况出现过——CLAUDE.md
记着那个教训：`app.inject({ method, url })` 不带任何 header，跑的是浏览器永远不会
发出的请求形状，曾因此漏掉一个 400。

跑完记得停掉 `npm run dev`。

- [ ] **Step 5: 报告结果**

把以下内容如实写出来，**不要美化**：

- `npm run check` 四步各自的结果与测试总数
- Step 4 冒烟的实际响应
- 任何跳过或未完成的步骤，以及原因
