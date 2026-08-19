# 数据上云：WebDAV 备份恢复、账号体系与 Gist 设置同步

日期：2026-08-19
状态：设计已确认，待实施
分支：`feat/cloud-sync`（从 `feat/theme-layer` 切出，非 `main`——见 §13.1）

---

## 1. 背景与目标

本地优先的个人工作台目前是**单进程 + 单个本地 SQLite 文件**，无账号、无网络。
ADR-0001 把「上云」定义为「将来把后端部署到 NAS」，并明确关闭了账号体系这条路。

现在需要的不是多端实时协作，而是三件事：

1. **数据不会丢**——异地备份，换机、硬盘坏、误删都能救回来
2. **换设备能接上**——记住一个 GitHub 账号，其余自动接上
3. **一台设备上能装多份数据**——本地账号与 GitHub 账号并存、可切换

使用场景已确认为 **B：同一时刻只有一台机器在用，云端是保险箱**。
不是多端并发编辑——那需要 CRDT 或真正的同步协议，本设计明确不做。

### 1.1 一条实测发现，它是全部方案的前提

```
workbench.db 磁盘大小 ...... 4,096 字节（1 页）
逻辑数据库大小 ............. 180 KB（45 页）
workbench.db-wal ........... 2.2 MB
```

`packages/data/src/db.ts:23` 开了 `journal_mode = WAL`，而 WAL 至今没有 checkpoint 过。
**此刻全部真实数据都在 `-wal` 文件里，主库文件几乎是空的。**

因此：**任何「把 `workbench.db` 拷到云上」的方案都是错的。** 拷出来的库能正常打开、
结构完整、但没有数据，而且不会报任何错。

解法是 `better-sqlite3@13.0.3` 自带的 `db.backup(filename)`（SQLite 官方 Online Backup
API，见 `node_modules/better-sqlite3/lib/methods/backup.js`）：产出**单个一致性快照文件**，
自动含 WAL 内容，不必停进程、不必处理 `-shm`。这是整个设计的地基。

**禁止用 `fs.copyFile` 复制数据库文件。** 这条要在 code review 里守住。

### 1.2 第二条发现：连接句柄换不掉

`openDatabase` 全进程只调用一次，句柄被按值捕获后再也换不掉：

- `packages/server/src/index.ts` → `new SqliteTodoRepository(sqlite)`
- `modules/todo/src/storage/sqlite-repository.ts:32` → `private readonly db`
- `modules/campus-recruit/src/storage/sqlite-repository.ts:17` → 同上
- `packages/server/src/app.ts:47-50` → `opts.db` 传给 settings 仓储与 `SqliteItemRepository`

**「恢复模式」与「多账号切换」本质是同一件事：在进程不重启的前提下换掉底层连接。**
现在的结构做不到——所有仓储都攥着一个 `readonly` 的旧句柄，换了文件它们照样读旧的。

所以需要一个连接持有层（子项目 0），它是 A 与 B 共同的前置。

---

## 2. 范围与子项目

|       | 子项目             | 依赖 | 内容                                      |
| ----- | ------------------ | ---- | ----------------------------------------- |
| **0** | 连接持有层         | 无   | 可换连接的注入方式                        |
| **A** | WebDAV 备份 / 恢复 | 0    | 快照、列表、删除、差异、恢复模式、回退    |
| **B** | 账号体系           | 0    | 本地账号 + GitHub 登录、切换、绑定 / 解绑 |
| **C** | Gist 设置与凭据    | B    | 设置上云、凭据零知识加密                  |

本文档覆盖全部四项。实施顺序 **0 → A → B → C**。

**明确不做**：多端并发编辑、冲突自动合并（CRDT）、多用户权限模型、服务端账号体系、
常驻调度器。

---

## 3. 已确认的决策

