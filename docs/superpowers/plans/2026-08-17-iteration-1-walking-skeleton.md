# 迭代 1：Walking Skeleton 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成一个功能极少但从 React 界面到 SQLite 文件全链路真实贯通的"今日工作台"，并让 CI 守住三条模块边界铁律。

**Architecture:** npm workspaces 单仓库，分 `packages/core`（纯领域逻辑，零 IO）、`packages/data`（SQLite + Drizzle 实现）、`packages/server`（Fastify 装配）、`packages/web`（React 外壳），以及 `modules/todo`（第一个真正的模块，含自己的 API 与 UI）。依赖方向恒为外层 → core；core 定义 `ItemRepository` 接口，data 提供实现（DIP）。模块只经 `ModuleContext` 触达 core，由 ESLint 边界规则强制。

**Tech Stack:** TypeScript(strict) · Node LTS · npm workspaces · tsx · Fastify 5 · better-sqlite3 · Drizzle ORM + drizzle-kit · Zod · React 19 + Vite · React Router · TanStack Query v5 · Tailwind CSS v4 · Luxon · Vitest · ESLint(flat config) + Prettier · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-17-personal-workbench-design.md`

## Global Constraints

- **三条边界铁律（spec §4.2 / §4.3），由 ESLint 强制，违反即 CI 失败：**
  1. `packages/core/**` 不得 import `@workbench/data` / `@workbench/server` / `@workbench/web` / `@workbench/module-*`
  2. `modules/A/**` 不得 import `@workbench/module-B`
  3. `modules/**` 不得直接 import `@workbench/data`，只能经由 `ModuleContext`
- **时间存储（spec §6）：** instant 一律 UTC ISO8601 文本（`2026-09-20T11:00:00.000Z`）；全天排程用浮动日期 `YYYY-MM-DD`，**绝不转 UTC**；`due_at` 恒为 instant，永不用浮动日期。
- **禁止在 SQL 中做时区转换（spec §6.4）：** 本地日边界必须在应用层换算成 UTC 区间后再查询。
- **优先级（spec §7）：** `importance` 手动存储（`high|normal|low`，默认 `normal`）；`urgency` **派生、不入库**；阈值 `IMMINENT_HOURS = 24`、`SOON_HOURS = 72` 为 core 中的具名常量。
- **SOLID 裁剪（spec §9.1）：** 只在"已有第二个实现"或"需保护架构边界"时抽接口，其余直接写具体实现。禁止投机性抽象。
- **测试策略（spec §12）：** 不 mock 数据库（用 `:memory:` SQLite）；不测 React 渲染细节；不设覆盖率门槛。core 与 service 层用 TDD，UI 层不用。
- **工作区包必须声明自身依赖：** 每个 `packages/*` 与 `modules/*` 的 `package.json` 都要在自己的
  `dependencies` / `devDependencies` 里声明它实际 import 的东西（本地包写 `"*"`，npm workspaces 会
  解析到本地）。安装一律用 `npm install <pkg> -w <workspace>`，**不得**装到根 manifest 靠 hoisting
  生效。理由：不声明依赖的包没有可读边界——读它的 manifest 看不出它被允许碰什么，而本项目的全部
  前提是硬模块边界。例外：仅由根 npm script 调用的 CLI 工具（如 `drizzle-kit`）留在根 devDependencies。
- **提交规范：** 分支 `feat/iteration-1-walking-skeleton`；commit message 使用 Conventional Commits；每个 Task 至少一次提交。

## 相对 spec 的两处有意偏离

执行时按本计划为准，两处偏离均已在下文对应 Task 说明理由：

1. **`ModuleDefinition` 拆成 `ServerModuleDefinition` 与 `UiModuleDefinition` 两个接口**（spec §8.1 是单一接口）。理由：单一接口会让 web 打包时把 Fastify 代码拉进浏览器产物。拆分同时也是 ISP 的正确应用 —— 服务端注册表不需要知道 React 路由。见 Task 5。
2. **`shadcn/ui` 推迟到迭代 4**（spec §10 列在第一批）。理由：迭代 1 的验收标准（spec §14.1）不含任何视觉要求，而 shadcn 组件是照着设计方向挑的，等迭代 4 确定"现代温暖"具体形态后再引入更合理。**Tailwind v4 本次即引入**，避免以后重写样式。

---

## 文件结构

```
personal-workbench/
├── package.json                          root，npm workspaces + 全部脚本
├── tsconfig.json                         全仓统一编译配置 + paths
├── eslint.config.js                      flat config，含三条边界规则
├── .prettierrc.json
├── vitest.config.ts                      单一配置覆盖全仓测试
├── .github/workflows/ci.yml
├── docs/adr/000{1..5}-*.md
├── packages/
│   ├── core/                             @workbench/core — 纯逻辑，零 IO
│   │   └── src/
│   │       ├── index.ts                  统一导出
│   │       ├── time.ts                   IsoInstant/PlainDate 类型 + 本地日边界换算
│   │       ├── time.test.ts
│   │       ├── item.ts                   Item / ScheduledTime / 枚举
│   │       ├── item.test.ts
│   │       ├── priority.ts               deriveUrgency / priorityScore / 阈值常量
│   │       ├── priority.test.ts
│   │       ├── repository.ts             ItemRepository 接口（DIP 的抽象端）
│   │       ├── module.ts                 ServerModuleDefinition / UiModuleDefinition / ModuleContext
│   │       └── testing/
│   │           └── item-repository-contract.ts   LSP 契约测试套件
│   ├── data/                             @workbench/data — SQLite 实现
│   │   ├── drizzle.config.ts
│   │   ├── migrations/                   drizzle-kit 生成
│   │   └── src/
│   │       ├── index.ts
│   │       ├── schema.ts                 items 表定义
│   │       ├── db.ts                     openDatabase / runCoreMigrations
│   │       ├── db.test.ts                迁移测试
│   │       ├── item-repository.ts        SqliteItemRepository
│   │       └── item-repository.test.ts   跑 core 的契约套件
│   ├── server/                           @workbench/server — Fastify 装配
│   │   └── src/
│   │       ├── index.ts                  进程入口
│   │       ├── app.ts                    buildApp()
│   │       ├── app.test.ts
│   │       └── registry.ts               模块注册：迁移 + 路由
│   └── web/                              @workbench/web — React 外壳
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx                  QueryClient + Router 装配
│           ├── App.tsx                   布局与导航（消费 uiModules）
│           ├── modules.ts                前端模块注册表
│           └── index.css                 @import "tailwindcss"
└── modules/
    └── todo/                             @workbench/module-todo
        └── src/
            ├── contract.ts               Zod schema，前后端共用（无副作用，两侧都可 import）
            ├── contract.test.ts
            ├── server/
            │   ├── index.ts              导出 todoServerModule
            │   ├── service.ts            createTask / listToday / completeTask
            │   ├── service.test.ts
            │   └── routes.ts             Fastify 路由
            │   └── routes.test.ts
            └── ui/
                ├── index.tsx             导出 todoUiModule（含 JSX，故为 .tsx）
                ├── api.ts                fetch 封装
                └── TodayPage.tsx         今日工作台页面
```

---

## 任务依赖顺序

```
1 工程骨架
└─ 2 core/time ─ 3 core/item ─ 4 core/priority ─ 5 core 接口+契约套件
                                                   └─ 6 data/schema+迁移 ─ 7 data/repository
                                                                             └─ 8 server 装配
                                                                                  └─ 9 todo contract+service
                                                                                       └─ 10 todo 路由
                                                                                            └─ 11 web 外壳
                                                                                                 └─ 12 todo UI
                                                                                                      └─ 13 ADR
                                                                                                           └─ 14 验收
```

---

## Task 1: 工程骨架与质量门禁

建立 workspaces、TypeScript、ESLint（含三条边界规则）、Prettier、Vitest、CI。本任务的交付物是**一条能跑绿的质量流水线**，后续每个任务都依赖它。

**Files:**

- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.husky/pre-commit`
- Create: `packages/core/package.json`, `packages/core/src/index.ts`

**Interfaces:**

- Consumes: 无（首个任务）
- Produces: npm 脚本 `npm run check`（= format:check + typecheck + lint + test）；workspace 包名约定 `@workbench/<name>`；tsconfig paths 别名

- [ ] **Step 1: 创建分支**

```bash
git checkout -b feat/iteration-1-walking-skeleton
```

- [ ] **Step 2: 写 root `package.json`**

```json
{
  "name": "personal-workbench",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "modules/*"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,magenta \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "tsx watch packages/server/src/index.ts",
    "dev:web": "vite --config packages/web/vite.config.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "check": "npm run format:check && npm run typecheck && npm run lint && npm run test",
    "db:generate": "drizzle-kit generate --config packages/data/drizzle.config.ts"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.0",
    "drizzle-kit": "^0.31.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.19.0",
    "vite": "^6.0.0",
    "vite-tsconfig-paths": "^5.1.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: 安装依赖**

```bash
npm install
```

预期：`node_modules/` 生成，无 ERR。若某个版本号已不存在，用 `npm install <pkg>@latest -D` 装最新版并同步回 `package.json` —— **不要**降级到更老的大版本。

- [ ] **Step 4: 写 `tsconfig.json`**

`moduleResolution: "bundler"` 让 tsx 与 Vite 都能直接吃 TS 源码，无需为内部包做构建。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@workbench/core": ["packages/core/src/index.ts"],
      "@workbench/core/testing": ["packages/core/src/testing/item-repository-contract.ts"],
      "@workbench/data": ["packages/data/src/index.ts"],
      "@workbench/server": ["packages/server/src/app.ts"],
      "@workbench/module-todo": ["modules/todo/src/server/index.ts"],
      "@workbench/module-todo/contract": ["modules/todo/src/contract.ts"],
      "@workbench/module-todo/ui": ["modules/todo/src/ui/index.tsx"]
    }
  },
  "include": ["packages/**/*", "modules/**/*", "*.ts", "*.config.ts"],
  "exclude": ["node_modules", "**/dist", "prototype-workbench"]
}
```

- [ ] **Step 5: 写 `.prettierrc.json` 与 `.prettierignore`**

`.prettierrc.json`：

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

`.prettierignore`：

```
node_modules
dist
packages/data/migrations
prototype-workbench
```

（`migrations/` 由 drizzle-kit 生成，不该被格式化。`prototype-workbench` 是归档原型，不参与工程化。）

- [ ] **Step 6: 写 `eslint.config.js` —— 三条边界铁律**

这是本任务的核心交付物。三条铁律在此从文档变成机器保证。

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** 依赖倒置：core 是最内层，不得依赖任何外层实现 */
const CORE_FORBIDDEN = [
  '@workbench/data',
  '@workbench/data/*',
  '@workbench/server',
  '@workbench/server/*',
  '@workbench/web',
  '@workbench/web/*',
  '@workbench/module-*',
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      'packages/data/migrations/**',
      'prototype-workbench/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 铁律 1：core 不得依赖外层（spec §4.2 铁律 2 + §9 DIP）
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: CORE_FORBIDDEN,
              message:
                '违反 spec §4.2 铁律 2：core 永不感知外层。core 只定义接口，实现由 data 提供（DIP）。',
            },
          ],
        },
      ],
    },
  },

  // 铁律 2 + 3：模块间零依赖；模块不得直连 data（spec §4.2）
  {
    files: ['modules/**/*.ts', 'modules/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@workbench/module-*'],
              message: '违反 spec §4.2 铁律 1：模块之间零依赖。需要共享的东西应上提到 core。',
            },
            {
              group: ['@workbench/data', '@workbench/data/*'],
              message: '违反 spec §4.3：模块不得直连数据层，只能经由 ModuleContext。',
            },
          ],
        },
      ],
    },
  },

  // 测试文件放宽。
  // no-restricted-imports 必须在此关掉：测试要造真实的 :memory: 库，
  // 必然 import @workbench/data（spec §12.2 不 mock 数据库）。
  // 本块置于最后，flat config 后者覆盖前者。
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/testing/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
```

安装 ESLint 核心配置包：

```bash
npm install -D @eslint/js
```

- [ ] **Step 7: 写 `vitest.config.ts`**

