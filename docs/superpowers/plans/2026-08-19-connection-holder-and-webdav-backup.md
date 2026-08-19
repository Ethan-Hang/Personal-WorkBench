# 连接持有层与 WebDAV 备份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让数据库连接可以在进程不重启的前提下被换掉，并把一致性快照安全地备份到 WebDAV、可列可删。

**Architecture:** 仓储不再持有连接对象，改为持有 `() => Database.Database` 函数，由 `packages/data` 的 `ConnectionHolder` 提供；新包 `packages/sync` 做子路径导出（`/contract` 纯 Zod 给浏览器，`/node` 装 WebDAV 客户端给服务端），快照一律走 `better-sqlite3` 的 Online Backup API，靠「先传数据再传元数据」的顺序换取原子性。

**Tech Stack:** TypeScript (ESM)、better-sqlite3 13、drizzle-orm、Fastify 5、Zod 4、webdav 5、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-19-cloud-sync-and-accounts-design.md`

**对应飞书任务：** TASK-028、TASK-029、TASK-030，以及 TASK-039 中的 ADR-0020。

## Global Constraints

- **禁止用 `fs.copyFile` / `fs.cp` 复制数据库文件。** 快照一律 `sqlite.backup(path)`。实测本机 `workbench.db` 磁盘 4096 字节而逻辑库 180KB，数据全在未 checkpoint 的 2.2MB WAL 里；文件拷贝得到的库能打开、结构完整、无数据、且不报错。
- **模块不得 import `@workbench/data`**（ADR-0008）。`modules/*/src/storage/` 只能依赖 `better-sqlite3` 与 `drizzle-orm` 的类型。
- **`modules/*/src/ui/**` 内禁止出现以 `/api/` 开头的字符串字面量**（现有 `no-restricted-syntax` 规则）。本计划不碰模块 UI。
- **依赖必须声明在自己的 `package.json`**，本地包写 `"*"`，安装用 `npm install <pkg> -w <workspace>`，不得装到根 manifest。运行期 import 进 `dependencies`，仅测试或仅类型用途进 `devDependencies`。
- **装依赖只走 `npm run setup`**，不要直接 `npm install` 全量安装。
- **Vitest 只收集 `packages/**/*.test.ts` 与 `modules/**/*.test.ts`**，不收 `.tsx`。
- **提交前跑 `npm run check`**（format:check → typecheck → lint → test），四步全绿才算过。
- 时间一律 UTC ISO8601 带 `Z` 与三位毫秒。

---

### Task 1: 连接持有层与仓储注入改造

**Files:**

- Create: `packages/data/src/connection-holder.ts`
- Create: `packages/data/src/connection-holder.test.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `modules/todo/src/storage/sqlite-repository.ts:30-34`
- Modify: `modules/campus-recruit/src/storage/sqlite-repository.ts:15-19`
- Modify（调用点，共 12 处）：
  - `packages/server/src/index.ts:20,22`
  - `packages/server/src/app.test.ts:131,132,252`
  - `modules/campus-recruit/src/server/routes.test.ts:21,130`
  - `modules/campus-recruit/src/storage/sqlite-repository.test.ts:13`
  - `modules/campus-recruit/src/testing/harness.ts:9`
  - `modules/todo/src/server/routes-extensions.test.ts:23`
  - `modules/todo/src/server/routes.test.ts:11,170`
  - `modules/todo/src/testing/harness.ts:15`

**Interfaces:**

- Consumes: 无（本任务是地基）。
- Produces:
  - `class ConnectionHolder`，方法 `open(path: string): Database.Database`、`current(): Database.Database`、`generation(): number`、`path(): string | null`、`close(): void`、`swap(newPath: string): Database.Database`，以及**已绑定 this 的箭头属性** `readonly getSqlite: () => Database.Database`。
  - `SqliteTodoRepository` 与 `SqliteCampusRecruitRepository` 的构造签名变为 `(getSqlite: () => Database.Database)`。

**关键设计说明（实现前必读）：** 两个仓储现在都是 `private readonly db: BetterSQLite3Database<typeof schema>` 字段，方法体全是 `this.db.select()...`。把这个**字段换成同名 getter**，所有方法体一行都不用动——这是本任务风险最低的改法，不要顺手重写方法体。

- [ ] **Step 1: 写失败的测试**

Create `packages/data/src/connection-holder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionHolder } from './connection-holder.js';

function tmpDb(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'holder-')), name);
}

describe('ConnectionHolder', () => {
  it('open 之后 current 返回可用连接，代次为 1', () => {
    const holder = new ConnectionHolder();
    const sqlite = holder.open(':memory:');
    expect(holder.current()).toBe(sqlite);
    expect(holder.generation()).toBe(1);
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('memory');
    holder.close();
  });

  it('未打开时 current 抛错，而不是返回 null', () => {
    const holder = new ConnectionHolder();
    expect(() => holder.current()).toThrow(/没有打开的连接/);
  });

  it('swap 之后连接对象身份改变，代次递增', () => {
    const holder = new ConnectionHolder();
    const first = holder.open(tmpDb('a.db'));
    const second = holder.swap(tmpDb('b.db'));
    expect(second).not.toBe(first);
    expect(holder.generation()).toBe(2);
    holder.close();
  });

  it('getSqlite 已绑定 this，可脱离实例传递', () => {
    const holder = new ConnectionHolder();
    const sqlite = holder.open(':memory:');
    const detached = holder.getSqlite;
    expect(detached()).toBe(sqlite);
    holder.close();
  });

  it('close 之后 -wal 与 -shm 不再残留', () => {
    const path = tmpDb('wal.db');
    const holder = new ConnectionHolder();
    const sqlite = holder.open(path);
    sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    sqlite.exec('INSERT INTO t (id) VALUES (1)');
    expect(existsSync(`${path}-wal`)).toBe(true);
    holder.close();
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-shm`)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/data/src/connection-holder.test.ts`
Expected: FAIL，报 `Failed to resolve import "./connection-holder.js"`。

- [ ] **Step 3: 实现持有层**

Create `packages/data/src/connection-holder.ts`:

```ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * 可替换的数据库连接持有者。
 *
 * 存在的理由：恢复模式与账号切换本质是同一件事——在进程不重启的前提下换掉底层连接。
 * 仓储此前按值捕获句柄（`private readonly db`），换了文件照样读旧的。
 *
 * 仓储拿到的是 `getSqlite` 这个函数而不是 holder 本身：`() => Database.Database`
 * 只用到 better-sqlite3 的类型，模块本来就依赖它，于是不必新增任何跨包接口。
 */
export class ConnectionHolder {
  #sqlite: Database.Database | null = null;
  #path: string | null = null;
  #generation = 0;