| #   | 决策                                                                 | 理由                                                                                          |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | **每账号一个独立 DB 文件**                                           | 隔离做在文件边界而非行边界，core schema 零改动，三条铁律不破                                  |
| D2  | **恢复模式 = 全服务暂停**，仅 `/api/health` 与 `/api/restore/*` 例外 | 换文件时读和写一样会碎；多标签页自动同步                                                      |
| D3  | **差异 = core 事项行级 + 模块表计数**                                | `items.title` 是 core 自己的字段，行级明细白送；不必给 `ModuleDefinition` 开新能力槽          |
| D4  | **绑定 GitHub 只覆写设置与凭据，不动数据库**                         | 拉数据走 A 已有的恢复流程（差异 → 确认 → 可回退），不重复造轮子，也不会一次绑定静默干掉本地库 |
| D5  | **凭据口令派生加密后存 Gist**                                        | secret gist 任人可读；零知识意味着 GitHub 被盗也拿不到 WebDAV 密码                            |
| D6  | **自动备份默认关闭**，手动备份与恢复不受开关约束                     | 默认配置下零出站网络请求，本地优先不被稀释                                                    |
| D7  | **自动清理旧备份跟随同一开关**                                       | 自动删除不可逆；关着自动备份却在背后删你手动传的备份是自相矛盾的                              |
| D8  | **注入 `() => Database.Database` 函数，不新增 `DbHolder` 接口**      | core 一行不改，不新增跨包 import 边                                                           |
| D9  | **账号注册表用 `accounts.json` 原子写，不用 SQLite**                 | 引导文件坏了要能用记事本救；损坏的 SQLite 直接开不了机                                        |
| D10 | **绑定 / 解绑不改账号 id、不改目录名**                               | 纯元数据操作，零文件动作，绑定失败不会留下找不到库的账号                                      |

---

## 4. 分层与包结构

依赖箭头仍恒指向内层。新增一个包与若干目录：

```
packages/core      不变（本设计不改 core 一行）
packages/data      + connection-holder.ts     连接持有层实现
                   + accounts-store.ts        accounts.json 原子读写
packages/sync      【新包】唯一有出站网络依赖的地方
   /contract         纯 Zod 形状 + 路径常量   ← web 与 server 共用
   /node             WebDAV / Gist / 加密     ← 只有 server 依赖
packages/server    + restore-gate.ts          全局 preHandler
                   + accounts/ backup/ restore/ auth/  四组路由
packages/ui        + 备份 / 账号 / 恢复三个面板的展示组件
packages/web       + 设置页新增三个面板、全屏恢复界面
modules/*          仅 storage 适配器的构造签名改变
```

### 4.1 为什么 `packages/sync` 必须做子路径导出

前端要用同一份 Zod 形状做响应校验，但直接 `web → sync` 会把 `webdav` 客户端打进浏览器
产物。**这与当初 `ServerModuleDefinition` / `UiModuleDefinition` 必须拆开是同一个陷阱。**

沿用模块已在用的子路径导出模式（`@workbench/module-todo` vs `@workbench/module-todo/storage`）：

- `@workbench/sync/contract` — 纯 Zod，无 IO，浏览器安全
- `@workbench/sync/node` — webdav 客户端、Gist 客户端、`node:crypto` 加密

### 4.2 数据目录布局

```
data/local/
  accounts.json                     引导文件，原子写，可手工修
  accounts/
    local-default/workbench.db
    <其他账号>/workbench.db
  .restore/
    state.json                      恢复状态，断电续命用
    incoming.db                     已下载解压的候选库
    rollback.db                     恢复前的本地快照 = 回退点
  credentials.json                  OS 保管库不可用时的退化存储
  server.log
```

环境变量：

- `WORKBENCH_DATA_DIR`（新增，默认 `./data/local`）——账号根
- `WORKBENCH_DB`（保留）——**逃生舱**：显式设置时锁定单库、禁用账号功能，供 CI 与测试用

---

## 5. 子项目 0：连接持有层

### 5.1 注入的是函数，不是对象

模块仓储签名从「拿一个连接」改成「拿一个取连接的函数」：

```ts
// 之前
constructor(sqlite: Database.Database) {
  this.db = drizzle(sqlite, { schema });
}

// 之后
constructor(private readonly getSqlite: () => Database.Database) {}
```

`() => Database.Database` 只用到 better-sqlite3 的类型，而模块本来就依赖它。
**不新增任何跨包接口，不新增一条 import 边，core 一行不改。**

若在 core 里新增 `DbHolder` 接口，要么让 core 沾上 better-sqlite3 类型（违反「core 零 IO
依赖」），要么再来一次 `registerRoutes(app: unknown)` 式的类型擦除。都不值得。

