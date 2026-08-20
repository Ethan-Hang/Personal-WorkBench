# 设置项持久化到数据库 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主题、时区、工作台偏好这八项设置从浏览器 localStorage 迁进本地 SQLite，使其跨设备可携带，同时首屏不闪默认主题。

**Architecture:** core 用一张 codec 表同时推出类型、默认值与校验，并定义 `SettingsRepository` 接口；data 提供一张 `app_settings` KV 表与 SQLite 实现；server 在模块注册表之外开一条壳层通道注册 `/api/settings`；ui 只声明一个 `SettingsStore` 端口并保持零网络调用，三个既有 Context 的公开接口一字不改，内部改为消费 `useSettings()`；web 提供端口的 HTTP 实现，负责首屏快照、乐观更新与一次性迁移旧 localStorage。

**Tech Stack:** TypeScript 5.7、Node ≥ 22.22.1、Fastify 5、Drizzle ORM + better-sqlite3、React 19、Vitest 4。

**Spec:** `docs/superpowers/specs/2026-08-19-settings-persistence-design.md`

## Global Constraints

- **三条铁律不破**：模块之间零依赖；core 不感知任何模块（`app_settings` 表里不得出现模块名）；模块自带迁移。本次改动不碰 `modules/` 下任何文件。
- **依赖方向恒指向内层**：`data → core`、`server → core/data`、`ui → core`（本次新增）、`web → core/ui`。`packages/ui` 不得 import `@workbench/data` 或任何模块。
- **`packages/ui` 保持零网络调用**：ui 里不得出现 `fetch(`，也不得出现以 `/api/` 开头的字符串。
- **不引入 zod 到 core / server**：校验一律走 core 的 codec 表。
- **工作区依赖必须在各自 `package.json` 声明**，本地包写 `"*"`，用 `npm install <pkg> -w <workspace>`，不得靠 hoisting。
- **装依赖只走 `npm run setup`**，不要直接 `npm install`（无 MSVC 工具链的机器上 `better-sqlite3` 会触发白跑的 `node-gyp rebuild`）。
- **时间一律 UTC ISO8601 带 `Z` 与三位毫秒**（`nowIso()`），禁止在 SQL 里做时区转换。
- **提交前跑 `npm run check`**（format:check → typecheck → lint → test，四步全绿）。
- Vitest 的 `include` 只收 `packages/**/*.test.ts` 与 `modules/**/*.test.ts`，**不收 `.tsx`**。因此凡是有分支逻辑的前端代码都要放进 `.ts` 文件，`.tsx` 只留薄壳。
- 测试环境是 `environment: 'node'`，**没有 `localStorage`、没有真 `fetch`**。前端可测代码必须通过参数注入 storage 与 fetch。
- 设计文档 `docs/superpowers/specs/2026-08-19-settings-persistence-design.md` 已存在但未提交，随 Task 1 一起提交。

---

## 文件结构

**新建**

| 文件                                                        | 职责                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/core/src/settings.ts`                             | codec 表、`AppSettings` 类型、默认值、`resolveSettings`、`parseSettingsPatch`、`SettingsRepository` 接口 |
| `packages/core/src/settings.test.ts`                        | 上述纯函数的单测                                                                                         |
| `packages/core/src/testing/settings-repository-contract.ts` | `SettingsRepository` 的行为契约（core 拥有，实现方运行）                                                 |
| `packages/data/src/settings-repository.ts`                  | `SqliteSettingsRepository`                                                                               |
| `packages/data/src/settings-repository.test.ts`             | 跑 core 的契约                                                                                           |
| `packages/data/migrations/0001_*.sql`                       | `app_settings` 建表（由 `npm run db:generate` 生成）                                                     |
| `packages/server/src/settings/contract.ts`                  | 端点路径与响应类型                                                                                       |
| `packages/server/src/settings/routes.ts`                    | `registerSettingsRoutes`                                                                                 |
| `packages/server/src/settings/routes.test.ts`               | `app.inject` 集成测试                                                                                    |
| `packages/ui/src/settingsSync.ts`                           | 端口定义 + 乐观更新/合并串行/回滚的框架无关逻辑                                                          |
| `packages/ui/src/settingsSync.test.ts`                      | 上述逻辑的单测（用假 store）                                                                             |
| `packages/ui/src/SettingsContext.tsx`                       | `SettingsProvider` / `useSettings`，`settingsSync` 的薄 React 壳                                         |
| `packages/web/src/settingsStore.ts`                         | `SettingsStore` 的 HTTP 实现 + 快照 + 一次性迁移                                                         |
| `packages/web/src/settingsStore.test.ts`                    | 请求形状、响应解析、失败路径、迁移只跑一次                                                               |
| `docs/adr/0018-settings-live-in-the-database.md`            | 壳层子系统与第二条注册通道的判据                                                                         |

**修改**

| 文件                                                           | 改动                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/index.ts`                                   | 导出 settings 相关类型与函数                                            |
| `packages/data/src/schema.ts`                                  | 加 `appSettings` 表                                                     |
| `packages/data/src/index.ts`                                   | 导出 `appSettings`、`SqliteSettingsRepository`                          |
| `packages/server/src/app.ts`                                   | `buildApp` 里注册 settings 路由                                         |
| `packages/ui/src/ThemeContext.tsx`                             | 内部读写改为 `useSettings()`，移除 localStorage 与两个 default props    |
| `packages/ui/src/TimezoneContext.tsx`                          | 同上                                                                    |
| `packages/ui/src/PreferencesContext.tsx`                       | 同上                                                                    |
| `packages/ui/src/index.tsx`                                    | 导出 `SettingsProvider` / `useSettings` / `SettingsStore`               |
| `packages/ui/package.json`                                     | 加 `@workbench/core` 依赖                                               |
| `packages/web/src/App.tsx`                                     | 最外层包 `SettingsProvider`，删掉 `defaultMode` / `defaultPalette` 传参 |
| `docs/adr/0014-timezone-management-and-three-way-deduction.md` | 补一句：库里有值就用库里的                                              |
| `CLAUDE.md`                                                    | 更新「当前状态」与「会咬人的约定」                                      |

---

### Task 1: core 的设置 codec 表与纯函数

**Files:**

- Create: `packages/core/src/settings.ts`
- Create: `packages/core/src/settings.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: 无
- Produces:
  - `interface SettingCodec<T> { readonly default: T; parse(raw: unknown): T | undefined }`
  - `const SETTINGS_CODECS`（八个键）
  - `type SettingKey = keyof typeof SETTINGS_CODECS`
  - `type AppSettings = { [K in SettingKey]: ... }`
  - `const SETTING_KEYS: readonly SettingKey[]`
  - `const DEFAULT_SETTINGS: Readonly<AppSettings>`
  - `function isSettingKey(key: string): key is SettingKey`
  - `function resolveSettings(raw: Record<string, unknown>): AppSettings`
  - `type SettingsPatchResult = { ok: true; patch: Partial<AppSettings> } | { ok: false; error: string }`
  - `function parseSettingsPatch(input: unknown): SettingsPatchResult`
  - `interface SettingsRepository { getAll(): Promise<Record<string, unknown>>; setMany(patch: Partial<AppSettings>): Promise<void> }`
  - `const SETTINGS_API = { root: () => '/api/settings' }`

- [ ] **Step 1: 写失败的测试**

创建 `packages/core/src/settings.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isSettingKey,
  parseSettingsPatch,
  resolveSettings,
} from './settings.js';

describe('DEFAULT_SETTINGS', () => {
  it('八个键齐全，且与现有 localStorage 时代的默认值一致', () => {
    expect(SETTING_KEYS).toHaveLength(8);
    expect(DEFAULT_SETTINGS).toEqual({
      'theme.mode': 'system',
      'theme.palette': 'warm',
      'timezone.id': 'Asia/Shanghai',
      'timezone.dstMode': 'auto',
      'workbench.showGreeting': true,
      'workbench.autoExpandOverdue': false,
      'workbench.enableAnimations': true,
      'workbench.showCompletedTasks': true,
    });
  });
});

