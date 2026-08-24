# 招聘季（Recruit Seasons）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给秋招模块加一层「招聘季」，投递归属到某一季，列表与统计按季作用，界面由「秋招」改称「招聘」。

**Architecture:** 模块内新增一张 `campus_recruit_seasons` 表与一列 `campus_recruit_applications.season_id`（外键指向它）。招聘季过滤在**服务端**完成（读端点带可选 `?seasonId=`），因此 `computeStats` 一行不用改——它本来就是对「传进来的这批投递」算的。前端持有「当前招聘季」并把它传下去。core 一行不改，铁律不破。

**Tech Stack:** TypeScript / Fastify / Drizzle ORM + better-sqlite3 / Zod / React + React Query / Tailwind v4 / Vitest

**Spec:** `docs/superpowers/specs/2026-08-24-recruit-seasons-design.md`

## Global Constraints

- **不重命名模块内部标识**：目录 `modules/campus-recruit`、模块 id `campus-recruit`、表前缀 `campus_recruit_`、API 前缀 `/api/campus`、路由 `/campus` 与 `/campus/stats` 一律不动（spec §7）。改名只发生在用户可见的文案上。
- **模块只能依赖 `@workbench/core` 与 `@workbench/http-kit`**，不得依赖其他模块或 `@workbench/data`（铁律 1）。
- **`modules/*/src/ui/**` 内禁止出现以 `/api/` 开头的字符串字面量**，路径一律来自 `contract.ts` 的常量（lint 规则 `no-restricted-syntax` 会拦）。
- **浮动日期绝不转 UTC**：`start_date` / `end_date` 存 `YYYY-MM-DD`。
- **领域错误必须落成 4xx**：用 `@workbench/http-kit` 的 `notFound` / `conflict` / `invalid`，未知错误继续冒泡。
- **默认招聘季的固定 id 是 `season-legacy-autumn`**，名称 `秋招`，`kind` 为 `campus-autumn`。这三个值在迁移、测试与文档里必须一致。
- 提交前跑 `npm run check`（format:check → typecheck → lint → test）四步全绿。
- 装依赖只走 `npm run setup`，不要 `npm install`。

---

### Task 1: 招聘季的表、迁移与仓储

**Files:**

- Modify: `modules/campus-recruit/src/storage/schema.ts`
- Create: `modules/campus-recruit/migrations/0003_recruit_seasons.sql`
- Modify: `modules/campus-recruit/migrations/meta/_journal.json`
- Create: `modules/campus-recruit/migrations/meta/0003_snapshot.json`（由 `npm run db:generate` 产出）
- Modify: `modules/campus-recruit/src/server/repository.ts`
- Modify: `modules/campus-recruit/src/storage/sqlite-repository.ts`
- Test: `modules/campus-recruit/src/storage/sqlite-repository.test.ts`

**Interfaces:**

- Consumes: 现有 `CampusRecruitRepository`、`SqliteCampusRecruitRepository`、`makeCampusHarness()`
- Produces:
  - `SEASON_KINDS = ['campus-autumn', 'campus-spring', 'intern', 'social'] as const`
  - `SeasonRecord { id: string; name: string; kind: SeasonKind; startDate: string | null; endDate: string | null; archivedAt: string | null; notes: string | null; createdAt: string; updatedAt: string }`
  - `SeasonChanges = Partial<Omit<SeasonRecord, 'id' | 'createdAt'>>`
  - `ApplicationRecord.seasonId: string`（**注意是 `string` 不是 `string | null`**）
  - Repository 新增：`listSeasons()`、`getSeason(id)`、`getSeasonByName(name)`、`insertSeason(record)`、`updateSeason(id, changes)`、`deleteSeason(id)`、`countApplicationsInSeason(seasonId)`
  - Repository 变更：`listApplications(seasonId?: string): Promise<ApplicationRecord[]>`

- [ ] **Step 1: 写失败的仓储测试**

追加到 `modules/campus-recruit/src/storage/sqlite-repository.test.ts` 末尾。先读该文件顶部，沿用它已有的 harness 与 fixture 写法。

```ts
it('招聘季可增删改查，且投递按季过滤', async () => {
  const h = makeCampusHarness();

  // 迁移自带的默认季：既有投递的去处
  const initial = await h.repo.listSeasons();
  expect(initial).toEqual([
    expect.objectContaining({ id: 'season-legacy-autumn', name: '秋招', kind: 'campus-autumn' }),
  ]);

  await h.repo.insertSeason({
    id: 'season-spring',
    name: '2027 春招',
    kind: 'campus-spring',
    startDate: '2027-02-01',
    endDate: null,
    archivedAt: null,
    notes: null,
    createdAt: '2026-08-24T02:00:00.000Z',
    updatedAt: '2026-08-24T02:00:00.000Z',
  });

  expect(await h.repo.getSeasonByName('2027 春招')).toMatchObject({ id: 'season-spring' });
  expect(await h.repo.getSeasonByName('不存在的季')).toBeNull();

  const renamed = await h.repo.updateSeason('season-spring', {
    name: '2027 春招（改）',
    updatedAt: '2026-08-24T03:00:00.000Z',
  });
  expect(renamed.name).toBe('2027 春招（改）');

  await h.repo.insertApplication({
    ...applicationFixture({ id: 'app-spring' }),
    seasonId: 'season-spring',
  });
  await h.repo.insertApplication({
    ...applicationFixture({ id: 'app-autumn' }),
    seasonId: 'season-legacy-autumn',
  });

  expect((await h.repo.listApplications()).map((a) => a.id).sort()).toEqual([
    'app-autumn',
    'app-spring',
  ]);
  expect((await h.repo.listApplications('season-spring')).map((a) => a.id)).toEqual(['app-spring']);
  expect(await h.repo.countApplicationsInSeason('season-spring')).toBe(1);

  expect(await h.repo.deleteSeason('season-spring')).toBe(true);
  expect(await h.repo.deleteSeason('season-spring')).toBe(false);
});
```

如果 `applicationFixture` 不接受 `id` 覆盖，改用该文件里既有的构造方式，只要保证两条投递 id 不同。

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/storage/sqlite-repository.test.ts`
Expected: FAIL —— `h.repo.listSeasons is not a function`

- [ ] **Step 3: 在 schema.ts 加表与列**

在 `modules/campus-recruit/src/storage/schema.ts` 里加季的种类常量与新表，放在 `campusRecruitApplications` **之前**（外键引用要求先定义）。

```ts
export const SEASON_KINDS = ['campus-autumn', 'campus-spring', 'intern', 'social'] as const;