### 5.2 drizzle 实例的记忆化

`drizzle(sqlite, { schema })` 不能再在构造时算一次。按「连接代次 + schema 引用」记忆化：

```ts
private cached?: { conn: Database.Database; db: BetterSQLite3Database<typeof schema> };

private get db() {
  const conn = this.getSqlite();
  if (this.cached?.conn !== conn) {          // 按连接对象身份，不是代次
    this.cached = { conn, db: drizzle(conn, { schema }) };
  }
  return this.cached.db;
}
```

**记忆化的判据是连接对象身份，不是代次号。** 这是 D8 的直接推论：模块只拿到
`() => Database.Database` 一个函数，拿不到也不需要拿到持有层的代次。
`swap()` 之后 `getSqlite()` 返回的是一个新对象，身份比较自然失效。

两个模块各改一处。

### 5.3 持有层职责（`packages/data/src/connection-holder.ts`）

- `open(path)` — 建连接、`journal_mode = WAL`、`foreign_keys = ON`、代次 +1
- `current()` / `generation()`
- `close()` — 关连接（正常关闭时 SQLite 会 checkpoint 并清掉 `-wal`/`-shm`）
- `swap(newPath)` — `close()` + `open()`，代次 +1

**代次单调递增，永不回退。** 它是「旧 drizzle 实例失效」的唯一判据。

---

## 6. 子项目 A：备份与恢复

### 6.1 备份：靠上传顺序换原子性

```
db.backup(tmp)  →  gzip  →  PUT <ts>.db.gz  →  PUT <ts>.meta.json
                                                     ↑
                                    meta 存在 = 这份备份完整
```

**先传数据再传元数据。** 中间断网只会留下一个没有 meta 的孤儿 `.db.gz`，列表里显示为
「不完整」并可清理。WebDAV 给不了原子性，那就用顺序编码它。

上传用 `putFileContents(path, buffer, { overwrite: false })`；文件名带毫秒时间戳。

### 6.2 元数据旁挂而非内嵌

列表页要判断「这份能不能恢复到当前代码」，不该为此下载 10 个库。

```json
{
  "v": 1,
  "createdAt": "2026-08-19T14:02:11.000Z",
  "accountId": "local-default",
  "device": "XCH-PC",
  "appVersion": "0.1.0",
  "migrations": {
    "__drizzle_migrations": 1755400000000,
    "__drizzle_migrations_modules_todo_migrations": 1755300000000,
    "__drizzle_migrations_modules_campus_recruit_migrations": 1755200000000
  },
  "counts": { "items": 2, "campus_recruit_applications": 21 },
  "bytes": 184320,
  "sha256": "…"
}
```

`migrations` **每条迁移谱系各记一个水位**，正对着「模块迁移各记各账」那条设计。
单一个版本号在这里是错的，因为三条谱系可以各自领先。

### 6.3 恢复：五态机

```
idle
 └→ preflight            下载 → 解压 → integrity_check → 水位比对 → 算差异
     └→ awaiting-confirm      展示差异，等确认（可取消，无副作用）
         └→ restoring         ← 从这里开始全服务 503
             ├ 1 snapshot-local   db.backup(rollback.db)    ← 回退点
             ├ 2 swap             关连接 → 删 db/-wal/-shm → rename → 开连接
             ├ 3 verify           integrity + foreign_key_check + 跑迁移 + 探针查询
             └ 4 done → idle
                 ↓ 任一步失败
             rolling-back        同样的 swap，源换成 rollback.db
                 ├ 成功 → idle（「已回到恢复前」）
                 └ 失败 → failed（不自动重试，日志给人工指令）
```

四个承重细节：

**① 没有回退点就不动手。** 第 1 步 `db.backup(rollback.db)` 失败则整个恢复拒绝开始。

**② 第 2 步必须显式删 `-wal` 与 `-shm`。** 只换主库而留下旧 WAL，旧数据会在下次打开时
复活并覆盖刚恢复的内容——**而且不报错**。这是 §1.1 那个坑的反面。

**③ 备份比代码新 → 拒绝恢复。** 水位比对三种结果：