单一配置覆盖全仓，避免 workspace 配置在 Vitest 版本间的漂移。

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['packages/**/*.test.ts', 'modules/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 8: 创建 core 包占位，让流水线有东西可检查**

`packages/core/package.json`：

```json
{
  "name": "@workbench/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./testing": "./src/testing/item-repository-contract.ts"
  }
}
```

`packages/core/src/index.ts`：

```ts
export const CORE_PACKAGE_NAME = '@workbench/core';
```

- [ ] **Step 9: 跑质量门禁，确认全绿**

```bash
npm run check
```

预期：format:check、typecheck、lint 三步通过；test 一步因"没有测试文件"而通过或提示 no test files（Vitest 默认对无匹配文件报错，若报错则在 `vitest.config.ts` 的 `test` 中加 `passWithNoTests: true`）。

- [ ] **Step 10: 验证边界规则真的会拦人（关键验证）**

这一步是本任务的验收核心 —— 不验证的守卫等于没有守卫。

临时在 `packages/core/src/index.ts` 顶部加一行：

```ts
import '@workbench/data';
```

运行：

```bash
npm run lint
```

预期：**FAIL**，报错信息含"违反 spec §4.2 铁律 2"。

确认报错后删除该行，重新 `npm run lint` 应通过。

- [ ] **Step 11: 装 pre-commit hook（只跑 Prettier）**

spec §13.3：**只**用 lint-staged 跑格式化，**不**在 commit 时跑测试 —— 那会抑制提交意愿，导致憋出巨大提交。

```bash
npm install -D husky lint-staged
npx husky init
```

`npx husky init` 会生成 `.husky/pre-commit` 且内容默认是 `npm test`。**必须改掉**，写成：

```sh
npx lint-staged
```

在 root `package.json` 追加顶层字段：

```json
  "lint-staged": {
    "*.{ts,tsx,js,json,md,css,yml}": "prettier --write"
  }
```

- [ ] **Step 12: 验证 hook 生效**

```bash
printf 'const   a={b:1}\n' > /tmp/fmt-probe.ts && cp /tmp/fmt-probe.ts ./fmt-probe.ts
git add fmt-probe.ts && git commit -m "chore: 探测格式化 hook"
```

预期：commit 成功，且 `cat fmt-probe.ts` 显示已被格式化为 `const a = { b: 1 };`。

确认后清理：

```bash
git rm -f fmt-probe.ts && git commit -m "chore: 移除格式化探针"
```

- [ ] **Step 13: 写 `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
```

四步分开写而非 `npm run check`，这样 CI 日志里能一眼看出是哪一步红的。

- [ ] **Step 14: 提交**

```bash
git add -A
git commit -m "chore: 搭建 workspaces 骨架与质量门禁

含 ESLint 三条模块边界规则（spec §4.3），已验证违规能被拦截。"
```

---

## Task 2: core — 时间与本地日边界换算

spec §6 全部落到这一个文件。这是整个项目里最容易出微妙 bug、也最值得 TDD 的地方。

**Files:**

- Create: `packages/core/src/time.ts`, `packages/core/src/time.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: 无
- Produces:
  - `type IsoInstant = string`（UTC ISO8601，如 `'2026-09-20T11:00:00.000Z'`）
  - `type PlainDate = string`（浮动日期 `'YYYY-MM-DD'`，无时区）
  - `nowIso(): IsoInstant`
  - `toIsoInstant(d: Date): IsoInstant`
  - `localDayOf(instant: IsoInstant, zone: string): PlainDate`
  - `localDayRange(date: PlainDate, zone: string): { startUtc: IsoInstant; endUtc: IsoInstant }` — 左闭右开
  - `endOfLocalDayUtc(date: PlainDate, zone: string): IsoInstant` — 用于把"只选到天"的 DDL 补成 23:59:59.999 的 instant

- [ ] **Step 1: 装 Luxon**

```bash
npm install luxon
npm install -D @types/luxon
```

- [ ] **Step 2: 写失败的测试**

`packages/core/src/time.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { localDayOf, localDayRange, endOfLocalDayUtc, toIsoInstant } from './time.js';

const SH = 'Asia/Shanghai';
const NY = 'America/New_York';

describe('localDayOf', () => {
  it('按目标时区判断日期，而非 UTC 日期', () => {
    // UTC 的 9/19 16:30 已经是上海的 9/20 00:30
    expect(localDayOf('2026-09-19T16:30:00.000Z', SH)).toBe('2026-09-20');
  });

  it('同一时刻在不同时区可能是不同的一天', () => {
    const instant = '2026-09-20T02:00:00.000Z';
    expect(localDayOf(instant, SH)).toBe('2026-09-20');
    expect(localDayOf(instant, NY)).toBe('2026-09-19');
  });
});

describe('localDayRange', () => {
  it('返回本地日的 UTC 左闭右开区间', () => {
    expect(localDayRange('2026-09-20', SH)).toEqual({
      startUtc: '2026-09-19T16:00:00.000Z',
      endUtc: '2026-09-20T16:00:00.000Z',
    });
  });

  it('跨月边界正确', () => {
    expect(localDayRange('2026-10-01', SH)).toEqual({
      startUtc: '2026-09-30T16:00:00.000Z',
      endUtc: '2026-10-01T16:00:00.000Z',
    });
  });

  it('夏令时切换日的区间长度不是 24 小时', () => {
    // 2026-03-08 是美东夏令时开始日，这一天只有 23 小时
    const { startUtc, endUtc } = localDayRange('2026-03-08', NY);
    const hours = (Date.parse(endUtc) - Date.parse(startUtc)) / 3_600_000;
    expect(hours).toBe(23);
  });

  it('区间是左闭右开：次日零点属于下一天', () => {
    const { endUtc } = localDayRange('2026-09-20', SH);
    expect(localDayOf(endUtc, SH)).toBe('2026-09-21');
  });
});

describe('endOfLocalDayUtc', () => {
  it('把只选到天的 DDL 补成该本地日的最后一毫秒', () => {
    expect(endOfLocalDayUtc('2026-09-20', SH)).toBe('2026-09-20T15:59:59.999Z');
  });
});

describe('toIsoInstant', () => {
  it('输出带毫秒的 UTC ISO8601', () => {
    expect(toIsoInstant(new Date(Date.UTC(2026, 8, 20, 11, 0, 0)))).toBe(
      '2026-09-20T11:00:00.000Z',
    );
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run packages/core/src/time.test.ts
```

预期：FAIL，`Failed to resolve import "./time.js"`。

- [ ] **Step 4: 实现 `time.ts`**

```ts
import { DateTime } from 'luxon';

/** UTC ISO8601 时刻，形如 '2026-09-20T11:00:00.000Z'。字典序等于时间序。 */
export type IsoInstant = string;

/** 浮动日期 'YYYY-MM-DD'，不带时区。用于全天排程（spec §6.2）。 */
export type PlainDate = string;

function assertValid(dt: DateTime, input: string): DateTime {
  if (!dt.isValid) {
    throw new Error(`无效的时间输入 "${input}"：${dt.invalidReason ?? 'unknown'}`);
  }
  return dt;
}

export function toIsoInstant(d: Date): IsoInstant {
  return d.toISOString();
}

export function nowIso(): IsoInstant {
  return new Date().toISOString();
}

/** 该时刻落在目标时区的哪一天。 */
export function localDayOf(instant: IsoInstant, zone: string): PlainDate {
  const dt = assertValid(DateTime.fromISO(instant, { zone }), instant);
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * 本地日对应的 UTC 区间，左闭右开。
 * 时区换算集中在这里，SQL 层只做字符串比较（spec §6.4）。
 */
export function localDayRange(
  date: PlainDate,
  zone: string,
): { startUtc: IsoInstant; endUtc: IsoInstant } {
  const start = assertValid(DateTime.fromISO(date, { zone }), date).startOf('day');
  const end = start.plus({ days: 1 });
  return {
    startUtc: start.toUTC().toISO({ suppressMilliseconds: false })!,
    endUtc: end.toUTC().toISO({ suppressMilliseconds: false })!,
  };
}

/** 把"只精确到天"的 DDL 补成该本地日最后一毫秒的 instant（spec §5.3 决策 ③）。 */
export function endOfLocalDayUtc(date: PlainDate, zone: string): IsoInstant {
  const end = assertValid(DateTime.fromISO(date, { zone }), date).endOf('day');
  return end.toUTC().toISO({ suppressMilliseconds: false })!;
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run packages/core/src/time.test.ts
```

预期：PASS，8 个测试全绿。

若 `toISO()` 输出的是 `+00:00` 后缀而非 `Z`，改用 `.toUTC().toISO({ format: 'extended' })` 仍不行时，用 `new Date(dt.toMillis()).toISOString()` 兜底 —— 断言里的 `Z` 后缀是硬要求，因为字典序可比是我们的存储前提。

- [ ] **Step 6: 从 `index.ts` 导出**

`packages/core/src/index.ts`：

```ts
export type { IsoInstant, PlainDate } from './time.js';
export { nowIso, toIsoInstant, localDayOf, localDayRange, endOfLocalDayUtc } from './time.js';
```

- [ ] **Step 7: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(core): 时间类型与本地日边界换算

instant 用 UTC ISO8601，浮动日期不转 UTC；时区换算集中于此，SQL 只做字符串比较（spec §6）。"
```

---

## Task 3: core — Item 模型与 ScheduledTime

**Files:**

- Create: `packages/core/src/item.ts`, `packages/core/src/item.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `IsoInstant`, `PlainDate`（Task 2）
- Produces:
  - `type ItemKind = 'task' | 'event'`
  - `type ItemStatus = 'inbox' | 'todo' | 'doing' | 'done' | 'cancelled'`
  - `type Importance = 'high' | 'normal' | 'low'`
  - `type ScheduledTime = { kind: 'all-day'; date: PlainDate } | { kind: 'timed'; start: IsoInstant; end?: IsoInstant }`
  - `interface Item`（全字段见实现）
  - `scheduledSortKey(s: ScheduledTime): string`
  - `IMPORTANCE_RANK: Record<Importance, number>`

- [ ] **Step 1: 写失败的测试**

`packages/core/src/item.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { scheduledSortKey, IMPORTANCE_RANK } from './item.js';

describe('scheduledSortKey', () => {
  it('全天事件用浮动日期本身作为排序键', () => {
    expect(scheduledSortKey({ kind: 'all-day', date: '2026-09-20' })).toBe('2026-09-20');
  });

  it('定时事件用 UTC instant 作为排序键', () => {
    expect(scheduledSortKey({ kind: 'timed', start: '2026-09-20T09:00:00.000Z' })).toBe(
      '2026-09-20T09:00:00.000Z',
    );
  });

  it('同日的全天事件排在定时事件之前（spec §6.3 附带收益）', () => {
    const allDay = scheduledSortKey({ kind: 'all-day', date: '2026-09-20' });
    const timed = scheduledSortKey({ kind: 'timed', start: '2026-09-20T09:00:00.000Z' });
    expect(allDay < timed).toBe(true);
  });
});

describe('IMPORTANCE_RANK', () => {
  it('high > normal > low', () => {
    expect(IMPORTANCE_RANK.high).toBeGreaterThan(IMPORTANCE_RANK.normal);
    expect(IMPORTANCE_RANK.normal).toBeGreaterThan(IMPORTANCE_RANK.low);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run packages/core/src/item.test.ts
```

预期：FAIL，无法解析 `./item.js`。

- [ ] **Step 3: 实现 `item.ts`**

```ts
import type { IsoInstant, PlainDate } from './time.js';

export type ItemKind = 'task' | 'event';
export type ItemStatus = 'inbox' | 'todo' | 'doing' | 'done' | 'cancelled';
export type Importance = 'high' | 'normal' | 'low';

export const ITEM_KINDS = ['task', 'event'] as const;
export const ITEM_STATUSES = ['inbox', 'todo', 'doing', 'done', 'cancelled'] as const;
export const IMPORTANCES = ['high', 'normal', 'low'] as const;

/**
 * 排程时间（spec §6.3）。
 * 全天事件用浮动日期，绝不转 UTC；定时事件用 UTC instant。
 * 消费者必须穷尽处理两个分支（spec §9 LSP）。
 */
export type ScheduledTime =
  { kind: 'all-day'; date: PlainDate } | { kind: 'timed'; start: IsoInstant; end?: IsoInstant };

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  notes: string | null;
  status: ItemStatus;
  importance: Importance;
  /** DDL，恒为 instant，永不用浮动日期（spec §5.3 决策 ③） */
  dueAt: IsoInstant | null;
  /** 未排程时为 null */
  scheduled: ScheduledTime | null;
  estimateMinutes: number | null;
  /** 迭代 3 引入 Goal 后才会有值 */
  goalId: string | null;
  /** 创建它的模块 id，卸载模块时的清理凭据（spec §5.3 决策 ④） */
  sourceModule: string;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
  completedAt: IsoInstant | null;
}

export const IMPORTANCE_RANK: Record<Importance, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

/**
 * 排序键。两个分支的返回值可直接字典序比较：
 * '2026-09-20' < '2026-09-20T09:00:00.000Z'，故全天事件天然排在当天定时事件之前。
 */
export function scheduledSortKey(s: ScheduledTime): string {
  switch (s.kind) {
    case 'all-day':
      return s.date;
    case 'timed':
      return s.start;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run packages/core/src/item.test.ts
```

预期：PASS，4 个测试全绿。

- [ ] **Step 5: 从 `index.ts` 导出**

在 `packages/core/src/index.ts` 追加：

```ts
export type { ItemKind, ItemStatus, Importance, ScheduledTime, Item } from './item.js';
export {
  ITEM_KINDS,
  ITEM_STATUSES,
  IMPORTANCES,
  IMPORTANCE_RANK,
  scheduledSortKey,
} from './item.js';
```

- [ ] **Step 6: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(core): Item 实体与 ScheduledTime 值对象

ScheduledTime 用 discriminated union 强制穷尽处理全天/定时两分支（spec §6.3）。"
```

---

## Task 4: core — 优先级派生

spec §7 全部落到这一个文件。`importance` 入库，`urgency` **永不入库**。

**Files:**

- Create: `packages/core/src/priority.ts`, `packages/core/src/priority.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `IsoInstant`（Task 2）、`Importance` / `IMPORTANCE_RANK`（Task 3）
- Produces:
  - `const IMMINENT_HOURS = 24`、`const SOON_HOURS = 72`
  - `type Urgency = 'overdue' | 'imminent' | 'soon' | 'later' | 'none'`
  - `deriveUrgency(dueAt: IsoInstant | null, now: IsoInstant): Urgency`
  - `URGENCY_RANK: Record<Urgency, number>`
  - `priorityScore(importance: Importance, urgency: Urgency): number`
  - `isUrgentQuadrant(u: Urgency): boolean`、`isImportantQuadrant(i: Importance): boolean`

- [ ] **Step 1: 写失败的测试**

`packages/core/src/priority.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  deriveUrgency,
  priorityScore,
  isUrgentQuadrant,
  isImportantQuadrant,
  IMMINENT_HOURS,
  SOON_HOURS,
} from './priority.js';

const NOW = '2026-09-20T00:00:00.000Z';
const hoursLater = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

describe('deriveUrgency', () => {
  it('无 DDL 即 none（spec §7.4 已接受的取舍）', () => {
    expect(deriveUrgency(null, NOW)).toBe('none');
  });

  it('已过 DDL 为 overdue', () => {
    expect(deriveUrgency(hoursLater(-0.001), NOW)).toBe('overdue');
  });

  it('DDL 正好等于 now 不算 overdue', () => {
    expect(deriveUrgency(NOW, NOW)).toBe('imminent');
  });

  it('24 小时内为 imminent', () => {
    expect(deriveUrgency(hoursLater(1), NOW)).toBe('imminent');
  });

  it('边界：正好 24 小时仍为 imminent', () => {
    expect(deriveUrgency(hoursLater(IMMINENT_HOURS), NOW)).toBe('imminent');
  });

  it('边界：刚过 24 小时变为 soon', () => {
    expect(deriveUrgency(hoursLater(IMMINENT_HOURS + 0.001), NOW)).toBe('soon');
  });

  it('边界：正好 72 小时仍为 soon', () => {
    expect(deriveUrgency(hoursLater(SOON_HOURS), NOW)).toBe('soon');
  });

  it('边界：刚过 72 小时变为 later', () => {
    expect(deriveUrgency(hoursLater(SOON_HOURS + 0.001), NOW)).toBe('later');
  });
});

describe('priorityScore', () => {
  it('同等重要时，越紧急分越高', () => {
    expect(priorityScore('normal', 'overdue')).toBeGreaterThan(priorityScore('normal', 'later'));
  });

  it('同等紧急时，越重要分越高', () => {
    expect(priorityScore('high', 'soon')).toBeGreaterThan(priorityScore('low', 'soon'));
  });

  it('重要性优先于紧急性：重要但不急 > 不重要但已逾期', () => {
    expect(priorityScore('high', 'none')).toBeGreaterThan(priorityScore('low', 'overdue'));
  });
});

describe('四象限映射（spec §7.2）', () => {
  it('overdue/imminent/soon 落在紧急侧', () => {
    expect(['overdue', 'imminent', 'soon'].every((u) => isUrgentQuadrant(u as never))).toBe(true);
  });

  it('later/none 落在不紧急侧', () => {
    expect(['later', 'none'].some((u) => isUrgentQuadrant(u as never))).toBe(false);
  });

  it('只有 high 落在重要侧', () => {
    expect(isImportantQuadrant('high')).toBe(true);
    expect(isImportantQuadrant('normal')).toBe(false);
    expect(isImportantQuadrant('low')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run packages/core/src/priority.test.ts
```

预期：FAIL，无法解析 `./priority.js`。

- [ ] **Step 3: 实现 `priority.ts`**

```ts
import type { IsoInstant } from './time.js';
import { type Importance, IMPORTANCE_RANK } from './item.js';

/** 阈值为具名常量，调整只改这里（spec §7.2） */
export const IMMINENT_HOURS = 24;
export const SOON_HOURS = 72;

const HOUR_MS = 3_600_000;

export type Urgency = 'overdue' | 'imminent' | 'soon' | 'later' | 'none';

/**
 * 紧急度由 due_at 派生，永不入库（spec §7.1）。
 * 这样它永远新鲜、零维护 —— 手工维护的紧急度必然腐化。
 */
export function deriveUrgency(dueAt: IsoInstant | null, now: IsoInstant): Urgency {
  if (dueAt === null) return 'none';

  const deltaMs = Date.parse(dueAt) - Date.parse(now);
  if (Number.isNaN(deltaMs)) {
    throw new Error(`无法解析时间：dueAt="${dueAt}" now="${now}"`);
  }

  if (deltaMs < 0) return 'overdue';
  if (deltaMs <= IMMINENT_HOURS * HOUR_MS) return 'imminent';
  if (deltaMs <= SOON_HOURS * HOUR_MS) return 'soon';
  return 'later';
}

export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 4,
  imminent: 3,
  soon: 2,
  later: 1,
  none: 0,
};

/**
 * 列表默认排序用的派生分，不入库（spec §7.3）。
 * importance 权重 10 倍于 urgency，使"重要"始终压过"紧急" ——
 * 这正是艾森豪威尔矩阵的本意：不要让紧急的琐事挤掉重要的事。
 */
export function priorityScore(importance: Importance, urgency: Urgency): number {
  return IMPORTANCE_RANK[importance] * 10 + URGENCY_RANK[urgency];
}

/** 四象限横轴（spec §7.2） */
export function isUrgentQuadrant(u: Urgency): boolean {
  return u === 'overdue' || u === 'imminent' || u === 'soon';
}

/** 四象限纵轴（spec §7.2） */
export function isImportantQuadrant(i: Importance): boolean {
  return i === 'high';
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run packages/core/src/priority.test.ts
```

预期：PASS，14 个测试全绿。

- [ ] **Step 5: 从 `index.ts` 导出**

```ts
export type { Urgency } from './priority.js';
export {
  IMMINENT_HOURS,
  SOON_HOURS,
  URGENCY_RANK,
  deriveUrgency,
  priorityScore,
  isUrgentQuadrant,
  isImportantQuadrant,
} from './priority.js';
```

- [ ] **Step 6: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(core): 重要×紧急优先级模型

urgency 由 due_at 派生且不入库；重要性权重压过紧急性（spec §7）。"
```

---

## Task 5: core — Repository 接口、Module 接口与 LSP 契约套件

本任务只产出**抽象**，是 DIP 与 ISP 的落点。同时产出 `ItemRepository` 的契约测试套件 —— spec §9 明确要求"Repository 用同一套契约测试跑所有实现"，这是 LSP 的可验证信号。

**Files:**

- Create: `packages/core/src/repository.ts`, `packages/core/src/module.ts`, `packages/core/src/testing/item-repository-contract.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `Item`、`ScheduledTime`、`Importance`、`ItemKind`、`IsoInstant`、`PlainDate`
- Produces:
  - `interface CreateItemInput` / `interface UpdateItemPatch`
  - `interface ListItemsQuery`
  - `interface ItemRepository`
  - `interface ModuleContext` / `interface ServerModuleDefinition` / `interface UiModuleDefinition` / `interface MigrationSource` / `interface NavEntry` / `interface UiRoute`
  - `runItemRepositoryContract(name: string, makeRepo: () => Promise<ItemRepository> | ItemRepository): void`

- [ ] **Step 1: 实现 `repository.ts`**

```ts
import type { Item, ItemKind, ItemStatus, Importance, ScheduledTime } from './item.js';
import type { IsoInstant } from './time.js';

export interface CreateItemInput {
  kind: ItemKind;
  title: string;
  notes?: string | null;
  status?: ItemStatus;
  importance?: Importance;
  dueAt?: IsoInstant | null;
  scheduled?: ScheduledTime | null;
  estimateMinutes?: number | null;
  goalId?: string | null;
}

export interface UpdateItemPatch {
  title?: string;
  notes?: string | null;
  status?: ItemStatus;
  importance?: Importance;
  dueAt?: IsoInstant | null;
  scheduled?: ScheduledTime | null;
  estimateMinutes?: number | null;
  goalId?: string | null;
  completedAt?: IsoInstant | null;
}

export interface ListItemsQuery {
  /** 排程落在此 UTC 区间内（左闭右开）。由 localDayRange 算出，禁止在 SQL 里换算时区。 */
  scheduledWithin?: { startUtc: IsoInstant; endUtc: IsoInstant };
  /** 全天排程恰为此浮动日期。与 scheduledWithin 同时给出时取并集。 */
  scheduledOnDate?: string;
  /** DDL 早于此刻（用于逾期摘要） */
  dueBefore?: IsoInstant;
  statuses?: ItemStatus[];
  sourceModules?: string[];
}

/**
 * core 定义抽象，data 提供实现（spec §9 DIP）。
 * 所有实现必须通过 runItemRepositoryContract 的同一套契约测试（spec §9 LSP）。
 */
export interface ItemRepository {
  create(moduleId: string, input: CreateItemInput): Promise<Item>;
  getById(id: string): Promise<Item | null>;
  update(id: string, patch: UpdateItemPatch): Promise<Item>;
  list(query: ListItemsQuery): Promise<Item[]>;
  /** 模块卸载用：删除某模块产生的全部 Item（spec §5.6），返回删除条数。 */
  deleteBySourceModule(moduleId: string): Promise<number>;
}
```

- [ ] **Step 2: 实现 `module.ts` —— 拆成 server / ui 两个接口**

> **偏离 spec §8.1 的理由：** spec 定义了单一 `ModuleDefinition` 同时含 `registerRoutes`（Fastify）与 `routes`/`nav`（React）。若合并，web 打包时会把 Fastify 拉进浏览器产物。拆分后服务端注册表只看到自己需要的东西 —— 这正是 ISP 的正确应用，比原 spec 更符合 §9 的要求。

```ts
import type { ItemRepository } from './repository.js';

/** 模块自带的迁移来源。folder 为相对仓库根的路径。 */
export interface MigrationSource {
  folder: string;
}

/**
 * 模块能触达 core 的唯一通道（spec §8.2）。
 * 刻意不暴露数据库句柄 —— 模块间零依赖因此在接口层面即不可违反（ISP）。
 */
export interface ModuleContext {
  moduleId: string;
  items: ItemRepository;
}

export interface ServerModuleDefinition {
  id: string;
  /** 迭代 1 中 todo 模块无自有表，传空数组。机制在此就位，迭代 5 秋招模块首次真正使用。 */
  migrations: MigrationSource[];
  registerRoutes(app: unknown, ctx: ModuleContext): void | Promise<void>;
}

export interface NavEntry {
  path: string;
  label: string;
}

export interface UiRoute {
  path: string;
  element: unknown;
}

export interface UiModuleDefinition {
  id: string;
  title: string;
  nav: NavEntry[];
  routes: UiRoute[];
}
```

> `registerRoutes` 的 `app` 与 `UiRoute.element` 用 `unknown` 而非 `FastifyInstance` / `ReactNode`，因为 core 不得依赖 Fastify 或 React —— 那会让"零 IO 依赖"破功。调用方在自己那侧做一次断言即可。这是为守住铁律付出的、可接受的代价。

- [ ] **Step 3: 写 LSP 契约套件**

`packages/core/src/testing/item-repository-contract.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { ItemRepository } from '../repository.js';

/**
 * ItemRepository 的行为契约（spec §9 LSP）。
 * 任何实现——SQLite 版、将来的同步版——都必须原样通过这一套测试。
 */
export function runItemRepositoryContract(
  name: string,
  makeRepo: () => Promise<ItemRepository> | ItemRepository,
): void {
  describe(`ItemRepository 契约：${name}`, () => {
    let repo: ItemRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('create 后可按 id 取回，且带上 sourceModule', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '写周报' });
      const found = await repo.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('写周报');
      expect(found!.sourceModule).toBe('todo');
    });

    it('create 应用默认值：status=todo, importance=normal', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '默认值' });
      expect(created.status).toBe('todo');
      expect(created.importance).toBe('normal');
    });

    it('getById 对不存在的 id 返回 null 而非抛错', async () => {
      expect(await repo.getById('does-not-exist')).toBeNull();
    });

    it('往返保持 all-day 排程的浮动日期，不做时区偏移', async () => {
      const created = await repo.create('todo', {
        kind: 'event',
        title: '全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      const found = await repo.getById(created.id);
      expect(found!.scheduled).toEqual({ kind: 'all-day', date: '2026-09-20' });
    });

    it('往返保持 timed 排程的 UTC instant', async () => {
      const created = await repo.create('campus-recruit', {
        kind: 'event',
        title: '笔试',
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T11:00:00.000Z',
          end: '2026-09-20T13:00:00.000Z',
        },
      });
      const found = await repo.getById(created.id);
      expect(found!.scheduled).toEqual({
        kind: 'timed',
        start: '2026-09-20T11:00:00.000Z',
        end: '2026-09-20T13:00:00.000Z',
      });
    });

    it('update 修改字段并推进 updatedAt', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '旧标题' });
      await new Promise((r) => setTimeout(r, 2));
      const updated = await repo.update(created.id, { title: '新标题', status: 'done' });
      expect(updated.title).toBe('新标题');
      expect(updated.status).toBe('done');
      expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
    });

    it('update 不存在的 id 应抛错', async () => {
      await expect(repo.update('does-not-exist', { title: 'x' })).rejects.toThrow();
    });

    it('list 按 scheduledWithin 过滤定时排程', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '区间内',
        scheduled: { kind: 'timed', start: '2026-09-20T02:00:00.000Z' },
      });
      await repo.create('todo', {
        kind: 'event',
        title: '区间外',
        scheduled: { kind: 'timed', start: '2026-09-25T02:00:00.000Z' },
      });

      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found.map((i) => i.title)).toEqual(['区间内']);
    });

    it('list 的区间右端点是排除的', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '恰在右端点',
        scheduled: { kind: 'timed', start: '2026-09-20T16:00:00.000Z' },
      });
      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found).toHaveLength(0);
    });

    // 左端点必须单独测：只测右端点排除的话，实现把 >= 写成 > 也照样通过，
    // 而那会让恰好排在本地零点的事项从"今天"里静默消失。
    it('list 的区间左端点是包含的', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '恰在左端点',
        scheduled: { kind: 'timed', start: '2026-09-19T16:00:00.000Z' },
      });
      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found.map((i) => i.title)).toEqual(['恰在左端点']);
    });

    it('list 同时给出 scheduledWithin 与 scheduledOnDate 时取并集', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '定时',
        scheduled: { kind: 'timed', start: '2026-09-20T02:00:00.000Z' },
      });
      await repo.create('todo', {
        kind: 'event',
        title: '全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });

      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
        scheduledOnDate: '2026-09-20',
      });
      expect(found.map((i) => i.title).sort()).toEqual(['全天', '定时']);
    });

    it('list 按 statuses 过滤', async () => {
      await repo.create('todo', { kind: 'task', title: '未完成' });
      const done = await repo.create('todo', { kind: 'task', title: '已完成' });
      await repo.update(done.id, { status: 'done' });

      const found = await repo.list({ statuses: ['done'] });
      expect(found.map((i) => i.title)).toEqual(['已完成']);
    });

    it('list 按 dueBefore 过滤，用于逾期摘要', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '已逾期',
        dueAt: '2026-09-01T00:00:00.000Z',
      });
      await repo.create('todo', {
        kind: 'task',
        title: '未逾期',
        dueAt: '2026-12-01T00:00:00.000Z',
      });

      const found = await repo.list({ dueBefore: '2026-09-20T00:00:00.000Z' });
      expect(found.map((i) => i.title)).toEqual(['已逾期']);
    });

    it('deleteBySourceModule 只删该模块的 Item（spec §5.6）', async () => {
      await repo.create('todo', { kind: 'task', title: '留下' });
      await repo.create('campus-recruit', { kind: 'event', title: '删掉 1' });
      await repo.create('campus-recruit', { kind: 'event', title: '删掉 2' });

      const deleted = await repo.deleteBySourceModule('campus-recruit');
      expect(deleted).toBe(2);

      const remaining = await repo.list({});
      expect(remaining.map((i) => i.title)).toEqual(['留下']);
    });
  });
}
```

- [ ] **Step 4: 从 `index.ts` 导出（契约套件走独立子路径，不进主入口）**

在 `packages/core/src/index.ts` 追加：

```ts
export type {
  CreateItemInput,
  UpdateItemPatch,
  ListItemsQuery,
  ItemRepository,
} from './repository.js';
export type {
  MigrationSource,
  ModuleContext,
  ServerModuleDefinition,
  NavEntry,
  UiRoute,
  UiModuleDefinition,
} from './module.js';
```

契约套件通过 `@workbench/core/testing` 引入（Task 1 已在 package.json `exports` 与 tsconfig paths 中配好），**不从主入口导出** —— 生产代码不该能碰到测试工具。

- [ ] **Step 5: 确认类型编译通过**

```bash
npm run typecheck && npm run lint
```

预期：PASS。此时契约套件尚无实现可跑，属正常。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(core): Repository/Module 接口与 LSP 契约测试套件

ModuleDefinition 拆为 server/ui 两接口（ISP，偏离 spec §8.1，理由见计划）。
ItemRepository 的行为契约独立成套件，所有实现须原样通过（spec §9 LSP）。"
```