export const campusRecruitSeasons = sqliteTable(
  'campus_recruit_seasons',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind', { enum: SEASON_KINDS }).notNull(),
    // 浮动日期：绝不转 UTC。「秋招 8 月 1 日开始」在任何时区都是 8 月 1 日
    startDate: text('start_date'),
    endDate: text('end_date'),
    archivedAt: text('archived_at'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    check(
      'ck_campus_recruit_seasons_kind',
      sql`${table.kind} IN ('campus-autumn', 'campus-spring', 'intern', 'social')`,
    ),
    uniqueIndex('uq_campus_recruit_seasons_name').on(table.name),
  ],
);
```

在 `campusRecruitApplications` 的字段里加一列（放在 `id` 之后即可）：

```ts
    // 刻意可空：SQLite 给已有表 ADD COLUMN 时带 NOT NULL 就必须带 DEFAULT，
    // 而那个 DEFAULT 会永久留在 schema 里，将来漏传 seasonId 不会报错、
    // 会静默落进 legacy 季。真正的 NOT NULL 需要整表重建，而 rounds 有外键
    // 指向本表，重建风险远大于收益。非空由 contract 的必填 + service 的存在性
    // 校验 + ApplicationRecord.seasonId 的 TS 类型（string）三处共同保证。
    seasonId: text('season_id').references(() => campusRecruitSeasons.id),
```

并在该表的约束数组里追加索引：

```ts
    index('idx_campus_recruit_applications_season_id').on(table.seasonId),
```

- [ ] **Step 4: 生成迁移，然后手工改成真正的增量**

Run: `npm run db:generate`

`drizzle-kit` 只会产出 DDL，**不会**产出那两条数据语句。把生成的 SQL 文件重命名为 `0003_recruit_seasons.sql`（`meta/_journal.json` 里的 `tag` 同步改），内容改成下面这份，并**保留同时生成的 `meta/0003_snapshot.json`**（下一份迁移要靠它 diff）：

```sql
-- 三步顺序是承重的：先建季表，再插入默认季，最后加列并回填。
-- 固定 id 而非随机 UUID：迁移是纯 SQL，没有生成 UUID 的能力，
-- 固定值也让「两台机器的库能不能对上」这个问题有答案。
CREATE TABLE `campus_recruit_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`archived_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_campus_recruit_seasons_kind" CHECK(`kind` IN ('campus-autumn', 'campus-spring', 'intern', 'social'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campus_recruit_seasons_name` ON `campus_recruit_seasons` (`name`);
--> statement-breakpoint
INSERT INTO `campus_recruit_seasons` (`id`, `name`, `kind`) VALUES ('season-legacy-autumn', '秋招', 'campus-autumn');
--> statement-breakpoint
ALTER TABLE `campus_recruit_applications` ADD `season_id` text REFERENCES campus_recruit_seasons(id);
--> statement-breakpoint
UPDATE `campus_recruit_applications` SET `season_id` = 'season-legacy-autumn' WHERE `season_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_season_id` ON `campus_recruit_applications` (`season_id`);
```

- [ ] **Step 5: 在 repository.ts 加类型与方法签名**

```ts
export type SeasonKind = 'campus-autumn' | 'campus-spring' | 'intern' | 'social';

export interface SeasonRecord {
  id: string;
  name: string;
  kind: SeasonKind;
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SeasonChanges = Partial<Omit<SeasonRecord, 'id' | 'createdAt'>>;
```

`ApplicationRecord` 加一行 `seasonId: string;`；`CampusRecruitRepository` 接口里改一条签名、加七个方法：

```ts
  listApplications(seasonId?: string): Promise<ApplicationRecord[]>;
  listSeasons(): Promise<SeasonRecord[]>;
  getSeason(id: string): Promise<SeasonRecord | null>;
  getSeasonByName(name: string): Promise<SeasonRecord | null>;
  insertSeason(record: SeasonRecord): Promise<void>;
  updateSeason(id: string, changes: SeasonChanges): Promise<SeasonRecord>;
  deleteSeason(id: string): Promise<boolean>;
  countApplicationsInSeason(seasonId: string): Promise<number>;
```

- [ ] **Step 6: 在 sqlite-repository.ts 实现它们**

```ts
  async listApplications(seasonId?: string): Promise<ApplicationRecord[]> {
    const rows = this.db
      .select()
      .from(campusRecruitApplications)
      .where(seasonId === undefined ? undefined : eq(campusRecruitApplications.seasonId, seasonId))
      .orderBy(asc(campusRecruitApplications.createdAt), asc(campusRecruitApplications.id))
      .all();
    // drizzle 由可空列推出 string | null，而应用层契约是 string。
    // 这个断言就是 schema.ts 里那处妥协的落点：非空由 contract 必填 +
    // service 存在性校验保证，不由 DB 保证。
    return rows as ApplicationRecord[];
  }

  async listSeasons(): Promise<SeasonRecord[]> {
    return this.db
      .select()
      .from(campusRecruitSeasons)
      .orderBy(asc(campusRecruitSeasons.createdAt), asc(campusRecruitSeasons.id))
      .all();
  }

  async getSeason(id: string): Promise<SeasonRecord | null> {
    return (
      this.db.select().from(campusRecruitSeasons).where(eq(campusRecruitSeasons.id, id)).get() ??
      null
    );
  }

  async getSeasonByName(name: string): Promise<SeasonRecord | null> {
    return (
      this.db.select().from(campusRecruitSeasons).where(eq(campusRecruitSeasons.name, name)).get() ??
      null
    );
  }

  async insertSeason(record: SeasonRecord): Promise<void> {
    this.db.insert(campusRecruitSeasons).values(record).run();
  }