  open(path: string): Database.Database {
    if (this.#sqlite !== null) {
      throw new Error('ConnectionHolder 已有打开的连接，先 close() 再 open()');
    }
    if (path !== ':memory:') {
      mkdirSync(dirname(resolve(path)), { recursive: true });
    }
    // 与 db.ts 一致的 ESM 互操作处理：某些解析下 Database 是命名空间对象。
    const SqliteConstructor =
      typeof Database === 'function'
        ? Database
        : (Database as unknown as { default: typeof Database }).default;
    const sqlite = new SqliteConstructor(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    this.#sqlite = sqlite;
    this.#path = path;
    this.#generation += 1;
    return sqlite;
  }

  current(): Database.Database {
    if (this.#sqlite === null) {
      throw new Error('ConnectionHolder 当前没有打开的连接');
    }
    return this.#sqlite;
  }

  /**
   * 注入给仓储的取连接函数。**已绑定 this**，可直接作为值传递：
   * `new SqliteTodoRepository(holder.getSqlite)`。
   */
  readonly getSqlite = (): Database.Database => this.current();

  generation(): number {
    return this.#generation;
  }

  path(): string | null {
    return this.#path;
  }

  /** 正常关闭时 SQLite 会 checkpoint 并清掉 -wal / -shm。 */
  close(): void {
    if (this.#sqlite === null) return;
    this.#sqlite.close();
    this.#sqlite = null;
    this.#path = null;
  }

  /** 换库（账号切换用）。恢复流程要在 close 与 open 之间替换文件，故不能用它。 */
  swap(newPath: string): Database.Database {
    this.close();
    return this.open(newPath);
  }
}
```

Modify `packages/data/src/index.ts`，在末尾追加一行：

```ts
export { ConnectionHolder } from './connection-holder.js';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run packages/data/src/connection-holder.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/data/src/connection-holder.ts packages/data/src/connection-holder.test.ts packages/data/src/index.ts
git commit -m "feat(data): 可替换连接的 ConnectionHolder TASK-028"
```

- [ ] **Step 6: 写「换库后仓储必须跟着换」的回归测试**

Create `modules/todo/src/storage/holder-swap.test.ts`:

```ts
import { beforeEach, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionHolder, runMigrationsFrom } from '@workbench/data';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { SqliteTodoRepository } from './sqlite-repository.js';

function freshDbPath(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'swap-')), name);
}

let holder: ConnectionHolder;

beforeEach(() => {
  holder = new ConnectionHolder();
});

it('swap 之后仓储读到的是新库，而不是缓存住的旧 drizzle 实例', async () => {
  const first = freshDbPath('one.db');
  holder.open(first);
  runMigrationsFrom(drizzle(holder.current()), 'modules/todo/migrations');

  const repo = new SqliteTodoRepository(holder.getSqlite);
  await repo.insertTag({
    id: 't1',
    name: '旧库标签',
    color: null,
    createdAt: '2026-08-19T00:00:00.000Z',
  });
  expect((await repo.listTags()).map((t) => t.name)).toEqual(['旧库标签']);

  holder.swap(freshDbPath('two.db'));
  runMigrationsFrom(drizzle(holder.current()), 'modules/todo/migrations');

  // 同一个 repo 实例，此刻必须看到空的新库。看到「旧库标签」= drizzle 实例被错误复用。
  expect(await repo.listTags()).toEqual([]);

  holder.close();
});
```

> **签名依据：** `modules/todo/src/server/repository.ts:64,67` —— `insertTag(record: TagRecord): Promise<void>` 与 `listTags(): Promise<TagRecord[]>`，`TagRecord` 为 `{ id, name, color: TagColor | null, createdAt }`。这条测试的价值全在「同一个 repo 实例换库后必须读到新库」，断言语义不许改。

- [ ] **Step 7: 跑测试确认失败**

Run: `npx vitest run modules/todo/src/storage/holder-swap.test.ts`
Expected: FAIL，`SqliteTodoRepository` 构造函数当前收的是连接对象而非函数，`drizzle(sqlite)` 会因为拿到函数而抛错。

- [ ] **Step 8: 改造两个仓储**

Modify `modules/todo/src/storage/sqlite-repository.ts`，把第 30-34 行

```ts
export class SqliteTodoRepository implements TodoRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(sqlite: Database.Database) {
    this.db = drizzle(sqlite, { schema });
  }
```

替换为

```ts
export class SqliteTodoRepository implements TodoRepository {
  #cached?: { conn: Database.Database; db: BetterSQLite3Database<typeof schema> };

  /**
   * 收的是**取连接的函数**而不是连接本身：恢复与账号切换会在运行期换掉底层连接
   * （ADR-0020）。按连接对象身份记忆化 drizzle 实例——模块拿不到、也不需要
   * 持有层的代次号，swap 之后 getSqlite() 返回新对象，身份比较自然失效。
   */
  constructor(private readonly getSqlite: () => Database.Database) {}

  private get db(): BetterSQLite3Database<typeof schema> {
    const conn = this.getSqlite();
    if (this.#cached?.conn !== conn) {
      this.#cached = { conn, db: drizzle(conn, { schema }) };
    }
    return this.#cached.db;
  }
```

**其余方法体一行不动**——它们用的都是 `this.db`，getter 与原字段同名。

Modify `modules/campus-recruit/src/storage/sqlite-repository.ts` 第 15-19 行，做**完全相同**的替换（类名 `SqliteCampusRecruitRepository`、接口 `CampusRecruitRepository`、`schema` 来自本模块的 `./schema.js`）：

```ts
export class SqliteCampusRecruitRepository implements CampusRecruitRepository {
  #cached?: { conn: Database.Database; db: BetterSQLite3Database<typeof schema> };

  constructor(private readonly getSqlite: () => Database.Database) {}