describe('resolveSettings', () => {
  it('空库返回全套默认值', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('库里有的键覆盖默认值，没有的补默认', () => {
    const resolved = resolveSettings({ 'theme.mode': 'dark' });
    expect(resolved['theme.mode']).toBe('dark');
    expect(resolved['theme.palette']).toBe('warm');
  });

  it('脏值静默回落默认，不抛', () => {
    const resolved = resolveSettings({
      'theme.mode': 'chartreuse',
      'workbench.showGreeting': 'yes',
      'timezone.id': 42,
    });
    expect(resolved['theme.mode']).toBe('system');
    expect(resolved['workbench.showGreeting']).toBe(true);
    expect(resolved['timezone.id']).toBe('Asia/Shanghai');
  });

  it('未知键被忽略，不出现在结果里', () => {
    const resolved = resolveSettings({ 'theme.nonsense': 'x' });
    expect(Object.keys(resolved).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('接受任何真实 IANA 时区，不限于 UI 展示列表里的那十几个', () => {
    expect(resolveSettings({ 'timezone.id': 'America/Argentina/Ushuaia' })['timezone.id']).toBe(
      'America/Argentina/Ushuaia',
    );
  });

  it('拒绝不存在的时区 id', () => {
    expect(resolveSettings({ 'timezone.id': 'Mars/Olympus_Mons' })['timezone.id']).toBe(
      'Asia/Shanghai',
    );
  });

  it('null 与 undefined 都回落默认', () => {
    expect(resolveSettings({ 'theme.mode': null })['theme.mode']).toBe('system');
    expect(resolveSettings({ 'theme.mode': undefined })['theme.mode']).toBe('system');
  });
});

describe('isSettingKey', () => {
  it('认识已知键，不认识别的', () => {
    expect(isSettingKey('theme.mode')).toBe(true);
    expect(isSettingKey('theme.nope')).toBe(false);
  });
});

describe('parseSettingsPatch', () => {
  it('全部合法时返回解析后的 patch', () => {
    const result = parseSettingsPatch({ 'theme.mode': 'dark', 'workbench.showGreeting': false });
    expect(result).toEqual({
      ok: true,
      patch: { 'theme.mode': 'dark', 'workbench.showGreeting': false },
    });
  });

  it('未知键直接失败，并在错误里点名', () => {
    const result = parseSettingsPatch({ 'theme.nope': 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('theme.nope');
  });

  it('值不合法直接失败，不静默回落——写入路径与读取路径口径不同', () => {
    const result = parseSettingsPatch({ 'theme.mode': 'chartreuse' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('theme.mode');
  });

  it('空补丁失败', () => {
    expect(parseSettingsPatch({}).ok).toBe(false);
  });

  it('非对象失败', () => {
    expect(parseSettingsPatch(null).ok).toBe(false);
    expect(parseSettingsPatch([]).ok).toBe(false);
    expect(parseSettingsPatch('theme.mode=dark').ok).toBe(false);
    expect(parseSettingsPatch(undefined).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/core/src/settings.test.ts`
Expected: FAIL，报 `Failed to resolve import "./settings.js"`。

- [ ] **Step 3: 写实现**

创建 `packages/core/src/settings.ts`：

```ts
/**
 * 应用级设置（不属于任何模块）。
 *
 * 这里刻意只有**一张表**：类型、默认值、校验三者全从 SETTINGS_CODECS 推导。
 * 加一个设置项 = 加一行，不改数据库表、不写迁移——存储侧是 KV，schema 就在这里。
 *
 * 不引 zod：codec 的 parse 是手写纯函数，与 ITEM_KINDS / ITEM_STATUSES 的常量风格一致，
 * 也维持 core「零 IO、依赖极薄」。服务端校验入参与客户端校验响应共用这一份，
 * 因此不可能出现两边口径各改一半。
 */

export interface SettingCodec<T> {
  readonly default: T;
  /** 不合法返回 undefined，不抛。「怎么处理不合法」由调用方决定。 */
  parse(raw: unknown): T | undefined;
}

function oneOf<const T extends readonly string[]>(
  values: T,
  fallback: T[number],
): SettingCodec<T[number]> {
  return {
    default: fallback,
    parse: (raw) =>
      typeof raw === 'string' && (values as readonly string[]).includes(raw)
        ? (raw as T[number])
        : undefined,
  };
}

function bool(fallback: boolean): SettingCodec<boolean> {
  return {
    default: fallback,
    parse: (raw) => (typeof raw === 'boolean' ? raw : undefined),
  };
}

/**
 * 时区的合法值域是**真实 IANA id**，而不是 UI 那份 WORLD_TIMEZONES 展示列表——
 * 后者是选择器的取材范围，把它当值域会让手动设置的冷门时区被判为脏值。
 */
function timezone(fallback: string): SettingCodec<string> {
  return {
    default: fallback,
    parse: (raw) => {
      if (typeof raw !== 'string' || raw.length === 0) return undefined;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: raw });
        return raw;
      } catch {
        return undefined;
      }
    },
  };
}

export const SETTINGS_CODECS = {
  'theme.mode': oneOf(['light', 'dark', 'system'] as const, 'system'),
  'theme.palette': oneOf(['warm', 'forest', 'ocean', 'amber', 'mono'] as const, 'warm'),
  'timezone.id': timezone('Asia/Shanghai'),
  'timezone.dstMode': oneOf(['auto', 'standard', 'daylight'] as const, 'auto'),
  'workbench.showGreeting': bool(true),
  'workbench.autoExpandOverdue': bool(false),
  'workbench.enableAnimations': bool(true),
  'workbench.showCompletedTasks': bool(true),
} satisfies Record<string, SettingCodec<unknown>>;

export type SettingKey = keyof typeof SETTINGS_CODECS;

export type AppSettings = {
  [K in SettingKey]: (typeof SETTINGS_CODECS)[K] extends SettingCodec<infer T> ? T : never;
};

export const SETTING_KEYS = Object.keys(SETTINGS_CODECS) as readonly SettingKey[];

export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.fromEntries(
  SETTING_KEYS.map((key) => [key, SETTINGS_CODECS[key].default]),
) as AppSettings;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_CODECS, key);
}

/**
 * 库里的原始值 → 完整设置。缺键补默认，脏值静默回落默认，未知键忽略。
 *
 * 读取路径**永不失败**：一条脏行不该让整个界面打不开。
 * 写入路径（parseSettingsPatch）相反，脏值直接 400——那是调用方的 bug，遮蔽只会更难查。
 */
export function resolveSettings(raw: Record<string, unknown>): AppSettings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const parsed = SETTINGS_CODECS[key].parse(raw[key]);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out as AppSettings;
}

export type SettingsPatchResult =
  { ok: true; patch: Partial<AppSettings> } | { ok: false; error: string };

/** 写入路径的校验。服务端与客户端共用。 */
export function parseSettingsPatch(input: unknown): SettingsPatchResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '设置补丁须为对象' };
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isSettingKey(key)) {
      return { ok: false, error: `未知设置项：${key}` };
    }
    const parsed = SETTINGS_CODECS[key].parse(value);
    if (parsed === undefined) {
      return { ok: false, error: `设置项 ${key} 的值不合法` };
    }
    patch[key] = parsed;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '设置补丁不能为空' };
  }
  return { ok: true, patch: patch as Partial<AppSettings> };
}

/**
 * core 定义抽象，data 提供实现（spec §9 DIP）。
 * getAll 返回**未解析**的原始值：data 只负责存取，
 * 「什么算合法设置」是领域知识，留在 resolveSettings。
 */
export interface SettingsRepository {
  getAll(): Promise<Record<string, unknown>>;
  /** upsert，单事务。空补丁是 no-op。 */
  setMany(patch: Partial<AppSettings>): Promise<void>;
}

/**
 * 设置端点的路径。服务端注册与客户端请求共用同一份，不可能各改一半。
 *
 * 模块把路径放在自己的 contract.ts 里；设置没有模块，它的 contract 天然属于 core。
 * 放这儿还有一个硬理由：packages/web 不能依赖 packages/server
 * （会把 Fastify 拉进浏览器产物），路径必须落在两边都能 import 的地方。
 */
export const SETTINGS_API = {
  root: () => '/api/settings',
} as const;
```

- [ ] **Step 4: 从 core 的 index 导出**

在 `packages/core/src/index.ts` 末尾追加：

```ts
export type {
  SettingCodec,
  SettingKey,
  AppSettings,
  SettingsPatchResult,
  SettingsRepository,
} from './settings.js';
export {
  SETTINGS_CODECS,
  SETTING_KEYS,
  DEFAULT_SETTINGS,
  SETTINGS_API,
  isSettingKey,
  resolveSettings,
  parseSettingsPatch,
} from './settings.js';
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/core/src/settings.test.ts`
Expected: PASS，14 个用例全绿。

- [ ] **Step 6: 提交（带上设计文档与本计划）**

```bash
git add packages/core/src/settings.ts packages/core/src/settings.test.ts \
        packages/core/src/index.ts \
        docs/superpowers/specs/2026-08-19-settings-persistence-design.md \
        docs/superpowers/plans/2026-08-19-settings-persistence.md
git commit -m "feat(core): 设置项的 codec 表与 SettingsRepository 接口 TASK-025"
```

---

### Task 2: data 的 app_settings 表与 SQLite 实现

**Files:**

- Modify: `packages/data/src/schema.ts`
- Create: `packages/data/migrations/0001_*.sql`（`npm run db:generate` 生成，文件名随机后缀由 drizzle-kit 决定）
- Create: `packages/core/src/testing/settings-repository-contract.ts`
- Create: `packages/data/src/settings-repository.ts`
- Create: `packages/data/src/settings-repository.test.ts`
- Modify: `packages/data/src/index.ts`

**Interfaces:**

- Consumes: Task 1 的 `SettingsRepository`、`AppSettings`
- Produces:
  - `function runSettingsRepositoryContract(name: string, makeRepo: () => Promise<SettingsRepository> | SettingsRepository): void`（从 `@workbench/core/testing/settings-repository-contract.js` 的相对路径 import，用法照 `runItemRepositoryContract`）
  - `class SqliteSettingsRepository implements SettingsRepository { constructor(db: Db) }`
  - `const appSettings`（drizzle 表）

- [ ] **Step 1: 写契约测试（core 拥有）**

创建 `packages/core/src/testing/settings-repository-contract.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { SettingsRepository } from '../settings.js';

/**
 * SettingsRepository 的行为契约（spec §9 LSP）。
 * 任何实现——SQLite 版、将来的同步版——都必须原样通过这一套测试。
 */
export function runSettingsRepositoryContract(
  name: string,
  makeRepo: () => Promise<SettingsRepository> | SettingsRepository,
): void {
  describe(`SettingsRepository 契约：${name}`, () => {
    let repo: SettingsRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('空库的 getAll 返回空对象而非抛错', async () => {
      expect(await repo.getAll()).toEqual({});
    });

    it('setMany 写入后 getAll 原样取回', async () => {
      await repo.setMany({ 'theme.mode': 'dark', 'workbench.showGreeting': false });
      expect(await repo.getAll()).toEqual({
        'theme.mode': 'dark',
        'workbench.showGreeting': false,
      });
    });

    it('同一个键再次 setMany 是覆盖而不是插入第二行', async () => {
      await repo.setMany({ 'theme.mode': 'dark' });
      await repo.setMany({ 'theme.mode': 'light' });
      expect(await repo.getAll()).toEqual({ 'theme.mode': 'light' });
    });

    it('部分写入不影响其他键', async () => {
      await repo.setMany({ 'theme.mode': 'dark', 'theme.palette': 'ocean' });
      await repo.setMany({ 'theme.mode': 'light' });
      expect(await repo.getAll()).toEqual({ 'theme.mode': 'light', 'theme.palette': 'ocean' });
    });

    it('布尔值往返后仍是布尔，不变成 0/1 或 "true"', async () => {
      await repo.setMany({ 'workbench.enableAnimations': false });
      const raw = await repo.getAll();
      expect(raw['workbench.enableAnimations']).toBe(false);
    });

    it('空补丁是 no-op，不抛错也不写行', async () => {
      await repo.setMany({});
      expect(await repo.getAll()).toEqual({});
    });
  });
}
```

- [ ] **Step 2: 加表定义**

在 `packages/data/src/schema.ts` 末尾追加（注意：表里没有任何模块名——铁律 2）：

```ts
/**
 * 应用级设置（core 的第二张表）。
 *
 * KV 而非固定单行宽表：设置项是增长最快的东西，宽表意味着每加一项都要 db:generate。
 * 代价是 SQL 层无类型——可接受，因为设置永远整表读取、由 core 的 codec 解析，
 * 从不参与 SQL 层的筛选或排序。
 *
 * 这与已否决的 EAV 不冲突：那条针对的是**业务实体**的万能键值表。
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  /** JSON.stringify 后的值。'"dark"' / 'false' / '"Asia/Shanghai"' */
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
```

- [ ] **Step 3: 生成迁移**

Run: `npm run db:generate`
Expected: 在 `packages/data/migrations/` 下生成 `0001_<随机词>.sql`，内容形如 `CREATE TABLE \`app_settings\` (...)`，并更新 `meta/_journal.json`。

用 `cat` 打开生成的 SQL 确认它只有 `CREATE TABLE app_settings`，**没有**对 `items` 表的任何 `ALTER` 或 `DROP`。若有，说明 schema 与既有迁移漂移了，停下来先查清楚再继续。

- [ ] **Step 4: 写实现**

创建 `packages/data/src/settings-repository.ts`：

```ts
import { nowIso, type AppSettings, type SettingsRepository } from '@workbench/core';
import type { Db } from './db.js';
import { appSettings } from './schema.js';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(appSettings);
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.valueJson);
      } catch {
        // 存坏的行直接跳过。读取路径永不失败——resolveSettings 会补上默认值。
      }
    }
    return out;
  }

  async setMany(patch: Partial<AppSettings>): Promise<void> {
    const entries = Object.entries(patch);
    if (entries.length === 0) return;
    const now = nowIso();
    this.db.transaction((tx) => {
      for (const [key, value] of entries) {
        const valueJson = JSON.stringify(value);
        tx.insert(appSettings)
          .values({ key, valueJson, updatedAt: now })
          .onConflictDoUpdate({ target: appSettings.key, set: { valueJson, updatedAt: now } })
          .run();
      }
    });
  }
}
```

- [ ] **Step 5: 写测试**

创建 `packages/data/src/settings-repository.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { runSettingsRepositoryContract } from '@workbench/core/testing/settings-repository-contract.js';
import { openTestDatabase } from './db.js';
import { SqliteSettingsRepository } from './settings-repository.js';

runSettingsRepositoryContract('SqliteSettingsRepository', () => {
  const { db } = openTestDatabase();
  return new SqliteSettingsRepository(db);
});

describe('SqliteSettingsRepository 的存储细节', () => {
  it('值以 JSON 文本落库，读出时还原为原类型', async () => {
    const { db, sqlite } = openTestDatabase();
    const repo = new SqliteSettingsRepository(db);
    await repo.setMany({ 'theme.mode': 'dark', 'workbench.showGreeting': false });

    const rows = sqlite
      .prepare('SELECT key, value_json FROM app_settings ORDER BY key')
      .all() as Array<{ key: string; value_json: string }>;
    expect(rows).toEqual([
      { key: 'theme.mode', value_json: '"dark"' },
      { key: 'workbench.showGreeting', value_json: 'false' },
    ]);
  });

  it('库里存了坏 JSON 时跳过该行，其余照常返回', async () => {
    const { db, sqlite } = openTestDatabase();
    const repo = new SqliteSettingsRepository(db);
    await repo.setMany({ 'theme.mode': 'dark' });
    sqlite
      .prepare('INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('theme.palette', '{not json', '2026-08-19T00:00:00.000Z');

    expect(await repo.getAll()).toEqual({ 'theme.mode': 'dark' });
  });

  it('updated_at 是带 Z 与三位毫秒的 UTC ISO8601', async () => {
    const { db, sqlite } = openTestDatabase();
    await new SqliteSettingsRepository(db).setMany({ 'theme.mode': 'dark' });
    const row = sqlite.prepare('SELECT updated_at FROM app_settings').get() as {
      updated_at: string;
    };
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
```

**注意** `openTestDatabase()` 只跑 core 迁移——新的 `0001_*` 正在 core 的集中目录里，所以它会自动被跑到，这也顺带验证了迁移本身。

- [ ] **Step 6: 确认 core 的 testing 子路径可被 import**

Run: `cat packages/core/package.json`
`@workbench/core/testing/...` 这个子路径 import 是否可用，取决于 core 的 `exports` 字段。若 `packages/data/src/item-repository.test.ts` 里已经这么 import 了 `runItemRepositoryContract`，照抄它的写法即可；若它用的是别的形式（例如相对路径或 `exports` 里带通配），改成一致的形式。

Run: `grep -n "item-repository-contract" packages/data/src/*.ts`
Expected: 看到既有写法，把 Step 5 里的 import 改成同形。

- [ ] **Step 7: 跑测试确认通过**

Run: `npx vitest run packages/data/src/settings-repository.test.ts`
Expected: PASS，契约 6 条 + 细节 3 条全绿。

- [ ] **Step 8: 从 data 的 index 导出**

`packages/data/src/index.ts` 改为（在既有行基础上追加）：

```ts
export { items, appSettings } from './schema.js';
export { SqliteSettingsRepository } from './settings-repository.js';
```

- [ ] **Step 9: 全量测试 + 提交**

Run: `npm run test`
Expected: 全绿（确认新迁移没有打断既有的迁移测试）。

```bash
git add packages/data/src/schema.ts packages/data/src/settings-repository.ts \
        packages/data/src/settings-repository.test.ts packages/data/src/index.ts \
        packages/data/migrations packages/core/src/testing/settings-repository-contract.ts
git commit -m "feat(data): app_settings 表与 SqliteSettingsRepository TASK-025"
```

---

### Task 3: server 的 /api/settings 与壳层注册通道

**Files:**

- Create: `packages/server/src/settings/contract.ts`
- Create: `packages/server/src/settings/routes.ts`
- Create: `packages/server/src/settings/routes.test.ts`
- Modify: `packages/server/src/app.ts`

**Interfaces:**

- Consumes: Task 1 的 `parseSettingsPatch` / `resolveSettings` / `SETTING_KEYS` / `SettingsRepository`；Task 2 的 `SqliteSettingsRepository`
- Produces:
  - `interface SettingsResponse { settings: AppSettings; storedKeys: SettingKey[] }`
  - `function registerSettingsRoutes(app: FastifyInstance, repo: SettingsRepository): void`

- [ ] **Step 1: 写失败的测试**

创建 `packages/server/src/settings/routes.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@workbench/core';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '../app.js';

async function makeApp() {
  const { db } = openTestDatabase();
  return buildApp({ db, modules: [] });
}

describe('GET /api/settings', () => {
  it('空库返回全套默认值，storedKeys 为空', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ settings: DEFAULT_SETTINGS, storedKeys: [] });
    await app.close();
  });
});

describe('PATCH /api/settings', () => {
  it('写入后返回完整设置，storedKeys 只含真正落库的键', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'dark' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settings['theme.mode']).toBe('dark');
    expect(body.settings['theme.palette']).toBe('warm');
    expect(body.storedKeys).toEqual(['theme.mode']);
    await app.close();
  });

  it('写入在 GET 里可见', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'timezone.id': 'Europe/Paris' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.json().settings['timezone.id']).toBe('Europe/Paris');
    expect(res.json().storedKeys).toEqual(['timezone.id']);
    await app.close();
  });

  it('未知键返回 400 并带请求编号，不写库', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.nope': 'x' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('theme.nope');
    expect(res.json().requestId).toBeTruthy();

    const after = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(after.json().storedKeys).toEqual([]);
    await app.close();
  });

  it('值不合法返回 400', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'chartreuse' } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('缺少 settings 字段返回 400 而非 500', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('一次写多个键是原子的：其中一个不合法则一个都不写', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'dark', 'theme.palette': 'nonsense' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.json().storedKeys).toEqual([]);
    await app.close();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/server/src/settings/routes.test.ts`
Expected: FAIL，GET 返回 404（路由尚未注册）。

- [ ] **Step 3: 写 contract**

创建 `packages/server/src/settings/contract.ts`：

```ts
import type { AppSettings, SettingKey } from '@workbench/core';

/**
 * 设置的前后端接缝。
 *
 * 与模块的 contract.ts 有两处刻意的不同：
 *
 * 1. **不放 Zod schema**。core 的 SETTINGS_CODECS 已经是「什么算合法设置」的唯一真相，
 *    服务端校验入参与客户端校验响应都调它；再写一份 Zod 就是两份口径，早晚各改一半。
 * 2. **路径本身住在 core**。packages/web 不能依赖 packages/server（会把 Fastify 拉进
 *    浏览器产物），所以路径必须落在两边都能 import 的地方。这里只是转出来，
 *    让服务端的 import 位置与模块保持同形。
 */
export { SETTINGS_API } from '@workbench/core';

export interface SettingsResponse {
  settings: AppSettings;
  /**
   * 库里**真实存在**的键。没有它，客户端无法区分「库里存的恰好是默认值」与
   * 「库里根本没有这一项」，一次性迁移旧 localStorage 时就只能盲写覆盖。
   */
  storedKeys: SettingKey[];
}

export interface SettingsPatchBody {
  settings: Partial<AppSettings>;
}
```

- [ ] **Step 4: 写路由**

创建 `packages/server/src/settings/routes.ts`：

```ts
import type { FastifyInstance } from 'fastify';
import {
  SETTING_KEYS,
  parseSettingsPatch,
  resolveSettings,
  type SettingsRepository,
} from '@workbench/core';
import { SETTINGS_API, type SettingsResponse } from './contract.js';

/** 交给 app.ts 的统一错误出口落成 400，同时照常带上请求编号。 */
function badRequest(message: string): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

function toResponse(raw: Record<string, unknown>): SettingsResponse {
  return {
    settings: resolveSettings(raw),
    storedKeys: SETTING_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(raw, key)),
  };
}

/**
 * 设置路由。**不经模块注册表**——设置不属于任何模块，也没有 core Item，
 * 且外壳启动即需要。判据见 ADR-0018；这条通道不是「懒得写模块」的后门。
 *
 * 校验放在 route 而非 service：这里根本没有 service 层，
 * 因此也不需要 todo 那套 DomainError / toHttp 的桥。
 */
export function registerSettingsRoutes(app: FastifyInstance, repo: SettingsRepository): void {
  app.get(SETTINGS_API.root(), async () => toResponse(await repo.getAll()));

  app.patch(SETTINGS_API.root(), async (request) => {
    const body = request.body as { settings?: unknown } | undefined;
    const result = parseSettingsPatch(body?.settings);
    if (!result.ok) throw badRequest(result.error);
    await repo.setMany(result.patch);
    return toResponse(await repo.getAll());
  });
}
```

- [ ] **Step 5: 在 buildApp 里接线**

修改 `packages/server/src/app.ts`。import 处加上：

```ts
import { SqliteItemRepository, SqliteSettingsRepository, type Db } from '@workbench/data';
import { registerSettingsRoutes } from './settings/routes.js';
```

把 `app.get('/api/health', ...)` 之后、`registerModules` 之前改成：

```ts
app.get('/api/health', async () => ({ ok: true }));

// 设置走模块注册表之外的第二条通道：它不属于任何模块，且外壳启动即需要（ADR-0018）。
registerSettingsRoutes(app, new SqliteSettingsRepository(opts.db));

const items = new SqliteItemRepository(opts.db);
await registerModules(app, opts.db, items, opts.modules);
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run packages/server/src/settings/routes.test.ts`
Expected: PASS，7 个用例全绿。

- [ ] **Step 7: 全量测试 + 提交**

Run: `npm run check`
Expected: 四步全绿。

```bash
git add packages/server/src/settings packages/server/src/app.ts
git commit -m "feat(server): /api/settings 与壳层注册通道 TASK-025"
```

---

### Task 4: ui 的同步逻辑（框架无关，可测）

**Files:**

- Create: `packages/ui/src/settingsSync.ts`
- Create: `packages/ui/src/settingsSync.test.ts`
- Modify: `packages/ui/package.json`

**Interfaces:**

- Consumes: Task 1 的 `AppSettings` / `SettingKey` / `DEFAULT_SETTINGS`
- Produces:
  - `interface SettingsSnapshot { settings: AppSettings; storedKeys: SettingKey[] }`
  - `interface SettingsStore { readSnapshot(): Partial<AppSettings>; writeSnapshot(settings: AppSettings): void; load(): Promise<SettingsSnapshot>; patch(p: Partial<AppSettings>): Promise<AppSettings> }`
  - `class SettingsSync { constructor(store: SettingsStore, onChange: (s: AppSettings) => void, onError: (m: string | null) => void); get current(): AppSettings; init(): Promise<void>; update(patch: Partial<AppSettings>): void; whenIdle(): Promise<void> }`

- [ ] **Step 1: 给 ui 加 core 依赖**

Run: `npm install @workbench/core@* -w packages/ui`

若该命令因为 `--ignore-scripts` 的历史约定出问题，改为手工在 `packages/ui/package.json` 的 `dependencies` 里加 `"@workbench/core": "*"`，再跑 `npm run setup`。

Expected: `packages/ui/package.json` 的 `dependencies` 里出现 `"@workbench/core": "*"`。

- [ ] **Step 2: 写失败的测试**

创建 `packages/ui/src/settingsSync.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AppSettings } from '@workbench/core';
import { SettingsSync, type SettingsStore } from './settingsSync.js';

/** 可控的假 store：patch 挂起在 deferred 上，用来精确制造并发。 */
function makeStore(overrides: Partial<SettingsStore> = {}) {
  const calls: Array<Partial<AppSettings>> = [];
  let server: AppSettings = { ...DEFAULT_SETTINGS };
  const store: SettingsStore = {
    readSnapshot: () => ({}),
    writeSnapshot: vi.fn(),
    load: async () => ({ settings: server, storedKeys: [] }),
    patch: async (p) => {
      calls.push(p);
      server = { ...server, ...p };
      return server;
    },
    ...overrides,
  };
  return { store, calls, getServer: () => server };
}

describe('SettingsSync 首屏', () => {
  it('构造时立即用快照填充，不等网络', () => {
    const { store } = makeStore({ readSnapshot: () => ({ 'theme.mode': 'dark' }) });
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    expect(sync.current['theme.mode']).toBe('dark');
    expect(sync.current['theme.palette']).toBe('warm');
  });

  it('快照里的脏值不会污染当前值', () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'chartreuse' }) as never,
    });
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    expect(sync.current['theme.mode']).toBe('system');
  });

  it('init 后用服务端值校正并回写快照', async () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'dark' }),
      load: async () => ({
        settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'light' },
        storedKeys: ['theme.mode'],
      }),
    });
    const onChange = vi.fn();
    const sync = new SettingsSync(store, onChange, vi.fn());
    await sync.init();
    expect(sync.current['theme.mode']).toBe('light');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ 'theme.mode': 'light' }));
    expect(store.writeSnapshot).toHaveBeenCalled();
  });

  it('init 失败时保留快照值，不清空界面', async () => {
    const { store } = makeStore({
      readSnapshot: () => ({ 'theme.mode': 'dark' }),
      load: async () => {
        throw new Error('后端没起来');
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    expect(sync.current['theme.mode']).toBe('dark');
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('后端没起来'));
  });
});

describe('SettingsSync 写入', () => {
  it('乐观更新：update 后立刻可见，不等请求回来', () => {
    const { store } = makeStore();
    const onChange = vi.fn();
    const sync = new SettingsSync(store, onChange, vi.fn());
    sync.update({ 'theme.mode': 'dark' });
    expect(sync.current['theme.mode']).toBe('dark');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ 'theme.mode': 'dark' }));
  });

  it('连续改动合并成一个后续请求，而不是各发一个', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: Array<Partial<AppSettings>> = [];
    let first = true;
    const store: SettingsStore = {
      readSnapshot: () => ({}),
      writeSnapshot: vi.fn(),
      load: async () => ({ settings: { ...DEFAULT_SETTINGS }, storedKeys: [] }),
      patch: async (p) => {
        calls.push(p);
        if (first) {
          first = false;
          await gate;
        }
        return { ...DEFAULT_SETTINGS, ...p };
      },
    };
    const sync = new SettingsSync(store, vi.fn(), vi.fn());

    sync.update({ 'theme.mode': 'dark' }); // 第一个请求，卡住
    sync.update({ 'theme.palette': 'ocean' }); // 入队
    sync.update({ 'timezone.id': 'Europe/Paris' }); // 与上一条合并
    release!();
    await sync.whenIdle();

    expect(calls).toEqual([
      { 'theme.mode': 'dark' },
      { 'theme.palette': 'ocean', 'timezone.id': 'Europe/Paris' },
    ]);
  });

  it('写失败时回滚到上一个服务端确认值并报错', async () => {
    const { store } = makeStore({
      patch: async () => {
        throw new Error('设置项 theme.mode 的值不合法（请求编号 req-7）');
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    expect(sync.current['theme.mode']).toBe('dark'); // 乐观期间
    await sync.whenIdle();
    expect(sync.current['theme.mode']).toBe('system'); // 回滚
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('req-7'));
  });

  it('成功后清掉上一次的错误', async () => {
    let shouldFail = true;
    const { store } = makeStore({
      patch: async (p) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('炸了');
        }
        return { ...DEFAULT_SETTINGS, ...p };
      },
    });
    const onError = vi.fn();
    const sync = new SettingsSync(store, vi.fn(), onError);
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    await sync.whenIdle();
    sync.update({ 'theme.mode': 'light' });
    await sync.whenIdle();
    expect(onError).toHaveBeenLastCalledWith(null);
  });

  it('成功后把确认值写进快照', async () => {
    const { store } = makeStore();
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    await sync.init();
    sync.update({ 'theme.mode': 'dark' });
    await sync.whenIdle();
    expect(store.writeSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ 'theme.mode': 'dark' }),
    );
  });

  it('空补丁不发请求', async () => {
    const { store, calls } = makeStore();
    const sync = new SettingsSync(store, vi.fn(), vi.fn());
    sync.update({});
    await sync.whenIdle();
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run packages/ui/src/settingsSync.test.ts`
Expected: FAIL，报无法解析 `./settingsSync.js`。

- [ ] **Step 4: 写实现**

创建 `packages/ui/src/settingsSync.ts`：

```ts
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  type AppSettings,
  type SettingKey,
} from '@workbench/core';

export interface SettingsSnapshot {
  settings: AppSettings;
  storedKeys: SettingKey[];
}

/**
 * 设置的读写端口。ui 只声明它，不实现——实现在 packages/web，
 * 这样 packages/ui 保持零网络调用，也不会出现硬编码的 /api/ 字面量。
 */
export interface SettingsStore {
  /** 同步。首屏立即可用，可能过期或不完整。 */
  readSnapshot(): Partial<AppSettings>;
  writeSnapshot(settings: AppSettings): void;
  load(): Promise<SettingsSnapshot>;
  patch(patch: Partial<AppSettings>): Promise<AppSettings>;
}

/**
 * 设置的同步器：乐观更新 + 合并串行 + 失败回滚。
 *
 * 刻意与 React 无关，因为这里是唯一有分支逻辑的地方，而 Vitest 不收集 .tsx。
 * SettingsContext.tsx 只是它的一层薄壳。
 */
export class SettingsSync {
  private settings: AppSettings;
  /** 上一个服务端确认过的值。写失败时回滚到它。 */
  private confirmed: AppSettings;
  private pending: Partial<AppSettings> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly onChange: (settings: AppSettings) => void,
    private readonly onError: (message: string | null) => void,
  ) {
    // 快照过一遍 resolveSettings：脏快照（手改过、版本更迭遗留）不该污染界面。
    this.settings = resolveSettings(this.store.readSnapshot() as Record<string, unknown>);
    this.confirmed = { ...DEFAULT_SETTINGS };
  }

  get current(): AppSettings {
    return this.settings;
  }

  async init(): Promise<void> {
    try {
      const snapshot = await this.store.load();
      this.confirmed = snapshot.settings;
      this.settings = snapshot.settings;
      this.store.writeSnapshot(snapshot.settings);
      this.onChange(snapshot.settings);
      this.onError(null);
    } catch (err) {
      // 拉不到就继续用快照：后端没起来时界面不该退回默认主题。
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }

  update(patch: Partial<AppSettings>): void {
    if (Object.keys(patch).length === 0) return;
    this.settings = { ...this.settings, ...patch };
    this.onChange(this.settings);
    this.pending = { ...(this.pending ?? {}), ...patch };
    void this.flush();
  }

  /** 测试与卸载用：等到队列排空。 */
  async whenIdle(): Promise<void> {
    while (this.flushing !== null) {
      await this.flushing;
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing !== null || this.pending === null) return;
    const batch = this.pending;
    this.pending = null;
    this.flushing = this.send(batch).finally(() => {
      this.flushing = null;
    });
    await this.flushing;
    if (this.pending !== null) await this.flush();
  }

  private async send(batch: Partial<AppSettings>): Promise<void> {
    try {
      const confirmed = await this.store.patch(batch);
      this.confirmed = confirmed;
      // 队列里还有后续改动时不要把界面拽回服务端值，否则连续操作会闪。
      if (this.pending === null) {
        this.settings = confirmed;
        this.onChange(confirmed);
      }
      this.store.writeSnapshot(confirmed);
      this.onError(null);
    } catch (err) {
      // 「界面已改、库里没改」正是这次要消灭的不一致，所以失败就回滚。
      this.pending = null;
      this.settings = this.confirmed;
      this.onChange(this.confirmed);
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/ui/src/settingsSync.test.ts`
Expected: PASS，10 个用例全绿。

若「连续改动合并」那条失败，检查 `flush` 的递归：第一次 `patch` 尚未 resolve 时，第二、三次 `update` 必须只往 `pending` 里合并而不新起请求。

- [ ] **Step 6: 提交**

```bash
git add packages/ui/src/settingsSync.ts packages/ui/src/settingsSync.test.ts \
        packages/ui/package.json package-lock.json
git commit -m "feat(ui): 设置同步器（乐观更新 + 合并串行 + 回滚） TASK-025"
```

---

### Task 5: ui 的 SettingsProvider 与三个 Context 改造

**Files:**

- Create: `packages/ui/src/SettingsContext.tsx`
- Modify: `packages/ui/src/ThemeContext.tsx`
- Modify: `packages/ui/src/TimezoneContext.tsx`
- Modify: `packages/ui/src/PreferencesContext.tsx`
- Modify: `packages/ui/src/index.tsx`

**Interfaces:**

- Consumes: Task 4 的 `SettingsSync` / `SettingsStore`
- Produces:
  - `function SettingsProvider({ store, children }: { store: SettingsStore; children: ReactNode })`
  - `function useSettings(): { settings: AppSettings; update: (p: Partial<AppSettings>) => void; lastError: string | null }`
  - `useTheme` / `useTimezone` / `usePreferences` 的返回形状**保持不变**

- [ ] **Step 1: 写 SettingsProvider**

创建 `packages/ui/src/SettingsContext.tsx`：

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '@workbench/core';
import { SettingsSync, type SettingsStore } from './settingsSync.js';

export interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 最近一次写失败的信息，含服务端返回的请求编号。设置页据此提示。 */
  lastError: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  store,
  children,
}: {
  store: SettingsStore;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [lastError, setLastError] = useState<string | null>(null);

  const syncRef = useRef<SettingsSync | null>(null);
  if (syncRef.current === null) {
    syncRef.current = new SettingsSync(store, setSettings, setLastError);
    // 首屏同步取快照，避免第一帧渲染默认主题再闪一下。
    setSettings(syncRef.current.current);
  }
  const sync = syncRef.current;

  useEffect(() => {
    void sync.init();
  }, [sync]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => sync.update(patch),
      lastError,
    }),
    [settings, lastError, sync],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内部使用');
  }
  return ctx;
}
```

**注意** `useState` 初值不能直接调 `syncRef.current.current`（那时 ref 还没建）。上面的写法是：先给 `DEFAULT_SETTINGS`，同一次渲染里建好 sync 后立刻 `setSettings`——React 会在提交前重跑一次渲染，不会闪。若 lint 抱怨渲染期 setState，改为 `useState<AppSettings>(() => { syncRef.current ??= new SettingsSync(...); return syncRef.current.current; })` 的惰性初值形式，效果相同。

- [ ] **Step 2: 改 ThemeContext**

修改 `packages/ui/src/ThemeContext.tsx`：

- 删除 `STORAGE_KEY_MODE` / `STORAGE_KEY_PALETTE` 两个常量与所有 `localStorage` 读写。
- 删除 `ThemeProvider` 的 `defaultMode` / `defaultPalette` 两个 props（默认值现在只有 core codec 表一个来源）。
- `mode` / `palette` 改为从 `useSettings()` 读，setter 改为 `update`。

`ThemeProvider` 主体改为：

```tsx
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const mode = settings['theme.mode'];
  const palette = settings['theme.palette'];

  const [systemMode, setSystemMode] = useState<'light' | 'dark'>(getSystemMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedMode = mode === 'system' ? systemMode : mode;

  // 同步 CSS 类名与属性到 document.documentElement（这段原样保留）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', palette);
    root.setAttribute('data-mode', resolvedMode);
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode, palette]);

  const setMode = useCallback((next: ThemeMode) => update({ 'theme.mode': next }), [update]);
  const setPalette = useCallback(
    (next: ThemePalette) => update({ 'theme.palette': next }),
    [update],
  );
  const toggleMode = useCallback(() => {
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    update({ 'theme.mode': next });
  }, [mode, update]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, palette, resolvedMode, setMode, setPalette, toggleMode }),
    [mode, palette, resolvedMode, setMode, setPalette, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

`ThemeMode` / `ThemePalette` 两个类型改为从 core 的 `AppSettings` 取，保证与 codec 表同源：

```ts
export type ThemeMode = AppSettings['theme.mode'];
export type ThemePalette = AppSettings['theme.palette'];
```

`PALETTES` 数组与 `PaletteMeta` 原样保留（那是展示元数据，不是值域）。

- [ ] **Step 3: 改 TimezoneContext**

修改 `packages/ui/src/TimezoneContext.tsx`：

- 删除 `TIMEZONE_STORAGE_KEY` / `DST_MODE_STORAGE_KEY` 与所有 `localStorage` 读写。
- `DEFAULT_TIMEZONE` 保留导出（其他文件在用），但值改为引用 `DEFAULT_SETTINGS['timezone.id']`。
- `DstMode` 改为 `AppSettings['timezone.dstMode']`。

`TimezoneProvider` 主体改为：

```tsx
export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const timezone = settings['timezone.id'];
  const dstMode = settings['timezone.dstMode'];

  const timezoneInfo = useMemo(() => getTimezoneInfo(timezone), [timezone]);

  const value = useMemo(
    () => ({
      timezone,
      setTimezone: (tz: string) => update({ 'timezone.id': tz }),
      dstMode,
      setDstMode: (m: DstMode) => update({ 'timezone.dstMode': m }),
      timezoneInfo,
      toUtcIso: (localStr: string) => toUtcIso(localStr, timezone),
      formatUtcToLocal: (utcIso: string) => formatUtcToLocal(utcIso, timezone),
    }),
    [timezone, dstMode, timezoneInfo, update],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}
```

`useTimezone` 里「无 Provider 时降级为上海时区」的那段保护**原样保留**。

- [ ] **Step 4: 改 PreferencesContext**

修改 `packages/ui/src/PreferencesContext.tsx`：

- 删除 `PREFERENCES_STORAGE_KEY`、`loadSavedPreferences`、`savePreferencesToStorage`。
- `WorkbenchPreferences` 接口与 `DEFAULT_PREFERENCES` **保留**（`SettingsPage` 在用），但 `DEFAULT_PREFERENCES` 改为从 `DEFAULT_SETTINGS` 推导。
- 加一对映射函数，把 core 的点分键与 UI 的驼峰键对上：

```ts
const PREF_KEYS = {
  showGreeting: 'workbench.showGreeting',
  autoExpandOverdue: 'workbench.autoExpandOverdue',
  enableAnimations: 'workbench.enableAnimations',
  showCompletedTasks: 'workbench.showCompletedTasks',
} as const satisfies Record<keyof WorkbenchPreferences, SettingKey>;

function toPreferences(settings: AppSettings): WorkbenchPreferences {
  return {
    showGreeting: settings['workbench.showGreeting'],
    autoExpandOverdue: settings['workbench.autoExpandOverdue'],
    enableAnimations: settings['workbench.enableAnimations'],
    showCompletedTasks: settings['workbench.showCompletedTasks'],
  };
}

function toPatch(patch: Partial<WorkbenchPreferences>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const [uiKey, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[PREF_KEYS[uiKey as keyof WorkbenchPreferences]] = value;
  }
  return out;
}
```

`PreferencesProvider` 主体改为（`initialPreferences` prop 删除，它只有测试在用且已无意义）：

```tsx
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const preferences = useMemo(() => toPreferences(settings), [settings]);

  // 同步动效属性到 document.documentElement（这段原样保留）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-animations', preferences.enableAnimations ? 'enabled' : 'disabled');
    root.setAttribute('data-reduced-motion', preferences.enableAnimations ? 'false' : 'true');
  }, [preferences.enableAnimations]);

  const setPreference = useCallback<PreferencesContextValue['setPreference']>(
    (key, valueOrUpdater) => {
      const next =
        typeof valueOrUpdater === 'function'
          ? (
              valueOrUpdater as (
                prev: WorkbenchPreferences[typeof key],
              ) => WorkbenchPreferences[typeof key]
            )(preferences[key])
          : valueOrUpdater;
      update(toPatch({ [key]: next } as Partial<WorkbenchPreferences>));
    },
    [preferences, update],
  );

  const togglePreference = useCallback(
    (key: keyof WorkbenchPreferences) => {
      update(toPatch({ [key]: !preferences[key] } as Partial<WorkbenchPreferences>));
    },
    [preferences, update],
  );

  const updatePreferences = useCallback<PreferencesContextValue['updatePreferences']>(
    (patchOrUpdater) => {
      const patch =
        typeof patchOrUpdater === 'function' ? patchOrUpdater(preferences) : patchOrUpdater;
      update(toPatch(patch));
    },
    [preferences, update],
  );

  const resetPreferences = useCallback(() => {
    update(toPatch(DEFAULT_PREFERENCES));
  }, [update]);

  const value = useMemo<PreferencesContextValue>(
    () => ({ preferences, setPreference, togglePreference, updatePreferences, resetPreferences }),
    [preferences, setPreference, togglePreference, updatePreferences, resetPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
```

- [ ] **Step 5: 修既有的 Context 测试**

`packages/ui/src/PreferencesContext.test.ts` 与 `TimezoneContext.test.ts` 里凡是断言 localStorage 行为的用例已经失效。

Run: `npx vitest run packages/ui/src/PreferencesContext.test.ts packages/ui/src/TimezoneContext.test.ts`

逐条看失败原因：

- 断言「写 localStorage」的用例 → **删掉**，这个行为已经不存在了。
- 断言纯函数（`toUtcIso`、`formatUtcToLocal`、`getTimezoneInfo`、默认值形状）的用例 → **保留**，它们不受影响。
- 断言 `DEFAULT_PREFERENCES` 内容的用例 → 保留，值没变。

- [ ] **Step 6: 导出新东西**

`packages/ui/src/index.tsx` 追加：

```ts
export { SettingsProvider, useSettings } from './SettingsContext.js';
export type { SettingsContextValue } from './SettingsContext.js';
export type { SettingsStore, SettingsSnapshot } from './settingsSync.js';
```

- [ ] **Step 7: 类型检查与 lint**

Run: `npm run typecheck && npm run lint`
Expected: 全绿。此时 `packages/web` 会因为 `App.tsx` 还没包 `SettingsProvider` 而**类型报错**（`ThemeProvider` 不再接受 `defaultMode`）——这是预期的，Task 6 修。若想让这一步单独绿，可以先把 `App.tsx` 的两个 props 删掉，剩下的接线留给 Task 6。

- [ ] **Step 8: 跑 ui 的全部测试**

Run: `npx vitest run packages/ui`
Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add packages/ui/src
git commit -m "refactor(ui): 三个设置 Context 改为消费 SettingsProvider TASK-025"
```

---

### Task 6: web 的 HTTP 实现、一次性迁移与接线

**Files:**

- Create: `packages/web/src/settingsStore.ts`
- Create: `packages/web/src/settingsStore.test.ts`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**

- Consumes: Task 4 的 `SettingsStore` / `SettingsSnapshot`；Task 3 的 `/api/settings`
- Produces:
  - `function createHttpSettingsStore(deps?: { fetchFn?: typeof fetch; storage?: Storage | null }): SettingsStore`
  - `const SNAPSHOT_KEY = 'workbench_settings'`
  - `const MIGRATED_FLAG = 'workbench_settings_migrated'`

- [ ] **Step 1: 写失败的测试**

创建 `packages/web/src/settingsStore.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@workbench/core';
import { createHttpSettingsStore, SNAPSHOT_KEY, MIGRATED_FLAG } from './settingsStore.js';

/** 测试环境是 node，没有 localStorage——用一个 Map 顶上。 */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readSnapshot / writeSnapshot', () => {
  it('没有快照时返回空对象', () => {
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
  });

  it('快照坏掉时返回空对象而不是抛', () => {
    const storage = makeStorage({ [SNAPSHOT_KEY]: '{not json' });
    const store = createHttpSettingsStore({ storage, fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
  });

  it('writeSnapshot 写进单个键，不再是五个散键', () => {
    const storage = makeStorage();
    const store = createHttpSettingsStore({ storage, fetchFn: vi.fn() });
    store.writeSnapshot({ ...DEFAULT_SETTINGS, 'theme.mode': 'dark' });
    expect(JSON.parse(storage.getItem(SNAPSHOT_KEY)!)['theme.mode']).toBe('dark');
  });

  it('storage 不可用（隐身模式）时静默降级，不抛', () => {
    const store = createHttpSettingsStore({ storage: null, fetchFn: vi.fn() });
    expect(store.readSnapshot()).toEqual({});
    expect(() => store.writeSnapshot(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('patch 的请求形状', () => {
  it('带 content-type: application/json，方法是 PATCH，body 包在 settings 里', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await store.patch({ 'theme.mode': 'dark' });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ settings: { 'theme.mode': 'dark' } });
  });

  it('4xx 时抛出服务端的错误信息与请求编号', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: '未知设置项：x', requestId: 'req-9' }, 400));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.patch({ 'theme.mode': 'dark' })).rejects.toThrow(/未知设置项：x.*req-9/);
  });

  it('响应形状不对时抛，而不是把脏数据喂给界面', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ nope: 1 }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.patch({ 'theme.mode': 'dark' })).rejects.toThrow();
  });
});