| 比对结果     | 处理                                      |
| ------------ | ----------------------------------------- |
| 相等         | 直接恢复                                  |
| 备份更旧     | 恢复后跑迁移（正常升级路径）              |
| **备份更新** | **拒绝**，返回 409 并说明是哪条谱系差多少 |

向下迁移不存在，硬恢复的症状是运行时 `no such column`。判断在 preflight 用 meta 完成，
不必下载。

**④ 恢复中断电不能变砖。** `.restore/state.json` 记录当前步骤；进程启动时若发现它存在，
**直接进入恢复态**并提示「上次恢复停在 swap，可回退或重试」。

### 6.4 差异计算：ATTACH，不手写比对

```sql
ATTACH 'incoming.db' AS cloud;

-- 云端多的
SELECT id, title FROM cloud.items EXCEPT SELECT id, title FROM main.items;
-- 本地多的：方向对调
-- 内容不同的：id 相交但整行不等
```

模块自有表遍历 `sqlite_master` 取表名（排除 `__drizzle_*` 与 `sqlite_*`）后各自 count。

**遍历表名是纯结构操作，不是感知模块**——它不知道 `campus_recruit` 是什么东西。

显示成人话用一条已有约定反推：表名前缀 `campus_recruit_` → moduleId `campus-recruit`
→ UI 本来就有的模块显示名。于是列出来是「**秋招 · applications 21 → 24**」，
不需要模块提供任何新东西，也不用开能力槽。

### 6.5 恢复态拦截

`packages/server/src/restore-gate.ts` 作为全局 `preHandler`：

- 状态非 `idle` 且路径不在白名单 → 503 + `{ state, step, message }`
- 白名单：`/api/health`、`/api/restore/*`

前端 React Query 的全局 `onError` 认这个 503 就切全屏恢复界面。多标签页因此自动同步，
不需要额外的广播机制。

### 6.6 备份策略（D6 / D7）

| 状态                           | 手动备份             | 启动自动备份     | 查看云端列表 / 恢复 | 自动清理       |
| ------------------------------ | -------------------- | ---------------- | ------------------- | -------------- |
| 未配置 WebDAV                  | 不可用（引导填凭据） | —                | 不可用              | —              |
| 已配置，自动备份**关**（默认） | 可用                 | 不跑             | **可用**            | **不跑**       |
| 已配置，自动备份**开**         | 可用                 | 距上次 >24h 则传 | 可用                | 超 10 份删最旧 |

设置项落在既有 `app_settings` KV，不新增表：

- `backup.autoEnabled` 默认 `false`
- `backup.retentionCount` 默认 `10`

**不引入常驻调度器**——自动备份挂在进程启动，与「重复任务物化挂在 `listToday`」同源。

---

## 7. 子项目 B：账号体系

### 7.1 账号模型

```jsonc
// data/local/accounts.json
{
  "v": 1,
  "activeId": "local-default",
  "accounts": [
    {
      "id": "local-default",
      "kind": "local",
      "displayName": "本地",
      "dbDir": "accounts/local-default",
      "createdAt": "2026-08-19T…",
      "lastUsedAt": "2026-08-19T…",
    },
  ],
}
```

绑定 GitHub 后该账号增加：

```jsonc
"kind": "github",
"github": { "login": "Ethan-Hang", "userId": 12345, "gistId": "abc…" }
```

**`id` 与 `dbDir` 恒不变（D10）。** 绑定与解绑都是纯元数据操作，一个文件都不动。
若绑定时把 `local-default` 改名成 `gh-Ethan-Hang`，就得连带重命名数据目录，
一次失败可能留下一个找不到库的账号。

**约束：同一个 GitHub 账号不能被两个本地账号绑定。** 否则两个库往同一个 gist 写设置、
互相覆盖。按 `github.userId` 在 `accounts.json` 层面校验唯一。

写入一律「写临时文件 → rename」原子替换。

### 7.2 现有数据的一次性迁移

启动时若 `accounts.json` 不存在但 `data/local/workbench.db` 存在：

1. 正常打开旧库，随即 `close()` —— **让 WAL checkpoint 掉**
2. `mkdir accounts/local-default/`
3. rename 单个主库文件（同盘，原子）
4. 写 `accounts.json`

