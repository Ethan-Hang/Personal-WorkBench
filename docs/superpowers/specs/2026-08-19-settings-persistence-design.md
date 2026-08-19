# 设置项从 localStorage 迁进数据库

- 任务：TASK-025（P1-高 / 全栈 / 重构）
- 日期：2026-08-19
- 状态：已评审，待实现

## 1. 问题

主题（mode / palette）、时区（timezone / dstMode）与工作台偏好（四个开关）目前只存在浏览器
localStorage 里：

| 设置                                               | 现存位置                                 |
| -------------------------------------------------- | ---------------------------------------- |
| `workbench_theme_mode` / `workbench_theme_palette` | `packages/ui/src/ThemeContext.tsx`       |
| `workbench_timezone` / `workbench_dst_mode`        | `packages/ui/src/TimezoneContext.tsx`    |
| `workbench_preferences`                            | `packages/ui/src/PreferencesContext.tsx` |

后端不存在任何 settings 表、路由或 core 概念。后果有两条：

1. 将来上云或换设备时，**数据同步了而设置不同步**。
2. ADR-0014 的时区三方推导会在每台新设备上重新猜一遍，用户此前的显式选择拿不回来。

打包成桌面应用与将来上云两条路都因此受益。

## 2. 目标与非目标

**目标**

- 八项设置以数据库为权威，跨设备/跨重装可携带。
- 首屏不闪默认主题。
- 已有用户本机的设置在升级后不丢。
- 加一个新设置项的成本 = 加一行代码，不改表、不写迁移。

**非目标**（YAGNI）

- 多用户 / 多 profile。本应用是本地单用户（ADR-0001）。
- 设置的导入导出、版本历史、云同步本身。
- 把模块自己的设置也收进来。目前没有模块有设置。

## 3. 归属：壳层子系统，不是模块

设置不属于任何模块，也没有 core `Item`，因此既不能进 `modules/*`，也不适合塞进现有的
`items` 模型。方案是在 core / data / server 各加一小块，构成一个**壳层子系统**，
经模块注册表之外的第二条通道接线。

已否决的两个替代方案：

- **做成 `modules/settings`**：能复用既有机制（自带迁移、注册表一行）。但设置的 Provider 位于
  `App.tsx` 最外层、早于模块路由存在；`packages/ui` 要用它就得反向依赖模块，破坏依赖方向。
  设置不是垂直切片，硬做成模块会把模块机制拧成不像模块的样子。
- **ui 里直接 fetch**：代码最少，但 `packages/ui` 从此带上网络依赖与硬编码 `/api/...` 字面量——
  正是 `eslint.config.js` 那条 `no-restricted-syntax` 专门封住的债，只是发生在 `packages/ui`
  而非 `modules/*/src/ui`，lint 拦不到。

## 4. core：一张 codec 表推出一切

新增 `packages/core/src/settings.ts`。不手写「类型 + 键列表 + 校验」三份，而是从一张 codec
表推导，加一个设置项 = 加一行：

```ts
export interface SettingCodec<T> {
  readonly default: T;
  parse(raw: unknown): T | undefined; // 不合法返回 undefined，不抛
}

const CODECS = {
  'theme.mode': oneOf(['light', 'dark', 'system'] as const, 'system'),
  'theme.palette': oneOf(['warm', 'forest', 'ocean', 'amber', 'mono'] as const, 'warm'),
  'timezone.id': timezoneCodec('Asia/Shanghai'),
  'timezone.dstMode': oneOf(['auto', 'standard', 'daylight'] as const, 'auto'),
  'workbench.showGreeting': bool(true),
  'workbench.autoExpandOverdue': bool(false),
  'workbench.enableAnimations': bool(true),
  'workbench.showCompletedTasks': bool(true),
} satisfies Record<string, SettingCodec<unknown>>;

export type SettingKey = keyof typeof CODECS;
export type AppSettings = { [K in SettingKey]: ValueOf<(typeof CODECS)[K]> };
export const SETTINGS_CODECS: Readonly<typeof CODECS>;
export const DEFAULT_SETTINGS: Readonly<AppSettings>;

/** 纯函数：库里的原始值 → 完整设置。缺键补默认，脏值静默回落默认，不抛。 */
export function resolveSettings(raw: Record<string, unknown>): AppSettings;
```