---

## Task 6: data — items 表、迁移与迁移测试

**Files:**

- Create: `packages/data/package.json`, `packages/data/drizzle.config.ts`, `packages/data/src/schema.ts`, `packages/data/src/db.ts`, `packages/data/src/db.test.ts`, `packages/data/src/index.ts`
- Generated: `packages/data/migrations/*.sql`

**Interfaces:**

- Consumes: core 的类型，以及 `ITEM_KINDS` / `ITEM_STATUSES` / `IMPORTANCES` 三个**运行期常量数组**
  —— drizzle 的 `text(col, { enum })` 需要真实数组值，这是刻意的：数据库枚举与领域类型共用
  同一真相来源，改一处两边同步。依赖方向 data → core，合规。
  因此 `packages/data/package.json` 必须声明 `@workbench/core` / `drizzle-orm` / `better-sqlite3`
  为自身依赖（与 `packages/core` 声明 `luxon` 同一模式），不得依赖 workspace 提升。
- Produces:
  - `items`（drizzle 表对象）
  - `type Db = BetterSQLite3Database<typeof schema>`
  - `openDatabase(path: string): { db: Db; sqlite: Database.Database }`
  - `runCoreMigrations(db: Db): void`
  - `runMigrationsFrom(db: Db, folder: string): void`
  - `openTestDatabase(): { db: Db; sqlite: Database.Database }` — `:memory:` + 已跑完迁移