describe('load 与一次性迁移', () => {
  it('没有旧键时只发一个 GET', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    const snapshot = await store.load();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(snapshot.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('把旧的五个 localStorage 键搬上去，然后删掉它们', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'dark',
      workbench_theme_palette: 'ocean',
      workbench_timezone: 'Europe/Paris',
      workbench_dst_mode: 'standard',
      workbench_preferences: JSON.stringify({ showGreeting: false, enableAnimations: false }),
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'dark' },
          storedKeys: ['theme.mode'],
        }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();

    const patchBody = JSON.parse(fetchFn.mock.calls[1][1].body);
    expect(patchBody.settings).toEqual({
      'theme.mode': 'dark',
      'theme.palette': 'ocean',
      'timezone.id': 'Europe/Paris',
      'timezone.dstMode': 'standard',
      'workbench.showGreeting': false,
      'workbench.enableAnimations': false,
    });
    expect(storage.getItem('workbench_theme_mode')).toBeNull();
    expect(storage.getItem('workbench_preferences')).toBeNull();
    expect(storage.getItem(MIGRATED_FLAG)).toBe('1');
  });

  it('库里已有的键不被旧值覆盖', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'dark',
      workbench_timezone: 'Europe/Paris',
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          settings: { ...DEFAULT_SETTINGS, 'theme.mode': 'light' },
          storedKeys: ['theme.mode'],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: ['theme.mode', 'timezone.id'] }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).settings).toEqual({
      'timezone.id': 'Europe/Paris',
    });
  });

  it('旧值里的脏数据被丢掉，不发上去', async () => {
    const storage = makeStorage({
      workbench_theme_mode: 'chartreuse',
      workbench_timezone: 'Europe/Paris',
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: ['timezone.id'] }),
      );
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).settings).toEqual({
      'timezone.id': 'Europe/Paris',
    });
  });

  it('已经迁移过就不再迁移，哪怕旧键又冒出来', async () => {
    const storage = makeStorage({ [MIGRATED_FLAG]: '1', workbench_theme_mode: 'dark' });
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }));
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('迁移的 PATCH 失败时不删旧键、不落标记，下次还能再来一遍', async () => {
    const storage = makeStorage({ workbench_theme_mode: 'dark' });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ settings: DEFAULT_SETTINGS, storedKeys: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: '炸了', requestId: 'req-1' }, 500));
    const store = createHttpSettingsStore({ storage, fetchFn });
    await store.load();
    expect(storage.getItem('workbench_theme_mode')).toBe('dark');
    expect(storage.getItem(MIGRATED_FLAG)).toBeNull();
  });

  it('GET 失败时抛，让 SettingsSync 保留快照', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: '炸了' }, 500));
    const store = createHttpSettingsStore({ storage: makeStorage(), fetchFn });
    await expect(store.load()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/web/src/settingsStore.test.ts`
Expected: FAIL，无法解析 `./settingsStore.js`。

- [ ] **Step 3: 写实现**

创建 `packages/web/src/settingsStore.ts`：

```ts
import {
  SETTINGS_API,
  SETTINGS_CODECS,
  isSettingKey,
  resolveSettings,
  type AppSettings,
  type SettingKey,
} from '@workbench/core';
import type { SettingsSnapshot, SettingsStore } from '@workbench/ui';

export const SNAPSHOT_KEY = 'workbench_settings';
export const MIGRATED_FLAG = 'workbench_settings_migrated';

/** 旧的散键 → core 的设置键。迁移完就删。 */
const LEGACY_SCALAR_KEYS: ReadonlyArray<[string, SettingKey]> = [
  ['workbench_theme_mode', 'theme.mode'],
  ['workbench_theme_palette', 'theme.palette'],
  ['workbench_timezone', 'timezone.id'],
  ['workbench_dst_mode', 'timezone.dstMode'],
];

/** 旧的偏好是一个 JSON blob，里面四个驼峰键。 */
const LEGACY_PREFERENCES_KEY = 'workbench_preferences';
const LEGACY_PREFERENCE_FIELDS: ReadonlyArray<[string, SettingKey]> = [
  ['showGreeting', 'workbench.showGreeting'],
  ['autoExpandOverdue', 'workbench.autoExpandOverdue'],
  ['enableAnimations', 'workbench.enableAnimations'],
  ['showCompletedTasks', 'workbench.showCompletedTasks'],
];

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSettingsResponse(body: unknown): body is SettingsSnapshot {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { settings?: unknown }).settings === 'object' &&
    (body as { settings?: unknown }).settings !== null &&
    Array.isArray((body as { storedKeys?: unknown }).storedKeys)
  );
}