`timezoneCodec` 用 `Intl.DateTimeFormat` 验证是不是真实 IANA 时区 id，不与
`WORLD_TIMEZONES` 那份展示用列表绑定——那是 UI 的取材范围，不是合法值域。

core 不引入 zod。codec 的 `parse` 是手写纯函数，与 core 现有 `ITEM_KINDS` / `ITEM_STATUSES`
的常量风格一致，也维持了「core 零 IO、依赖极薄」。

`resolveSettings` 是本任务里唯一有分支逻辑的地方（缺键、脏值、类型不符、旧值），
接近全覆盖单测。

Repository 接口留在 core，实现在 data（照 `ItemRepository` 的 DIP）：

```ts
export interface SettingsRepository {
  getAll(): Promise<Record<string, unknown>>; // 原始值，不解析
  setMany(patch: Partial<AppSettings>): Promise<void>; // upsert，单事务
}
```

解析刻意不放进 data：data 只负责存取，「什么算合法设置」是领域知识。

## 5. data：一张 KV 表

`packages/data/migrations/` 加一条迁移（core 自己的集中目录；设置不是模块，
所以不走 `runMigrationsFrom` 的分表记账）：

```sql
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

表里没有任何模块名，与铁律 2 一致。

选 KV 而非「固定单行宽表」的理由：设置项是增长最快的东西，宽表意味着每加一项都要
`db:generate` 一次迁移。代价是 SQL 层无类型——但设置永远是整表读取、由 core codec 解析，
从不参与 SQL 层的筛选或排序，这个代价不落到任何实际查询上。

（这与 ADR 里对 EAV 的否决不冲突：那条针对的是**业务实体**的万能键值表，会同时牺牲类型安全与
查询性能。设置既不参与查询，类型安全也由 core 的 codec 表在应用层完整保住。）

新增 `SqliteSettingsRepository`，并配一份由 core 拥有、由实现方运行的行为契约测试
`packages/core/src/testing/settings-repository-contract.ts`（照 `item-repository-contract.ts`）。
任何新的 `SettingsRepository` 实现都必须原样通过它。

## 6. server：第二条注册通道

`packages/server/src/settings/contract.ts` 只放路径与类型，**不引 Zod**：

```ts
export const SETTINGS_API = { root: () => '/api/settings' } as const;
export interface SettingsResponse {
  settings: AppSettings;
  storedKeys: SettingKey[];
}
export interface SettingsPatchBody {
  settings: Partial<AppSettings>;
}
```

模块的 `contract.ts` 用 Zod 描述形状，这里刻意不用：core 的 codec 表已经是「什么算合法设置」
的唯一真相，再写一份 Zod 就是两份口径，早晚各改一半。服务端校验入参、客户端校验响应，
两边都调同一份 codec。`packages/server` 因此也不新增依赖。

`routes.ts` 两个端点：

| 端点                  | 行为                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/settings`   | 读库 → `resolveSettings` → 永远返回完整八项 + `storedKeys`                                            |
| `PATCH /api/settings` | 逐键过 codec：未知键 400，值非法 400；全通过则单事务 upsert，返回与 GET 完全同形的 `SettingsResponse` |

`storedKeys` 是库里真实存在的键。没有它，前端无法区分「库里存的就是默认值」与「库里根本没有
这一项」，一次性迁移旧 localStorage 时就只能盲写覆盖。

4xx 沿用 `app.ts` 已有的统一错误出口——抛一个带 `statusCode = 400` 的错误即可，不需要 todo 那套
`DomainError` / `toHttp`（那是因为 todo 的校验在 service 层；这里校验就在 route）。
未知错误照旧冒泡成 500 并带请求编号。

接线在 `buildApp` 里，与 `/api/health` 并排：

```ts
app.get('/api/health', ...);
registerSettingsRoutes(app, new SqliteSettingsRepository(opts.db));   // ← 新增
const items = new SqliteItemRepository(opts.db);
await registerModules(app, opts.db, items, opts.modules);
```

**这一行是模块注册表之外的第二条注册通道**，也是本设计最需要立规矩的地方。风险是它日后成为
「懒得写模块就往这儿塞」的后门。判据写死在 ADR-0018 里：只有**无 core Item、无模块归属、
且外壳启动即需要**的东西才走这条路。目前只有设置一个。

## 7. 前端：一个端口，三个 Context 保持原样

### 7.1 ui 层