先 close 再搬的顺序是关键：这样只需搬一个文件，不必同时处理 `-wal`/`-shm`，
也不会搬出一个半截状态。与 TASK-025 一次性迁移 localStorage 同形。

### 7.3 GitHub 登录：Device Flow

无 client_secret，`client_id` 可直接编译进代码。

```
POST github.com/login/device/code       { client_id, scope: 'read:user gist' }
  → { device_code, user_code, verification_uri, expires_in, interval }
  → UI 显示 user_code，一键打开 verification_uri

POST github.com/login/oauth/access_token
     grant_type=urn:ietf:params:oauth:grant-type:device_code
  → 按 interval 轮询

GET  api.github.com/user                → login + id
```

**必须处理的轮询响应**：`authorization_pending`（继续等）、`slow_down`（**按响应加大
间隔**，否则会被限流）、`expired_token`（重新发起）、`access_denied`（用户拒绝）。

### 7.4 token 与凭据的本地存储

威胁模型分两档：

- **云端（Gist）**：强制口令派生加密。secret gist 任人可读，这是唯一真正的攻击面。
- **本地**：优先 OS 凭据管理器；不可用则退到 `data/local/credentials.json`，
  并在设置页明示「本机凭据未受系统保管库保护」。

本地文件泄露意味着攻击者已在你机器上，那 SQLite 库本身也全泄了，加密它收益有限。

**因此 OS 保管库是增强项而非阻塞项**，实施不卡在原生模块可用性上。

### 7.5 切换账号：复用恢复态那套 503

```
POST /api/accounts/active { id }
  → gate 进入 switching 态（其余请求 503）
  → holder.swap(新路径) → 跑迁移 → 代次 +1
  → 更新 accounts.json 的 activeId 与 lastUsedAt
  → 回 idle
```

两条最容易出 bug 的地方：

1. **切换必须跑迁移**——另一个账号的库可能是更旧的代码建的。
2. **前端必须全量 invalidate React Query 缓存。** 不清就会看到上一个账号的残留数据，
   症状是「数据串了」；因为乐观更新的存在，它会以很难复现的方式间歇出现。

### 7.6 绑定与解绑

**绑定**（D4）：已登录 GitHub → 选方向（云→本 / 本→云）→ 只作用于设置与凭据 →
写入 `github` 字段。完成后提示「检测到云端有 N 份备份，要看差异吗？」，
点进去走 §6.3 的恢复流程。

**解绑**：删掉 `github` 字段、清本地 token 与 gistId。**不删云端 gist**（可能还在别处用），
但提示可手动删除。

---

## 8. 子项目 C：Gist 设置与凭据

### 8.1 加密：`node:crypto` 就够

```
scryptSync(口令, salt, 32)  →  AES-256-GCM(iv 12B)  →  header 明文 + data 密文
```

**不引入任何第三方库，更不引入原生模块**——这对 `npm run setup` 的 `--ignore-scripts`
很重要。

```json
{
  "v": 1,
  "kdf": "scrypt",
  "salt": "9f3a…",
  "cipher": "AES-256-GCM",
  "iv": "…",
  "updatedAt": "2026-08-19T…",
  "device": "XCH-PC",
  "data": "k7Hs+2xQ…密文…"
}
```

三个设计点：

- **口令验证不需要单独存 verifier**：GCM 的认证标签解不开就是口令错。少一个字段，
  也少一个能被离线爆破的靶子。
- **salt 只在改口令时更换**，不是每次写。scrypt 很慢，每改一次主题就重派生会明显卡。
- **header 保持明文**（`v`/`kdf`/`salt`/`iv`/`updatedAt`/`device`）。列表与冲突判断
  不解密就能做，而它们不泄露任何内容。

**Gist 里绝不存 GitHub token。** 只有 WebDAV 凭据与设置。

忘记口令的后果有界：重新填一次 WebDAV 凭据即可，**数据不丢**（数据在 WebDAV，不在 Gist）。

### 8.2 同步时机与冲突

设置改动 → 走既有 `SettingsSync`（乐观更新 / 合并串行 / 回滚）落库 → **debounce 后推 Gist**。

推之前先 GET 比对 `updatedAt`：

- 云端不比本地上次见到的新 → 直接推
- 云端更新（另一台设备改过）→ **停下，让用户选方向**，与绑定时同样的两个选项