export function createHttpSettingsStore(
  deps: { fetchFn?: typeof fetch; storage?: Storage | null } = {},
): SettingsStore {
  const doFetch = deps.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;

  function read(key: string): string | null {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function write(key: string, value: string): void {
    try {
      storage?.setItem(key, value);
    } catch {
      // 隐身模式或配额超限：静默降级。快照丢了只是首屏会闪一下，不是错误。
    }
  }

  function remove(key: string): void {
    try {
      storage?.removeItem(key);
    } catch {
      // 同上
    }
  }

  async function request(init: RequestInit): Promise<SettingsSnapshot> {
    const res = await doFetch(SETTINGS_API.root(), init);
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body as { error?: string; requestId?: string } | null;
      const suffix = err?.requestId ? `（请求编号 ${err.requestId}）` : '';
      throw new Error(`${err?.error ?? `设置请求失败：HTTP ${res.status}`}${suffix}`);
    }
    if (!isSettingsResponse(body)) {
      throw new Error('设置响应形状不符合契约');
    }
    // 服务端返回的也过一遍 codec：接缝上大声失败，好过页面静默变空。
    return {
      settings: resolveSettings(body.settings as unknown as Record<string, unknown>),
      storedKeys: body.storedKeys.filter((k): k is SettingKey => isSettingKey(k)),
    };
  }

  /** 读旧的 localStorage，逐项过 codec，脏值丢掉。 */
  function readLegacy(): Partial<AppSettings> {
    const out: Record<string, unknown> = {};
    for (const [legacyKey, settingKey] of LEGACY_SCALAR_KEYS) {
      const raw = read(legacyKey);
      if (raw === null) continue;
      const parsed = SETTINGS_CODECS[settingKey].parse(raw);
      if (parsed !== undefined) out[settingKey] = parsed;
    }
    const prefsRaw = read(LEGACY_PREFERENCES_KEY);
    if (prefsRaw !== null) {
      try {
        const prefs = JSON.parse(prefsRaw) as Record<string, unknown>;
        for (const [field, settingKey] of LEGACY_PREFERENCE_FIELDS) {
          const parsed = SETTINGS_CODECS[settingKey].parse(prefs[field]);
          if (parsed !== undefined) out[settingKey] = parsed;
        }
      } catch {
        // 坏的偏好 blob 直接跳过
      }
    }
    return out as Partial<AppSettings>;
  }

  function clearLegacy(): void {
    for (const [legacyKey] of LEGACY_SCALAR_KEYS) remove(legacyKey);
    remove(LEGACY_PREFERENCES_KEY);
    write(MIGRATED_FLAG, '1');
  }

  return {
    readSnapshot() {
      const raw = read(SNAPSHOT_KEY);
      if (raw === null) return {};
      try {
        return JSON.parse(raw) as Partial<AppSettings>;
      } catch {
        return {};
      }
    },

    writeSnapshot(settings) {
      write(SNAPSHOT_KEY, JSON.stringify(settings));
    },

    async load() {
      const snapshot = await request({ method: 'GET' });
      if (read(MIGRATED_FLAG) !== null) return snapshot;

      // 一次性迁移：只补库里**没有**的键，绝不覆盖已落库的值。
      const legacy = readLegacy();
      const missing = Object.fromEntries(
        Object.entries(legacy).filter(([key]) => !snapshot.storedKeys.includes(key as SettingKey)),
      ) as Partial<AppSettings>;

      if (Object.keys(missing).length === 0) {
        clearLegacy();
        return snapshot;
      }

      // 失败就不落标记、不删旧键——下次启动还能再来一遍。
      const merged = await request({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: missing }),
      });
      clearLegacy();
      return merged;
    },

    async patch(patch) {
      const result = await request({
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: patch }),
      });
      return result.settings;
    },
  };
}
```

- [ ] **Step 4: 确认没有 import 到 server**

`packages/web` **不得**依赖 `@workbench/server`——会把 Fastify 拉进浏览器产物，正是
`ServerModuleDefinition` 与 `UiModuleDefinition` 拆开要避免的事。`SETTINGS_API` 在 Task 1
就放在了 core，这里从 `@workbench/core` import 即可。

Run: `grep -rn "@workbench/server" packages/web/src`
Expected: 无输出。

Run: `grep -rn "'/api/" packages/ui/src`
Expected: 无输出（ui 保持零硬编码路径）。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run packages/web/src/settingsStore.test.ts`
Expected: PASS，14 个用例全绿。