- [ ] **Step 1: 装依赖并建包**

```bash
npm install drizzle-orm better-sqlite3
```

`packages/data/package.json`：

```json
{
  "name": "@workbench/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

- [ ] **Step 2: 写 `schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { IMPORTANCES, ITEM_KINDS, ITEM_STATUSES } from '@workbench/core';

/**
 * core 的统一事项表（spec §5.2）。
 * 时间列全部为 TEXT：instant 存 UTC ISO8601，全天排程存浮动日期 YYYY-MM-DD（spec §6）。
 * 注意：这里没有任何模块的名字 —— core 永不感知模块（spec §4.2 铁律 2）。
 */
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ITEM_KINDS }).notNull(),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: ITEM_STATUSES }).notNull().default('todo'),
    importance: text('importance', { enum: IMPORTANCES }).notNull().default('normal'),
    /** DDL，恒为 UTC ISO8601 instant */
    dueAt: text('due_at'),
    /** 1 时 scheduled_start 存浮动日期，0 时存 UTC instant */
    isAllDay: integer('is_all_day', { mode: 'boolean' }).notNull().default(false),
    scheduledStart: text('scheduled_start'),
    scheduledEnd: text('scheduled_end'),
    estimateMinutes: integer('estimate_minutes'),
    /** 迭代 3 引入 goals 表后再加外键约束 */
    goalId: text('goal_id'),
    sourceModule: text('source_module').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    completedAt: text('completed_at'),
  },
  (t) => [
    index('idx_items_scheduled_start').on(t.scheduledStart),
    index('idx_items_due_at').on(t.dueAt),
    index('idx_items_status').on(t.status),
    index('idx_items_source_module').on(t.sourceModule),
  ],
);
```

> 若 drizzle 版本对第三个参数仍要求返回对象而非数组，改成 `(t) => ({ scheduledStartIdx: index('idx_items_scheduled_start').on(t.scheduledStart), ... })`。两种写法在不同大版本中各有支持，以 `npm run typecheck` 的结果为准。

- [ ] **Step 3: 写 `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/data/src/schema.ts',
  out: './packages/data/migrations',
  dbCredentials: { url: './data/local/workbench.db' },
});
```

- [ ] **Step 4: 生成迁移文件**

```bash
npm run db:generate
```

预期：`packages/data/migrations/0000_*.sql` 与 `meta/` 生成，SQL 中含 `CREATE TABLE \`items\``。

打开生成的 SQL 肉眼确认：`due_at`、`scheduled_start` 是 `text`，`is_all_day` 是 `integer`。

- [ ] **Step 5: 写 `db.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_MIGRATIONS = resolve(HERE, '../migrations');

export function openDatabase(path: string): { db: Db; sqlite: Database.Database } {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** 跑 core 自己的迁移。 */
export function runCoreMigrations(db: Db): void {
  migrate(db, { migrationsFolder: CORE_MIGRATIONS });
}

/** 跑某个模块携带的迁移（spec §8.1 migrations 字段）。 */
export function runMigrationsFrom(db: Db, folder: string): void {
  migrate(db, { migrationsFolder: resolve(process.cwd(), folder) });
}

/** 测试专用：`:memory:` 库 + 已跑完 core 迁移。不 mock 数据库（spec §12.2）。 */
export function openTestDatabase(): { db: Db; sqlite: Database.Database } {
  const handle = openDatabase(':memory:');
  runCoreMigrations(handle.db);
  return handle;
}
```

> 若 `drizzle(sqlite, { schema })` 的类型报错，改用 `drizzle({ client: sqlite, schema })` —— 新旧两种调用签名在不同大版本中各有支持，以 `npm run typecheck` 为准。

- [ ] **Step 6: 写迁移测试**

`packages/data/src/db.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { openTestDatabase, runCoreMigrations } from './db.js';
import { items } from './schema.js';

describe('core 迁移', () => {
  it('建出 items 表', () => {
    const { db, sqlite } = openTestDatabase();
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='items'`,
    );
    expect(rows).toHaveLength(1);
    sqlite.close();
  });

  it('迁移可重复执行而不报错（幂等）', () => {
    const { db, sqlite } = openTestDatabase();
    // openTestDatabase 已跑过一次；第二次应被 drizzle 的迁移记录表拦下
    expect(() => runCoreMigrations(db)).not.toThrow();
    sqlite.close();
  });

  it('items 表的默认值生效', () => {
    const { db, sqlite } = openTestDatabase();
    db.insert(items)
      .values({ id: 'x1', kind: 'task', title: '默认值', sourceModule: 'todo' })
      .run();
    const row = db.select().from(items).all()[0]!;
    expect(row.status).toBe('todo');
    expect(row.importance).toBe('normal');
    expect(row.isAllDay).toBe(false);
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    sqlite.close();
  });

  it('title 与 source_module 为 NOT NULL', () => {
    const { db, sqlite } = openTestDatabase();
    expect(() =>
      db.run(sql`INSERT INTO items (id, kind, title) VALUES ('x2', 'task', '缺少 source_module')`),
    ).toThrow();
    sqlite.close();
  });
});
```

- [ ] **Step 7: 跑测试确认通过**

```bash
npx vitest run packages/data/src/db.test.ts
```

预期：PASS，4 个测试全绿。

- [ ] **Step 8: 写 `index.ts` 并把本地数据目录加进 .gitignore**

`packages/data/src/index.ts`：

```ts
export { items } from './schema.js';
export type { Db } from './db.js';
export { openDatabase, openTestDatabase, runCoreMigrations, runMigrationsFrom } from './db.js';
export { SqliteItemRepository } from './item-repository.js';
```

> `SqliteItemRepository` 在 Task 7 创建。若想让本任务独立通过 typecheck，先注释掉这一行，Task 7 再放开。

`.gitignore` 中确认已有 `data/local/`（Task 0 已写入，无需改动）。

- [ ] **Step 9: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(data): items 表、迁移与迁移测试

时间列全为 TEXT，instant 存 UTC ISO8601，全天排程存浮动日期（spec §6）。
迁移层必测——这是唯一写错会毁掉真实数据的地方（spec §12.1）。"
```

---

## Task 7: data — SqliteItemRepository

实现 core 定义的接口，并用 Task 5 的契约套件验证 LSP。

**Files:**

- Create: `packages/data/src/item-repository.ts`, `packages/data/src/item-repository.test.ts`
- Modify: `packages/data/src/index.ts`（放开 Task 6 Step 8 注释掉的那行）

**Interfaces:**

- Consumes: `ItemRepository` / `CreateItemInput` / `UpdateItemPatch` / `ListItemsQuery` / `Item` / `ScheduledTime`（core）；`items` / `Db`（Task 6）；`runItemRepositoryContract`（Task 5）
- Produces: `class SqliteItemRepository implements ItemRepository`，构造签名 `new SqliteItemRepository(db: Db)`

- [ ] **Step 1: 先写测试（契约套件 + 一条 SQL 层专属断言）**