  private get db(): BetterSQLite3Database<typeof schema> {
    const conn = this.getSqlite();
    if (this.#cached?.conn !== conn) {
      this.#cached = { conn, db: drizzle(conn, { schema }) };
    }
    return this.#cached.db;
  }
```

- [ ] **Step 9: 修全部 12 个调用点**

把 `new SqliteTodoRepository(sqlite)` 改成 `new SqliteTodoRepository(() => sqlite)`，`new SqliteCampusRecruitRepository(sqlite)` 改成 `new SqliteCampusRecruitRepository(() => sqlite)`。逐个文件按上面 **Files** 段列出的行号处理。

**`packages/server/src/index.ts` 只改两行，不要顺手接入持有层。** 保留 `openDatabase(DB_PATH)` 原样，把它返回的 `sqlite` 包成箭头函数：

```ts
const todoServerModule = createTodoServerModule(new SqliteTodoRepository(() => sqlite));
const campusRecruitServerModule = createCampusRecruitServerModule(
  new SqliteCampusRecruitRepository(() => sqlite),
);
```

> **为什么本任务不把 `ConnectionHolder` 接进组合根：** 真正需要 `close()` / `open()` 的是计划 ② 的恢复引擎与计划 ③ 的账号切换。现在接进来只会让组合根多一层没人用的间接，还得同步改 `openDatabase` 的返回形状。本任务的交付是**让仓储不再焊死连接**，持有层由单测证明可用即可。

其余 11 处调用点全部是纯机械替换：`(sqlite)` → `(() => sqlite)`。

- [ ] **Step 10: 跑全量测试**

Run: `npm run check`
Expected: 四步全绿。特别确认 `packages/data/src/item-repository.test.ts` 里的 **15 条 `ItemRepository` 契约测试原样通过**——仓储从「持有连接」改成「持有取连接的函数」是实现替换，LSP 说它该照过不误。

- [ ] **Step 11: 提交**

```bash
git add modules/todo/src modules/campus-recruit/src packages/server/src
git commit -m "refactor(modules): 仓储改为注入取连接函数，为换库让路 TASK-028"
```

---

### Task 2: packages/sync 骨架、一致性快照与 WebDAV 上传

**Files:**

- Create: `packages/sync/package.json`
- Create: `packages/sync/tsconfig.json`
- Create: `packages/sync/src/contract.ts`
- Create: `packages/sync/src/node/index.ts`
- Create: `packages/sync/src/node/snapshot.ts`
- Create: `packages/sync/src/node/snapshot.test.ts`
- Create: `packages/sync/src/node/webdav-client.ts`
- Create: `packages/sync/src/node/errors.ts`
- Modify: `tsconfig.json`（根，加 path 映射，与既有 `@workbench/*` 条目同形）

**Interfaces:**

- Consumes: Task 1 的 `ConnectionHolder`（仅测试里用来造真实库）。
- Produces:
  - `@workbench/sync/contract`：`SYNC_API`、`backupMetaSchema`、`BackupMeta`、`backupListItemSchema`、`BackupListItem`、`backupConfigSchema`、`BackupConfig`。
  - `@workbench/sync/node`：`createSnapshot(sqlite, tmpPath, ctx): Promise<{ name: string; gz: Buffer; meta: BackupMeta }>`、`class WebdavBackupStore`、`class SyncError`。

- [ ] **Step 1: 建包并装依赖**

Create `packages/sync/package.json`:

```json
{
  "name": "@workbench/sync",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/contract.ts",
  "types": "./src/contract.ts",
  "exports": {
    ".": "./src/contract.ts",
    "./contract": "./src/contract.ts",
    "./node": "./src/node/index.ts"
  },
  "dependencies": {
    "@workbench/core": "*",
    "webdav": "^5.8.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@workbench/data": "*",
    "better-sqlite3": "^13.0.3"
  }
}
```

> `better-sqlite3` 进 devDependencies 是刻意的：`createSnapshot` 只**接收**一个 `Database.Database`，是纯类型用途，运行期不 import。这与 `modules/todo` 把 `@workbench/data` 列为 devDependency 是同一条诚实原则。`webdav` 是运行期真 import，进 dependencies。

Create `packages/sync/tsconfig.json`，复制 `packages/data/tsconfig.json` 的内容（实现时先 `cat packages/data/tsconfig.json` 再照抄，不要凭空写）。

Run:

```bash
npm install webdav -w @workbench/sync
```

- [ ] **Step 2: 写契约**

Create `packages/sync/src/contract.ts`:

```ts
import { z } from 'zod';

/** 备份文件名在路径里的占位符。传它得到 Fastify 注册模式，传真实名字得到请求路径。 */
export const NAME_PARAM = ':name';

export const SYNC_API = {
  backupConfig: () => '/api/backup/config',
  backupRun: () => '/api/backup/run',
  backupList: () => '/api/backup/list',
  backupItem: (name: string) =>
    name === NAME_PARAM ? `/api/backup/${NAME_PARAM}` : `/api/backup/${encodeURIComponent(name)}`,
} as const;

/**
 * 旁挂的备份元数据。**不内嵌进快照**：列表页要判断「这份能不能恢复到当前代码」，
 * 不该为此下载 10 个库。
 */
export const backupMetaSchema = z.object({
  v: z.literal(1),
  createdAt: z.string(),
  accountId: z.string(),
  device: z.string(),
  appVersion: z.string(),
  /** 每条迁移谱系各记一个水位。单个版本号在这里是错的——三条谱系可以各自领先。 */
  migrations: z.record(z.string(), z.number()),
  counts: z.record(z.string(), z.number()),
  bytes: z.number().int().nonnegative(),
  sha256: z.string(),
});
export type BackupMeta = z.infer<typeof backupMetaSchema>;

export const backupListItemSchema = z.object({
  name: z.string(),
  /** meta 缺失 = 上传中断留下的孤儿，不可恢复，可清理。 */
  complete: z.boolean(),
  meta: backupMetaSchema.nullable(),
});
export type BackupListItem = z.infer<typeof backupListItemSchema>;

export const backupConfigSchema = z.object({
  configured: z.boolean(),
  url: z.string().nullable(),
  username: z.string().nullable(),
  autoEnabled: z.boolean(),
  retentionCount: z.number().int().min(1).max(100),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;

/** 写配置。password 只进不出——读接口永远不回传它。 */
export const backupConfigPatchSchema = z.object({
  url: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  autoEnabled: z.boolean().optional(),
  retentionCount: z.number().int().min(1).max(100).optional(),
});
export type BackupConfigPatch = z.infer<typeof backupConfigPatchSchema>;
```

- [ ] **Step 3: 写快照的失败测试**

Create `packages/sync/src/node/snapshot.test.ts`:

```ts
import { expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createSnapshot } from './snapshot.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'snap-'));
}

const ctx = { accountId: 'local-default', device: 'test-host', appVersion: '0.0.0' };

it('快照捕获仍在 WAL 里、尚未 checkpoint 的数据', async () => {
  const dir = tmpDir();
  const dbPath = join(dir, 'w.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec('CREATE TABLE items (id TEXT PRIMARY KEY, title TEXT)');
  sqlite.exec("INSERT INTO items VALUES ('a', '在 WAL 里')");

  const { gz, meta } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  const restored = join(dir, 'restored.db');
  writeFileSync(restored, gunzipSync(gz));
  const check = new Database(restored, { readonly: true });
  expect(check.prepare('SELECT title FROM items').get()).toEqual({ title: '在 WAL 里' });
  expect(meta.counts.items).toBe(1);

  check.close();
  sqlite.close();
});

it('快照记录每条迁移谱系各自的水位', async () => {
  const dir = tmpDir();
  const sqlite = new Database(join(dir, 'm.db'));
  sqlite.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, created_at NUMERIC)');
  sqlite.exec(
    'CREATE TABLE __drizzle_migrations_modules_todo_migrations (id INTEGER PRIMARY KEY, created_at NUMERIC)',
  );
  sqlite.exec('INSERT INTO __drizzle_migrations (created_at) VALUES (100), (300)');
  sqlite.exec('INSERT INTO __drizzle_migrations_modules_todo_migrations (created_at) VALUES (200)');

  const { meta } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  expect(meta.migrations).toEqual({
    __drizzle_migrations: 300,
    __drizzle_migrations_modules_todo_migrations: 200,
  });
  sqlite.close();
});

it('临时快照文件用完即删，不留垃圾', async () => {
  const dir = tmpDir();
  const tmpPath = join(dir, 'tmp.db');
  const sqlite = new Database(join(dir, 'x.db'));
  sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  await createSnapshot(sqlite, tmpPath, ctx);

  expect(existsSync(tmpPath)).toBe(false);
  sqlite.close();
});

it('文件名带 UTC 时间戳且以 .db.gz 结尾', async () => {
  const dir = tmpDir();
  const sqlite = new Database(join(dir, 'n.db'));
  sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  const { name } = await createSnapshot(sqlite, join(dir, 'tmp.db'), ctx);

  expect(name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db\.gz$/);
  sqlite.close();
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `npx vitest run packages/sync/src/node/snapshot.test.ts`
Expected: FAIL，`Failed to resolve import "./snapshot.js"`。

- [ ] **Step 5: 实现快照**

Create `packages/sync/src/node/snapshot.ts`:

```ts
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { BackupMeta } from '../contract.js';

export interface SnapshotContext {
  accountId: string;
  device: string;
  appVersion: string;
}

/** 迁移记账表的名字都以此开头（`runMigrationsFrom` 按目录派生专属记账表）。 */
const MIGRATION_TABLE_PREFIX = '__drizzle_migrations';

function userTables(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '${MIGRATION_TABLE_PREFIX}%'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function migrationWatermarks(sqlite: Database.Database): Record<string, number> {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name LIKE '${MIGRATION_TABLE_PREFIX}%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  const out: Record<string, number> = {};
  for (const { name } of rows) {
    const row = sqlite.prepare(`SELECT MAX(created_at) AS hi FROM "${name}"`).get() as
      { hi: number | null } | undefined;
    out[name] = Number(row?.hi ?? 0);
  }
  return out;
}

function rowCounts(sqlite: Database.Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of userTables(sqlite)) {
    const row = sqlite.prepare(`SELECT count(*) AS c FROM "${name}"`).get() as { c: number };
    out[name] = row.c;
  }
  return out;
}

/** `2026-08-19T14:02:11.000Z` → `2026-08-19T14-02-11-000Z`（冒号与点在 WebDAV 路径里不安全）。 */
function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/**
 * 产出一致性快照。
 *
 * **必须走 `sqlite.backup()`（SQLite 官方 Online Backup API），绝不能 fs.copyFile。**
 * WAL 模式下主库文件可能几乎是空的——数据都在未 checkpoint 的 -wal 里，
 * 文件拷贝得到的库能打开、结构完整、无数据、且不报错。
 */
export async function createSnapshot(
  sqlite: Database.Database,
  tmpPath: string,
  ctx: SnapshotContext,
): Promise<{ name: string; gz: Buffer; meta: BackupMeta }> {
  const createdAt = new Date().toISOString();

  // 先在连接仍打开时读元数据，避免快照与统计之间出现窗口。
  const migrations = migrationWatermarks(sqlite);
  const counts = rowCounts(sqlite);

  await sqlite.backup(tmpPath);
  let raw: Buffer;
  try {
    raw = readFileSync(tmpPath);
  } finally {
    rmSync(tmpPath, { force: true });
  }

  const gz = gzipSync(raw);
  const meta: BackupMeta = {
    v: 1,
    createdAt,
    accountId: ctx.accountId,
    device: ctx.device,
    appVersion: ctx.appVersion,
    migrations,
    counts,
    bytes: raw.byteLength,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };

  return { name: `${fileStamp(createdAt)}.db.gz`, gz, meta };
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run packages/sync/src/node/snapshot.test.ts`
Expected: PASS，4 个用例全绿。第一条尤其重要——它就是本设计的立身之本。

- [ ] **Step 7: 实现错误类型与 WebDAV 存储**

Create `packages/sync/src/node/errors.ts`:

```ts
/**
 * 云操作的领域错误。
 *
 * 不从 modules/todo 抽取公共层：与「传输层每个模块各写一份 request()，
 * 第三个模块出现时再考虑抽取」是同一条判断——现在是第二处。
 */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** 未知错误必须继续冒泡，否则拿不到请求编号也进不了日志。 */
export function toSyncError(err: unknown): SyncError | null {
  const status =
    (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 403) return new SyncError('WebDAV 凭据无效或无权限', 400);
  if (status === 404) return new SyncError('WebDAV 上的备份目录不存在', 409);
  if (status === 507) return new SyncError('WebDAV 存储配额已满', 409);
  return null;
}
```

Create `packages/sync/src/node/webdav-client.ts`:

```ts
import { createClient, type WebDAVClient } from 'webdav';
import { backupMetaSchema, type BackupListItem, type BackupMeta } from '../contract.js';
import { SyncError, toSyncError } from './errors.js';

export interface WebdavCredentials {
  url: string;
  username: string;
  password: string;
}

const META_SUFFIX = '.meta.json';
const DATA_SUFFIX = '.db.gz';

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    const mapped = toSyncError(err);
    if (mapped) throw mapped;
    throw err; // 未知错误继续冒泡
  }
}

export class WebdavBackupStore {
  readonly #client: WebDAVClient;
  readonly #dir: string;

  constructor(creds: WebdavCredentials, dir = '/workbench-backups') {
    this.#client = createClient(creds.url, {
      username: creds.username,
      password: creds.password,
    });
    this.#dir = dir;
  }

  async ensureDir(): Promise<void> {
    await guard(async () => {
      if ((await this.#client.exists(this.#dir)) === false) {
        await this.#client.createDirectory(this.#dir, { recursive: true });
      }
    });
  }

  /**
   * 先传数据再传元数据。WebDAV 给不了原子性，那就用顺序编码它：
   * meta 存在 = 这份备份完整；中途断网只留下一个孤儿 .db.gz。
   */
  async upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void> {
    await this.ensureDir();
    await guard(async () => {
      await this.#client.putFileContents(`${this.#dir}/${name}`, gz, { overwrite: false });
      await this.#client.putFileContents(
        `${this.#dir}/${name}${META_SUFFIX}`,
        JSON.stringify(meta),
        { overwrite: false },
      );
    });
  }