- [ ] **Step 6: 接线 App.tsx**

修改 `packages/web/src/App.tsx`：

```tsx
import { SettingsProvider /* 既有的那些 */ } from '@workbench/ui';
import { createHttpSettingsStore } from './settingsStore.js';

// 模块作用域建一次即可：store 无状态，重建会白白丢掉内部引用。
const settingsStore = createHttpSettingsStore();
```

Provider 嵌套改为：

```tsx
    <SettingsProvider store={settingsStore}>
      <ThemeProvider>
        <TimezoneProvider>
          <PreferencesProvider>
            {/* 其余原样 */}
```

注意 `ThemeProvider` 的 `defaultMode="system"` 与 `defaultPalette="warm"` 两个 props 已删除，这里也要一并删掉。

- [ ] **Step 7: 端到端手验**

Run: `npm run dev`

在浏览器里逐条确认：

1. 打开 http://localhost:5173 ——首屏**不闪**默认主题（如果你之前设过 dark 或非 warm 配色）。
2. 设置页换个配色 → 刷新页面 → 配色还在。
3. `sqlite3 data/local/workbench.db "select * from app_settings"`（或用任意 SQLite 客户端）——能看到刚才改的键。
4. 浏览器 devtools 的 Application → Local Storage：旧的五个 `workbench_theme_mode` 等键**已消失**，只剩 `workbench_settings` 与 `workbench_settings_migrated`。
5. 关掉后端（Ctrl-C 掉 server 那一半）→ 再改设置 → 界面**回滚**并给出带请求编号的错误，而不是假装改成功。
6. 时区地图里连续快速点几个城市 → devtools Network 里请求数**明显少于**点击次数，且最终值正确。