`packages/data/src/item-repository.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { runItemRepositoryContract } from '@workbench/core/testing';
import { openTestDatabase } from './db.js';
import { SqliteItemRepository } from './item-repository.js';

runItemRepositoryContract('SqliteItemRepository', () => {
  const { db } = openTestDatabase();
  return new SqliteItemRepository(db);
});

describe('SqliteItemRepository 的存储细节', () => {
  it('全天排程在 SQL 层就是裸的 YYYY-MM-DD，没有被转成 UTC（spec §6.2）', async () => {
    const { db } = openTestDatabase();
    const repo = new SqliteItemRepository(db);
    await repo.create('todo', {
      kind: 'event',
      title: '全天',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const rows = db.all<{ scheduled_start: string; is_all_day: number }>(
      sql`SELECT scheduled_start, is_all_day FROM items`,
    );
    expect(rows[0]!.scheduled_start).toBe('2026-09-20');
    expect(rows[0]!.is_all_day).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run packages/data/src/item-repository.test.ts
```

预期：FAIL，无法解析 `./item-repository.js`。

- [ ] **Step 3: 实现 `item-repository.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import {
  nowIso,
  type CreateItemInput,
  type Item,
  type ItemRepository,
  type ListItemsQuery,
  type ScheduledTime,
  type UpdateItemPatch,
} from '@workbench/core';
import type { Db } from './db.js';
import { items } from './schema.js';

type Row = typeof items.$inferSelect;

/** 行 → ScheduledTime。is_all_day 决定 scheduled_start 的解释（spec §6.3）。 */
function toScheduled(row: Row): ScheduledTime | null {
  if (row.scheduledStart === null) return null;
  if (row.isAllDay) return { kind: 'all-day', date: row.scheduledStart };
  return row.scheduledEnd === null
    ? { kind: 'timed', start: row.scheduledStart }
    : { kind: 'timed', start: row.scheduledStart, end: row.scheduledEnd };
}

/** ScheduledTime → 列值。switch 穷尽两分支，漏一个即编译失败。 */
function fromScheduled(s: ScheduledTime | null): {
  isAllDay: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
} {
  if (s === null) return { isAllDay: false, scheduledStart: null, scheduledEnd: null };
  switch (s.kind) {
    case 'all-day':
      return { isAllDay: true, scheduledStart: s.date, scheduledEnd: null };
    case 'timed':
      return { isAllDay: false, scheduledStart: s.start, scheduledEnd: s.end ?? null };
  }
}

function toItem(row: Row): Item {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    status: row.status,
    importance: row.importance,
    dueAt: row.dueAt,
    scheduled: toScheduled(row),
    estimateMinutes: row.estimateMinutes,
    goalId: row.goalId,
    sourceModule: row.sourceModule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export class SqliteItemRepository implements ItemRepository {
  constructor(private readonly db: Db) {}

  async create(moduleId: string, input: CreateItemInput): Promise<Item> {
    const now = nowIso();
    const sched = fromScheduled(input.scheduled ?? null);
    const row = this.db
      .insert(items)
      .values({
        id: randomUUID(),
        kind: input.kind,
        title: input.title,
        notes: input.notes ?? null,
        status: input.status ?? 'todo',
        importance: input.importance ?? 'normal',
        dueAt: input.dueAt ?? null,
        isAllDay: sched.isAllDay,
        scheduledStart: sched.scheduledStart,
        scheduledEnd: sched.scheduledEnd,
        estimateMinutes: input.estimateMinutes ?? null,
        goalId: input.goalId ?? null,
        sourceModule: moduleId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      .returning()
      .get();
    return toItem(row);
  }

  async getById(id: string): Promise<Item | null> {
    const row = this.db.select().from(items).where(eq(items.id, id)).get();
    return row === undefined ? null : toItem(row);
  }

  async update(id: string, patch: UpdateItemPatch): Promise<Item> {
    const values: Partial<typeof items.$inferInsert> = { updatedAt: nowIso() };

    if (patch.title !== undefined) values.title = patch.title;
    if (patch.notes !== undefined) values.notes = patch.notes;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.importance !== undefined) values.importance = patch.importance;
    if (patch.dueAt !== undefined) values.dueAt = patch.dueAt;
    if (patch.estimateMinutes !== undefined) values.estimateMinutes = patch.estimateMinutes;
    if (patch.goalId !== undefined) values.goalId = patch.goalId;
    if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;
    if (patch.scheduled !== undefined) {
      const sched = fromScheduled(patch.scheduled);
      values.isAllDay = sched.isAllDay;
      values.scheduledStart = sched.scheduledStart;
      values.scheduledEnd = sched.scheduledEnd;
    }

    const row = this.db.update(items).set(values).where(eq(items.id, id)).returning().get();
    if (row === undefined) throw new Error(`Item 不存在：${id}`);
    return toItem(row);
  }

  async list(query: ListItemsQuery): Promise<Item[]> {
    const conditions: SQL[] = [];

    // 排程条件：定时区间 与 全天日期 取并集
    const scheduleAlternatives: SQL[] = [];
    if (query.scheduledWithin !== undefined) {
      scheduleAlternatives.push(
        and(
          eq(items.isAllDay, false),
          gte(items.scheduledStart, query.scheduledWithin.startUtc),
          lt(items.scheduledStart, query.scheduledWithin.endUtc),
        )!,
      );
    }
    if (query.scheduledOnDate !== undefined) {
      scheduleAlternatives.push(
        and(eq(items.isAllDay, true), eq(items.scheduledStart, query.scheduledOnDate))!,
      );
    }
    if (scheduleAlternatives.length === 1) conditions.push(scheduleAlternatives[0]!);
    if (scheduleAlternatives.length > 1) conditions.push(or(...scheduleAlternatives)!);

    if (query.dueBefore !== undefined) {
      // isNotNull 是冗余的（SQL 中 NULL < x 结果为 NULL，本就不会命中），
      // 但写出来让"无 DDL 的任务永远不算逾期"这条语义在代码里显式可见
      conditions.push(and(isNotNull(items.dueAt), lt(items.dueAt, query.dueBefore))!);
    }
    if (query.statuses !== undefined && query.statuses.length > 0) {
      conditions.push(inArray(items.status, query.statuses));
    }
    if (query.sourceModules !== undefined && query.sourceModules.length > 0) {
      conditions.push(inArray(items.sourceModule, query.sourceModules));
    }

    const rows =
      conditions.length === 0
        ? this.db.select().from(items).all()
        : this.db
            .select()
            .from(items)
            .where(and(...conditions))
            .all();

    return rows.map(toItem);
  }

  async deleteBySourceModule(moduleId: string): Promise<number> {
    const deleted = this.db
      .delete(items)
      .where(eq(items.sourceModule, moduleId))
      .returning({ id: items.id })
      .all();
    return deleted.length;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run packages/data/src/item-repository.test.ts
```

预期：PASS，契约套件 14 项 + 存储细节 1 项全绿。

- [ ] **Step 5: 放开 index 导出并跑全量门禁**

取消 `packages/data/src/index.ts` 中 `SqliteItemRepository` 那行的注释。

```bash
npm run check
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(data): SqliteItemRepository 并通过 core 契约套件

ScheduledTime 双向映射用 switch 穷尽两分支；全天排程在 SQL 层保持裸日期（spec §6.2/§9 LSP）。"
```

---

## Task 8: server — Fastify 装配与模块注册表

**Files:**

- Create: `packages/server/package.json`, `packages/server/src/registry.ts`, `packages/server/src/app.ts`, `packages/server/src/app.test.ts`, `packages/server/src/index.ts`

**Interfaces:**

- Consumes: `ServerModuleDefinition` / `ModuleContext` / `ItemRepository`（core）；`openDatabase` / `openTestDatabase` / `runCoreMigrations` / `runMigrationsFrom` / `SqliteItemRepository`（data）
- Produces:
  - `buildApp(opts: { db: Db; modules: ServerModuleDefinition[] }): Promise<FastifyInstance>`
  - `registerModules(app: FastifyInstance, db: Db, items: ItemRepository, modules: ServerModuleDefinition[]): Promise<void>`

- [ ] **Step 1: 装 Fastify 并建包**

```bash
npm install fastify
```

`packages/server/package.json`：

```json
{
  "name": "@workbench/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/app.ts",
  "types": "./src/app.ts",
  "exports": { ".": "./src/app.ts" }
}
```

- [ ] **Step 2: 写失败的测试**

`packages/server/src/app.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import type { ServerModuleDefinition } from '@workbench/core';
import { openTestDatabase } from '@workbench/data';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

function fakeModule(id: string, calls: string[]): ServerModuleDefinition {
  return {
    id,
    migrations: [],
    registerRoutes(app, ctx) {
      calls.push(`${id}:${ctx.moduleId}`);
      (app as FastifyInstance).get(`/api/${id}/ping`, async () => ({ from: ctx.moduleId }));
    },
  };
}

describe('buildApp', () => {
  it('暴露健康检查', async () => {
    const { db } = openTestDatabase();
    const app = await buildApp({ db, modules: [] });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('为每个模块调用 registerRoutes，并传入以自身 id 构造的 ModuleContext', async () => {
    const { db } = openTestDatabase();
    const calls: string[] = [];
    const app = await buildApp({
      db,
      modules: [fakeModule('alpha', calls), fakeModule('beta', calls)],
    });

    expect(calls).toEqual(['alpha:alpha', 'beta:beta']);

    const res = await app.inject({ method: 'GET', url: '/api/beta/ping' });
    expect(res.json()).toEqual({ from: 'beta' });
    await app.close();
  });

  it('模块经 ModuleContext 创建的 Item 自动带上自己的 sourceModule', async () => {
    const { db } = openTestDatabase();
    let createdSource = '';
    const probe: ServerModuleDefinition = {
      id: 'probe',
      migrations: [],
      async registerRoutes(_app, ctx) {
        const item = await ctx.items.create(ctx.moduleId, { kind: 'task', title: '探针' });
        createdSource = item.sourceModule;
      },
    };
    const app = await buildApp({ db, modules: [probe] });
    expect(createdSource).toBe('probe');
    await app.close();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run packages/server/src/app.test.ts
```

预期：FAIL，无法解析 `./app.js`。

- [ ] **Step 4: 实现 `registry.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import type { ItemRepository, ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { runMigrationsFrom, type Db } from '@workbench/data';

/**
 * 模块注册（spec §8）。
 * 每个模块先跑自己的迁移，再注册路由，并只拿到以自身 id 构造的 ModuleContext。
 * 迭代 1 中 todo 模块 migrations 为空数组，此循环空转；机制在此就位，
 * 迭代 5 的秋招模块是第一个真正使用它的模块。
 */
export async function registerModules(
  app: FastifyInstance,
  db: Db,
  items: ItemRepository,
  modules: ServerModuleDefinition[],
): Promise<void> {
  const seen = new Set<string>();

  for (const mod of modules) {
    if (seen.has(mod.id)) {
      throw new Error(`模块 id 重复：${mod.id}`);
    }
    seen.add(mod.id);

    for (const source of mod.migrations) {
      runMigrationsFrom(db, source.folder);
    }

    const ctx: ModuleContext = { moduleId: mod.id, items };
    await mod.registerRoutes(app, ctx);
  }
}
```

- [ ] **Step 5: 实现 `app.ts`**

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { SqliteItemRepository, type Db } from '@workbench/data';
import { registerModules } from './registry.js';

export interface BuildAppOptions {
  db: Db;
  modules: ServerModuleDefinition[];
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  app.get('/api/health', async () => ({ ok: true }));

  const items = new SqliteItemRepository(opts.db);
  await registerModules(app, opts.db, items, opts.modules);

  await app.ready();
  return app;
}
```

- [ ] **Step 6: 跑测试确认通过**

```bash
npx vitest run packages/server/src/app.test.ts
```

预期：PASS，3 个测试全绿。

- [ ] **Step 7: 写进程入口 `index.ts`**

todo 模块尚不存在（Task 9 创建），先留一个空模块列表，Task 10 再接入。

```ts
import { openDatabase, runCoreMigrations } from '@workbench/data';
import { buildApp } from './app.js';

const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
const PORT = Number(process.env.PORT ?? 3000);

const { db } = openDatabase(DB_PATH);
runCoreMigrations(db);

const app = await buildApp({ db, modules: [], logger: true });

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
```

- [ ] **Step 8: 手动确认服务能起来**

```bash
npm run dev:server
```

另开一个终端：

```bash
curl http://127.0.0.1:3000/api/health
```

预期输出：`{"ok":true}`。同时确认 `data/local/workbench.db` 文件已生成。确认后 Ctrl+C 停掉。

- [ ] **Step 9: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(server): Fastify 装配与模块注册表

模块只拿到以自身 id 构造的 ModuleContext；模块迁移机制就位（spec §8）。"
```

---

## Task 9: modules/todo — Zod 契约与 service

第一个真正的模块。注意它**不 import `@workbench/data`** —— 只经 `ModuleContext` 触达 core。

**Files:**