新增 `packages/ui/src/SettingsContext.tsx`，声明端口并持有状态：

```ts
export interface SettingsStore {
  readSnapshot(): Partial<AppSettings>; // 同步，首屏立即可用
  load(): Promise<{ settings: AppSettings; storedKeys: SettingKey[] }>;
  patch(p: Partial<AppSettings>): Promise<AppSettings>;
}
```

`SettingsProvider` 拿这个端口，负责四件事：

1. 首屏用 `readSnapshot()` 同步渲染，**零闪烁**；
2. 后台 `load()` 校正，差异则重渲染并回写快照；
3. 写时乐观更新，失败回滚到上一个服务端确认值，并暴露 `lastError`（含请求编号）；
4. **合并串行**：同一时刻只有一个请求在飞，期间的改动合并成下一个 patch。时区地图那种连续
   点选因此不会打出一串竞态请求。

`useTheme` / `useTimezone` / `usePreferences` 的**公开接口一字不改**，只把内部的 localStorage
读写换成 `useSettings()`。508 行的 `SettingsPage.tsx`、`ThemeSelector`、`TimezoneMapSelector`
与所有页面都不需要改动。

`packages/ui` 新增 `@workbench/core` 依赖（取 `AppSettings` 与 codec）。方向指向内层，符合依赖
规则；core 只依赖 luxon，浏览器可用。ui 仍然零网络调用。

Provider 嵌套顺序（`App.tsx`）：

```
<SettingsProvider store={httpSettingsStore}>
  <ThemeProvider><TimezoneProvider><PreferencesProvider>
```

`useTimezone` 现有的「无 Provider 时降级为上海时区」保护保留。`ThemeProvider` 的 `defaultMode` /
`defaultPalette` 两个 props 随之失去意义（默认值改由 core 的 codec 表提供），一并移除，
`App.tsx` 对应的传参也删掉。

### 7.2 web 层

新增 `packages/web/src/settingsStore.ts` 实现端口：

- 快照存单键 `workbench_settings`（整份 JSON），不再是五个散键。
- **一次性迁移**：首次运行时读旧的五个键，只把 `storedKeys` 里**没有**的键 PATCH 上去，
  成功后删除旧键并落一个已迁移标记。用户当前选的主题与时区不会丢，也不会覆盖库里已有的值。
- **写失败就回滚并提示**，不做「界面已改、库里没改」的假成功——那正是本任务要消灭的不一致。
  后端不可用时设置改不动，与「前端本来就不能脱离后端运行」的现状一致。

## 8. 测试

| 层        | 内容                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| core      | `resolveSettings` 与各 codec：缺键、脏值、类型不符、旧值、未知键。接近全覆盖                                                  |
| data      | `SqliteSettingsRepository` 原样跑通 core 的 `settings-repository-contract`                                                    |
| data 迁移 | 新迁移在空库与既有库上都能跑通                                                                                                |
| server    | `settings/routes.test.ts`：`openTestDatabase()` + `app.inject`，读写往返、未知键 400、脏值 400、缺键补默认、`storedKeys` 正确 |
| web       | `settingsStore.test.ts`：请求头形状、响应解析、失败回滚、一次性迁移只跑一次                                                   |
| UI        | 不测渲染，维持现有策略                                                                                                        |

`app.inject` 不带任何 header，跑的是浏览器永远不会发出的请求形状。因此请求形状的守卫放在
`settingsStore.test.ts`——这正是 CLAUDE.md 里那条教训指定的位置。`settingsStore.ts` 是 `.ts`，
会被 Vitest 收集。

## 9. 文档

- 新增 `docs/adr/0018-settings-live-in-the-database.md`：记录「壳层子系统 + 第二条注册通道」
  这个决定、判据与风险，以及 KV 表与 EAV 否决的边界。
- ADR-0014 补一句：时区不再在每台新设备上重新三方推导，库里有值就用库里的。
- CLAUDE.md 更新「当前状态」与「会咬人的约定」两节。

## 10. 已知取舍

- **设置读写全走后端**。后端不可用时设置改不动。可接受：本应用前端本就不能脱离后端运行。
- **KV 表在 SQL 层无类型**。可接受：设置从不参与 SQL 筛选或排序，类型安全在 core 侧完整保住。
- **第二条注册通道**。用 ADR 判据约束，而非 lint——与铁律 3 一样，是需要人来守的一条。