- [ ] **Step 8: 提交**

```bash
git add packages/web/src/settingsStore.ts packages/web/src/settingsStore.test.ts \
        packages/web/src/App.tsx packages/core/src/settings.ts packages/core/src/index.ts \
        packages/server/src/settings/contract.ts
git commit -m "feat(web): 设置走 HTTP 落库，并一次性迁移旧 localStorage TASK-025"
```

---

### Task 7: ADR 与文档

**Files:**

- Create: `docs/adr/0018-settings-live-in-the-database.md`
- Modify: `docs/adr/0014-timezone-management-and-three-way-deduction.md`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: 前六个任务的最终形态
- Produces: 无代码产物

- [ ] **Step 1: 写 ADR-0018**

创建 `docs/adr/0018-settings-live-in-the-database.md`。照既有 ADR 的结构（先 `cat docs/adr/0012-scheduling-is-a-cross-module-capability.md` 看一眼格式再动笔），内容覆盖：

- **背景**：八项设置只在 localStorage，上云/换设备时数据同步而设置不同步；ADR-0014 的三方推导会在新设备上重猜。
- **决策**：设置是**壳层子系统**，不是模块。core 持有 codec 表与 `SettingsRepository` 接口，data 持有 `app_settings` KV 表，server 在模块注册表之外注册 `/api/settings`。
- **判据（最重要的一段）**：走这条第二注册通道的东西必须同时满足三条——**无 core Item、无模块归属、外壳启动即需要**。目前只有设置一个。不满足就老老实实写模块。
- **为什么不是模块**：Provider 在 `App.tsx` 最外层、早于模块路由；`packages/ui` 要用就得反向依赖模块，破坏依赖方向。
- **为什么 KV 不是宽表，且与 EAV 否决不矛盾**：设置项增长最快，宽表每加一项都要写迁移；设置从不参与 SQL 筛选或排序，类型安全由 core codec 表在应用层保住。EAV 那条否决针对的是业务实体。
- **为什么不用 Zod**：codec 表已是唯一真相，再写一份就是两份口径。
- **代价**：设置读写全走后端，后端不可用时改不动（与「前端本就不能脱离后端运行」一致）；第二条通道靠 ADR 判据而非 lint 约束，是又一条需要人来守的规矩。