  async list(): Promise<BackupListItem[]> {
    await this.ensureDir();
    const entries = await guard(async () => {
      const raw = await this.#client.getDirectoryContents(this.#dir);
      return Array.isArray(raw) ? raw : raw.data;
    });

    const names = entries
      .filter((e) => e.type === 'file' && e.basename.endsWith(DATA_SUFFIX))
      .map((e) => e.basename)
      .sort()
      .reverse(); // 文件名带 UTC 时间戳，字典序倒序 = 时间倒序

    const metaNames = new Set(
      entries.filter((e) => e.basename.endsWith(META_SUFFIX)).map((e) => e.basename),
    );

    const out: BackupListItem[] = [];
    for (const name of names) {
      if (!metaNames.has(`${name}${META_SUFFIX}`)) {
        out.push({ name, complete: false, meta: null });
        continue;
      }
      const text = await guard(() =>
        this.#client.getFileContents(`${this.#dir}/${name}${META_SUFFIX}`, { format: 'text' }),
      );
      const parsed = backupMetaSchema.safeParse(JSON.parse(String(text)));
      out.push(
        parsed.success
          ? { name, complete: true, meta: parsed.data }
          : { name, complete: false, meta: null },
      );
    }
    return out;
  }

  /** 数据与元数据一起删。先删 meta，让「删到一半」表现为孤儿而非可恢复的假象。 */
  async remove(name: string): Promise<void> {
    if (!name.endsWith(DATA_SUFFIX)) {
      throw new SyncError(`不是合法的备份文件名：${name}`, 400);
    }
    await guard(async () => {
      if (await this.#client.exists(`${this.#dir}/${name}${META_SUFFIX}`)) {
        await this.#client.deleteFile(`${this.#dir}/${name}${META_SUFFIX}`);
      }
      if (await this.#client.exists(`${this.#dir}/${name}`)) {
        await this.#client.deleteFile(`${this.#dir}/${name}`);
      }
    });
  }