- Create: `modules/todo/package.json`, `modules/todo/src/contract.ts`, `modules/todo/src/contract.test.ts`, `modules/todo/src/server/service.ts`, `modules/todo/src/server/service.test.ts`

**Interfaces:**

- Consumes: `ModuleContext`、`deriveUrgency`、`priorityScore`、`localDayRange`、`localDayOf`、`endOfLocalDayUtc`、`nowIso`、`Item`
- Produces:
  - `TODO_MODULE_ID = 'todo'`
  - `createTaskInputSchema` / `type CreateTaskInput`
  - `taskViewSchema` / `type TaskView`
  - `todayResponseSchema` / `type TodayResponse`
  - `createTask(ctx, input, opts): Promise<TaskView>`
  - `listToday(ctx, opts): Promise<TodayResponse>`
  - `completeTask(ctx, id, opts): Promise<TaskView>`
  - `opts: { zone: string; now?: IsoInstant }`

- [ ] **Step 1: 装 Zod 并建包**

```bash
npm install zod
```

`modules/todo/package.json`：

```json
{
  "name": "@workbench/module-todo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/server/index.ts",
  "types": "./src/server/index.ts",
  "exports": {
    ".": "./src/server/index.ts",
    "./contract": "./src/contract.ts",
    "./ui": "./src/ui/index.tsx"
  }
}
```

- [ ] **Step 2: 写 `contract.ts`（前后端共用，无副作用）**

```ts
import { z } from 'zod';

export const TODO_MODULE_ID = 'todo';

export const importanceSchema = z.enum(['high', 'normal', 'low']);
export const urgencySchema = z.enum(['overdue', 'imminent', 'soon', 'later', 'none']);

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字'),
  importance: importanceSchema.default('normal'),
  /** 只精确到天的 DDL；服务端补成该本地日 23:59:59.999 的 instant（spec §5.3 决策 ③） */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
    .nullable()
    .default(null),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['inbox', 'todo', 'doing', 'done', 'cancelled']),
  importance: importanceSchema,
  dueAt: z.string().nullable(),
  urgency: urgencySchema,
  priorityScore: z.number(),
  isImportantQuadrant: z.boolean(),
  isUrgentQuadrant: z.boolean(),
});
export type TaskView = z.infer<typeof taskViewSchema>;

export const todayResponseSchema = z.object({
  /** 本地日期，用于界面显示"今天是哪天" */
  date: z.string(),
  zone: z.string(),
  /** 今日任务，按 priorityScore 降序、dueAt 升序 */
  tasks: z.array(taskViewSchema),
  /** 逾期摘要：首页顶部醒目提示，按需展开（原型已确认结论） */
  overdue: z.array(taskViewSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
```

- [ ] **Step 3: 写 contract 测试**

`modules/todo/src/contract.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createTaskInputSchema } from './contract.js';

describe('createTaskInputSchema', () => {
  it('填上默认值', () => {
    expect(createTaskInputSchema.parse({ title: '写周报' })).toEqual({
      title: '写周报',
      importance: 'normal',
      dueDate: null,
    });
  });

  it('去掉标题首尾空白', () => {
    expect(createTaskInputSchema.parse({ title: '  写周报  ' }).title).toBe('写周报');
  });

  it('拒绝空标题', () => {
    expect(() => createTaskInputSchema.parse({ title: '   ' })).toThrow();
  });

  it('拒绝非 YYYY-MM-DD 的日期', () => {
    expect(() => createTaskInputSchema.parse({ title: 'x', dueDate: '2026/09/20' })).toThrow();
  });

  it('接受合法日期', () => {
    expect(createTaskInputSchema.parse({ title: 'x', dueDate: '2026-09-20' }).dueDate).toBe(
      '2026-09-20',
    );
  });
});
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run modules/todo/src/contract.test.ts
```

预期：PASS，5 个测试全绿。（本步无需先失败 —— schema 与测试同批写就，直接验证即可。）

- [ ] **Step 5: 写 service 的失败测试**

`modules/todo/src/server/service.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { TODO_MODULE_ID } from '../contract.js';
import { createTask, listToday, completeTask } from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z'; // 上海时间 9/20 10:00

function makeCtx(): ModuleContext {
  const { db } = openTestDatabase();
  return { moduleId: TODO_MODULE_ID, items: new SqliteItemRepository(db) };
}

describe('createTask', () => {
  let ctx: ModuleContext;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('创建的任务默认排在今天', async () => {
    const task = await createTask(
      ctx,
      { title: '写周报', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).toContain(task.id);
  });

  it('dueDate 被补成该本地日的最后一毫秒（spec §5.3 决策 ③）', async () => {
    const task = await createTask(
      ctx,
      { title: '有死线', importance: 'high', dueDate: '2026-09-20' },
      { zone: SH, now: NOW },
    );
    expect(task.dueAt).toBe('2026-09-20T15:59:59.999Z');
  });

  it('无 dueDate 时 urgency 为 none（spec §7.4）', async () => {
    const task = await createTask(
      ctx,
      { title: '无死线', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.urgency).toBe('none');
  });
});

describe('listToday', () => {
  let ctx: ModuleContext;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('返回本地日期与时区', async () => {
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.date).toBe('2026-09-20');
    expect(today.zone).toBe(SH);
  });

  it('按 priorityScore 降序排列', async () => {
    await createTask(
      ctx,
      { title: '低', importance: 'low', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      { title: '高', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      { title: '中', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );

    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.title)).toEqual(['高', '中', '低']);
  });

  it('逾期任务进 overdue 而不进 tasks', async () => {
    await createTask(
      ctx,
      { title: '早就该做完', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.overdue.map((t) => t.title)).toEqual(['早就该做完']);
    expect(today.tasks.map((t) => t.title)).not.toContain('早就该做完');
  });

  it('已完成的任务不出现在 overdue 中', async () => {
    const task = await createTask(
      ctx,
      { title: '逾期但已完成', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, task.id, { zone: SH, now: NOW });
    const today = await listToday(ctx, { zone: SH, now: NOW });
    expect(today.overdue).toHaveLength(0);
  });
});

describe('completeTask', () => {
  it('把状态置为 done 并写入 completedAt', async () => {
    const ctx = makeCtx();
    const task = await createTask(
      ctx,
      { title: '做完它', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const done = await completeTask(ctx, task.id, { zone: SH, now: NOW });
    expect(done.status).toBe('done');

    const stored = await ctx.items.getById(task.id);
    expect(stored!.completedAt).toBe(NOW);
  });

  it('对不存在的 id 抛错', async () => {
    const ctx = makeCtx();
    await expect(completeTask(ctx, 'nope', { zone: SH, now: NOW })).rejects.toThrow();
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

```bash
npx vitest run modules/todo/src/server/service.test.ts
```

预期：FAIL，无法解析 `./service.js`。

- [ ] **Step 7: 实现 `service.ts`**

```ts
import {
  deriveUrgency,
  endOfLocalDayUtc,
  isImportantQuadrant,
  isUrgentQuadrant,
  localDayOf,
  localDayRange,
  nowIso,
  priorityScore,
  type IsoInstant,
  type Item,
  type ModuleContext,
} from '@workbench/core';
import type { CreateTaskInput, TaskView, TodayResponse } from '../contract.js';

export interface ServiceOptions {
  zone: string;
  now?: IsoInstant;
}

function resolveNow(opts: ServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

function toView(item: Item, now: IsoInstant): TaskView {
  const urgency = deriveUrgency(item.dueAt, now);
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    importance: item.importance,
    dueAt: item.dueAt,
    urgency,
    priorityScore: priorityScore(item.importance, urgency),
    isImportantQuadrant: isImportantQuadrant(item.importance),
    isUrgentQuadrant: isUrgentQuadrant(urgency),
  };
}

/** priorityScore 降序；同分时 dueAt 升序（有死线的排前面）。 */
function byPriority(a: TaskView, b: TaskView): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.dueAt === null && b.dueAt === null) return 0;
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0;
}

const OPEN_STATUSES = ['inbox', 'todo', 'doing'] as const;

export async function createTask(
  ctx: ModuleContext,
  input: CreateTaskInput,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const today = localDayOf(now, opts.zone);

  const item = await ctx.items.create(ctx.moduleId, {
    kind: 'task',
    title: input.title,
    importance: input.importance,
    // 只精确到天的 DDL 补成该本地日最后一毫秒（spec §5.3 决策 ③）
    dueAt: input.dueDate === null ? null : endOfLocalDayUtc(input.dueDate, opts.zone),
    // 新建任务默认排在今天，走全天排程分支
    scheduled: { kind: 'all-day', date: today },
  });

  return toView(item, now);
}

export async function listToday(ctx: ModuleContext, opts: ServiceOptions): Promise<TodayResponse> {
  const now = resolveNow(opts);
  const date = localDayOf(now, opts.zone);
  // 时区换算在应用层完成，SQL 只做字符串比较（spec §6.4）
  const range = localDayRange(date, opts.zone);

  const scheduled = await ctx.items.list({
    scheduledWithin: range,
    scheduledOnDate: date,
    statuses: [...OPEN_STATUSES],
    sourceModules: [ctx.moduleId],
  });

  const overdueItems = await ctx.items.list({
    dueBefore: now,
    statuses: [...OPEN_STATUSES],
    sourceModules: [ctx.moduleId],
  });

  const overdueIds = new Set(overdueItems.map((i) => i.id));

  return {
    date,
    zone: opts.zone,
    tasks: scheduled
      .filter((i) => !overdueIds.has(i.id))
      .map((i) => toView(i, now))
      .sort(byPriority),
    overdue: overdueItems.map((i) => toView(i, now)).sort(byPriority),
  };
}

export async function completeTask(
  ctx: ModuleContext,
  id: string,
  opts: ServiceOptions,
): Promise<TaskView> {
  const now = resolveNow(opts);
  const updated = await ctx.items.update(id, { status: 'done', completedAt: now });
  return toView(updated, now);
}
```

- [ ] **Step 8: 跑测试确认通过**

```bash
npx vitest run modules/todo/src/server/service.test.ts
```

预期：PASS，9 个测试全绿。

- [ ] **Step 9: 确认边界规则没被违反**

```bash
npm run lint
```

预期：PASS。若 `service.ts` 里不慎写了 `import ... from '@workbench/data'`，lint 会报"违反 spec §4.3"。测试文件 import data 是允许的（要造真实的 `:memory:` 库），Task 1 Step 6 的测试文件段落已把该规则关掉。

- [ ] **Step 10: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(todo): Zod 契约与 service 层

只经 ModuleContext 触达 core，不碰数据层；DDL 只到天时补成本地日末刻（spec §5.3/§8.2）。"
```

---

## Task 10: modules/todo — HTTP 路由并接入 server

**Files:**

- Create: `modules/todo/src/server/routes.ts`, `modules/todo/src/server/routes.test.ts`, `modules/todo/src/server/index.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**

- Consumes: Task 9 的 service 与 contract；`ServerModuleDefinition`、`ModuleContext`
- Produces:
  - `todoServerModule: ServerModuleDefinition`
  - HTTP 接口：`GET /api/todo/today`、`POST /api/todo/tasks`、`POST /api/todo/tasks/:id/complete`

- [ ] **Step 1: 写失败的测试**

`modules/todo/src/server/routes.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { todoServerModule } from './index.js';

async function makeApp(): Promise<FastifyInstance> {
  const { db } = openTestDatabase();
  return buildApp({ db, modules: [todoServerModule] });
}

describe('todo HTTP 接口', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await makeApp();
  });

  it('POST /api/todo/tasks 创建任务并回传视图', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '写周报', importance: 'high' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe('写周报');
    expect(body.importance).toBe('high');
    expect(typeof body.priorityScore).toBe('number');
  });

  it('POST /api/todo/tasks 对空标题返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
  });

  it('GET /api/todo/today 返回今天的任务', async () => {
    await app.inject({ method: 'POST', url: '/api/todo/tasks', payload: { title: 'A' } });
    await app.inject({ method: 'POST', url: '/api/todo/tasks', payload: { title: 'B' } });

    const res = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('POST /api/todo/tasks/:id/complete 完成任务后它不再出现在今日列表', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/todo/tasks',
      payload: { title: '做完它' },
    });
    const id = created.json().id;

    const done = await app.inject({ method: 'POST', url: `/api/todo/tasks/${id}/complete` });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('done');

    const today = await app.inject({ method: 'GET', url: '/api/todo/today' });
    expect(today.json().tasks).toHaveLength(0);
  });

  it('完成不存在的任务返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/todo/tasks/nope/complete' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run modules/todo/src/server/routes.test.ts
```

预期：FAIL，无法解析 `./index.js`。

- [ ] **Step 3: 实现 `routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { createTaskInputSchema } from '../contract.js';
import { completeTask, createTask, listToday, type ServiceOptions } from './service.js';

/** 迭代 1 用系统时区；跨时区支持见 spec §6.5 的已知限制。 */
function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerTodoRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  app.get('/api/todo/today', async () => listToday(ctx, opts()));

  app.post('/api/todo/tasks', async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const task = await createTask(ctx, parsed.data, opts());
    return reply.code(201).send(task);
  });

  app.post('/api/todo/tasks/:id/complete', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return completeTask(ctx, params.data.id, opts());
  });
}
```

- [ ] **Step 4: 实现 `server/index.ts` —— 模块定义**

```ts
import type { FastifyInstance } from 'fastify';
import type { ModuleContext, ServerModuleDefinition } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import { registerTodoRoutes } from './routes.js';