- [ ] **Step 2: 给 ADR-0014 补一句**

在 `docs/adr/0014-timezone-management-and-three-way-deduction.md` 的适当位置（三方推导那段之后）追加：

```markdown
> **2026-08-19 更新（TASK-025 / ADR-0018）**：时区偏好现已落库。三方推导只在
> `app_settings` 里没有 `timezone.id` 时才跑——库里有值就直接用，换设备不再重猜一遍。
```

- [ ] **Step 3: 更新 CLAUDE.md**

三处改动：

1. 「当前状态」段：把「系统设置支持主题、时区与工作台偏好全链路持久化」改为明确落库，并把「一层共享设计基座」的描述里加上 `SettingsProvider`。
2. 「架构 · 分层与依赖方向」：`packages/ui` 现在依赖 `@workbench/core`，把这条写进去。
3. 「会咬人的约定」新增一小节：

```markdown
### 设置走的是第二条注册通道

主题 / 时区 / 工作台偏好落在 `app_settings` 这张 KV 表里，路由 `/api/settings` 在
`buildApp` 里与 `/api/health` 并排注册，**不经模块注册表**。设置不属于任何模块，
也没有 core `Item`，硬做成模块只会把模块机制拧变形。

**这条通道不是「懒得写模块」的后门。** 判据在 ADR-0018：只有同时满足
「无 core Item、无模块归属、外壳启动即需要」三条的东西才能走，目前只有设置一个。
与铁律 3 一样，这条 lint 管不住，只能靠人守。

localStorage 没有消失，但降级成了**首屏快照**（单键 `workbench_settings`）——
DB 是唯一权威。写失败会回滚并提示，不做「界面已改、库里没改」的假成功。
```

- [ ] **Step 4: 最终验收**

Run: `npm run check`
Expected: format:check → typecheck → lint → test 四步全绿。

- [ ] **Step 5: 提交**

```bash
git add docs/adr CLAUDE.md
git commit -m "docs: ADR-0018 设置落库与第二条注册通道 TASK-025"
```

---

## 收尾

七个任务跑完后：

- [ ] 确认 `git log --oneline` 有七个 commit，且每个都能独立说清做了什么。
- [ ] 回到飞书「研发任务管理」的 TASK-025，把状态从「待办」改为「待测试」，填上分支名与提交 hash，补上 `关联文档路径`（指向 spec 与 ADR-0018）。