  async download(name: string): Promise<Buffer> {
    return guard(async () => {
      const buf = await this.#client.getFileContents(`${this.#dir}/${name}`, { format: 'binary' });
      return Buffer.from(buf as ArrayBuffer);
    });
  }
}
```

Create `packages/sync/src/node/index.ts`:

```ts
export { createSnapshot, type SnapshotContext } from './snapshot.js';
export { WebdavBackupStore, type WebdavCredentials } from './webdav-client.js';
export { SyncError, toSyncError } from './errors.js';
```

- [ ] **Step 8: 补 WebDAV 客户端的协议测试**

Create `packages/sync/src/node/webdav-client.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { SyncError, toSyncError } from './errors.js';

it('401 映射为 400 而不是 500，凭据错要能被界面区分', () => {
  const mapped = toSyncError({ status: 401 });
  expect(mapped).toBeInstanceOf(SyncError);
  expect(mapped?.statusCode).toBe(400);
  expect(mapped?.message).toMatch(/凭据/);
});

it('507 映射为 409，配额满与凭据错不能混为一谈', () => {
  expect(toSyncError({ status: 507 })?.statusCode).toBe(409);
  expect(toSyncError({ status: 507 })?.message).toMatch(/配额/);
});

it('未知错误返回 null，交给上层继续冒泡', () => {
  expect(toSyncError(new Error('socket hang up'))).toBeNull();
  expect(toSyncError({ status: 418 })).toBeNull();
});

it('remove 拒绝非备份文件名，防止误删目录里的其他东西', async () => {
  const { WebdavBackupStore } = await import('./webdav-client.js');
  const store = new WebdavBackupStore({ url: 'https://x', username: 'u', password: 'p' });
  await expect(store.remove('../../etc/passwd')).rejects.toThrow(/不是合法的备份文件名/);
});
```

- [ ] **Step 9: 跑测试并提交**

Run: `npm run check`
Expected: 四步全绿。

```bash
git add packages/sync tsconfig.json package-lock.json
git commit -m "feat(sync): packages/sync 骨架、一致性快照与 WebDAV 上传 TASK-029"
```

---

### Task 3: 备份配置、列表、删除与保留策略

**Files:**

- Modify: `packages/core/src/settings.ts`（加 `count()` codec 与两个设置项）
- Modify: `packages/core/src/settings.test.ts`（若不存在则 Create）
- Create: `packages/server/src/backup/credentials.ts`
- Create: `packages/server/src/backup/credentials.test.ts`
- Create: `packages/server/src/backup/service.ts`
- Create: `packages/server/src/backup/service.test.ts`
- Create: `packages/server/src/backup/routes.ts`
- Create: `packages/server/src/backup/routes.test.ts`
- Modify: `packages/server/src/app.ts:47`（在设置路由旁并排注册）
- Modify: `packages/server/package.json`（加 `@workbench/sync` 依赖）

**Interfaces:**

- Consumes: Task 2 的 `createSnapshot`、`WebdavBackupStore`、`SyncError`、`SYNC_API`、`backupConfigSchema`、`backupConfigPatchSchema`。
- Produces:
  - `readCredentials(dir): Promise<StoredCredentials>` / `writeCredentials(dir, patch): Promise<void>`
  - `class BackupService`，方法 `config()`、`updateConfig(patch)`、`run()`、`list()`、`remove(name)`、`maybeAutoBackup()`
  - `registerBackupRoutes(app, service)`

- [ ] **Step 1: 给 core 加设置项的失败测试**

Modify（或 Create）`packages/core/src/settings.test.ts`，追加：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettingsPatch, resolveSettings } from './settings.js';

describe('备份设置项', () => {
  it('自动备份默认关闭 —— 默认配置下零出站网络请求', () => {
    expect(DEFAULT_SETTINGS['backup.autoEnabled']).toBe(false);
  });

  it('保留份数默认 10', () => {
    expect(DEFAULT_SETTINGS['backup.retentionCount']).toBe(10);
  });

  it('保留份数拒绝越界与非整数', () => {
    expect(parseSettingsPatch({ 'backup.retentionCount': 0 }).ok).toBe(false);
    expect(parseSettingsPatch({ 'backup.retentionCount': 101 }).ok).toBe(false);
    expect(parseSettingsPatch({ 'backup.retentionCount': 3.5 }).ok).toBe(false);
    expect(parseSettingsPatch({ 'backup.retentionCount': 5 }).ok).toBe(true);
  });

  it('库里的脏值静默回落默认，读取路径永不失败', () => {
    expect(resolveSettings({ 'backup.retentionCount': 'ten' })['backup.retentionCount']).toBe(10);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run packages/core/src/settings.test.ts`
Expected: FAIL，`DEFAULT_SETTINGS['backup.autoEnabled']` 是 `undefined`。

- [ ] **Step 3: 实现 core 的两处改动**

Modify `packages/core/src/settings.ts`，在 `timezone()` 函数之后加：

```ts
/** 有界整数。备份保留份数用它——越界值当脏值处理，回落默认。 */
function count(fallback: number, min: number, max: number): SettingCodec<number> {
  return {
    default: fallback,
    parse: (raw) =>
      typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max
        ? raw
        : undefined,
  };
}
```

在 `SETTINGS_CODECS` 的 `'workbench.showCompletedTasks'` 之后加两行：

```ts
  'backup.autoEnabled': bool(false),
  'backup.retentionCount': count(10, 1, 100),
```

> **为什么改 core 不算破例：** 铁律 2 说的是 core 永不感知模块，而备份不是模块——core 本来就拥有应用级设置，该文件注释写着「加一个设置项 = 加一行」。这是它自带的扩展点。详见 spec §4.0。

- [ ] **Step 4: 跑测试确认通过并提交**

Run: `npx vitest run packages/core/src/settings.test.ts`
Expected: PASS。

```bash
git add packages/core/src/settings.ts packages/core/src/settings.test.ts
git commit -m "feat(core): 备份的自动开关与保留份数设置项 TASK-030"
```

- [ ] **Step 5: 写本地凭据存储的失败测试**

Create `packages/server/src/backup/credentials.test.ts`:

```ts
import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCredentials, writeCredentials } from './credentials.js';

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'creds-'));
}

it('没有文件时返回空凭据，而不是抛错', async () => {
  expect(await readCredentials(dir())).toEqual({});
});

it('写入后能读回', async () => {
  const d = dir();
  await writeCredentials(d, { webdav: { url: 'https://dav', username: 'u', password: 'p' } });
  expect((await readCredentials(d)).webdav?.password).toBe('p');
});

it('部分更新不丢其他键', async () => {
  const d = dir();
  await writeCredentials(d, { webdav: { url: 'https://dav', username: 'u', password: 'p' } });
  await writeCredentials(d, { github: { token: 't' } });
  const out = await readCredentials(d);
  expect(out.webdav?.url).toBe('https://dav');
  expect(out.github?.token).toBe('t');
});

it('损坏的 JSON 不让服务起不来，回落空凭据', async () => {
  const d = dir();
  writeFileSync(join(d, 'credentials.json'), '{ 坏掉的');
  expect(await readCredentials(d)).toEqual({});
});

it('写入是原子的：写完之后没有残留的临时文件', async () => {
  const d = dir();
  await writeCredentials(d, { webdav: { url: 'https://dav', username: 'u', password: 'p' } });
  expect(() => readFileSync(join(d, 'credentials.json.tmp'))).toThrow();
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `npx vitest run packages/server/src/backup/credentials.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 7: 实现凭据存储**

Create `packages/server/src/backup/credentials.ts`:

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface StoredCredentials {
  webdav?: { url: string; username: string; password: string };
  github?: { token: string };
}

const FILE = 'credentials.json';

/**
 * 本地凭据的落盘位置。
 *
 * 威胁模型分两档（spec §7.4）：真正必须加密的是**传上 GitHub 的那份**，
 * 因为 secret gist 任人可读。本地文件泄露意味着攻击者已在机器上，
 * 那 SQLite 库本身也全泄了，加密它收益有限。
 *
 * OS 凭据管理器是**增强项而非阻塞项**——接上之后本文件降级为退化路径。
 */
export async function readCredentials(dir: string): Promise<StoredCredentials> {
  try {
    const raw = readFileSync(join(dir, FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as StoredCredentials;
  } catch {
    // 文件不存在或 JSON 损坏都回落空凭据：一份坏掉的凭据不该让服务起不来。
    return {};
  }
}

/** 写临时文件再 rename 的原子替换，避免写到一半留下半截 JSON。 */
export async function writeCredentials(
  dir: string,
  patch: Partial<StoredCredentials>,
): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const merged = { ...(await readCredentials(dir)), ...patch };
  const tmp = join(dir, `${FILE}.tmp`);
  writeFileSync(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 });
  renameSync(tmp, join(dir, FILE));
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npx vitest run packages/server/src/backup/credentials.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 9: 写备份服务的失败测试**

Create `packages/server/src/backup/service.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupListItem, BackupMeta } from '@workbench/sync/contract';
import { BackupService } from './service.js';

function fakeStore(items: BackupListItem[] = []) {
  return {
    uploaded: [] as string[],
    removed: [] as string[],
    async upload(name: string) {
      this.uploaded.push(name);
    },
    async list() {
      return items;
    },
    async remove(name: string) {
      this.removed.push(name);
    },
  };
}

function meta(createdAt: string): BackupMeta {
  return {
    v: 1,
    createdAt,
    accountId: 'local-default',
    device: 'test',
    appVersion: '0.0.0',
    migrations: {},
    counts: {},
    bytes: 1,
    sha256: 'x',
  };
}

function listOf(...stamps: string[]): BackupListItem[] {
  return stamps.map((s) => ({ name: `${s}.db.gz`, complete: true, meta: meta(s) }));
}

function newService(opts: {
  settings?: Record<string, unknown>;
  store?: ReturnType<typeof fakeStore>;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'svc-'));
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE items (id TEXT PRIMARY KEY)');
  const store = opts.store ?? fakeStore();
  const written: Array<Record<string, unknown>> = [];
  const service = new BackupService({
    dataDir: dir,
    getSqlite: () => sqlite,
    accountId: 'local-default',
    device: 'test',
    appVersion: '0.0.0',
    readSettings: async () => ({
      'backup.autoEnabled': false,
      'backup.retentionCount': 10,
      ...opts.settings,
    }),
    writeSettings: async (patch) => void written.push(patch),
    createStore: () => store as never,
  });
  return { service, store, dir, written };
}

it('未配置 WebDAV 时 run 返回明确的 400，而不是崩在网络层', async () => {
  const { service } = newService({});
  await expect(service.run()).rejects.toMatchObject({ statusCode: 400 });
});

it('自动备份关闭时 maybeAutoBackup 什么都不做', async () => {
  const { service, store } = newService({ settings: { 'backup.autoEnabled': false } });
  await service.maybeAutoBackup();
  expect(store.uploaded).toEqual([]);
});

it('自动备份关闭时不清理旧备份 —— 自动删除不可逆，不能在背后发生', async () => {
  const store = fakeStore(
    listOf(
      ...Array.from(
        { length: 15 },
        (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}T00-00-00-000Z`,
      ),
    ),
  );
  const { service } = newService({ settings: { 'backup.autoEnabled': false }, store });
  await service.maybeAutoBackup();
  expect(store.removed).toEqual([]);
});