**刻意不做自动合并。** 逐键取新会产生两边的混合体，无法回答「我现在用的到底是哪一套
设置」。这与 §7.6 的绑定语义保持一致，不引入第三种语义。

GitHub 认证后 5000 次/小时，debounce 之后完全够。

---

## 9. 契约

路径常量与 Zod 形状放 `@workbench/sync/contract`，server 与 web 共用同一份。

| 方法    | 路径                            | 说明                           |
| ------- | ------------------------------- | ------------------------------ |
| GET     | `/api/accounts`                 | 列表 + `activeId`              |
| POST    | `/api/accounts`                 | 新建本地账号                   |
| POST    | `/api/accounts/active`          | 切换（触发 `switching` 态）    |
| DELETE  | `/api/accounts/:id`             | 删除账号与其数据（需二次确认） |
| POST    | `/api/accounts/:id/github/bind` | 绑定，body 带方向              |
| DELETE  | `/api/accounts/:id/github`      | 解绑                           |
| POST    | `/api/auth/github/device`       | 发起 device flow               |
| POST    | `/api/auth/github/device/poll`  | 轮询换 token                   |
| GET/PUT | `/api/backup/config`            | WebDAV 配置与 `autoEnabled`    |
| POST    | `/api/backup/run`               | 立即备份                       |
| GET     | `/api/backup/list`              | 云端列表（读 meta，不下载库）  |
| DELETE  | `/api/backup/:name`             | 删除一份                       |
| POST    | `/api/restore/preflight`        | 下载 + 校验 + 差异报告         |
| POST    | `/api/restore/confirm`          | 进入 `restoring`               |
| POST    | `/api/restore/rollback`         | 手动回退                       |
| GET     | `/api/restore/state`            | 当前状态（白名单）             |
| GET     | `/api/health`                   | **新增 `state` 字段**          |

这些路由在 `buildApp` 里与 `/api/settings` 并排注册，**不经模块注册表**。

### 9.1 为什么允许走第二条注册通道

ADR-0018 给第二通道定了三条判据：**无 core Item、无模块归属、外壳启动即需要**。

- 账号：决定开哪个库，启动时就必须存在 ✓
- 恢复态拦截：要挡住每一个请求，必须在启动时装上 ✓
- 备份配置：是设置的一部分，设置本就走这条通道 ✓

三条全中。这不是「懒得写模块」的后门——它们确实不是模块。

---

## 10. 错误处理

`packages/sync` **自己写一份** `DomainError` + `toHttp`，**不抽取公共层**。
与「传输层每个模块各写一份 `request()`，第三个模块出现时再考虑抽取」是同一条判断——
现在是第二处。

必须落成明确 4xx 而不是 500（云操作失败几乎都在外部服务，落成 500 就查不动了）：

| 情况                   | 落成      | 关键                                 |
| ---------------------- | --------- | ------------------------------------ |
| WebDAV 401 / 404 / 507 | 400 / 409 | 凭据错、目录不存在、配额满要分开说   |
| Gist token 失效        | 401       | 要引导去重新登录，不是通用报错       |
| 解密失败               | 400       | **必须区分「口令错」与「数据损坏」** |
| 迁移水位不兼容         | 409       | 说清是哪条谱系、差多少               |
| 恢复中收到业务请求     | 503       | 带 `{ state, step }`                 |

**未知错误必须继续冒泡**，否则拿不到请求编号也进不了日志。
请求编号要贯穿云操作——它是唯一能把界面和日志对上的东西。

---

## 11. 测试策略

沿用现有分层投入，不设覆盖率门槛。

| 层                             | 投入                                           |
| ------------------------------ | ---------------------------------------------- |
| 加密往返、口令错、密文篡改检测 | 接近全覆盖，纯函数，TDD                        |
| 差异计算（ATTACH + EXCEPT）    | 接近全覆盖，`:memory:` 双库真跑                |
| 连接持有层 swap                | **必测**——「写错会毁掉真实数据」的新成员       |
| 恢复状态机                     | 关键路径，且**每一步失败都要有对应的回退测试** |
| WebDAV / Gist 客户端           | 只测协议编解码，网络打桩                       |
| accounts.json 原子写           | 必测：写到一半崩溃不得损坏原文件               |
| UI                             | 沿用现状，冒烟                                 |