export const todoServerModule: ServerModuleDefinition = {
  id: TODO_MODULE_ID,
  // 本模块无自有表，只消费 core Item。迁移机制的首个真实使用者是迭代 5 的秋招模块。
  migrations: [],
  registerRoutes(app: unknown, ctx: ModuleContext) {
    registerTodoRoutes(app as FastifyInstance, ctx);
  },
};

export { createTask, listToday, completeTask } from './service.js';
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run modules/todo/src/server/routes.test.ts
```

预期：PASS，5 个测试全绿。

- [ ] **Step 6: 把 todo 模块接进服务进程**

修改 `packages/server/src/index.ts`，把模块列表从空数组换成实际模块：

```ts
import { openDatabase, runCoreMigrations } from '@workbench/data';
import { todoServerModule } from '@workbench/module-todo';
import { buildApp } from './app.js';

const DB_PATH = process.env.WORKBENCH_DB ?? './data/local/workbench.db';
const PORT = Number(process.env.PORT ?? 3000);

const { db } = openDatabase(DB_PATH);
runCoreMigrations(db);

const app = await buildApp({ db, modules: [todoServerModule], logger: true });

await app.listen({ port: PORT, host: '127.0.0.1' });
console.log(`workbench server 已启动：http://127.0.0.1:${PORT}`);
```

- [ ] **Step 7: 手动验证持久化（验收标准 3）**

```bash
npm run dev:server
```

另开终端：

```bash
curl -X POST http://127.0.0.1:3000/api/todo/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"重启后我还在吗","importance":"high"}'
curl http://127.0.0.1:3000/api/todo/today
```

Ctrl+C 停掉服务，重新 `npm run dev:server`，再次：

```bash
curl http://127.0.0.1:3000/api/todo/today
```

预期：任务仍在。**这一条是验收标准 3，必须亲眼确认。**

- [ ] **Step 8: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(todo): HTTP 路由并接入服务进程

todo 作为真正的模块注册，而非硬编码进 server（spec §14.1 隐藏收益）。"
```

---

## Task 11: web — React 外壳

**Files:**

- Create: `packages/web/package.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/modules.ts`, `packages/web/src/index.css`

**Interfaces:**

- Consumes: `UiModuleDefinition`（core）
- Produces: 可运行的 Vite 开发服务器（默认 5173），`/api` 代理到 `127.0.0.1:3000`；导航由 `uiModules` 驱动

- [ ] **Step 1: 装前端依赖**

```bash
npm install react react-dom react-router @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

> Tailwind v4 用 Vite 插件，**不需要 `tailwind.config.js`，也不需要 PostCSS 配置**。若 `react-router` 包名解析失败，说明该版本仍以 `react-router-dom` 发布，改装 `react-router-dom` 并同步调整 import。

- [ ] **Step 2: 建包并写 `vite.config.ts`**

`packages/web/package.json`：

```json
{
  "name": "@workbench/web",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

`packages/web/vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: HERE,
  plugins: [react(), tailwindcss(), tsconfigPaths({ root: '../..' })],
  server: {
    port: 5173,
    // 代理让浏览器只看到一个源，彻底绕开 CORS
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
```

- [ ] **Step 3: 写 `index.html` 与 `index.css`**

`packages/web/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>个人工作台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/web/src/index.css`：

```css
@import 'tailwindcss';
```

- [ ] **Step 4: 写前端模块注册表 `modules.ts`**

`todoUiModule` 要到 Task 12 才存在，所以本任务先写空数组版本，Task 12 再补上 —— 这样本任务能独立通过 typecheck。

```ts
import type { UiModuleDefinition } from '@workbench/core';

/**
 * 前端模块注册表。加模块 = 在此加一行 import 与一个数组项。
 * 与服务端注册表对称，两侧都不需要改 core（spec §9 OCP）。
 */
export const uiModules: UiModuleDefinition[] = [];
```

- [ ] **Step 5: 写 `App.tsx`**

```tsx
import { NavLink, Route, Routes, Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { uiModules } from './modules';

export function App() {
  const navEntries = uiModules.flatMap((m) => m.nav);
  // 首页重定向到「第一个模块的第一个导航项」。注册表为空时不注册这条重定向——
  // 外壳不得对任何具体模块的 URL 命名做假设，哪怕只是一个兜底默认值。
  const firstPath = navEntries[0]?.path;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-3xl gap-4 px-6 py-4">
          <span className="font-semibold">个人工作台</span>
          {navEntries.map((entry) => (
            <NavLink
              key={entry.path}
              to={entry.path}
              className={({ isActive }) =>
                isActive ? 'text-amber-700 underline' : 'text-stone-600 hover:text-stone-900'
              }
            >
              {entry.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <Routes>
          {firstPath !== undefined && (
            <Route path="/" element={<Navigate to={firstPath} replace />} />
          )}
          {uiModules.flatMap((m) =>
            m.routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element as ReactNode} />
            )),
          )}
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: 写 `main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const root = document.getElementById('root');
if (root === null) throw new Error('找不到 #root 挂载点');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: 启动前端，确认外壳能渲染**

```bash
npm run dev:web
```

浏览器打开 `http://localhost:5173`。预期：看到"个人工作台"标题栏（导航为空、内容区为空是正常的，模块页面在 Task 12 才有）。确认后 Ctrl+C。

- [ ] **Step 8: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(web): React 外壳、Tailwind v4 与前端模块注册表

导航与路由由 uiModules 驱动，加模块无需改外壳（spec §9 OCP）。"
```

---

## Task 12: modules/todo — 今日工作台页面

**Files:**

- Create: `modules/todo/src/ui/api.ts`, `modules/todo/src/ui/TodayPage.tsx`, `modules/todo/src/ui/index.tsx`
- Modify: `packages/web/src/modules.ts`（把 Task 11 的空数组换成含 todoUiModule 的版本）

**Interfaces:**

- Consumes: `TodayResponse` / `TaskView` / `createTaskInputSchema`（`@workbench/module-todo/contract`）；`UiModuleDefinition`（core）
- Produces: `todoUiModule: UiModuleDefinition`，挂载路径 `/today`

- [ ] **Step 1: 写 `api.ts`**

```ts
import {
  todayResponseSchema,
  taskViewSchema,
  type CreateTaskInput,
  type TaskView,
  type TodayResponse,
} from '../contract.js';

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `请求失败（${res.status}）`);
  }
  return body;
}

export async function fetchToday(): Promise<TodayResponse> {
  // 用 Zod 校验响应：后端改了形状，这里会立刻报错而不是页面静默变空
  return todayResponseSchema.parse(await request('/api/todo/today'));
}