it('config 永不回传密码', async () => {
  const { service } = newService({});
  await service.updateConfig({ url: 'https://dav', username: 'u', password: 'secret' });
  const cfg = await service.config();
  expect(cfg.configured).toBe(true);
  expect(cfg.username).toBe('u');
  expect(JSON.stringify(cfg)).not.toContain('secret');
});

it('两个开关写进 app_settings，而不是被静默丢掉', async () => {
  const { service, written } = newService({});
  await service.updateConfig({ autoEnabled: true, retentionCount: 5 });
  expect(written).toEqual([{ 'backup.autoEnabled': true, 'backup.retentionCount': 5 }]);
});

it('只改开关时不要求提供凭据', async () => {
  const { service } = newService({});
  await expect(service.updateConfig({ autoEnabled: true })).resolves.toBeUndefined();
});
```

- [ ] **Step 10: 跑测试确认失败**

Run: `npx vitest run packages/server/src/backup/service.test.ts`
Expected: FAIL，`BackupService` 不存在。

- [ ] **Step 11: 实现备份服务**

Run 先加依赖：

```bash
npm install @workbench/sync@* -w @workbench/server
```

Create `packages/server/src/backup/service.ts`:

```ts
import type Database from 'better-sqlite3';
import { join } from 'node:path';
import type { BackupConfig, BackupConfigPatch, BackupListItem } from '@workbench/sync/contract';
import { SyncError, WebdavBackupStore, createSnapshot } from '@workbench/sync/node';
import { readCredentials, writeCredentials } from './credentials.js';