三条守卫：

1. **`ItemRepository` 的 15 条契约测试必须原样通过。** 仓储从「持有连接」改成
   「持有取连接的函数」是实现替换，LSP 说它该照过不误——现成的回归网。
2. **新增回归：swap 之后复用旧 drizzle 实例必须失败。** 这与「模块迁移各记各账」
   那次踩的坑同类——静默用错句柄不报错，只在几步之后表现为莫名其妙的数据。
3. **最核心的一条**：「swap 到一半失败 → 自动回退 → 数据与恢复前逐行相等」。
   整个功能只有这一处能毁掉真实数据，对标现有对 data 迁移的态度。

---

## 12. ADR 清单

| 编号     | 标题                           | 要点                                         |
| -------- | ------------------------------ | -------------------------------------------- |
| **0019** | 账号体系与每账号独立数据库     | 推翻 ADR-0001 的「不做账号体系」             |
| **0020** | 备份与恢复：快照、状态机与回退 | WAL 陷阱、迁移水位闸门、断电续命             |
| **0021** | 云端凭据的零知识加密           | secret gist 不是私有；本地与云端两档威胁模型 |

### 12.1 ADR-0019 要精确说明推翻了哪一半

ADR-0001 说「若将来要做多用户，账号与数据隔离需要一次真正的重构，而非增量」。
**这句话在它设想的路径上是对的**——共享一个库、所有表加 `user_id`，确实要动 core。

但还有第三条路：**每账号一个库文件**。选它之后 core 一行不改，三条铁律一条不破。

- **仍然成立**：不做多用户、不做权限模型、不做服务端账号体系
- **被推翻**：单一数据库文件、系统内无身份概念
- **为什么没付出预言中的代价**：隔离做在文件边界而不是行边界

---

## 13. 实施顺序与前置人工步骤

### 13.1 分支

从 **`feat/theme-layer`** 切 `feat/cloud-sync`，而非 `main`。

`docs/parallel-development.md` 要求从 `main` 切，但 `main` 当前落后 `feat/theme-layer`
二十个提交——TASK-025 的 `app_settings` 与 `SettingsSync` 全在 theme-layer 上，
而本设计直接建在它们之上。**这是一次有意的偏离，`main` 追上后应恢复约定。**

### 13.2 前置人工步骤（不能等到实施时才发现）

1. **在 GitHub 注册一个 OAuth App**，拿到 `client_id`，开启 Device Flow。
2. **准备一个 WebDAV 账号**（坚果云 / Nextcloud 等），确认免费额度的请求与流量配额。
3. **确认 `@napi-rs/keyring` 在本机可用**（N-API 预编译，理论上与 `better-sqlite3` 同样
   免编译）。不可用则走 §7.4 的退化路径，不阻塞。

### 13.3 顺序

```
0  连接持有层（含两个模块仓储改造 + 契约测试回归）
A  备份 → 列表 / 删除 → 差异 → 恢复状态机 → 回退 → 断电续命
B  accounts.json + 一次性迁移 → 切换 → Device Flow → 绑定 / 解绑
C  加密 → Gist 读写 → 与 SettingsSync 接线 → 冲突方向选择
```

---

## 14. 已知限制

- **不支持多端并发编辑。** 两台设备同时改，后备份的会覆盖先备份的。B 场景（保险箱）
  已明确接受这一点。
- **忘记同步口令** → 需重填 WebDAV 凭据（数据不丢）。
- **备份未加密。** WebDAV 上的 `.db.gz` 是明文快照，依赖网盘账号本身的安全性。
  若将来要端到端加密备份，复用 §8.1 的加密原语即可，但**恢复时的差异计算需要先解密**，
  届时要重新评估 preflight 的成本。
- **Gist 单文件 1MB 上限**（超出 API 返回 `truncated: true`）。设置与凭据远低于此，
  但**不要把任何业务数据放进 Gist**。
- **秋招 Item 的对账覆盖行为不变**：恢复后 `reconcileAllProjections` 仍会覆盖手动排程。
  这与 ADR-0012 一致，不是本设计引入的问题。