  async updateSeason(id: string, changes: SeasonChanges): Promise<SeasonRecord> {
    const row = this.db
      .update(campusRecruitSeasons)
      .set(changes)
      .where(eq(campusRecruitSeasons.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`招聘季不存在：${id}`);
    return row;
  }

  async deleteSeason(id: string): Promise<boolean> {
    const rows = this.db
      .delete(campusRecruitSeasons)
      .where(eq(campusRecruitSeasons.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  async countApplicationsInSeason(seasonId: string): Promise<number> {
    return this.db
      .select()
      .from(campusRecruitApplications)
      .where(eq(campusRecruitApplications.seasonId, seasonId))
      .all().length;
  }
```

import 行补上 `campusRecruitSeasons` 与 `SeasonChanges` / `SeasonRecord`。

- [ ] **Step 7: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit/src/storage/sqlite-repository.test.ts`
Expected: PASS

- [ ] **Step 8: 修好被签名变化打破的既有测试**

Run: `npx vitest run modules/campus-recruit`

既有构造 `ApplicationRecord` 的地方现在缺 `seasonId`。在 `modules/campus-recruit/src/testing/fixtures.ts` 的 `applicationFixture` 默认值里加 `seasonId: 'season-legacy-autumn'`，其余按编译报错逐个补。
Expected: 全部 PASS

- [ ] **Step 9: 提交**

```bash
git add modules/campus-recruit
git commit -m "feat(campus): 招聘季的表、迁移 0003 与仓储"
```

---

### Task 2: 契约——招聘季的形状与端点，投递视图加季

**Files:**

- Modify: `modules/campus-recruit/src/contract.ts`
- Test: `modules/campus-recruit/src/contract.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `SeasonRecord`（形状对齐，但 contract 不 import server 类型）
- Produces:
  - `SEASON_KINDS`、`SeasonKind`
  - `seasonViewSchema` / `SeasonView`（含 `applicationCount: number`）
  - `seasonsResponseSchema`（`{ seasons: SeasonView[] }`）
  - `createSeasonInputSchema` / `CreateSeasonInput` / `CreateSeasonData`
  - `updateSeasonInputSchema` / `UpdateSeasonInput`
  - `CAMPUS_API.seasons: string`、`CAMPUS_API.season(id: string): string`
  - `applicationsQuery(seasonId?: string): string`、`statsQuery(seasonId?: string): string`
  - `ApplicationView` 加 `seasonId: string`、`seasonName: string`
  - `createApplicationInputSchema` 加必填 `seasonId`；`updateApplicationInputSchema` 加可选 `seasonId`

- [ ] **Step 1: 写失败的契约测试**

追加到 `modules/campus-recruit/src/contract.test.ts`：

```ts
it('招聘季的形状与端点', () => {
  expect(CAMPUS_API.seasons).toBe('/api/campus/seasons');
  expect(CAMPUS_API.season('s1')).toBe('/api/campus/seasons/s1');
  expect(CAMPUS_API.season('s/1')).toBe('/api/campus/seasons/s%2F1');
  expect(CAMPUS_API.season(ID_PARAM)).toBe('/api/campus/seasons/:id');

  // 季筛选是查询参数，省略即全部季（命令面板要跨季搜索）
  expect(applicationsQuery()).toBe('/api/campus/applications');
  expect(applicationsQuery('s1')).toBe('/api/campus/applications?seasonId=s1');
  expect(statsQuery('s/1')).toBe('/api/campus/stats?seasonId=s%2F1');

  const created = createSeasonInputSchema.parse({ name: ' 2027 春招 ', kind: 'campus-spring' });
  expect(created).toEqual({
    name: '2027 春招',
    kind: 'campus-spring',
    startDate: null,
    endDate: null,
    notes: null,
  });

  expect(() => createSeasonInputSchema.parse({ name: '  ', kind: 'social' })).toThrow();
  expect(() => createSeasonInputSchema.parse({ name: 'x', kind: '实习' })).toThrow();
  // 起止是浮动日期，不接受时刻
  expect(() =>
    createSeasonInputSchema.parse({ name: 'x', kind: 'social', startDate: '2027-02-01T00:00:00Z' }),
  ).toThrow();

  expect(updateSeasonInputSchema.parse({ archived: true })).toEqual({ archived: true });
});
```

import 里补上 `applicationsQuery`、`statsQuery`、`createSeasonInputSchema`、`updateSeasonInputSchema`。

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/contract.test.ts`
Expected: FAIL —— 这些导出还不存在

- [ ] **Step 3: 在 contract.ts 实现**

常量（放在 `APPLICATION_STATUS_CODES` 附近）：

```ts
export const SEASON_KINDS = ['campus-autumn', 'campus-spring', 'intern', 'social'] as const;
export type SeasonKind = (typeof SEASON_KINDS)[number];
```

既有的 `dateSchema` 允许带时刻部分，招聘季只要日，所以另开一个：

```ts
/** 招聘季的起止是浮动日期，只到天。绝不转 UTC（ADR-0004）。 */
const floatingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return false;
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return (
      dateObj.getUTCFullYear() === y &&
      dateObj.getUTCMonth() === m - 1 &&
      dateObj.getUTCDate() === d
    );
  }, '日期必须是有效日历日期');

const seasonFieldSchemas = {
  name: z.string().trim().min(1, '招聘季名称不能为空').max(60),
  kind: z.enum(SEASON_KINDS),
  startDate: floatingDateSchema.nullable(),
  endDate: floatingDateSchema.nullable(),
  notes: nullableText(2000),
};

export const createSeasonInputSchema = z.object({
  ...seasonFieldSchemas,
  startDate: seasonFieldSchemas.startDate.default(null),
  endDate: seasonFieldSchemas.endDate.default(null),
  notes: seasonFieldSchemas.notes.default(null),
});
export type CreateSeasonInput = z.input<typeof createSeasonInputSchema>;
export type CreateSeasonData = z.output<typeof createSeasonInputSchema>;

// archived 是布尔意图，落成哪个时刻由服务端决定——与 shelved 同形（ADR-0026）
export const updateSeasonInputSchema = z
  .object(seasonFieldSchemas)
  .partial()
  .extend({ archived: z.boolean().optional() });
export type UpdateSeasonInput = z.infer<typeof updateSeasonInputSchema>;

export const seasonViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(SEASON_KINDS),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  archivedAt: instantSchema.nullable(),
  notes: z.string().nullable(),
  applicationCount: z.number().int().nonnegative(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type SeasonView = z.infer<typeof seasonViewSchema>;

export const seasonsResponseSchema = z.object({ seasons: z.array(seasonViewSchema) });
export type SeasonsResponse = z.infer<typeof seasonsResponseSchema>;
```

投递侧三处改动。`applicationFieldSchemas` 里加：

```ts
  seasonId: z.string().min(1, '必须指定招聘季'),
```

`createApplicationInputSchema` 因此自动带上必填 `seasonId`（**不要**给它 `.default()`）；`updateApplicationInputSchema` 用的是 `.partial()`，自动得到可选 `seasonId`。`applicationViewSchema` 加两行：

```ts
  seasonId: z.string(),
  // 冗余季名而不是让前端自己关联：跨季模式（命令面板、全部季列表）下
  // 每条结果都要显示它属于哪一季，只给 id 等于把 join 推给每个消费者
  seasonName: z.string(),
```

`CAMPUS_API` 里加两条：

```ts
  /** GET → { seasons: SeasonView[] }；POST CreateSeasonInput → SeasonView（201） */
  seasons: '/api/campus/seasons',
  /** PATCH UpdateSeasonInput → SeasonView；DELETE → 204 */
  season: (id: string): string => `/api/campus/seasons/${segment(id)}`,
```

紧随其后加两个查询串构造函数：

```ts
/**
 * 招聘季筛选是**可选**查询参数，省略即全部季。
 * 不做成必填是因为命令面板（⌘K）要跨季搜索；作为交换，统计页恒传。
 */
function withSeason(path: string, seasonId?: string): string {
  return seasonId === undefined ? path : `${path}?seasonId=${encodeURIComponent(seasonId)}`;
}
export const applicationsQuery = (seasonId?: string): string =>
  withSeason(CAMPUS_API.applications, seasonId);
export const statsQuery = (seasonId?: string): string => withSeason(CAMPUS_API.stats, seasonId);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit/src/contract.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add modules/campus-recruit/src/contract.ts modules/campus-recruit/src/contract.test.ts
git commit -m "feat(campus): 契约加招聘季的形状与端点，投递视图带季"
```

---

### Task 3: service——招聘季的 CRUD 与归档 / 删除语义

**Files:**

- Modify: `modules/campus-recruit/src/server/service.ts`
- Test: `modules/campus-recruit/src/server/service.test.ts`

**Interfaces:**

- Consumes: Task 1 的仓储方法、Task 2 的 `CreateSeasonData` / `UpdateSeasonInput` / `SeasonView`
- Produces（`opts` 均为既有的 `CampusServiceOptions`）：
  - `listSeasons(repo, opts): Promise<{ seasons: SeasonView[] }>`
  - `createSeason(repo, input: CreateSeasonData, opts): Promise<SeasonView>`
  - `updateSeason(repo, id: string, input: UpdateSeasonInput, opts): Promise<SeasonView>`
  - `deleteSeason(repo, id: string, opts): Promise<void>`

- [ ] **Step 1: 写失败的 service 测试**

先在该文件的 `pendingApplicationInput()` 里加默认 `seasonId: 'season-legacy-autumn'`，然后追加：

```ts
describe('招聘季', () => {
  it('新建、改名、归档，归档不影响投影', async () => {
    const h = makeCampusHarness();
    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    expect(spring).toMatchObject({ name: '2027 春招', archivedAt: null, applicationCount: 0 });

    const { seasons } = await listSeasons(h.repo, OPTS);
    expect(seasons.map((s) => s.id)).toEqual(['season-legacy-autumn', spring.id]);

    // 这一季里有一条带截止日的投递，归档后它的 core Item 必须还在
    const app = await createApplication(
      h.ctx,
      h.repo,
      { ...pendingApplicationInput(), seasonId: spring.id },
      OPTS,
    );
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);

    const archived = await updateSeason(h.repo, spring.id, { archived: true }, OPTS);
    expect(archived.archivedAt).toBe(NOW);
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
    expect(await h.repo.getApplication(app.id)).not.toBeNull();

    // 再归档一次不刷新时刻：「从哪天起不再看它」才是有用的信息
    const again = await updateSeason(
      h.repo,
      spring.id,
      { archived: true },
      { ...OPTS, now: LATER },
    );
    expect(again.archivedAt).toBe(NOW);

    const revived = await updateSeason(h.repo, spring.id, { archived: false }, OPTS);
    expect(revived.archivedAt).toBeNull();
  });

  it('重名回 409', async () => {
    const h = makeCampusHarness();
    await expect(
      createSeason(h.repo, createSeasonInputSchema.parse({ name: '秋招', kind: 'social' }), OPTS),
    ).rejects.toMatchObject({ status: 409 });

    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    await expect(updateSeason(h.repo, spring.id, { name: '秋招' }, OPTS)).rejects.toMatchObject({
      status: 409,
    });
    // 改成自己现在的名字不算重名
    await expect(
      updateSeason(h.repo, spring.id, { name: '2027 春招' }, OPTS),
    ).resolves.toMatchObject({ name: '2027 春招' });
  });

  it('季里有投递、或它是最后一个未归档的季，都拒绝删除', async () => {
    const h = makeCampusHarness();

    // 最后一个未归档的季：删了就没地方放新投递
    await expect(deleteSeason(h.repo, 'season-legacy-autumn', OPTS)).rejects.toMatchObject({
      status: 409,
    });

    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    await createApplication(
      h.ctx,
      h.repo,
      { ...pendingApplicationInput(), seasonId: spring.id },
      OPTS,
    );
    // 有投递：不级联删除，让操作失败并提示
    await expect(deleteSeason(h.repo, spring.id, OPTS)).rejects.toMatchObject({ status: 409 });
    expect(await h.repo.getSeason(spring.id)).not.toBeNull();

    const empty = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 社招', kind: 'social' }),
      OPTS,
    );
    await expect(deleteSeason(h.repo, empty.id, OPTS)).resolves.toBeUndefined();
    expect(await h.repo.getSeason(empty.id)).toBeNull();
  });

  it('不存在的季回 404', async () => {
    const h = makeCampusHarness();
    await expect(updateSeason(h.repo, 'missing', { name: 'x' }, OPTS)).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteSeason(h.repo, 'missing', OPTS)).rejects.toMatchObject({ status: 404 });
  });
});
```

import 补 `createSeason` / `updateSeason` / `deleteSeason` / `listSeasons` 与 `createSeasonInputSchema`。

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/server/service.test.ts`
Expected: FAIL —— 这四个函数还不存在

- [ ] **Step 3: 实现四个函数**

在 `modules/campus-recruit/src/server/service.ts`（`conflict` 已随「撤回投递」引入，若不在则补 import）：

```ts
async function requireSeason(repo: CampusRecruitRepository, id: string): Promise<SeasonRecord> {
  const season = await repo.getSeason(id);
  if (season === null) throw notFound(`招聘季不存在：${id}`);
  return season;
}

async function seasonView(
  repo: CampusRecruitRepository,
  season: SeasonRecord,
): Promise<SeasonView> {
  return { ...season, applicationCount: await repo.countApplicationsInSeason(season.id) };
}

export async function listSeasons(
  repo: CampusRecruitRepository,
  _opts: CampusServiceOptions,
): Promise<{ seasons: SeasonView[] }> {
  const seasons = await repo.listSeasons();
  return { seasons: await Promise.all(seasons.map((season) => seasonView(repo, season))) };
}

export async function createSeason(
  repo: CampusRecruitRepository,
  input: CreateSeasonData,
  opts: CampusServiceOptions,
): Promise<SeasonView> {
  const now = resolveNow(opts);
  // 名称唯一：重名会让切换器无法分辨「哪个是哪个」
  if ((await repo.getSeasonByName(input.name)) !== null) {
    throw conflict(`已有同名招聘季：${input.name}`);
  }
  const record: SeasonRecord = {
    id: randomUUID(),
    name: input.name,
    kind: input.kind,
    startDate: input.startDate,
    endDate: input.endDate,
    archivedAt: null,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertSeason(record);
  return seasonView(repo, record);
}

export async function updateSeason(
  repo: CampusRecruitRepository,
  id: string,
  input: UpdateSeasonInput,
  opts: CampusServiceOptions,
): Promise<SeasonView> {
  const existing = await requireSeason(repo, id);
  const now = resolveNow(opts);
  const changes: SeasonChanges = { updatedAt: now };
  if (input.name !== undefined && input.name !== existing.name) {
    if ((await repo.getSeasonByName(input.name)) !== null) {
      throw conflict(`已有同名招聘季：${input.name}`);
    }
    changes.name = input.name;
  }
  if (input.kind !== undefined) changes.kind = input.kind;
  if (input.startDate !== undefined) changes.startDate = input.startDate;
  if (input.endDate !== undefined) changes.endDate = input.endDate;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.archived !== undefined) {
    // 已归档的再归档一次不刷新时刻——「从哪天起不再看它」才是有用的那个信息
    changes.archivedAt = input.archived ? (existing.archivedAt ?? now) : null;
  }
  return seasonView(repo, await repo.updateSeason(id, changes));
}

export async function deleteSeason(
  repo: CampusRecruitRepository,
  id: string,
  _opts: CampusServiceOptions,
): Promise<void> {
  const season = await requireSeason(repo, id);
  // 不级联删除：一个下拉里的误点不该带走几十条投递及其全部轮次。
  // 宁可让操作失败并提示下一步，也不悄悄丢数据（与「撤回投递」同一条原则）。
  const count = await repo.countApplicationsInSeason(id);
  if (count > 0) {
    throw conflict(`这个招聘季里还有 ${count} 条投递，请先移走或删除它们`);
  }
  const active = (await repo.listSeasons()).filter((s) => s.archivedAt === null);
  if (season.archivedAt === null && active.length <= 1) {
    throw conflict('这是最后一个未归档的招聘季，删掉就没有地方放新投递了');
  }
  await repo.deleteSeason(id);
}
```

import 补 `SeasonChanges` / `SeasonRecord`（`./repository.js`）与 `CreateSeasonData` / `SeasonView` / `UpdateSeasonInput`（`../contract.js`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit/src/server/service.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add modules/campus-recruit/src/server/service.ts modules/campus-recruit/src/server/service.test.ts
git commit -m "feat(campus): 招聘季的 CRUD 与归档 / 删除语义"
```

---

### Task 4: service——投递按季过滤、创建校验、移动投递、统计按季

**Files:**

- Modify: `modules/campus-recruit/src/server/service.ts`
- Test: `modules/campus-recruit/src/server/service.test.ts`

**Interfaces:**

- Consumes: Task 3 的 `requireSeason`；Task 1 的 `listApplications(seasonId?)`
- Produces:
  - `CampusServiceOptions` 加 `seasonId?: string`
  - `listApplications(repo, opts)` 与 `getStats(repo, opts)` 按 `opts.seasonId` 取数
  - `createApplication` / `updateApplication` 识别 `seasonId`

- [ ] **Step 1: 写失败的测试**

先读 `modules/campus-recruit/src/server/stats.ts` 确认返回字段名，再追加：

```ts
it('列表与统计按季过滤，轮次跟着投递一起被过滤', async () => {
  const h = makeCampusHarness();
  const spring = await createSeason(
    h.repo,
    createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
    OPTS,
  );

  const autumnApp = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
  const springApp = await createApplication(
    h.ctx,
    h.repo,
    { ...pendingApplicationInput(), seasonId: spring.id },
    OPTS,
  );
  await createRound(h.ctx, h.repo, autumnApp.id, roundInput(), OPTS);

  const autumnOnly = await listApplications(h.repo, {
    ...OPTS,
    seasonId: 'season-legacy-autumn',
  });
  expect(autumnOnly.applications.map((a) => a.id)).toEqual([autumnApp.id]);
  expect(autumnOnly.applications[0]).toMatchObject({
    seasonId: 'season-legacy-autumn',
    seasonName: '秋招',
  });

  const all = await listApplications(h.repo, OPTS);
  expect(all.applications).toHaveLength(2);

  // 统计只算这一季：春招那条没有轮次，秋招那条有一轮 technical
  const springStats = await getStats(h.repo, { ...OPTS, seasonId: spring.id });
  expect(springStats).toMatchObject({ total: 1 });
  expect(springStats.funnel.applicationToTechnical).toBe(0);
  expect(springApp.seasonName).toBe('2027 春招');
});

it('创建投递时季必须存在；改季即移动投递', async () => {
  const h = makeCampusHarness();
  await expect(
    createApplication(h.ctx, h.repo, { ...pendingApplicationInput(), seasonId: 'missing' }, OPTS),
  ).rejects.toMatchObject({ status: 404 });

  const spring = await createSeason(
    h.repo,
    createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
    OPTS,
  );
  const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

  const moved = await updateApplication(h.ctx, h.repo, app.id, { seasonId: spring.id }, OPTS);
  expect(moved).toMatchObject({ seasonId: spring.id, seasonName: '2027 春招' });

  await expect(
    updateApplication(h.ctx, h.repo, app.id, { seasonId: 'missing' }, OPTS),
  ).rejects.toMatchObject({ status: 404 });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/server/service.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`CampusServiceOptions` 加一行：

```ts
export interface CampusServiceOptions {
  zone: string;
  now?: IsoInstant;
  /** 省略即全部季。可选而非必填：命令面板（⌘K）要跨季搜索 */
  seasonId?: string;
}
```

`applicationView` 需要季名。加一个映射构造函数，避免每条投递查一次库：

```ts
async function seasonNames(repo: CampusRecruitRepository): Promise<Map<string, string>> {
  return new Map((await repo.listSeasons()).map((season) => [season.id, season.name]));
}
```

给 `applicationView` 加一个 `names: Map<string, string>` 参数，返回对象里加：

```ts
    seasonId: application.seasonId,
    // 季名恒可解析：season_id 有外键，且删除季时会拒绝掉还有投递的季
    seasonName: names.get(application.seasonId) ?? '',
```

所有调用 `applicationView` 的地方补上 `await seasonNames(repo)`。

`listApplications` 与 `getStats` 按季取数——**统计里轮次必须跟着投递一起过滤**，否则别的季的面试会算进这一季的转化率：

```ts
export async function listApplications(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<{ applications: ApplicationView[] }> {
  const applications = await repo.listApplications(opts.seasonId);
  const names = await seasonNames(repo);
  const now = resolveNow(opts);
  return {
    applications: await Promise.all(
      applications.map((application) => applicationView(repo, application, now, names)),
    ),
  };
}

export async function getStats(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<StatsResponse> {
  const applications = await repo.listApplications(opts.seasonId);
  const allRounds = await repo.listRounds();
  // 轮次必须跟着投递一起过滤，否则别的季的面试会算进这一季的转化率
  const ids = new Set(applications.map((application) => application.id));
  const rounds = allRounds.filter((round) => ids.has(round.applicationId));
  return computeStats(applications, rounds, resolveNow(opts));
}
```

现有 `listApplications` 里的排序逻辑照搬，不要在本次顺手改它。

`createApplication` 在插入前校验季存在，并把 `seasonId` 写进 record：

```ts
await requireSeason(repo, input.seasonId);
```

`updateApplication` 组装 `changes` 时加：

```ts
if (input.seasonId !== undefined) {
  // 移动投递到另一个招聘季。校验存在性，否则会写出一条查不到季名的孤儿
  await requireSeason(repo, input.seasonId);
  changes.seasonId = input.seasonId;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit`
Expected: PASS（既有用例若因 `pendingApplicationInput` 缺 `seasonId` 报错，按报错补齐）

- [ ] **Step 5: 提交**

```bash
git add modules/campus-recruit/src/server
git commit -m "feat(campus): 投递按季过滤、创建校验季存在、改季即移动投递"
```

---

### Task 5: 路由与前端 api 客户端

**Files:**

- Modify: `modules/campus-recruit/src/server/routes.ts`
- Modify: `modules/campus-recruit/src/ui/api.ts`
- Test: `modules/campus-recruit/src/server/routes.test.ts`
- Test: `modules/campus-recruit/src/ui/api.test.ts`
- Possibly modify: `packages/http-kit/src/`（给 `defineRoute` 加 `query` 支持，见 Step 3）

**Interfaces:**

- Consumes: Task 2 的端点常量与 schema、Task 3/4 的 service 函数
- Produces:
  - `fetchSeasons(): Promise<SeasonsResponse>`
  - `postSeason(input: CreateSeasonInput): Promise<SeasonView>`
  - `patchSeason(id: string, input: UpdateSeasonInput): Promise<SeasonView>`
  - `deleteSeason(id: string): Promise<void>`
  - `fetchApplications(seasonId?: string)`、`fetchStats(seasonId?: string)`

- [ ] **Step 1: 写失败的路由测试**

该文件里既有的建投递 payload 全部要补 `seasonId: 'season-legacy-autumn'`，否则会因必填而 400。然后追加：

```ts
it('招聘季端点：列表 / 新建 / 改名 / 归档 / 删除，两种 409', async () => {
  const { app } = await makeApp();

  const listed = await app.inject({ method: 'GET', url: '/api/campus/seasons' });
  expect(listed.statusCode).toBe(200);
  expect(seasonsResponseSchema.parse(listed.json()).seasons).toEqual([
    expect.objectContaining({ id: 'season-legacy-autumn', name: '秋招', applicationCount: 0 }),
  ]);

  const created = await app.inject({
    method: 'POST',
    url: '/api/campus/seasons',
    payload: { name: '2027 春招', kind: 'campus-spring' },
  });
  expect(created.statusCode).toBe(201);
  const season = seasonViewSchema.parse(created.json());

  const dup = await app.inject({
    method: 'POST',
    url: '/api/campus/seasons',
    payload: { name: '2027 春招', kind: 'social' },
  });
  expect(dup.statusCode).toBe(409);

  const archived = await app.inject({
    method: 'PATCH',
    url: `/api/campus/seasons/${season.id}`,
    payload: { archived: true },
  });
  expect(archived.statusCode).toBe(200);
  expect(seasonViewSchema.parse(archived.json()).archivedAt).toEqual(expect.any(String));

  // 归档后 legacy 季是最后一个未归档的，删它要被拒
  const refused = await app.inject({
    method: 'DELETE',
    url: '/api/campus/seasons/season-legacy-autumn',
  });
  expect(refused.statusCode).toBe(409);

  const deleted = await app.inject({ method: 'DELETE', url: `/api/campus/seasons/${season.id}` });
  expect(deleted.statusCode).toBe(204);
  expect(deleted.body).toBe('');
});

it('投递列表与统计接受 seasonId 查询参数', async () => {
  const { app } = await makeApp();
  await app.inject({
    method: 'POST',
    url: '/api/campus/applications',
    payload: {
      company: '星云科技',
      position: '固件工程师',
      priority: 'S',
      seasonId: 'season-legacy-autumn',
    },
  });

  const scoped = await app.inject({
    method: 'GET',
    url: '/api/campus/applications?seasonId=season-legacy-autumn',
  });
  expect(scoped.json().applications).toHaveLength(1);

  const other = await app.inject({ method: 'GET', url: '/api/campus/applications?seasonId=nope' });
  expect(other.json().applications).toHaveLength(0);

  const stats = await app.inject({
    method: 'GET',
    url: '/api/campus/stats?seasonId=season-legacy-autumn',
  });
  expect(statsResponseSchema.parse(stats.json())).toMatchObject({ total: 1 });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/server/routes.test.ts`
Expected: FAIL —— 404（路由未注册）

- [ ] **Step 3: 注册路由**

**先读 `packages/http-kit/src/` 确认 `defineRoute` 是否支持 `query` 这个键。** 若不支持，两种做法二选一：给 `defineRoute` 加 `query`（它是通用胶水、零领域词汇，加这个不破 ADR-0024 的收口条件），或在 handler 里自行 `seasonQuery.parse(request.query)`。**优先加到 `defineRoute`**——另外四个模块迟早也要。

```ts
const seasonQuery = z.object({ seasonId: z.string().min(1).optional() });

app.get(
  CAMPUS_API.applications,
  defineRoute({ query: seasonQuery }, ({ query }) =>
    listApplications(repo, { zone: resolveZone(), seasonId: query.seasonId }),
  ),
);

app.get(
  CAMPUS_API.stats,
  defineRoute({ query: seasonQuery }, ({ query }) =>
    getStats(repo, { zone: resolveZone(), seasonId: query.seasonId }),
  ),
);

app.get(CAMPUS_API.seasons, async () => listSeasons(repo, { zone: resolveZone() }));

app.post(
  CAMPUS_API.seasons,
  defineRoute({ body: createSeasonInputSchema, status: 201 }, ({ body }) =>
    createSeason(repo, body, { zone: resolveZone() }),
  ),
);

app.patch(
  CAMPUS_API.season(ID_PARAM),
  defineRoute({ params: idParams, body: updateSeasonInputSchema }, ({ params, body }) =>
    updateSeason(repo, params.id, body, { zone: resolveZone() }),
  ),
);

app.delete(
  CAMPUS_API.season(ID_PARAM),
  defineRoute({ params: idParams, status: 204 }, ({ params }) =>
    deleteSeason(repo, params.id, { zone: resolveZone() }),
  ),
);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit/src/server/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 写前端 api 客户端与它的测试**

在 `modules/campus-recruit/src/ui/api.ts`：

```ts
export const fetchSeasons = async (): Promise<SeasonsResponse> =>
  seasonsResponseSchema.parse(await request(CAMPUS_API.seasons));

export const postSeason = async (input: CreateSeasonInput): Promise<SeasonView> =>
  seasonViewSchema.parse(await request(CAMPUS_API.seasons, json('POST', input)));

export const patchSeason = async (id: string, input: UpdateSeasonInput): Promise<SeasonView> =>
  seasonViewSchema.parse(await request(CAMPUS_API.season(id), json('PATCH', input)));

export const deleteSeason = async (id: string): Promise<void> => {
  await request(CAMPUS_API.season(id), { method: 'DELETE' });
};
```

`fetchApplications` 与 `fetchStats` 改成接受可选季：

```ts
export const fetchApplications = async (
  seasonId?: string,
): Promise<{ applications: ApplicationView[] }> =>
  applicationsResponseSchema.parse(await request(applicationsQuery(seasonId)));

export const fetchStats = async (seasonId?: string): Promise<StatsResponse> =>
  statsResponseSchema.parse(await request(statsQuery(seasonId)));
```

在 `modules/campus-recruit/src/ui/api.test.ts` 追加（沿用该文件既有的 fetch stub 写法，helper 名字以实际为准）：

```ts
it('季筛选进查询串，且 id 会被转义', async () => {
  const fetchMock = stubFetch({ applications: [] });
  await fetchApplications('s/1');
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/campus/applications?seasonId=s%2F1');

  await fetchApplications();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/campus/applications');
});
```

- [ ] **Step 6: 跑测试**

Run: `npx vitest run modules/campus-recruit`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add modules/campus-recruit packages/http-kit
git commit -m "feat(campus): 招聘季的四个端点与前端 api 客户端"
```

---

### Task 6: 前端——切换器、管理弹窗、移动投递与门面改名

**Files:**

- Create: `modules/campus-recruit/src/ui/useCurrentSeason.ts`
- Test: `modules/campus-recruit/src/ui/useCurrentSeason.test.ts`
- Create: `modules/campus-recruit/src/ui/components/SeasonSwitcher.tsx`
- Create: `modules/campus-recruit/src/ui/components/SeasonManagerModal.tsx`
- Modify: `modules/campus-recruit/src/ui/ApplicationsPage.tsx`
- Modify: `modules/campus-recruit/src/ui/StatsPage.tsx`
- Modify: `modules/campus-recruit/src/ui/index.tsx`
- Modify: `modules/campus-recruit/src/ui/components/QuickAddApplicationModal.tsx`
- Modify: `modules/campus-recruit/src/ui/components/ApplicationTableRow.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/pages/SettingsPage.tsx`

**Interfaces:**

- Consumes: Task 5 的 `fetchSeasons` / `postSeason` / `patchSeason` / `deleteSeason` / `fetchApplications(seasonId?)` / `fetchStats(seasonId?)`
- Produces:
  - `readStoredSeasonId(): string | null`、`writeStoredSeasonId(id: string): void`、`pickInitialSeason(seasons: SeasonView[], storedId: string | null): SeasonView | null`（**纯函数放 `.ts`，`.tsx` 不进 Vitest 收集范围**）
  - `<SeasonSwitcher seasons currentId onChange onManage />`
  - `<SeasonManagerModal isOpen onClose seasons onCreate onUpdate onDelete isBusy error />`

- [ ] **Step 1: 写失败的纯函数测试**

新建 `modules/campus-recruit/src/ui/useCurrentSeason.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { SeasonView } from '../contract.js';
import { pickInitialSeason } from './useCurrentSeason.js';

const season = (id: string, archivedAt: string | null = null): SeasonView => ({
  id,
  name: id,
  kind: 'social',
  startDate: null,
  endDate: null,
  archivedAt,
  notes: null,
  applicationCount: 0,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
});

describe('pickInitialSeason', () => {
  it('优先用上次选的那一季', () => {
    expect(pickInitialSeason([season('a'), season('b')], 'b')?.id).toBe('b');
  });

  it('上次选的季已被删除时退回第一个未归档的季', () => {
    const seasons = [season('a', '2026-08-01T00:00:00.000Z'), season('b')];
    expect(pickInitialSeason(seasons, 'gone')?.id).toBe('b');
  });

  it('上次选的季已归档仍然尊重它——归档只影响列举，不该把人踢走', () => {
    const archived = season('a', '2026-08-01T00:00:00.000Z');
    expect(pickInitialSeason([archived, season('b')], 'a')?.id).toBe('a');
  });

  it('一个季都没有时返回 null', () => {
    expect(pickInitialSeason([], null)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `npx vitest run modules/campus-recruit/src/ui/useCurrentSeason.test.ts`
Expected: FAIL —— 模块不存在

- [ ] **Step 3: 实现纯函数**

新建 `modules/campus-recruit/src/ui/useCurrentSeason.ts`：

```ts
import type { SeasonView } from '../contract.js';

/**
 * 「当前招聘季」是**页面局部状态**，不是用户设置，所以走 localStorage 而不是
 * app_settings（判据见 ADR-0018）。同目录的视图模式（表格 / 看板）已有先例。
 */
const STORAGE_KEY = 'campus_current_season';

export function readStoredSeasonId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSeasonId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function pickInitialSeason(
  seasons: SeasonView[],
  storedId: string | null,
): SeasonView | null {
  // 已归档的季若正被选中就继续尊重它：归档只影响默认列举，不该把人踢出正在看的季
  const stored = seasons.find((season) => season.id === storedId);
  if (stored !== undefined) return stored;
  return seasons.find((season) => season.archivedAt === null) ?? seasons[0] ?? null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run modules/campus-recruit/src/ui/useCurrentSeason.test.ts`
Expected: PASS

- [ ] **Step 5: 写切换器组件**

新建 `modules/campus-recruit/src/ui/components/SeasonSwitcher.tsx`：一个下拉，未归档的季在前，已归档的折在「显示已归档」之后，末项是「管理招聘季…」（触发 `onManage`）。样式照该目录其它组件的写法（`controlClass` 等来自 `@workbench/ui`）。**组件内不得出现 `/api/` 字面量**——数据由父组件取好后传进来。

- [ ] **Step 6: 写管理弹窗**

新建 `modules/campus-recruit/src/ui/components/SeasonManagerModal.tsx`，用 `@workbench/ui` 的 `Modal`。列出全部季（含 `applicationCount`），每行可改名 / 归档 / 删除，底部一个新建表单（名称 + 类型 + 可选起止日期）。409 的文案直接展示服务端返回的 message——那两条拒绝规则的提示语就是写给用户看的。

- [ ] **Step 7: 接进两个页面**

`ApplicationsPage.tsx`：

- `useQuery({ queryKey: ['campus', 'seasons'], queryFn: fetchSeasons })`
- 用 `pickInitialSeason` 定当前季，选中时 `writeStoredSeasonId`
- 投递查询 key 改为 `['campus', 'applications', currentSeasonId]`，`queryFn` 传季
- `SeasonSwitcher` 放进现有那条 sticky 工具栏
- 新建投递时把 `seasonId: currentSeasonId` 放进 payload
- 季相关 mutation 成功后 invalidate `['campus', 'seasons']` 与 `['campus', 'applications']`

`StatsPage.tsx`：同样取季、同样的切换器，`fetchStats(currentSeasonId)`，**标题带季名**——不带的话没人说得清屏幕上这些数字是哪一季的。

`QuickAddApplicationModal.tsx`：标题改成 `新建投递 · {seasonName}`。

`ApplicationTableRow.tsx` 的档案编辑表单加一个「招聘季」下拉，改动走 `onUpdateApplication(id, { seasonId })`。

- [ ] **Step 8: 门面改名**

`modules/campus-recruit/src/ui/index.tsx`：

```tsx
  title: '招聘管理',
  nav: [
    { path: '/campus', label: '投递管理' },
    { path: '/campus/stats', label: '招聘统计' },
  ],
```

**路由字符串不动**（`/campus`、`/campus/stats`）。

`packages/web/src/pages/SettingsPage.tsx:499` 那段：标题改「招聘管理模块 (campus-recruit)」，把写错的表名 `campus_recruit_events` 改成 `campus_recruit_rounds`，再补上新增的 `campus_recruit_seasons`。

`packages/web/src/App.tsx`：命令面板结果里给投递加上季名（`app.seasonName`）——它现在是跨季搜索的唯一入口。

- [ ] **Step 9: 全量校验**

Run: `npm run check`
Expected: 四步全绿

- [ ] **Step 10: 提交**

```bash
git add modules/campus-recruit packages/web
git commit -m "feat(campus): 招聘季切换器、管理弹窗与门面改名"
```

---

### Task 7: 文档

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md`（若其中有秋招模块的描述）

- [ ] **Step 1: 更新 CLAUDE.md**

把「秋招的两条状态语义」一节改成「招聘模块的几条语义」，保留原有两条，并补三条：

1. **界面叫「招聘管理」，代码里仍叫 `campus-recruit`。** 目录 / 模块 id / 表前缀 / API / 路由全部没改，理由见 spec §7（迁移账本按目录名派生、已存 core Item 的 `sourceModule`、备份水位）。**读到 campus-recruit 时不要以为是漏改的。**
2. **`season_id` 在 DB 上可空，非空由应用层保证**（contract 必填 + service 存在性校验 + TS 类型三处），理由见 spec §2.2。
3. **日历与今日不跟着招聘季切换器走**——投影是跨模块聚合，不认季。切到「社招」时日历上照样有秋招的面试，这是对的。

- [ ] **Step 2: 格式化并提交**

```bash
npx prettier --write CLAUDE.md README.md
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md 记下招聘季的三条会咬人的性质"
```

---

## 人工验收清单（自动化测试覆盖不到）

1. **旧库回填**：用真实库 `data/local/accounts/local-default/workbench.db` 启动一次，确认现有投递全部落进「秋招」，投递页正常显示。
2. **切换器**：新建「2027 春招」，在两季之间切换，确认列表与统计都跟着变，刷新后仍停在上次选的季。
3. **管理弹窗**：改名、归档（确认它从默认列表消失但日历上的面试还在）、删除空季成功、删除有投递的季被拒并给出可读提示、删除最后一个未归档季被拒。
4. **移动投递**：把一条投递改到另一季，确认它从当前季列表消失、在目标季出现。
5. **命令面板**：⌘K 搜一个别的季的公司名，确认搜得到且结果上标了季名。