/** 距上次备份超过这个间隔，启动时才自动传一次。不引入常驻调度器。 */
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface BackupStoreLike {
  upload(name: string, gz: Buffer, meta: unknown): Promise<void>;
  list(): Promise<BackupListItem[]>;
  remove(name: string): Promise<void>;
}

export interface BackupServiceOptions {
  dataDir: string;
  getSqlite: () => Database.Database;
  accountId: string;
  device: string;
  appVersion: string;
  readSettings: () => Promise<Record<string, unknown>>;
  /** 写 app_settings。备份的两个开关落在既有 KV 表，不新增存储。 */
  writeSettings: (patch: Record<string, unknown>) => Promise<void>;
  /** 测试注入点。生产走真实 WebDAV。 */
  createStore?: (creds: { url: string; username: string; password: string }) => BackupStoreLike;
}

export class BackupService {
  constructor(private readonly opts: BackupServiceOptions) {}

  async #store(): Promise<BackupStoreLike> {
    const creds = (await readCredentials(this.opts.dataDir)).webdav;
    if (!creds) {
      throw new SyncError('尚未配置 WebDAV，请先在设置页填写地址与凭据', 400);
    }
    const make = this.opts.createStore ?? ((c) => new WebdavBackupStore(c));
    return make(creds);
  }

  async config(): Promise<BackupConfig> {
    const creds = (await readCredentials(this.opts.dataDir)).webdav;
    const settings = await this.opts.readSettings();
    return {
      configured: creds !== undefined,
      url: creds?.url ?? null,
      username: creds?.username ?? null,
      // 密码只进不出：读接口永远不回传它。
      autoEnabled: settings['backup.autoEnabled'] === true,
      retentionCount: Number(settings['backup.retentionCount'] ?? 10),
    };
  }

  async updateConfig(patch: BackupConfigPatch): Promise<void> {
    if (patch.url !== undefined || patch.username !== undefined || patch.password !== undefined) {
      const existing = (await readCredentials(this.opts.dataDir)).webdav;
      const url = patch.url ?? existing?.url;
      const username = patch.username ?? existing?.username;
      const password = patch.password ?? existing?.password;
      if (url === undefined || username === undefined || password === undefined) {
        throw new SyncError('首次配置 WebDAV 需同时提供地址、用户名与密码', 400);
      }
      await writeCredentials(this.opts.dataDir, { webdav: { url, username, password } });
    }

    const settingsPatch: Record<string, unknown> = {};
    if (patch.autoEnabled !== undefined) settingsPatch['backup.autoEnabled'] = patch.autoEnabled;
    if (patch.retentionCount !== undefined) {
      settingsPatch['backup.retentionCount'] = patch.retentionCount;
    }
    if (Object.keys(settingsPatch).length > 0) {
      await this.opts.writeSettings(settingsPatch);
    }
  }

  async run(): Promise<{ name: string }> {
    const store = await this.#store();
    const { name, gz, meta } = await createSnapshot(
      this.opts.getSqlite(),
      join(this.opts.dataDir, '.backup.tmp.db'),
      {
        accountId: this.opts.accountId,
        device: this.opts.device,
        appVersion: this.opts.appVersion,
      },
    );
    await store.upload(name, gz, meta);
    return { name };
  }

  async list(): Promise<BackupListItem[]> {
    return (await this.#store()).list();
  }

  async remove(name: string): Promise<void> {
    await (await this.#store()).remove(name);
  }

  /**
   * 启动时的自动备份。**默认关闭**——默认配置下本应用零出站网络请求。
   *
   * 保留策略跟随同一个开关：关着自动备份却在背后删你手动传的备份是自相矛盾的，
   * 而且自动删除不可逆。
   */
  async maybeAutoBackup(): Promise<void> {
    const settings = await this.opts.readSettings();
    if (settings['backup.autoEnabled'] !== true) return;

    const store = await this.#store();
    const existing = await store.list();
    const newest = existing.find((b) => b.complete && b.meta !== null)?.meta?.createdAt;
    if (newest !== undefined && Date.now() - Date.parse(newest) < AUTO_BACKUP_INTERVAL_MS) {
      return;
    }

    await this.run();

    const retention = Number(settings['backup.retentionCount'] ?? 10);
    const after = await store.list();
    for (const stale of after.slice(retention)) {
      await store.remove(stale.name);
    }
  }
}
```

- [ ] **Step 12: 跑测试确认通过**

Run: `npx vitest run packages/server/src/backup/service.test.ts`
Expected: PASS，5 个用例全绿。

- [ ] **Step 13: 写路由的失败测试**

Create `packages/server/src/backup/routes.test.ts`:

```ts
import { expect, it } from 'vitest';
import Fastify from 'fastify';
import { SYNC_API } from '@workbench/sync/contract';
import { registerBackupRoutes } from './routes.js';

function appWith(service: Partial<Record<string, unknown>>) {
  const app = Fastify();
  registerBackupRoutes(app, service as never);
  return app;
}

it('未配置 WebDAV 时 run 落成 400 而不是 500', async () => {
  const app = appWith({
    run: async () => {
      const { SyncError } = await import('@workbench/sync/node');
      throw new SyncError('尚未配置 WebDAV', 400);
    },
  });
  const res = await app.inject({
    method: 'POST',
    url: SYNC_API.backupRun(),
    headers: { 'content-type': 'application/json' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error).toMatch(/尚未配置/);
});

it('删除的备份名经过 URL 解码后原样传给服务', async () => {
  const seen: string[] = [];
  const app = appWith({ remove: async (name: string) => void seen.push(name) });
  const res = await app.inject({
    method: 'DELETE',
    url: SYNC_API.backupItem('2026-08-19T14-02-11-000Z.db.gz'),
  });
  expect(res.statusCode).toBe(204);
  expect(seen).toEqual(['2026-08-19T14-02-11-000Z.db.gz']);
});

it('config 的 PUT 拒绝不合法的 URL', async () => {
  const app = appWith({ updateConfig: async () => undefined });
  const res = await app.inject({
    method: 'PUT',
    url: SYNC_API.backupConfig(),
    headers: { 'content-type': 'application/json' },
    payload: { url: '不是网址' },
  });
  expect(res.statusCode).toBe(400);
});
```

> **注意：** `app.inject({ method, url })` 不带任何 header，跑的是浏览器**永远不会发出**的请求形状——曾因此漏掉一个 400。上面的写请求都显式带了 `content-type`。

- [ ] **Step 14: 跑测试确认失败**

Run: `npx vitest run packages/server/src/backup/routes.test.ts`
Expected: FAIL，`registerBackupRoutes` 不存在。

- [ ] **Step 15: 实现路由**

Create `packages/server/src/backup/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { NAME_PARAM, SYNC_API, backupConfigPatchSchema } from '@workbench/sync/contract';
import { SyncError } from '@workbench/sync/node';
import type { BackupService } from './service.js';

/** 领域错误落成 4xx；未知错误继续冒泡到统一出口，那里才拿得到请求编号。 */
function toHttp(err: unknown): never {
  if (err instanceof SyncError) {
    const wrapped = new Error(err.message) as Error & { statusCode: number };
    wrapped.statusCode = err.statusCode;
    throw wrapped;
  }
  throw err;
}

export function registerBackupRoutes(app: FastifyInstance, service: BackupService): void {
  app.get(SYNC_API.backupConfig(), async () => {
    try {
      return await service.config();
    } catch (err) {
      toHttp(err);
    }
  });

  app.put(SYNC_API.backupConfig(), async (request, reply) => {
    const parsed = backupConfigPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '备份配置不合法' });
    }
    try {
      await service.updateConfig(parsed.data);
      return reply.code(204).send();
    } catch (err) {
      toHttp(err);
    }
  });

  app.post(SYNC_API.backupRun(), async () => {
    try {
      return await service.run();
    } catch (err) {
      toHttp(err);
    }
  });

  app.get(SYNC_API.backupList(), async () => {
    try {
      return { backups: await service.list() };
    } catch (err) {
      toHttp(err);
    }
  });

  app.delete(SYNC_API.backupItem(NAME_PARAM), async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      await service.remove(name);
      return reply.code(204).send();
    } catch (err) {
      toHttp(err);
    }
  });
}
```

- [ ] **Step 16: 接入组合根**

Modify `packages/server/src/app.ts`，在 `registerSettingsRoutes(...)` 那一行之后加：

```ts
// 备份与设置并排走第二条注册通道：不属于任何模块，且恢复态拦截启动即需要（ADR-0018 §4.0）。
if (opts.backup !== undefined) {
  registerBackupRoutes(app, opts.backup);
}
```

并在 `BuildAppOptions` 里加可选字段：

```ts
  /** 不传则不注册备份路由（既有测试无需改动）。 */
  backup?: BackupService;