export async function postTask(
  input: Pick<CreateTaskInput, 'title' | 'importance' | 'dueDate'>,
): Promise<TaskView> {
  return taskViewSchema.parse(
    await request('/api/todo/tasks', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function postComplete(id: string): Promise<TaskView> {
  return taskViewSchema.parse(await request(`/api/todo/tasks/${id}/complete`, { method: 'POST' }));
}
```

- [ ] **Step 2: 写 `TodayPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Importance } from '@workbench/core';
import type { TaskView } from '../contract.js';
import { fetchToday, postComplete, postTask } from './api.js';

const TODAY_KEY = ['todo', 'today'] as const;

const URGENCY_LABEL: Record<TaskView['urgency'], string> = {
  overdue: '已逾期',
  imminent: '24 小时内',
  soon: '3 天内',
  later: '还早',
  none: '无死线',
};

function TaskRow({ task, onComplete }: { task: TaskView; onComplete: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-stone-200 py-3">
      <input
        type="checkbox"
        aria-label={`完成 ${task.title}`}
        onChange={() => onComplete(task.id)}
        className="size-4"
      />
      <span className="flex-1">{task.title}</span>
      {task.isImportantQuadrant && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">重要</span>
      )}
      <span
        className={task.urgency === 'overdue' ? 'text-xs text-red-700' : 'text-xs text-stone-500'}
      >
        {URGENCY_LABEL[task.urgency]}
      </span>
    </li>
  );
}

export function TodayPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [importance, setImportance] = useState<Importance>('normal');
  const [dueDate, setDueDate] = useState('');

  const today = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: TODAY_KEY });

  const create = useMutation({
    mutationFn: postTask,
    onSuccess: () => {
      setTitle('');
      setDueDate('');
      void invalidate();
    },
  });

  const complete = useMutation({ mutationFn: postComplete, onSuccess: () => void invalidate() });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (title.trim() === '') return;
    create.mutate({ title, importance, dueDate: dueDate === '' ? null : dueDate });
  }

  if (today.isPending) return <p className="text-stone-500">加载中…</p>;
  if (today.isError) return <p className="text-red-700">加载失败：{today.error.message}</p>;

  const { date, tasks, overdue } = today.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">今日工作台 · {date}</h1>

      {overdue.length > 0 && (
        <details className="rounded border border-red-200 bg-red-50 px-4 py-3">
          <summary className="cursor-pointer text-red-800">
            有 {overdue.length} 项逾期任务，点击展开
          </summary>
          <ul className="mt-2">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
            ))}
          </ul>
        </details>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="要做点什么？"
          aria-label="任务标题"
          className="flex-1 rounded border border-stone-300 px-3 py-2"
        />
        <select
          value={importance}
          onChange={(e) => setImportance(e.target.value as Importance)}
          aria-label="重要程度"
          className="rounded border border-stone-300 px-3 py-2"
        >
          <option value="high">重要</option>
          <option value="normal">一般</option>
          <option value="low">次要</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="截止日期"
          className="rounded border border-stone-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-amber-700 px-4 py-2 text-white disabled:opacity-50"
        >
          添加
        </button>
      </form>

      {create.isError && <p className="text-red-700">添加失败：{create.error.message}</p>}

      {tasks.length === 0 ? (
        <p className="text-stone-500">今天还没有安排。</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onComplete={(id) => complete.mutate(id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 写 `ui/index.tsx` —— UI 模块定义**

文件名必须是 `.tsx`（含 JSX）。Task 1 的 tsconfig paths 与 Task 9 的 package.json `exports` 已按 `.tsx` 配置好，无需改动。

```tsx
import type { UiModuleDefinition } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import { TodayPage } from './TodayPage.js';

export const todoUiModule: UiModuleDefinition = {
  id: TODO_MODULE_ID,
  title: '待办',
  nav: [{ path: '/today', label: '今日' }],
  routes: [{ path: '/today', element: <TodayPage /> }],
};

export { TodayPage };
```

- [ ] **Step 4: 把 todo 接入前端注册表**

`packages/web/src/modules.ts`：

```ts
import type { UiModuleDefinition } from '@workbench/core';
import { todoUiModule } from '@workbench/module-todo/ui';

export const uiModules: UiModuleDefinition[] = [todoUiModule];
```

- [ ] **Step 5: 端到端手动验证**

```bash
npm run dev
```

浏览器打开 `http://localhost:5173`，逐条确认：

1. 页面标题显示"今日工作台 · <今天日期>"，日期正确
2. 输入标题、选"重要"、留空日期，点添加 → 任务出现在列表，标"重要"、显示"无死线"
3. 再加一条，截止日期选**昨天** → 它出现在顶部红色逾期摘要中，不在主列表
4. 再加一条，截止日期选**今天** → 显示"24 小时内"
5. 重要的排在一般的前面
6. 勾选任一任务 → 它从列表消失
7. Ctrl+C 停掉全部，重新 `npm run dev` → 未完成的任务仍在

- [ ] **Step 6: 全量门禁 + 提交**

```bash
npm run check
git add -A
git commit -m "feat(todo): 今日工作台页面

前端用 Zod 校验响应，后端改形状会立刻报错而非页面静默变空。"
```

---

## Task 13: ADR 0001–0005

把本次设计中"以后会忘记为什么"的部分固化。spec §13.4 要求这五条，是验收标准 7。

**Files:**

- Create: `docs/adr/0001-local-first-architecture.md` … `docs/adr/0005-module-boundaries.md`

**Interfaces:**

- Consumes: 无
- Produces: 无代码接口

- [ ] **Step 1: 写 ADR-0001**

`docs/adr/0001-local-first-architecture.md`：

```markdown
# 0001. 采用本地优先架构，预留同步层

日期：2026-08-17
状态：已接受

## 背景

个人工作台供本人长期使用，需求会持续增长。候选形态有四种：纯本地单机应用、
本地优先且预留同步、自建服务端多端访问、云端 SaaS。开发者 Web 不熟，
要求成熟主流方案。

## 决策

采用本地优先：Node 后端进程 + 本地 SQLite 文件 + 浏览器访问 localhost。
不做账号体系，不做网络同步。后端保持为独立进程，使同步与多端访问成为将来的
纯增量改动。

## 后果

- 去掉了账号与网络这两个最大的复杂度来源，迭代速度最快
- 数据完全在本机，无隐私与成本问题
- 代价：手机与其他电脑暂不可访问
- 后端已是独立进程，将来部署至 NAS 即可多端，不改业务代码
- 关闭的选项：短期内不会有多用户能力；若将来要做多用户，账号与数据隔离
  需要一次真正的重构，而非增量
```

- [ ] **Step 2: 写 ADR-0002**

`docs/adr/0002-unified-item-model.md`：

```markdown
# 0002. 统一 Item 模型 + 模块扩展表，否决 EAV

日期：2026-08-17
状态：已接受

## 背景

工作台将持续加入定制模块（秋招、社招等），且要求模块事项自动出现在日历与
今日工作台。需要一种既支持自动联动、又允许每个模块有自己专属字段的数据模型。

候选方案：

1. 每个模块完全独立建表，互不相干
2. 统一 Item 表 + 模块扩展表，扩展表以 item_id 指向 core
3. 统一 Item 表 + EAV（万能键值表）承载模块字段

## 决策

采用方案 2。core 只有 Item / Goal / Tag 三个实体；模块自建扩展表，
外键方向恒为**模块 → core**；core 的建表语句中不出现任何模块名称。

明确否决 EAV。

## 后果

- 自动联动变得平淡：模块创建一条 core Item，日历查 Item 表即可见到，
  日历完全不需要知道模块存在
- 保住了类型安全与查询性能——这正是否决 EAV 的理由：EAV 同时牺牲两者，
  且随模块增多迅速不可维护
- `source_module` 字段使模块卸载可用一条 SQL 完成，无残留
- 代价：core 的 Item 模型必须一开始就设计得足够抽象。若某个模块的领域
  实在无法映射到 Item，则需要重新评估本决策——迭代 5 的秋招模块是首次真正的检验
- 关闭的选项：模块不能拥有"与 Item 无关但仍需上日历"的实体
```

- [ ] **Step 3: 写 ADR-0003**

`docs/adr/0003-derived-urgency.md`：

```markdown
# 0003. urgency 由 due_at 派生，不入库

日期：2026-08-17
状态：已接受

## 背景

采用重要 × 紧急两维（艾森豪威尔矩阵）划分任务。若两个维度都手工维护并存库，
紧急度会迅速失真：今天标记为"紧急"的任务，两周后标记仍在，但含义已经变了。
没有人会回头逐条更新紧急度。

## 决策

`importance` 手动设置并入库（high / normal / low，默认 normal）。
`urgency` **不入库**，由 `due_at` 与当前时刻派生：

- 无 due_at → none
- 已过 → overdue
- ≤ 24h → imminent
- ≤ 72h → soon
- 否则 → later

阈值 24 / 72 为 core 中的具名常量。

## 后果

- 紧急度永远新鲜，零维护
- 副作用：无 DDL 即不算紧急。本模型会迫使"我觉得这事急"翻译成
  "它哪天必须做完"。这被视为特性而非缺陷
- 若实际使用中确实需要"无死线但紧急"的表达，可增加手动 urgency override
  字段——纯增量，不推翻本决策
- 关闭的选项：无法表达与时间无关的紧迫感（如"老板催了"）
```

- [ ] **Step 4: 写 ADR-0004**

`docs/adr/0004-time-storage.md`：

```markdown
# 0004. 时间存储：instant 用 UTC，全天事件用浮动日期；暂不存每记录时区

日期：2026-08-17
状态：已接受

## 背景

日历类应用最经典的事故来源是混用不同语义的时间。本项目有三类时间需求：
时刻（创建时间、DDL、定时事件）、全天事件、以及"今天有什么"这类本地日查询。

## 决策

1. **时刻**存 UTC ISO8601 文本（`2026-09-20T11:00:00.000Z`）。其字典序等于
   时间序，SQL 可直接 ORDER BY / BETWEEN 并吃到索引
2. **全天事件**存浮动日期 `YYYY-MM-DD`，**绝不转 UTC**。参照 RFC 5545 对
   DATE 与 DATE-TIME 的区分
3. `due_at` **恒为时刻**，不使用浮动日期。UI 只选到天时补成该本地日
   23:59:59.999 的 instant，使 urgency 派生无需分支
4. 数据库用一组列 + `is_all_day` 标记；类型安全由 core 的 `ScheduledTime`
   discriminated union 保证
5. **禁止在 SQL 中做时区转换**。本地日边界在应用层换算为 UTC 区间后再查询
6. **暂不存每记录的时区**

## 后果

- 全天事件不会因时区而移位一天（若按 UTC 存，`2026-09-20` 在伦敦会变成 19 号）
- 附带收益：`'2026-09-20' < '2026-09-20T09:00:00.000Z'`，同列排序时全天事件
  天然排在当天定时事件之前，正是日历应有的顺序
- **已知限制**：跨时区旅行时，此前排定的"9 点会议"会显示为当地时间的另一时刻
- **将来补法**：增加 `tz` 列存 IANA 时区名（如 `Asia/Shanghai`，对应
  iCalendar 的 TZID）。这是纯增量迁移，不推翻既有数据
```

- [ ] **Step 5: 写 ADR-0005**

`docs/adr/0005-module-boundaries.md`：

```markdown
# 0005. 模块边界三条铁律，由 lint 强制

日期：2026-08-17
状态：已接受

## 背景

本项目的首要目标是让第 10 个模块的加入成本等于第 2 个。这要求模块之间、
模块与核心之间有严格且不会随时间腐化的边界。架构约束若只写在文档里，
数月后必破——尤其是单人项目，没有 code review 兜底。

## 决策

三条铁律：

1. 模块只能依赖 core，模块之间零依赖
2. core 永不感知模块
3. 模块自带迁移与注册项；删模块 = 删一个目录 + 删一行注册

铁律 1 与铁律 2 由 `eslint.config.js` 的三条 `no-restricted-imports` 规则强制
（§4.3 的强制表），违反即 CI 失败。同时 `ModuleContext` 在接口层面就不暴露数据库句柄，
使铁律 1「模块只能依赖 core」在类型层面即不可违反 —— 模块拿不到数据层的句柄，
不是因为它不该用，而是因为它根本够不着。

**铁律 3 没有、也不可能有对应的 lint 规则。** 它不是一条 import 约束，而是一个结构性质：
由 `ServerModuleDefinition.migrations` 字段与注册表的形状保证 —— 模块把自己的迁移带在
定义里，注册表逐个执行。这一条靠的是结构，不是 CI。若将来有人把某个模块的迁移搬进
core 的集中目录，没有任何自动检查会拦住他，而模块的自包含性就此丢失。**这是三条铁律里
唯一需要人来守的一条。**

`ModuleDefinition` 拆分为 `ServerModuleDefinition` 与 `UiModuleDefinition`
两个接口，避免 web 打包时把 Fastify 拉进浏览器产物，同时符合接口隔离原则。

## 后果

- "随时加模块不塌房"从愿望变成机器保证的事实
- OCP 有了可验证信号：加第 N 个模块的 diff 中，`packages/core/` 改动应为 0 行
- 代价：core 的 `module.ts` 中 `registerRoutes(app: unknown)` 与
  `UiRoute.element: unknown` 用了 unknown 而非具体类型，因为 core 不得依赖
  Fastify 或 React。调用方需各自做一次类型断言。这是为守住铁律付出的、
  可接受的代价
- 关闭的选项：模块之间无法直接复用代码。需要共享的东西必须上提到 core，
  这是刻意的摩擦——它迫使共享逻辑经过一次"是否真的属于核心"的审视
```

- [ ] **Step 6: 提交**

```bash
git add docs/adr
git commit -m "docs(adr): 记录 0001-0005 五条架构决策

固化本次设计中'以后会忘记为什么'的部分（spec §13.4）。"
```

---

## Task 14: 验收、README 与合并

**Files:**

- Create: `README.md`
- Modify: 无

**Interfaces:**

- Consumes: 前 13 个任务的全部产出
- Produces: 无

- [ ] **Step 1: 逐条核对 spec §14.1 的七条验收标准**

在干净环境下重跑一遍：

```bash
rm -rf data/local
npm run dev
```

| #   | 标准                                      | 怎么验                                                  |
| --- | ----------------------------------------- | ------------------------------------------------------- |
| 1   | 浏览器看到今日工作台                      | 打开 `http://localhost:5173`，看到"今日工作台 · <日期>" |
| 2   | 可创建任务（title + importance + due_at） | 表单三个字段都能填，提交成功                            |
| 3   | 存入 SQLite，重启后仍在                   | Ctrl+C，重新 `npm run dev`，刷新页面，任务仍在          |
| 4   | 按 priorityScore 排序，逾期有标记         | 重要的排前面；逾期项在顶部红色摘要里                    |
| 5   | 可勾选完成                                | 勾选后从列表消失                                        |
| 6   | CI 全绿                                   | `npm run check` 四步全过                                |
| 7   | ADR 0001–0005 齐全                        | `ls docs/adr` 有五个文件                                |

任何一条不过，回到对应 Task 修复后再继续。

- [ ] **Step 2: 验证边界规则仍然有效（回归）**

Task 1 Step 10 验证过一次，此时代码已长大，再验一次确保规则没被误关：

在 `modules/todo/src/server/service.ts` 顶部临时加：

```ts
import '@workbench/data';
```

```bash
npm run lint
```

预期：FAIL，报"违反 spec §4.3"。确认后删除该行。

- [ ] **Step 3: 写 `README.md`**

````markdown
# 个人工作台

本地优先的个人工作台。当前处于迭代 1（Walking Skeleton），已实现今日工作台的
任务创建、排序与完成。

## 快速开始

```bash
npm install
npm run dev
```
````

打开 http://localhost:5173

服务端在 3000 端口，前端 5173 通过 Vite 代理转发 `/api`，浏览器只看到一个源。

## 常用命令

| 命令                  | 作用                                          |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | 同时启动后端与前端                            |
| `npm run check`       | 格式 + 类型 + lint + 测试（提交前跑这个）     |
| `npm run test`        | 只跑测试                                      |
| `npm run db:generate` | 改完 `packages/data/src/schema.ts` 后生成迁移 |

## 数据在哪

`data/local/workbench.db`（已在 .gitignore 中）。删掉它即可从空库重来。

## 要改代码先读什么

1. `docs/superpowers/specs/2026-08-17-personal-workbench-design.md` — 架构设计
2. `docs/adr/` — 五条架构决策及其理由。**动 core 之前必读**

## 加一个新模块

1. 在 `modules/<name>/` 建目录，参照 `modules/todo/` 的结构
2. 在 `packages/server/src/index.ts` 的 modules 数组加一项
3. 在 `packages/web/src/modules.ts` 的 uiModules 数组加一项
4. 在该模块的 `package.json` 里声明它自己的依赖：本地工作区包写 `"*"`，
   安装用 `npm install <pkg> -w <workspace>`；运行期真正 import 的进 `dependencies`，
   仅测试或仅类型用途的进 `devDependencies`。见
   `docs/adr/0006-workspace-dependency-declaration.md`
5. 模块自己的迁移放在自己目录下、写进 `ServerModuleDefinition.migrations`，
   **不要放进 core 的集中目录**

三条铁律里，**前两条由 ESLint 强制**，违反会在 `npm run lint` 时报错：

- **模块只能依赖 core，模块之间零依赖** —— import 别的模块或直连 `@workbench/data` 会被拦
- **core 永不感知模块** —— 在 core 里 import 任何外层都会被拦

第三条 **模块自带迁移与注册项** 没有任何自动检查，只能靠人守。把某个模块的迁移
搬进 core 的集中目录，lint 和 CI 都不会报错，但「删模块 = 删一个目录 + 删一行注册」
这个承诺就此失效。详见 `docs/adr/0005-module-boundaries.md`。

**如果加模块时你发现必须改 `packages/core/`，停下来想清楚**——这通常意味着
某个 core 的假设错了，值得记一条新的 ADR。

````

- [ ] **Step 4: 最终门禁**

```bash
npm run check
````

预期：四步全绿。

- [ ] **Step 5: 提交并合并**

```bash
git add -A
git commit -m "docs: README 与迭代 1 验收

七条验收标准逐条确认通过（spec §14.1）。"

git checkout main
git merge --squash feat/iteration-1-walking-skeleton
git commit -m "feat: 迭代 1 Walking Skeleton

从 React 界面到 SQLite 文件全链路贯通，todo 作为第一个真正的模块接入。
三条模块边界铁律由 ESLint 强制并已验证生效。"
```

---

## 完成定义

迭代 1 完成的标志是：**下一个人（或三个月后的你）能照着 README 的"加一个新模块"三步，
在不修改 `packages/core/` 任何一行的前提下，把一个新模块接进来。**

这一条到迭代 5（秋招模块）才会被真正检验。若那时必须改 core，说明 ADR-0002
的某个假设有误——那时修正代价仍然可控，这正是把秋招模块安排在早期的原因。