```

Modify `packages/server/src/index.ts`，在 `buildApp` 之后、`app.listen` 之前加：

```ts
const backup = new BackupService({
  dataDir: dirname(resolve(DB_PATH)),
  getSqlite: () => sqlite,
  accountId: 'local-default',
  device: hostname(),
  appVersion: process.env.npm_package_version ?? '0.0.0',
  readSettings: async () => new SqliteSettingsRepository(db).getAll(),
  writeSettings: async (patch) =>
    new SqliteSettingsRepository(db).setMany(patch as Partial<AppSettings>),
});
```

把它传进 `buildApp({ ..., backup })`，并在 `app.listen` 之后加：

```ts
// 自动备份挂在启动，不引入常驻调度器（与重复任务物化挂在 listToday 同源）。
// 失败不得影响启动：备份是保险，不是运行前提。
void backup.maybeAutoBackup().catch((err: unknown) => {
  app.log.warn({ err }, '启动时自动备份失败');
});
```

- [ ] **Step 17: 跑全量并提交**

Run: `npm run check`
Expected: 四步全绿。

```bash
git add packages/server/src packages/server/package.json package-lock.json
git commit -m "feat(server): 备份配置、运行、列表与保留策略 TASK-030"
```

---

### Task 4: ADR-0020 与项目文档同步

**Files:**

- Create: `docs/adr/0020-backup-snapshot-and-restore-state-machine.md`
- Modify: `CLAUDE.md`
- Modify: `docs/parallel-development.md`

**Interfaces:**

- Consumes: Task 1-3 的全部产出。
- Produces: 无代码接口。

- [ ] **Step 1: 写 ADR-0020**

Create `docs/adr/0020-backup-snapshot-and-restore-state-machine.md`，沿用既有 ADR 的结构（背景 / 决策 / 后果），内容要点：

- **背景**：实测 `workbench.db` 磁盘 4096 字节而逻辑库 180KB，数据全在未 checkpoint 的 2.2MB WAL 里；文件拷贝得到的库能打开、无数据、不报错。
- **决策**：快照一律走 `sqlite.backup()`；元数据旁挂为 `.meta.json` 且**每条迁移谱系各记一个水位**；先传数据再传元数据，用上传顺序换原子性；自动备份与自动清理**默认关闭**。
- **后果**：默认配置下零出站网络请求；孤儿 `.db.gz` 是可识别的中断态而非静默损坏；单一版本号无法表达三条迁移谱系，故不采用。
- **关闭的选项**：`fs.copyFile`（会静默丢数据）、元数据内嵌进快照（列表要下载全部库）。

- [ ] **Step 2: 更新 CLAUDE.md**

在「架构 / 分层与依赖方向」的包列表里加一行：

```
packages/sync     WebDAV / Gist / 加密，全项目唯一有出站网络依赖的地方
```

在「会咬人的约定」新增一节，要点：数据库快照禁止 `fs.copyFile`；仓储持有的是 `() => Database.Database` 而非连接对象，换库时 drizzle 实例按连接对象身份自动失效；备份默认关闭。

- [ ] **Step 3: 更新 docs/parallel-development.md**

在「目录归属」表格里加两行：

| 目录                            | 归属     | 说明                                |
| ------------------------------- | -------- | ----------------------------------- |
| `packages/sync/src/node/**`     | 后端     | WebDAV / Gist / 加密                |
| `packages/sync/src/contract.ts` | **共同** | **交接点，与模块 contract.ts 同级** |

并在「交接点」一节说明：`packages/sync/src/contract.ts` 是**第二个**交接点，改它同样等于改契约。

- [ ] **Step 4: 提交**

```bash
git add docs/adr/0020-backup-snapshot-and-restore-state-machine.md CLAUDE.md docs/parallel-development.md
git commit -m "docs: ADR-0020 备份快照与文档同步 TASK-030 TASK-039"
```

---

## 计划外但必须知道的事

- **TASK-027 是本计划的人工前置**：Task 3 的联调需要一个真实 WebDAV 账号（坚果云 / Nextcloud）。没有它，Task 3 的单测仍能全绿（store 是注入的假实现），但**没做过一次真实上传就不能算完**。
- **本计划不含恢复。** `ConnectionHolder` 的 `close()` / `open()` 在 Task 1 只被单测覆盖，尚未接进组合根——真正需要它们的是计划 ② 的恢复引擎。这是刻意的：先交付「数据传得上去」，再交付「数据拿得回来」。
- **`WebdavBackupStore.download()` 在本计划里没有消费者**，它是给计划 ② 的 preflight 预留的。保留它而不是删掉，是因为它与 `upload` 的错误映射共用 `guard()`，分开写反而会重复。
