# Campus Recruit Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first self-owned-data module: campus application tracking, arbitrary interview rounds, Item projections, funnel statistics, and two registered UI pages.

**Architecture:** `modules/campus-recruit` owns its records, migrations, repository contract, SQLite adapter, services, HTTP routes, and UI. Its tables are the source of truth; core Items are module-owned projections repaired by idempotent reconciliation. The composition root injects the shared SQLite connection into the module storage adapter without adding a database handle to `ModuleContext`.

**Tech Stack:** TypeScript 5.7 strict, Node.js, npm workspaces, Fastify 5, SQLite/better-sqlite3, Drizzle ORM 0.45, Zod 4, React 19, TanStack Query 5, Tailwind CSS 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-17-campus-recruit-module-design.md`

## Global Constraints

- Module ID is exactly `campus-recruit`; every owned table starts with `campus_recruit_`.
- Production module code must not import `@workbench/data` or another `@workbench/module-*`. Tests may use `@workbench/data` for real `:memory:` SQLite integration tests.
- Only `modules/*/src/storage/**` may import `better-sqlite3`, `drizzle-orm`, or `drizzle-orm/*`; service/routes receive a module-owned Repository, never a database connection.
- Instant values are UTC ISO8601 strings with `Z` and three millisecond digits. `apply_deadline_date` is a floating `YYYY-MM-DD`; reconciliation converts it with `endOfLocalDayUtc()` and also projects an all-day schedule. SQL never performs time-zone conversion.
- Application status is derived and never stored. `SHELVED_DAYS = 90`; exactly 90 days is still `applied`, more than 90 days with no rounds is `shelved`.
- Round flow order uses `sequence`, not `scheduledAt` or `createdAt`. `unique(application_id, sequence)` is enforced by SQLite.
- Creating the first round or setting any non-null application outcome automatically sets `appliedAt = now` when it is still null; progressed records must never derive as `pending` or fall outside the applied funnel denominator.
- Application tables are the source of truth. Item projection writes are immediately reconciled, full reconciliation runs at module startup, and reconciliation is idempotent.
- A failed round's own Item is `done`; only later (`sequence` greater), future, unfinished Items are `cancelled`. `rejected` and `declined` cancel all future unfinished Items.
- Priority maps `S|A -> high`, `B -> normal`, `C -> low`.
- Today workspace lists Items from all modules. Non-todo Items are visible but read-only and carry a source label.
- UI uses the shared `@workbench/ui` primitives and existing Tailwind v4 tokens. Do not add a Tailwind config, PostCSS config, component test framework, Playwright, imports, notifications, or `itemDecorators`.
- Core and service changes use red-green-refactor. UI is manually verified; do not add React rendering-detail tests.
- Every task ends with its focused tests, then a small commit. Run `npm run check` before the final commit.

## File Map

### Core and composition changes

- `packages/core/src/repository.ts` — add module-scoped single Item deletion.
- `packages/core/src/testing/item-repository-contract.ts` — make deletion part of the LSP contract.
- `packages/data/src/item-repository.ts` — SQLite implementation of scoped deletion.
- `eslint.config.js` and `packages/core/src/eslint.boundaries.test.ts` — confine database libraries to module storage adapters.
- `modules/todo/src/contract.ts`, `modules/todo/src/server/service.ts`, `modules/todo/src/server/service.test.ts`, `modules/todo/src/ui/TodayPage.tsx` — turn today into a cross-module read-only aggregation.
- `packages/server/src/index.ts`, `packages/server/package.json` — inject SQLite adapter and register the server module.
- `packages/web/src/modules.ts`, `packages/web/package.json` — register the UI module.
- `tsconfig.json`, `package-lock.json` — workspace aliases and dependency graph.

### New campus module

- `modules/campus-recruit/package.json` — honest runtime/test dependencies and exports.
- `modules/campus-recruit/drizzle.config.ts` — future migration generation for the module-owned schema.
- `modules/campus-recruit/migrations/0000_campus_recruit.sql` and `migrations/meta/_journal.json` — applications/rounds DDL and indexes.
- `modules/campus-recruit/src/contract.ts` and `contract.test.ts` — shared Zod request/response boundary.
- `modules/campus-recruit/src/server/repository.ts` — storage-neutral records and `CampusRecruitRepository`.
- `modules/campus-recruit/src/storage/schema.ts` — Drizzle mapping for module tables only.
- `modules/campus-recruit/src/storage/sqlite-repository.ts` and `.test.ts` — real SQLite adapter and migration/CRUD tests.
- `modules/campus-recruit/src/testing/fixtures.ts` and `harness.ts` — shared deterministic records and real in-memory integration harness; never imported by production code.
- `modules/campus-recruit/src/server/domain.ts` and `.test.ts` — status, labels, priority mapping, and sequence semantics.
- `modules/campus-recruit/src/server/stats.ts` and `.test.ts` — pure funnel calculations.
- `modules/campus-recruit/src/server/projections.ts` and `.test.ts` — Item projection reconciliation and orphan cleanup.
- `modules/campus-recruit/src/server/service.ts` and `.test.ts` — application/round use cases.
- `modules/campus-recruit/src/server/routes.ts` and `.test.ts` — Fastify API.
- `modules/campus-recruit/src/server/index.ts` — server module factory and startup reconciliation.
- `modules/campus-recruit/src/ui/api.ts` and `.test.ts` — browser transport and response validation.
- `modules/campus-recruit/src/ui/ApplicationsPage.tsx` — application/round editing flow.
- `modules/campus-recruit/src/ui/StatsPage.tsx` — funnel and failure distribution.
- `modules/campus-recruit/src/ui/index.tsx` — navigation and routes.

---

### Task 1: Add module-scoped Item deletion

**Files:**

- Modify: `packages/core/src/repository.ts`
- Modify: `packages/core/src/testing/item-repository-contract.ts`
- Modify: `packages/data/src/item-repository.ts`
- Test: `packages/data/src/item-repository.test.ts` (runs the shared contract)

**Interfaces:**

- Consumes: existing `ItemRepository.create()`, `getById()`, and `Item.sourceModule`.
- Produces: `ItemRepository.delete(moduleId: string, id: string): Promise<boolean>` for projection cleanup in Tasks 5–7.

- [ ] **Step 1: Add two failing cases to the shared Repository contract**

Append inside `runItemRepositoryContract`:

```ts
it('delete 删除自己的 Item，并返回 true', async () => {
  const own = await repo.create('campus-recruit', { kind: 'task', title: '截止任务' });

  expect(await repo.delete('campus-recruit', own.id)).toBe(true);
  expect(await repo.getById(own.id)).toBeNull();
});

it('delete 不得删除其他模块的 Item', async () => {
  const todo = await repo.create('todo', { kind: 'task', title: 'todo 的任务' });

  expect(await repo.delete('campus-recruit', todo.id)).toBe(false);
  expect(await repo.getById(todo.id)).toMatchObject({ id: todo.id, sourceModule: 'todo' });
});
```

- [ ] **Step 2: Run the contract and verify the expected type failure**

Run: `npx vitest run packages/data/src/item-repository.test.ts`

Expected: FAIL because `ItemRepository` and `SqliteItemRepository` do not define `delete`.

- [ ] **Step 3: Add the interface and minimal SQLite implementation**

Add to `ItemRepository` after `list()`:

```ts
/** 删除调用模块拥有的单条 Item；不存在或不属于调用方均返回 false。 */
delete(moduleId: string, id: string): Promise<boolean>;
```

Add to `SqliteItemRepository` before `deleteBySourceModule()`:

```ts
async delete(moduleId: string, id: string): Promise<boolean> {
  const deleted = this.db
    .delete(items)
    .where(and(eq(items.id, id), eq(items.sourceModule, moduleId)))
    .returning({ id: items.id })
    .get();
  return deleted !== undefined;
}
```

- [ ] **Step 4: Run focused and full core/data tests**

Run: `npx vitest run packages/data/src/item-repository.test.ts packages/core/src/item.test.ts`

Expected: PASS, including both new deletion cases.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/repository.ts packages/core/src/testing/item-repository-contract.ts packages/data/src/item-repository.ts
git commit -m "feat(core): add module-scoped item deletion"
```

---

### Task 2: Scaffold the module, enforce the storage boundary, and migrate its tables

**Files:**

- Create: `modules/campus-recruit/package.json`
- Create: `modules/campus-recruit/drizzle.config.ts`
- Create: `modules/campus-recruit/migrations/0000_campus_recruit.sql`
- Create: `modules/campus-recruit/migrations/meta/_journal.json`
- Create: `modules/campus-recruit/src/contract.ts`
- Create: `modules/campus-recruit/src/contract.test.ts`
- Create: `modules/campus-recruit/src/storage/schema.ts`
- Create: `modules/campus-recruit/src/storage/sqlite-repository.test.ts`
- Modify: `eslint.config.js`
- Modify: `packages/core/src/eslint.boundaries.test.ts`
- Modify: `tsconfig.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `runMigrationsFrom()`, core Items table, Zod 4, Drizzle SQLite schema primitives.
- Produces: module constants/schemas, migrated tables, and the only directory allowed to import database libraries.

- [ ] **Step 1: Add failing lint-boundary tests**

Append to `packages/core/src/eslint.boundaries.test.ts`:

```ts
it('模块业务代码不得 import SQLite 或 Drizzle', async () => {
  const messages = await messagesFor(
    'modules/probe/src/server/service.ts',
    "import 'drizzle-orm';\nimport 'better-sqlite3';\n",
  );
  expect(messages.join('\n')).toContain('数据库依赖只能出现在模块 storage 目录');
});

it('模块 storage 可用 Drizzle，但仍不得 import @workbench/data', async () => {
  const drizzle = await messagesFor(
    'modules/probe/src/storage/schema.ts',
    "import 'drizzle-orm/sqlite-core';\n",
  );
  expect(drizzle.join('\n')).not.toContain('数据库依赖只能出现在模块 storage 目录');

  const data = await messagesFor(
    'modules/probe/src/storage/schema.ts',
    "import '@workbench/data';\n",
  );
  expect(data.join('\n')).toContain('模块不得直连数据层');
});
```

- [ ] **Step 2: Run the lint-boundary test and verify it fails**

Run: `npx vitest run packages/core/src/eslint.boundaries.test.ts`

Expected: FAIL because database imports outside storage are not restricted yet.

- [ ] **Step 3: Split the ESLint rule into business and storage scopes**

Keep the existing module-to-module and `@workbench/data` patterns. Add database imports to the general module block:

```js
{
  group: ['better-sqlite3', 'drizzle-orm', 'drizzle-orm/*'],
  message: '数据库依赖只能出现在模块 storage 目录（ADR-0008）。',
},
```

Then add a later override before the test-file exemption. Repeat the module/data restrictions exactly, but omit the database-library pattern:

```js
{
  files: ['modules/*/src/storage/**/*.ts'],
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
            message: '模块不得直连数据层；storage 适配器由组合根注入连接（ADR-0008）。',
          },
        ],
      },
    ],
  },
},
```

- [ ] **Step 4: Create the workspace manifest and aliases**

Create `modules/campus-recruit/package.json`:

```json
{
  "name": "@workbench/module-campus-recruit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/server/index.ts",
  "types": "./src/server/index.ts",
  "exports": {
    ".": "./src/server/index.ts",
    "./contract": "./src/contract.ts",
    "./storage": "./src/storage/sqlite-repository.ts",
    "./ui": "./src/ui/index.tsx"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.101.4",
    "@workbench/core": "*",
    "@workbench/ui": "*",
    "better-sqlite3": "^13.0.3",
    "drizzle-orm": "^0.45.2",
    "react": "^19.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@workbench/data": "*",
    "@workbench/server": "*",
    "fastify": "^5.12.0"
  }
}
```

Add aliases to `tsconfig.json`:

```json
"@workbench/module-campus-recruit": ["modules/campus-recruit/src/server/index.ts"],
"@workbench/module-campus-recruit/contract": ["modules/campus-recruit/src/contract.ts"],
"@workbench/module-campus-recruit/storage": ["modules/campus-recruit/src/storage/sqlite-repository.ts"],
"@workbench/module-campus-recruit/ui": ["modules/campus-recruit/src/ui/index.tsx"]
```

Run `npm install` once after saving the manifest to update `package-lock.json` without changing version ranges.

- [ ] **Step 5: Define the shared contract constants and input validation**

Create `modules/campus-recruit/src/contract.ts` with these exact public values:

```ts
import { z } from 'zod';

export const CAMPUS_RECRUIT_MODULE_ID = 'campus-recruit';
export const APPLICATION_PRIORITIES = ['S', 'A', 'B', 'C'] as const;
export const APPLICATION_OUTCOMES = ['offer', 'oc', 'rejected', 'declined'] as const;
export const ROUND_KINDS = ['assessment', 'written', 'technical', 'hr', 'other'] as const;
export const ROUND_OUTCOMES = ['pending', 'passed', 'failed'] as const;
export const APPLICATION_STATUS_CODES = [
  'offer',
  'oc',
  'declined',
  'failed',
  'pending',
  'shelved',
  'applied',
  'in_progress',
] as const;

export type ApplicationPriority = (typeof APPLICATION_PRIORITIES)[number];
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];
export type RoundKind = (typeof ROUND_KINDS)[number];
export type RoundOutcome = (typeof ROUND_OUTCOMES)[number];
export type ApplicationStatusCode = (typeof APPLICATION_STATUS_CODES)[number];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');
const instantSchema = z.string().datetime({ offset: true });
const nullableText = (max: number) => z.string().trim().max(max).nullable().default(null);

export const createApplicationInputSchema = z.object({
  company: z.string().trim().min(1, '公司不能为空').max(100),
  position: z.string().trim().min(1, '岗位不能为空').max(120),
  companyType: nullableText(80),
  industry: nullableText(80),
  city: nullableText(80),
  channel: nullableText(80),
  referral: nullableText(200),
  priority: z.enum(APPLICATION_PRIORITIES).default('B'),
  applyDeadlineDate: dateSchema.nullable().default(null),
  appliedAt: instantSchema.nullable().default(null),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().default(null),
  salary: nullableText(120),
  link: nullableText(1000),
  notes: nullableText(4000),
});
export type CreateApplicationInput = z.input<typeof createApplicationInputSchema>;
export type CreateApplicationData = z.output<typeof createApplicationInputSchema>;

export const updateApplicationInputSchema = createApplicationInputSchema.partial();
export type UpdateApplicationInput = z.infer<typeof updateApplicationInputSchema>;

export const createRoundInputSchema = z.object({
  kind: z.enum(ROUND_KINDS),
  name: z.string().trim().min(1, '轮次名称不能为空').max(100),
  scheduledAt: instantSchema.nullable().default(null),
  format: nullableText(80),
  durationMin: z.number().int().positive().max(1440).nullable().default(null),
  outcome: z.enum(ROUND_OUTCOMES).default('pending'),
  notes: nullableText(4000),
});
export type CreateRoundInput = z.input<typeof createRoundInputSchema>;
export type CreateRoundData = z.output<typeof createRoundInputSchema>;

export const updateRoundInputSchema = createRoundInputSchema.partial().extend({
  sequence: z.number().int().positive().optional(),
});
export type UpdateRoundInput = z.infer<typeof updateRoundInputSchema>;
```

Continue the same file with response schemas used by server and UI:

```ts
export const roundViewSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  sequence: z.number().int().positive(),
  kind: z.enum(ROUND_KINDS),
  name: z.string(),
  scheduledAt: instantSchema.nullable(),
  format: z.string().nullable(),
  durationMin: z.number().int().positive().nullable(),
  outcome: z.enum(ROUND_OUTCOMES),
  outcomeAt: instantSchema.nullable(),
  notes: z.string().nullable(),
  itemId: z.string().nullable(),
});
export type RoundView = z.infer<typeof roundViewSchema>;

export const applicationViewSchema = z.object({
  id: z.string(),
  company: z.string(),
  position: z.string(),
  companyType: z.string().nullable(),
  industry: z.string().nullable(),
  city: z.string().nullable(),
  channel: z.string().nullable(),
  referral: z.string().nullable(),
  priority: z.enum(APPLICATION_PRIORITIES),
  applyDeadlineDate: dateSchema.nullable(),
  appliedAt: instantSchema.nullable(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  outcomeAt: instantSchema.nullable(),
  salary: z.string().nullable(),
  link: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.object({
    code: z.enum(APPLICATION_STATUS_CODES),
    label: z.string(),
    failedRoundName: z.string().nullable(),
  }),
  rounds: z.array(roundViewSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type ApplicationView = z.infer<typeof applicationViewSchema>;

export const applicationsResponseSchema = z.object({
  applications: z.array(applicationViewSchema),
});

export const statsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  applied: z.number().int().nonnegative(),
  assessment: z.number().int().nonnegative(),
  technical: z.number().int().nonnegative(),
  hr: z.number().int().nonnegative(),
  offers: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  shelved: z.number().int().nonnegative(),
  rates: z.object({
    applicationToAssessment: z.number().nullable(),
    applicationToTechnical: z.number().nullable(),
    technicalToOffer: z.number().nullable(),
  }),
  failedByKind: z.array(
    z.object({ kind: z.enum(ROUND_KINDS), count: z.number().int().positive() }),
  ),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;
```

- [ ] **Step 6: Test validation defaults and rejection cases**

Create `contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApplicationInputSchema, updateRoundInputSchema } from './contract.js';

describe('campus recruit contract', () => {
  it('fills application defaults and trims required text', () => {
    const parsed = createApplicationInputSchema.parse({
      company: '  星云科技  ',
      position: '固件工程师',
    });
    expect(parsed.company).toBe('星云科技');
    expect(parsed.priority).toBe('B');
    expect(parsed.applyDeadlineDate).toBeNull();
    expect(parsed.outcome).toBeNull();
  });

  it('rejects an invalid deadline date', () => {
    expect(() =>
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        applyDeadlineDate: '2026/09/20',
      }),
    ).toThrow();
  });

  it('requires a positive round sequence when supplied', () => {
    expect(() => updateRoundInputSchema.parse({ sequence: 0 })).toThrow();
  });
});
```

- [ ] **Step 7: Create the module schema and SQL migration**

Create `src/storage/schema.ts`. Do not import the core `items` schema; cross-boundary foreign keys live in SQL, while `deadlineItemId` and `itemId` remain nullable text in the Drizzle mapping.

```ts
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_PRIORITIES,
  ROUND_KINDS,
  ROUND_OUTCOMES,
} from '../contract.js';

export const campusRecruitApplications = sqliteTable(
  'campus_recruit_applications',
  {
    id: text('id').primaryKey(),
    company: text('company').notNull(),
    position: text('position').notNull(),
    companyType: text('company_type'),
    industry: text('industry'),
    city: text('city'),
    channel: text('channel'),
    referral: text('referral'),
    priority: text('priority', { enum: APPLICATION_PRIORITIES }).notNull().default('B'),
    applyDeadlineDate: text('apply_deadline_date'),
    appliedAt: text('applied_at'),
    outcome: text('outcome', { enum: APPLICATION_OUTCOMES }),
    outcomeAt: text('outcome_at'),
    salary: text('salary'),
    link: text('link'),
    notes: text('notes'),
    deadlineItemId: text('deadline_item_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    index('idx_campus_recruit_applications_applied_at').on(table.appliedAt),
    index('idx_campus_recruit_applications_outcome').on(table.outcome),
  ],
);

export const campusRecruitRounds = sqliteTable(
  'campus_recruit_rounds',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id')
      .notNull()
      .references(() => campusRecruitApplications.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    kind: text('kind', { enum: ROUND_KINDS }).notNull(),
    name: text('name').notNull(),
    scheduledAt: text('scheduled_at'),
    format: text('format'),
    durationMin: integer('duration_min'),
    outcome: text('outcome', { enum: ROUND_OUTCOMES }).notNull().default('pending'),
    outcomeAt: text('outcome_at'),
    notes: text('notes'),
    itemId: text('item_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (table) => [
    uniqueIndex('uq_campus_recruit_round_sequence').on(table.applicationId, table.sequence),
    index('idx_campus_recruit_rounds_application_id').on(table.applicationId),
    index('idx_campus_recruit_rounds_kind').on(table.kind),
    index('idx_campus_recruit_rounds_scheduled_at').on(table.scheduledAt),
  ],
);
```

Create `migrations/0000_campus_recruit.sql`:

```sql
CREATE TABLE `campus_recruit_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `company` text NOT NULL,
  `position` text NOT NULL,
  `company_type` text,
  `industry` text,
  `city` text,
  `channel` text,
  `referral` text,
  `priority` text DEFAULT 'B' NOT NULL CHECK (`priority` IN ('S', 'A', 'B', 'C')),
  `apply_deadline_date` text,
  `applied_at` text,
  `outcome` text CHECK (`outcome` IS NULL OR `outcome` IN ('offer', 'oc', 'rejected', 'declined')),
  `outcome_at` text,
  `salary` text,
  `link` text,
  `notes` text,
  `deadline_item_id` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  FOREIGN KEY (`deadline_item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `campus_recruit_rounds` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL,
  `sequence` integer NOT NULL CHECK (`sequence` > 0),
  `kind` text NOT NULL CHECK (`kind` IN ('assessment', 'written', 'technical', 'hr', 'other')),
  `name` text NOT NULL,
  `scheduled_at` text,
  `format` text,
  `duration_min` integer,
  `outcome` text DEFAULT 'pending' NOT NULL CHECK (`outcome` IN ('pending', 'passed', 'failed')),
  `outcome_at` text,
  `notes` text,
  `item_id` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  FOREIGN KEY (`application_id`) REFERENCES `campus_recruit_applications`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL,
  UNIQUE (`application_id`, `sequence`)
);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_applied_at` ON `campus_recruit_applications` (`applied_at`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_outcome` ON `campus_recruit_applications` (`outcome`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_application_id` ON `campus_recruit_rounds` (`application_id`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_kind` ON `campus_recruit_rounds` (`kind`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_scheduled_at` ON `campus_recruit_rounds` (`scheduled_at`);
```

Create the migration journal:

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1786960000000,
      "tag": "0000_campus_recruit",
      "breakpoints": true
    }
  ]
}
```

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/campus-recruit/src/storage/schema.ts',
  out: './modules/campus-recruit/migrations',
  dbCredentials: { url: './data/local/workbench.db' },
});
```

- [ ] **Step 8: Test the real migration**

Create the first test in `src/storage/sqlite-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openTestDatabase, runMigrationsFrom } from '@workbench/data';

describe('campus recruit migrations', () => {
  it('creates both owned tables and enforces round sequence uniqueness', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');

    const names = db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'campus_recruit_%'
      ORDER BY name
    `);
    expect(names.map((row) => row.name)).toEqual([
      'campus_recruit_applications',
      'campus_recruit_rounds',
    ]);

    sqlite.close();
  });
});
```

Add these two tests to the same `describe`:

```ts
it('enforces sequence uniqueness per application', () => {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/campus-recruit/migrations');
  db.run(sql`
    INSERT INTO campus_recruit_applications (id, company, position)
    VALUES ('a1', '星云科技', '固件工程师')
  `);
  db.run(sql`
    INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
    VALUES ('r1', 'a1', 1, 'technical', '一面')
  `);
  expect(() =>
    db.run(sql`
      INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
      VALUES ('r2', 'a1', 1, 'hr', 'HR 面')
    `),
  ).toThrow();
  sqlite.close();
});

it('keeps foreign keys pointing from module tables to application and core Item', () => {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/campus-recruit/migrations');
  const roundTargets = db.all<{ table: string }>(
    sql`PRAGMA foreign_key_list('campus_recruit_rounds')`,
  );
  const applicationTargets = db.all<{ table: string }>(
    sql`PRAGMA foreign_key_list('campus_recruit_applications')`,
  );
  expect(roundTargets.map((row) => row.table).sort()).toEqual([
    'campus_recruit_applications',
    'items',
  ]);
  expect(applicationTargets.map((row) => row.table)).toEqual(['items']);
  sqlite.close();
});
```

- [ ] **Step 9: Run the scaffold checks**

Run:

```bash
npx vitest run packages/core/src/eslint.boundaries.test.ts modules/campus-recruit/src/contract.test.ts modules/campus-recruit/src/storage/sqlite-repository.test.ts
npm run typecheck
npm run lint
```

Expected: all pass; no module production file outside `src/storage` can import a database library.

- [ ] **Step 10: Commit**

```bash
git add eslint.config.js packages/core/src/eslint.boundaries.test.ts tsconfig.json package-lock.json modules/campus-recruit
git commit -m "feat(campus): scaffold owned storage and contracts"
```

---

### Task 3: Implement the campus Repository and SQLite adapter

**Files:**

- Create: `modules/campus-recruit/src/server/repository.ts`
- Create: `modules/campus-recruit/src/storage/sqlite-repository.ts`
- Create: `modules/campus-recruit/src/testing/fixtures.ts`
- Modify: `modules/campus-recruit/src/storage/sqlite-repository.test.ts`

**Interfaces:**

- Consumes: Task 2 schema/migration and `better-sqlite3` connection supplied by composition.
- Produces: `CampusRecruitRepository` used by domain services and projection reconciliation, plus deterministic `applicationFixture()` and `roundFixture()` test records.

- [ ] **Step 1: Define storage-neutral records and Repository methods**

Create `src/server/repository.ts`:

```ts
import type {
  ApplicationOutcome,
  ApplicationPriority,
  RoundKind,
  RoundOutcome,
} from '../contract.js';

export interface ApplicationRecord {
  id: string;
  company: string;
  position: string;
  companyType: string | null;
  industry: string | null;
  city: string | null;
  channel: string | null;
  referral: string | null;
  priority: ApplicationPriority;
  applyDeadlineDate: string | null;
  appliedAt: string | null;
  outcome: ApplicationOutcome | null;
  outcomeAt: string | null;
  salary: string | null;
  link: string | null;
  notes: string | null;
  deadlineItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoundRecord {
  id: string;
  applicationId: string;
  sequence: number;
  kind: RoundKind;
  name: string;
  scheduledAt: string | null;
  format: string | null;
  durationMin: number | null;
  outcome: RoundOutcome;
  outcomeAt: string | null;
  notes: string | null;
  itemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationChanges = Partial<Omit<ApplicationRecord, 'id' | 'createdAt'>>;
export type RoundChanges = Partial<Omit<RoundRecord, 'id' | 'applicationId' | 'createdAt'>>;

export interface CampusRecruitRepository {
  listApplications(): Promise<ApplicationRecord[]>;
  getApplication(id: string): Promise<ApplicationRecord | null>;
  insertApplication(record: ApplicationRecord): Promise<void>;
  updateApplication(id: string, changes: ApplicationChanges): Promise<ApplicationRecord>;
  deleteApplication(id: string): Promise<boolean>;
  listRounds(applicationId?: string): Promise<RoundRecord[]>;
  getRound(id: string): Promise<RoundRecord | null>;
  insertRound(record: RoundRecord): Promise<void>;
  updateRound(id: string, changes: RoundChanges): Promise<RoundRecord>;
  resequenceRound(id: string, targetSequence: number, updatedAt: string): Promise<RoundRecord>;
  deleteRound(id: string): Promise<boolean>;
  nextRoundSequence(applicationId: string): Promise<number>;
  setDeadlineItemId(applicationId: string, itemId: string | null): Promise<void>;
  setRoundItemId(roundId: string, itemId: string | null): Promise<void>;
}
```

- [ ] **Step 2: Add failing CRUD and sequence tests**

Create `src/testing/fixtures.ts` so later test tasks use the same complete records:

```ts
import type { ApplicationRecord, RoundRecord } from '../server/repository.js';

const CREATED = '2026-08-17T00:00:00.000Z';

export function applicationFixture(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'app-1',
    company: '星云科技',
    position: '固件工程师',
    companyType: null,
    industry: null,
    city: null,
    channel: null,
    referral: null,
    priority: 'B',
    applyDeadlineDate: null,
    appliedAt: '2026-08-17T01:00:00.000Z',
    outcome: null,
    outcomeAt: null,
    salary: null,
    link: null,
    notes: null,
    deadlineItemId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function roundFixture(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: 'round-1',
    applicationId: 'app-1',
    sequence: 1,
    kind: 'technical',
    name: '一面',
    scheduledAt: null,
    format: null,
    durationMin: null,
    outcome: 'pending',
    outcomeAt: null,
    notes: null,
    itemId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}
```

Add a `makeRepository()` helper in the adapter test that opens a test database, runs module migrations, constructs `SqliteCampusRecruitRepository(sqlite)` and `SqliteItemRepository(db)`, and returns `{ repo, items, sqlite }`. Test these exact behaviors:

```ts
it('round-trips an application and its rounds', async () => {
  const { repo } = makeRepository();
  const app = applicationFixture({ id: 'app-1' });
  const round = roundFixture({ id: 'round-1', applicationId: app.id, sequence: 1 });
  await repo.insertApplication(app);
  await repo.insertRound(round);

  expect(await repo.getApplication(app.id)).toEqual(app);
  expect(await repo.listRounds(app.id)).toEqual([round]);
});

it('allocates max sequence plus one per application', async () => {
  const { repo } = makeRepository();
  await repo.insertApplication(applicationFixture({ id: 'app-1' }));
  await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 2 }));
  expect(await repo.nextRoundSequence('app-1')).toBe(3);
});

it('resequence swaps with an occupied sequence atomically', async () => {
  const { repo } = makeRepository();
  await repo.insertApplication(applicationFixture({ id: 'app-1' }));
  await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 1 }));
  await repo.insertRound(roundFixture({ id: 'r2', applicationId: 'app-1', sequence: 2 }));
  await repo.resequenceRound('r2', 1, '2026-09-21T00:00:00.000Z');
  expect((await repo.listRounds('app-1')).map((round) => [round.id, round.sequence])).toEqual([
    ['r2', 1],
    ['r1', 2],
  ]);
});

it('deleting an application cascades its rounds', async () => {
  const { repo } = makeRepository();
  await repo.insertApplication(applicationFixture({ id: 'app-1' }));
  await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 1 }));
  expect(await repo.deleteApplication('app-1')).toBe(true);
  expect(await repo.listRounds('app-1')).toEqual([]);
});
```

Add these assertions as a fourth test:

```ts
it('updates records and projection links; missing deletion returns false', async () => {
  const { repo, items } = makeRepository();
  await repo.insertApplication(applicationFixture({ id: 'app-1' }));
  await repo.insertRound(roundFixture({ id: 'round-1', applicationId: 'app-1', sequence: 1 }));

  expect(
    await repo.updateApplication('app-1', { city: '上海', updatedAt: '2026-09-21T00:00:00.000Z' }),
  ).toMatchObject({ city: '上海' });
  expect(
    await repo.updateRound('round-1', { name: '技术一面', updatedAt: '2026-09-21T00:00:00.000Z' }),
  ).toMatchObject({ name: '技术一面' });

  const deadlineItem = await items.create('campus-recruit', { kind: 'task', title: '截止' });
  const roundItem = await items.create('campus-recruit', { kind: 'event', title: '一面' });
  await repo.setDeadlineItemId('app-1', deadlineItem.id);
  await repo.setRoundItemId('round-1', roundItem.id);
  expect(await repo.getApplication('app-1')).toMatchObject({ deadlineItemId: deadlineItem.id });
  expect(await repo.getRound('round-1')).toMatchObject({ itemId: roundItem.id });
  expect(await repo.deleteRound('missing')).toBe(false);
  expect(await repo.deleteApplication('missing')).toBe(false);
});
```

- [ ] **Step 3: Run the adapter test and verify it fails**

Run: `npx vitest run modules/campus-recruit/src/storage/sqlite-repository.test.ts`

Expected: FAIL because `SqliteCampusRecruitRepository` does not exist.

- [ ] **Step 4: Implement the adapter mechanically**

Create `src/storage/sqlite-repository.ts`. Construct a schema-scoped Drizzle handle from the injected connection:

```ts
import type Database from 'better-sqlite3';
import { and, asc, eq, max } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  ApplicationChanges,
  ApplicationRecord,
  CampusRecruitRepository,
  RoundChanges,
  RoundRecord,
} from '../server/repository.js';
import * as schema from './schema.js';
import { campusRecruitApplications, campusRecruitRounds } from './schema.js';

export class SqliteCampusRecruitRepository implements CampusRecruitRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(sqlite: Database.Database) {
    this.db = drizzle(sqlite, { schema });
  }

  async listApplications(): Promise<ApplicationRecord[]> {
    return this.db
      .select()
      .from(campusRecruitApplications)
      .orderBy(asc(campusRecruitApplications.createdAt))
      .all();
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    return (
      this.db
        .select()
        .from(campusRecruitApplications)
        .where(eq(campusRecruitApplications.id, id))
        .get() ?? null
    );
  }

  async insertApplication(record: ApplicationRecord): Promise<void> {
    this.db.insert(campusRecruitApplications).values(record).run();
  }

  async updateApplication(id: string, changes: ApplicationChanges): Promise<ApplicationRecord> {
    const row = this.db
      .update(campusRecruitApplications)
      .set(changes)
      .where(eq(campusRecruitApplications.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`投递不存在：${id}`);
    return row;
  }

  async deleteApplication(id: string): Promise<boolean> {
    return (
      this.db
        .delete(campusRecruitApplications)
        .where(eq(campusRecruitApplications.id, id))
        .returning({ id: campusRecruitApplications.id })
        .get() !== undefined
    );
  }

  async listRounds(applicationId?: string): Promise<RoundRecord[]> {
    if (applicationId === undefined) {
      return this.db
        .select()
        .from(campusRecruitRounds)
        .orderBy(asc(campusRecruitRounds.applicationId), asc(campusRecruitRounds.sequence))
        .all();
    }
    return this.db
      .select()
      .from(campusRecruitRounds)
      .where(eq(campusRecruitRounds.applicationId, applicationId))
      .orderBy(asc(campusRecruitRounds.sequence))
      .all();
  }

  async getRound(id: string): Promise<RoundRecord | null> {
    return (
      this.db.select().from(campusRecruitRounds).where(eq(campusRecruitRounds.id, id)).get() ?? null
    );
  }

  async insertRound(record: RoundRecord): Promise<void> {
    this.db.insert(campusRecruitRounds).values(record).run();
  }

  async updateRound(id: string, changes: RoundChanges): Promise<RoundRecord> {
    const row = this.db
      .update(campusRecruitRounds)
      .set(changes)
      .where(eq(campusRecruitRounds.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`轮次不存在：${id}`);
    return row;
  }

  async deleteRound(id: string): Promise<boolean> {
    return (
      this.db
        .delete(campusRecruitRounds)
        .where(eq(campusRecruitRounds.id, id))
        .returning({ id: campusRecruitRounds.id })
        .get() !== undefined
    );
  }

  async resequenceRound(
    id: string,
    targetSequence: number,
    updatedAt: string,
  ): Promise<RoundRecord> {
    return this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(campusRecruitRounds)
        .where(eq(campusRecruitRounds.id, id))
        .get();
      if (current === undefined) throw new Error(`轮次不存在：${id}`);
      if (current.sequence === targetSequence) return current;

      const occupied = tx
        .select()
        .from(campusRecruitRounds)
        .where(
          and(
            eq(campusRecruitRounds.applicationId, current.applicationId),
            eq(campusRecruitRounds.sequence, targetSequence),
          ),
        )
        .get();

      if (occupied !== undefined) {
        const temporary =
          (tx
            .select({ value: max(campusRecruitRounds.sequence) })
            .from(campusRecruitRounds)
            .where(eq(campusRecruitRounds.applicationId, current.applicationId))
            .get()?.value ?? 0) + 1;
        tx.update(campusRecruitRounds)
          .set({ sequence: temporary, updatedAt })
          .where(eq(campusRecruitRounds.id, occupied.id))
          .run();
      }

      const moved = tx
        .update(campusRecruitRounds)
        .set({ sequence: targetSequence, updatedAt })
        .where(eq(campusRecruitRounds.id, current.id))
        .returning()
        .get()!;

      if (occupied !== undefined) {
        tx.update(campusRecruitRounds)
          .set({ sequence: current.sequence, updatedAt })
          .where(eq(campusRecruitRounds.id, occupied.id))
          .run();
      }
      return moved;
    });
  }

  async nextRoundSequence(applicationId: string): Promise<number> {
    const row = this.db
      .select({ value: max(campusRecruitRounds.sequence) })
      .from(campusRecruitRounds)
      .where(eq(campusRecruitRounds.applicationId, applicationId))
      .get();
    return (row?.value ?? 0) + 1;
  }

  async setDeadlineItemId(applicationId: string, itemId: string | null): Promise<void> {
    const row = this.db
      .update(campusRecruitApplications)
      .set({ deadlineItemId: itemId })
      .where(eq(campusRecruitApplications.id, applicationId))
      .returning({ id: campusRecruitApplications.id })
      .get();
    if (row === undefined) throw new Error(`投递不存在：${applicationId}`);
  }

  async setRoundItemId(roundId: string, itemId: string | null): Promise<void> {
    const row = this.db
      .update(campusRecruitRounds)
      .set({ itemId })
      .where(eq(campusRecruitRounds.id, roundId))
      .returning({ id: campusRecruitRounds.id })
      .get();
    if (row === undefined) throw new Error(`轮次不存在：${roundId}`);
  }
}
```

- [ ] **Step 5: Run adapter, type, and lint checks**

Run:

```bash
npx vitest run modules/campus-recruit/src/storage/sqlite-repository.test.ts
npm run typecheck
npm run lint
```

Expected: PASS. Production imports of Drizzle/better-sqlite3 occur only under `src/storage`.

- [ ] **Step 6: Commit**

```bash
git add modules/campus-recruit/src/server/repository.ts modules/campus-recruit/src/storage modules/campus-recruit/src/testing/fixtures.ts
git commit -m "feat(campus): add application repository"
```

---

### Task 4: Implement derived status and funnel statistics as pure functions

**Files:**

- Create: `modules/campus-recruit/src/server/domain.ts`
- Create: `modules/campus-recruit/src/server/domain.test.ts`
- Create: `modules/campus-recruit/src/server/stats.ts`
- Create: `modules/campus-recruit/src/server/stats.test.ts`

**Interfaces:**

- Consumes: `ApplicationRecord`, `RoundRecord`, Task 3 fixtures, spec status precedence, `SHELVED_DAYS = 90`.
- Produces: `deriveApplicationStatus()`, `priorityToImportance()`, and `computeStats()` for Tasks 5–9.

- [ ] **Step 1: Write status-precedence and boundary tests**

Import the Task 3 fixtures and use a fixed `NOW = '2026-11-30T00:00:00.000Z'`. Add the precedence table:

```ts
it.each([
  ['offer', applicationFixture({ outcome: 'offer' }), [], 'offer'],
  ['oc', applicationFixture({ outcome: 'oc' }), [], 'oc'],
  ['declined', applicationFixture({ outcome: 'declined' }), [], 'declined'],
  ['rejected', applicationFixture({ outcome: 'rejected' }), [], 'failed'],
  ['pending', applicationFixture({ appliedAt: null }), [], 'pending'],
  ['applied', applicationFixture({ appliedAt: '2026-11-01T00:00:00.000Z' }), [], 'applied'],
])('%s status', (_name, application, rounds, expected) => {
  expect(deriveApplicationStatus(application, rounds, NOW).code).toBe(expected);
});

it('offer wins over a failed round', () => {
  const status = deriveApplicationStatus(
    applicationFixture({ outcome: 'offer' }),
    [roundFixture({ outcome: 'failed', name: '一面' })],
    NOW,
  );
  expect(status.code).toBe('offer');
});

it('uses the highest sequence as the latest round even when it has no schedule', () => {
  const status = deriveApplicationStatus(
    applicationFixture(),
    [
      roundFixture({ id: 'r1', sequence: 1, name: '一面', scheduledAt: NOW }),
      roundFixture({ id: 'r2', sequence: 2, name: '二面', scheduledAt: null }),
    ],
    NOW,
  );
  expect(status).toMatchObject({ code: 'in_progress', label: '流程中 · 二面' });
});
```

Add the remaining boundary and mapping cases explicitly:

```ts
it('derives failed round name', () => {
  expect(
    deriveApplicationStatus(
      applicationFixture(),
      [roundFixture({ outcome: 'failed', name: '技术一面' })],
      NOW,
    ),
  ).toEqual({ code: 'failed', label: '已挂 · 技术一面', failedRoundName: '技术一面' });
});

it('shelves only after strictly more than 90 days', () => {
  const exactly = applicationFixture({ appliedAt: '2026-09-01T00:00:00.000Z' });
  expect(deriveApplicationStatus(exactly, [], '2026-11-30T00:00:00.000Z').code).toBe('applied');
  expect(deriveApplicationStatus(exactly, [], '2026-11-30T00:00:00.001Z').code).toBe('shelved');
});

it('an unscheduled round prevents shelving', () => {
  const old = applicationFixture({ appliedAt: '2026-01-01T00:00:00.000Z' });
  expect(deriveApplicationStatus(old, [roundFixture({ scheduledAt: null })], NOW).code).toBe(
    'in_progress',
  );
});

it.each([
  ['S', 'high'],
  ['A', 'high'],
  ['B', 'normal'],
  ['C', 'low'],
] as const)('maps %s priority to %s importance', (priority, expected) => {
  expect(priorityToImportance(priority)).toBe(expected);
});
```

- [ ] **Step 2: Run status tests and verify they fail**

Run: `npx vitest run modules/campus-recruit/src/server/domain.test.ts`

Expected: FAIL because `domain.ts` does not exist.

- [ ] **Step 3: Implement status derivation with explicit precedence**

Create `domain.ts`:

```ts
import type { Importance } from '@workbench/core';
import type { ApplicationPriority, ApplicationStatusCode } from '../contract.js';
import type { ApplicationRecord, RoundRecord } from './repository.js';

export const SHELVED_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DerivedApplicationStatus {
  code: ApplicationStatusCode;
  label: string;
  failedRoundName: string | null;
}

export function priorityToImportance(priority: ApplicationPriority): Importance {
  if (priority === 'S' || priority === 'A') return 'high';
  if (priority === 'B') return 'normal';
  return 'low';
}

export function deriveApplicationStatus(
  application: ApplicationRecord,
  rounds: RoundRecord[],
  now: string,
): DerivedApplicationStatus {
  if (application.outcome === 'offer')
    return { code: 'offer', label: 'Offer', failedRoundName: null };
  if (application.outcome === 'oc') return { code: 'oc', label: 'OC', failedRoundName: null };
  if (application.outcome === 'declined')
    return { code: 'declined', label: '我拒了', failedRoundName: null };

  const failedRound = [...rounds]
    .filter((round) => round.outcome === 'failed')
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (application.outcome === 'rejected' || failedRound !== undefined) {
    return {
      code: 'failed',
      label: failedRound === undefined ? '已挂' : `已挂 · ${failedRound.name}`,
      failedRoundName: failedRound?.name ?? null,
    };
  }

  if (application.appliedAt === null)
    return { code: 'pending', label: '待投递', failedRoundName: null };
  if (
    rounds.length === 0 &&
    Date.parse(now) - Date.parse(application.appliedAt) > SHELVED_DAYS * DAY_MS
  ) {
    return { code: 'shelved', label: '泡池子', failedRoundName: null };
  }
  if (rounds.length === 0) return { code: 'applied', label: '已投递', failedRoundName: null };

  const latest = [...rounds].sort((a, b) => b.sequence - a.sequence)[0]!;
  return { code: 'in_progress', label: `流程中 · ${latest.name}`, failedRoundName: null };
}
```

- [ ] **Step 4: Write failing statistics tests**

Cover the three denominators, zero-denominator `null`, unique-application counting, and failed-round distribution:

```ts
it('computes funnel rates using applications, not number of rounds', () => {
  const apps = [
    applicationFixture({ id: 'a1', appliedAt: NOW, outcome: 'offer' }),
    applicationFixture({ id: 'a2', appliedAt: NOW }),
  ];
  const rounds = [
    roundFixture({ id: 'r1', applicationId: 'a1', kind: 'technical' }),
    roundFixture({ id: 'r2', applicationId: 'a1', kind: 'technical', sequence: 2 }),
    roundFixture({ id: 'r3', applicationId: 'a2', kind: 'assessment' }),
  ];
  const stats = computeStats(apps, rounds, NOW);
  expect(stats.technical).toBe(1);
  expect(stats.rates.applicationToTechnical).toBe(0.5);
  expect(stats.rates.technicalToOffer).toBe(1);
});

it('returns null rather than zero or NaN for an empty denominator', () => {
  const stats = computeStats([], [], NOW);
  expect(stats.rates).toEqual({
    applicationToAssessment: null,
    applicationToTechnical: null,
    technicalToOffer: null,
  });
});
```

- [ ] **Step 5: Implement `computeStats()`**

Create `stats.ts`:

```ts
import { ROUND_KINDS, type RoundKind, type StatsResponse } from '../contract.js';
import { deriveApplicationStatus } from './domain.js';
import type { ApplicationRecord, RoundRecord } from './repository.js';

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function computeStats(
  applications: ApplicationRecord[],
  rounds: RoundRecord[],
  now: string,
): StatsResponse {
  const assessmentIds = new Set(
    rounds
      .filter((round) => round.kind === 'assessment' || round.kind === 'written')
      .map((round) => round.applicationId),
  );
  const technicalIds = new Set(
    rounds.filter((round) => round.kind === 'technical').map((round) => round.applicationId),
  );
  const hrIds = new Set(
    rounds.filter((round) => round.kind === 'hr').map((round) => round.applicationId),
  );
  const roundsByApplication = new Map<string, RoundRecord[]>();
  for (const round of rounds) {
    const list = roundsByApplication.get(round.applicationId) ?? [];
    list.push(round);
    roundsByApplication.set(round.applicationId, list);
  }
  const statuses = applications.map((application) =>
    deriveApplicationStatus(application, roundsByApplication.get(application.id) ?? [], now),
  );
  const applied = applications.filter((application) => application.appliedAt !== null).length;
  const offers = statuses.filter(
    (status) => status.code === 'offer' || status.code === 'oc',
  ).length;

  const failedCounts = new Map<RoundKind, number>();
  for (const round of rounds) {
    if (round.outcome === 'failed') {
      failedCounts.set(round.kind, (failedCounts.get(round.kind) ?? 0) + 1);
    }
  }

  return {
    total: applications.length,
    pending: statuses.filter((status) => status.code === 'pending').length,
    applied,
    assessment: assessmentIds.size,
    technical: technicalIds.size,
    hr: hrIds.size,
    offers,
    failed: statuses.filter((status) => status.code === 'failed').length,
    shelved: statuses.filter((status) => status.code === 'shelved').length,
    rates: {
      applicationToAssessment: ratio(assessmentIds.size, applied),
      applicationToTechnical: ratio(technicalIds.size, applied),
      technicalToOffer: ratio(offers, technicalIds.size),
    },
    failedByKind: ROUND_KINDS.flatMap((kind) => {
      const count = failedCounts.get(kind) ?? 0;
      return count === 0 ? [] : [{ kind, count }];
    }),
  };
}
```

The distribution counts each failed round because the metric is “挂在哪一轮的分布”.

- [ ] **Step 6: Run pure logic tests**

Run:

```bash
npx vitest run modules/campus-recruit/src/server/domain.test.ts modules/campus-recruit/src/server/stats.test.ts
npm run typecheck
```

Expected: PASS, including status precedence and 90-day boundary.

- [ ] **Step 7: Commit**

```bash
git add modules/campus-recruit/src/contract.ts modules/campus-recruit/src/server/domain.ts modules/campus-recruit/src/server/domain.test.ts modules/campus-recruit/src/server/stats.ts modules/campus-recruit/src/server/stats.test.ts
git commit -m "feat(campus): derive application status and funnel stats"
```

---

### Task 5: Build idempotent Item projection reconciliation

**Files:**

- Create: `modules/campus-recruit/src/server/projections.ts`
- Create: `modules/campus-recruit/src/server/projections.test.ts`
- Create: `modules/campus-recruit/src/testing/harness.ts`

**Interfaces:**

- Consumes: `ModuleContext.items`, `CampusRecruitRepository`, Task 1 scoped deletion, Task 4 priority/status rules.
- Produces: `reconcileApplicationProjections()` and `reconcileAllProjections()` for service mutations and startup recovery, plus `makeCampusHarness()` for later integration tests.

- [ ] **Step 1: Write the real-database projection harness**

Create `src/testing/harness.ts`. It must use one `:memory:` SQLite connection for core and module storage:

```ts
export function makeCampusHarness() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/campus-recruit/migrations');
  const repo = new SqliteCampusRecruitRepository(sqlite);
  const items = new SqliteItemRepository(db);
  const ctx: ModuleContext = { moduleId: CAMPUS_RECRUIT_MODULE_ID, items };
  return { db, sqlite, repo, items, ctx };
}
```

In `projections.test.ts`, use:

```ts
const NOW = '2026-09-20T02:00:00.000Z';
const SH = 'Asia/Shanghai';
```

- [ ] **Step 2: Add failing deadline/idempotence tests**

```ts
it('creates one deadline task and remains idempotent', async () => {
  const h = makeCampusHarness();
  await h.repo.insertApplication(
    applicationFixture({
      id: 'a1',
      priority: 'S',
      applyDeadlineDate: '2026-09-20',
      appliedAt: null,
    }),
  );

  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

  const projected = await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] });
  expect(projected).toHaveLength(1);
  expect(projected[0]).toMatchObject({
    kind: 'task',
    title: '投递 星云科技 固件工程师',
    importance: 'high',
    dueAt: '2026-09-20T15:59:59.999Z',
    scheduled: { kind: 'all-day', date: '2026-09-20' },
    status: 'todo',
  });
  expect((await h.repo.getApplication('a1'))!.deadlineItemId).toBe(projected[0]!.id);
});

it('marks an existing deadline task done after application', async () => {
  const h = makeCampusHarness();
  await h.repo.insertApplication(
    applicationFixture({ id: 'a1', applyDeadlineDate: '2026-09-20', appliedAt: null }),
  );
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  await h.repo.updateApplication('a1', { appliedAt: NOW, updatedAt: NOW });
  await reconcileApplicationProjections(h.ctx, h.repo, 'a1', NOW, SH);
  const app = (await h.repo.getApplication('a1'))!;
  expect(await h.items.getById(app.deadlineItemId!)).toMatchObject({
    status: 'done',
    completedAt: NOW,
  });
});
```

- [ ] **Step 3: Add failing recovery and ownership tests**

Add recovery and ownership cases:

```ts
it('replaces a missing linked Item without leaving a duplicate', async () => {
  const h = makeCampusHarness();
  await h.repo.insertApplication(
    applicationFixture({ id: 'a1', applyDeadlineDate: '2026-09-20', appliedAt: null }),
  );
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  const oldId = (await h.repo.getApplication('a1'))!.deadlineItemId!;
  await h.items.delete(CAMPUS_RECRUIT_MODULE_ID, oldId);

  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  const newId = (await h.repo.getApplication('a1'))!.deadlineItemId!;
  expect(newId).not.toBe(oldId);
  expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
});

it('deletes unreferenced campus Items', async () => {
  const h = makeCampusHarness();
  const orphan = await h.items.create(CAMPUS_RECRUIT_MODULE_ID, {
    kind: 'task',
    title: '孤儿投影',
  });
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  expect(await h.items.getById(orphan.id)).toBeNull();
});

it('never updates or deletes a todo Item stored in a bad module link', async () => {
  const h = makeCampusHarness();
  const todo = await h.items.create('todo', { kind: 'task', title: 'todo 原文' });
  await h.repo.insertApplication(
    applicationFixture({
      id: 'a1',
      applyDeadlineDate: '2026-09-20',
      appliedAt: null,
      deadlineItemId: todo.id,
    }),
  );
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  expect(await h.items.getById(todo.id)).toMatchObject({
    title: 'todo 原文',
    sourceModule: 'todo',
  });
  expect((await h.repo.getApplication('a1'))!.deadlineItemId).not.toBe(todo.id);
});
```

Add one table-driven round-status test with these rows:

```ts
it.each([
  ['failed round itself', 'failed', 1, '2026-09-21T02:00:00.000Z', 'done'],
  ['later future round', 'pending', 2, '2026-09-22T02:00:00.000Z', 'cancelled'],
  ['later past round', 'pending', 2, '2026-09-19T02:00:00.000Z', 'todo'],
] as const)(
  '%s outcome=%s sequence=%i schedule=%s -> %s',
  async (_name, outcome, sequence, scheduledAt, expected) => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(applicationFixture({ id: 'a1', appliedAt: NOW }));
    if (sequence > 1) {
      await h.repo.insertRound(
        roundFixture({
          id: 'failed-first',
          applicationId: 'a1',
          sequence: 1,
          outcome: 'failed',
          outcomeAt: NOW,
          scheduledAt: '2026-09-20T01:00:00.000Z',
        }),
      );
    }
    await h.repo.insertRound(
      roundFixture({ id: 'target', applicationId: 'a1', sequence, outcome, scheduledAt }),
    );
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    const target = (await h.repo.getRound('target'))!;
    expect(await h.items.getById(target.itemId!)).toMatchObject({ status: expected });
  },
);

it('declined application cancels every future pending round', async () => {
  const h = makeCampusHarness();
  await h.repo.insertApplication(
    applicationFixture({ id: 'a1', appliedAt: NOW, outcome: 'declined', outcomeAt: NOW }),
  );
  await h.repo.insertRound(
    roundFixture({ id: 'r1', applicationId: 'a1', scheduledAt: '2026-09-22T02:00:00.000Z' }),
  );
  await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
  const round = (await h.repo.getRound('r1'))!;
  expect(await h.items.getById(round.itemId!)).toMatchObject({ status: 'cancelled' });
});
```

- [ ] **Step 4: Run projection tests and verify they fail**

Run: `npx vitest run modules/campus-recruit/src/server/projections.test.ts`

Expected: FAIL because reconciliation functions do not exist.

- [ ] **Step 5: Implement desired projection calculation and guarded updates**

Create `projections.ts` with these exports:

```ts
import { endOfLocalDayUtc, type Item, type ModuleContext } from '@workbench/core';

export async function reconcileApplicationProjections(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  applicationId: string,
  now: string,
  zone: string,
): Promise<void>;

export async function reconcileAllProjections(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  now: string,
  zone: string,
): Promise<void>;
```

Use a helper that resolves a stored Item ID without crossing ownership:

```ts
async function ownedItem(ctx: ModuleContext, id: string | null): Promise<Item | null> {
  if (id === null) return null;
  const item = await ctx.items.getById(id);
  return item?.sourceModule === ctx.moduleId ? item : null;
}
```

For the deadline projection, it is desired when `applyDeadlineDate !== null` and either the application is not applied or it already has a deadline link. Create with:

```ts
{
  kind: 'task',
  title: `投递 ${application.company} ${application.position}`,
  importance: priorityToImportance(application.priority),
  dueAt: endOfLocalDayUtc(application.applyDeadlineDate, zone),
  scheduled: { kind: 'all-day', date: application.applyDeadlineDate },
  status: application.appliedAt === null ? 'todo' : 'done',
}
```

For each round with `scheduledAt !== null`, create an event. Compute the optional end using `durationMin`:

```ts
const end =
  round.durationMin === null
    ? undefined
    : new Date(Date.parse(round.scheduledAt) + round.durationMin * 60_000).toISOString();

const scheduled =
  end === undefined
    ? { kind: 'timed' as const, start: round.scheduledAt }
    : { kind: 'timed' as const, start: round.scheduledAt, end };
```

The desired `completedAt` is `application.appliedAt` for a completed deadline and
`round.outcomeAt ?? now` for a passed/failed round. `CreateItemInput` has no `completedAt`, so after
creating a projection whose desired completion time is non-null, immediately apply one guarded update:

```ts
const created = await ctx.items.create(ctx.moduleId, createInput);
if (desiredCompletedAt !== null) {
  await ctx.items.update(created.id, { completedAt: desiredCompletedAt });
}
```

Store the created ID only after both calls succeed. If the process exits between create and link write,
full reconciliation removes the unreferenced Item and creates one linked replacement.

Status calculation must use this exact order:

```ts
if (round.outcome === 'passed' || round.outcome === 'failed') return 'done';
const isFuture = Date.parse(round.scheduledAt) > Date.parse(now);
const failedBefore = rounds.some(
  (candidate) => candidate.outcome === 'failed' && candidate.sequence < round.sequence,
);
if (
  isFuture &&
  (application.outcome === 'rejected' || application.outcome === 'declined' || failedBefore)
) {
  return 'cancelled';
}
return 'todo';
```

Before calling `ctx.items.update()`, compare title, importance, dueAt, scheduled, status, and completedAt. Skip the update if every field already matches; this keeps a second reconciliation from changing `updatedAt`. If the stored ID belongs to another module, clear the module link and create a new owned Item without touching the foreign Item.

- [ ] **Step 6: Implement orphan cleanup in full reconciliation**

After reconciling every application, reload applications and rounds so newly written Item IDs are visible. Build a referenced-ID set from `deadlineItemId` and `itemId`, then:

```ts
const owned = await ctx.items.list({ sourceModules: [ctx.moduleId] });
for (const item of owned) {
  if (!referencedIds.has(item.id)) {
    await ctx.items.delete(ctx.moduleId, item.id);
  }
}
```

When a projection is no longer desired (deadline removed, round schedule cleared), delete only an owned Item with `ctx.items.delete(ctx.moduleId, id)` and clear the stored link.

- [ ] **Step 7: Run projection and Repository tests**

Run:

```bash
npx vitest run modules/campus-recruit/src/server/projections.test.ts modules/campus-recruit/src/storage/sqlite-repository.test.ts packages/data/src/item-repository.test.ts
npm run typecheck
```

Expected: PASS. Two full reconciliation calls leave the same Item count and the same Item `updatedAt` values.

- [ ] **Step 8: Commit**

```bash
git add modules/campus-recruit/src/server/projections.ts modules/campus-recruit/src/server/projections.test.ts modules/campus-recruit/src/testing/harness.ts
git commit -m "feat(campus): reconcile item projections"
```

---

### Task 6: Implement application/round services and the HTTP API

**Files:**

- Create: `modules/campus-recruit/src/server/service.ts`
- Create: `modules/campus-recruit/src/server/service.test.ts`
- Create: `modules/campus-recruit/src/server/routes.ts`
- Create: `modules/campus-recruit/src/server/routes.test.ts`
- Create: `modules/campus-recruit/src/server/index.ts`

**Interfaces:**

- Consumes: Tasks 2–5 contracts, Repository, pure domain functions, and projection reconciliation.
- Produces: all campus use cases, nine HTTP endpoints, and `createCampusRecruitServerModule(repository)`.

- [ ] **Step 1: Define service options, not-found error, and public use cases**

Start `service.ts` with:

```ts
import { randomUUID } from 'node:crypto';
import { nowIso, type IsoInstant, type ModuleContext } from '@workbench/core';
import type {
  ApplicationView,
  CreateApplicationData,
  CreateRoundData,
  StatsResponse,
  UpdateApplicationInput,
  UpdateRoundInput,
} from '../contract.js';
import { deriveApplicationStatus } from './domain.js';
import { reconcileAllProjections, reconcileApplicationProjections } from './projections.js';
import type { ApplicationRecord, CampusRecruitRepository, RoundRecord } from './repository.js';
import { computeStats } from './stats.js';

export interface CampusServiceOptions {
  zone: string;
  now?: IsoInstant;
}

export class CampusNotFoundError extends Error {}

function resolveNow(opts: CampusServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

export async function listApplications(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<{ applications: ApplicationView[] }>;

export async function createApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  input: CreateApplicationData,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function updateApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  input: UpdateApplicationInput,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function markApplicationApplied(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function deleteApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<void>;

export async function createRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  applicationId: string,
  input: CreateRoundData,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function updateRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  input: UpdateRoundInput,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function deleteRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<ApplicationView>;

export async function getStats(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<StatsResponse>;
```

- [ ] **Step 2: Write failing service tests for the application lifecycle**

Import and use Task 5's `makeCampusHarness()`. Define deterministic parsed inputs at the top of the test:

```ts
const NOW = '2026-09-20T02:00:00.000Z';
const OPTS = { zone: 'Asia/Shanghai', now: NOW } as const;

function pendingApplicationInput() {
  return createApplicationInputSchema.parse({
    company: '星云科技',
    position: '固件工程师',
    priority: 'S',
    applyDeadlineDate: '2026-09-20',
  });
}

function appliedApplicationInput() {
  return createApplicationInputSchema.parse({
    ...pendingApplicationInput(),
    appliedAt: NOW,
  });
}

function roundInput(overrides: Partial<CreateRoundData> = {}): CreateRoundData {
  return createRoundInputSchema.parse({
    kind: 'technical',
    name: '一面',
    scheduledAt: '2026-09-21T02:00:00.000Z',
    durationMin: 60,
    ...overrides,
  });
}
```

Then test:

```ts
it('creates an application, converts deadline date in the configured zone, and projects it', async () => {
  const h = makeCampusHarness();
  const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), {
    zone: 'Asia/Shanghai',
    now: NOW,
  });
  expect(created.applyDeadlineDate).toBe('2026-09-20');
  const projected = await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] });
  expect(projected[0]).toMatchObject({
    dueAt: '2026-09-20T15:59:59.999Z',
    scheduled: { kind: 'all-day', date: '2026-09-20' },
  });
  expect(created.status.code).toBe('pending');
  expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
});

it('marking applied completes the deadline projection', async () => {
  const h = makeCampusHarness();
  const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
  const applied = await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);
  expect(applied.appliedAt).toBe(NOW);
  expect(applied.status.code).toBe('applied');
  const stored = (await h.repo.getApplication(created.id))!;
  expect(await h.items.getById(stored.deadlineItemId!)).toMatchObject({ status: 'done' });
});
```

Add outcome, deletion, and missing-record cases:

```ts
it('setting a terminal outcome marks an un-applied record as applied', async () => {
  const h = makeCampusHarness();
  const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
  const rejected = await updateApplication(
    h.ctx,
    h.repo,
    created.id,
    { outcome: 'rejected' },
    OPTS,
  );
  expect(rejected).toMatchObject({ appliedAt: NOW, outcome: 'rejected', outcomeAt: NOW });
  expect(rejected.status.code).toBe('failed');
});

it('deleting an application removes every linked Item', async () => {
  const h = makeCampusHarness();
  const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
  await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
  await deleteApplication(h.ctx, h.repo, app.id, OPTS);
  expect(await h.repo.getApplication(app.id)).toBeNull();
  expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toEqual([]);
});

it('throws CampusNotFoundError for a missing application', async () => {
  const h = makeCampusHarness();
  await expect(markApplicationApplied(h.ctx, h.repo, 'missing', OPTS)).rejects.toBeInstanceOf(
    CampusNotFoundError,
  );
});
```

- [ ] **Step 3: Write failing service tests for arbitrary rounds**

Test default sequence allocation (1, then 2), transactional sequence editing, schedule projection, passed/failed semantics, deletion, and automatic application marking:

```ts
it('failed round is done and cancels only later future rounds', async () => {
  const h = makeCampusHarness();
  const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
  const afterFirst = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);
  const first = afterFirst.rounds[0]!;
  const afterSecond = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '二面' }), OPTS);
  const second = afterSecond.rounds.find((round) => round.sequence === 2)!;

  await updateRound(h.ctx, h.repo, first.id, { outcome: 'failed' }, OPTS);

  expect(await h.items.getById(first.itemId!)).toMatchObject({ status: 'done' });
  expect(await h.items.getById(second.itemId!)).toMatchObject({ status: 'cancelled' });
});

it('creating the first round marks an un-applied application as applied', async () => {
  const h = makeCampusHarness();
  const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
  await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);
  expect(await h.repo.getApplication(app.id)).toMatchObject({ appliedAt: NOW });
});
```

- [ ] **Step 4: Run service tests and verify they fail**

Run: `npx vitest run modules/campus-recruit/src/server/service.test.ts`

Expected: FAIL because the service functions do not exist.

- [ ] **Step 5: Implement record construction and view assembly**

Create applications with a server-generated ID and timestamps. Convert date-only deadline values only in the service:

```ts
const now = resolveNow(opts);
const record: ApplicationRecord = {
  id: randomUUID(),
  company: input.company,
  position: input.position,
  companyType: input.companyType,
  industry: input.industry,
  city: input.city,
  channel: input.channel,
  referral: input.referral,
  priority: input.priority,
  applyDeadlineDate: input.applyDeadlineDate,
  appliedAt: input.appliedAt,
  outcome: input.outcome,
  outcomeAt: input.outcome === null ? null : now,
  salary: input.salary,
  link: input.link,
  notes: input.notes,
  deadlineItemId: null,
  createdAt: now,
  updatedAt: now,
};
```

If a created record already has a non-null outcome and `appliedAt` is null, store `appliedAt = now`. After insertion, call `reconcileApplicationProjections()` with `opts.zone`. For updates, include only keys present in the parsed patch; store `applyDeadlineDate` unchanged, set `outcomeAt = now` when a non-null outcome changes, clear `outcomeAt` when outcome becomes null, and set `appliedAt = now` when a non-null outcome is written to an un-applied record.

Build a view by loading rounds, sorting by `sequence`, and applying `deriveApplicationStatus(record, rounds, now)`. Sort the application list by priority rank `S=0, A=1, B=2, C=3`, then `updatedAt` descending, then company name.

- [ ] **Step 6: Implement round mutations and recoverable deletion order**

For create, load the parent application first. If `appliedAt` is null, update it to `now` before inserting the round; this also lets reconciliation complete the deadline task. Always use `await repo.nextRoundSequence(applicationId)` for the new round. Set `outcomeAt` when the initial outcome is not `pending`.

For update, remove `sequence` from the normal `RoundChanges` patch. If it is present and differs from the stored value, call `repo.resequenceRound(id, input.sequence, now)` first; the adapter swaps with an occupied sequence in one SQLite transaction. Apply the remaining fields with `updateRound()`, then reconcile the parent application so “latest round” and cancellation order use the new sequence immediately.

For application deletion:

```ts
const application = await requireApplication(repo, id);
const rounds = await repo.listRounds(id);
for (const itemId of [application.deadlineItemId, ...rounds.map((round) => round.itemId)]) {
  if (itemId !== null) await ctx.items.delete(ctx.moduleId, itemId);
}
await repo.deleteApplication(id);
await reconcileAllProjections(ctx, repo, now, opts.zone);
```

For round deletion, delete its owned Item first, delete the round, then reconcile the parent application. If storage deletion fails while the record still exists, reconciliation can recreate the projection from module truth.

- [ ] **Step 7: Define and test the HTTP routes**

Register exactly these endpoints in `routes.ts`:

| Method | Path                                  | Result                |
| ------ | ------------------------------------- | --------------------- |
| GET    | `/api/campus/applications`            | `{ applications }`    |
| POST   | `/api/campus/applications`            | `201 ApplicationView` |
| PATCH  | `/api/campus/applications/:id`        | `ApplicationView`     |
| POST   | `/api/campus/applications/:id/apply`  | `ApplicationView`     |
| DELETE | `/api/campus/applications/:id`        | `204`                 |
| POST   | `/api/campus/applications/:id/rounds` | `201 ApplicationView` |
| PATCH  | `/api/campus/rounds/:id`              | `ApplicationView`     |
| DELETE | `/api/campus/rounds/:id`              | `ApplicationView`     |
| GET    | `/api/campus/stats`                   | `StatsResponse`       |

Use `z.object({ id: z.string().min(1) })` for params. Invalid input returns `{ error }` with 400. Catch only `CampusNotFoundError` and return 404; let unexpected errors reach Fastify. Resolve the system zone once per request with `Intl.DateTimeFormat().resolvedOptions().timeZone`.

Route tests must assert: create returns 201; invalid company returns 400; missing application returns 404; apply has no body and returns 200; round creation returns its projection link; delete returns an empty 204 response; stats response parses with `statsResponseSchema`.

- [ ] **Step 8: Create the server module factory with startup reconciliation**

Create `server/index.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { nowIso, type ModuleContext, type ServerModuleDefinition } from '@workbench/core';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { reconcileAllProjections } from './projections.js';
import type { CampusRecruitRepository } from './repository.js';
import { registerCampusRecruitRoutes } from './routes.js';

export function createCampusRecruitServerModule(
  repository: CampusRecruitRepository,
): ServerModuleDefinition {
  return {
    id: CAMPUS_RECRUIT_MODULE_ID,
    migrations: [{ folder: 'modules/campus-recruit/migrations' }],
    async registerRoutes(app: unknown, ctx: ModuleContext) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await reconcileAllProjections(ctx, repository, nowIso(), zone);
      registerCampusRecruitRoutes(app as FastifyInstance, ctx, repository);
    },
  };
}

export type { CampusRecruitRepository } from './repository.js';
```

- [ ] **Step 9: Run all module server tests**

Run:

```bash
npx vitest run modules/campus-recruit/src/server
npm run typecheck
npm run lint
```

Expected: PASS for domain, stats, projection, service, and route layers.

- [ ] **Step 10: Commit**

```bash
git add modules/campus-recruit/src/server
git commit -m "feat(campus): add application and round API"
```

---

### Task 7: Make Today a cross-module read-only workspace

**Files:**

- Modify: `modules/todo/src/contract.ts`
- Modify: `modules/todo/src/server/service.ts`
- Modify: `modules/todo/src/server/service.test.ts`
- Modify: `modules/todo/src/ui/TodayPage.tsx`
- Modify: `modules/todo/src/ui/api.test.ts`

**Interfaces:**

- Consumes: all core Items, including campus projections from Task 5.
- Produces: `TaskView.sourceModule` and read-only rendering for non-todo Items.

- [ ] **Step 1: Add failing cross-module service tests**

Add `sourceModule` to expected views and create a campus Item directly through the shared Repository:

```ts
it('includes other modules and reports their sourceModule', async () => {
  const ctx = makeCtx();
  await ctx.items.create('campus-recruit', {
    kind: 'task',
    title: '投递 星云科技 固件工程师',
    dueAt: '2026-09-20T15:59:59.999Z',
    scheduled: { kind: 'all-day', date: '2026-09-20' },
  });

  const today = await listToday(ctx, { zone: SH, now: NOW });
  expect(today.tasks).toContainEqual(
    expect.objectContaining({ title: '投递 星云科技 固件工程师', sourceModule: 'campus-recruit' }),
  );
});
```

Keep the route test proving `/api/todo/tasks/:id/complete` returns 404 for a campus Item. That endpoint remains todo-owned.

- [ ] **Step 2: Run the todo tests and verify failure**

Run: `npx vitest run modules/todo/src/server/service.test.ts modules/todo/src/server/routes.test.ts`

Expected: FAIL because `listToday` filters to `todo` and `TaskView` lacks `sourceModule`.

- [ ] **Step 3: Change the contract and service aggregation**

Add to `taskViewSchema`:

```ts
sourceModule: z.string(),
```

Add `sourceModule: item.sourceModule` in `toView()`. Remove `sourceModules: [ctx.moduleId]` from both `ctx.items.list()` calls in `listToday()`. Keep statuses, schedule, overdue exclusion, and priority sorting unchanged.

Update the mocked `TaskView` in `ui/api.test.ts` with `sourceModule: 'todo'`.

- [ ] **Step 4: Render non-todo tasks read-only**

Change `TaskRow` so ownership controls the checkbox, not the title or kind:

```tsx
const isTodo = task.sourceModule === TODO_MODULE_ID;

return (
  <li className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
    {isTodo ? (
      <input
        type="checkbox"
        aria-label={`完成 ${task.title}`}
        onChange={() => onComplete(task.id)}
        className="size-[18px] rounded-[6px] accent-accent"
      />
    ) : (
      <span
        aria-hidden="true"
        className="size-[18px] rounded-full border border-line bg-surface-2"
      />
    )}
    <span className="flex-1 text-[13px] font-semibold">{task.title}</span>
    {!isTodo && <Chip tone="neutral">秋招</Chip>}
    {task.isImportantQuadrant && <Chip tone="warning">重要</Chip>}
    <Chip tone={URGENCY_TONE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</Chip>
  </li>
);
```

Import `TODO_MODULE_ID` from the contract. Do not add deep links or completion actions for campus Items.

- [ ] **Step 5: Run todo regression tests**

Run:

```bash
npx vitest run modules/todo
npm run typecheck
```

Expected: PASS. Campus Items appear in Today while the todo completion route still refuses them.

- [ ] **Step 6: Commit**

```bash
git add modules/todo/src
git commit -m "feat(todo): show cross-module items read-only"
```

---

### Task 8: Build the campus browser API and Applications page

**Files:**

- Create: `modules/campus-recruit/src/ui/api.ts`
- Create: `modules/campus-recruit/src/ui/api.test.ts`
- Create: `modules/campus-recruit/src/ui/ApplicationsPage.tsx`

**Interfaces:**

- Consumes: Task 2 Zod contracts and Task 6 HTTP endpoints.
- Produces: typed browser calls and the complete application/round management UI.

- [ ] **Step 1: Write transport tests before the browser API**

Mock `globalThis.fetch` as todo does. Assert body/header behavior and response parsing:

```ts
it('apply and delete requests have no JSON content-type when they have no body', async () => {
  await postApply('a1');
  await deleteApplication('a1');
  expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
  expect(headerOf(calls[1]!.init, 'Content-Type')).toBeNull();
});

it('application creation sends JSON and validates the response', async () => {
  await postApplication({ company: '星云科技', position: '固件工程师', priority: 'S' });
  expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');
  expect(calls[0]!.init?.body).toBe(
    JSON.stringify({ company: '星云科技', position: '固件工程师', priority: 'S' }),
  );
});
```

Use a complete valid `ApplicationView` response fixture; do not cast malformed JSON to the expected type.

- [ ] **Step 2: Run the transport test and verify it fails**

Run: `npx vitest run modules/campus-recruit/src/ui/api.test.ts`

Expected: FAIL because `api.ts` does not exist.

- [ ] **Step 3: Implement the typed browser API**

Use the same header rule as todo: declare JSON only when `init.body !== undefined`:

```ts
async function request(url: string, init?: RequestInit): Promise<unknown> {
  const headers = init?.body === undefined ? undefined : { 'Content-Type': 'application/json' };
  const response = await fetch(url, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (body as { error?: string } | undefined)?.error ?? `请求失败（${response.status}）`,
    );
  }
  return body;
}

function json(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}
```

Then export:

```ts
export const fetchApplications = async (): Promise<{ applications: ApplicationView[] }> =>
  applicationsResponseSchema.parse(await request('/api/campus/applications'));

export const postApplication = async (input: CreateApplicationInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request('/api/campus/applications', json('POST', input)));

export const patchApplication = async (
  id: string,
  input: UpdateApplicationInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/applications/${id}`, json('PATCH', input)),
  );

export const postApply = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/applications/${id}/apply`, { method: 'POST' }),
  );

export const deleteApplication = async (id: string): Promise<void> => {
  await request(`/api/campus/applications/${id}`, { method: 'DELETE' });
};

export const postRound = async (
  applicationId: string,
  input: CreateRoundInput,
): Promise<ApplicationView> =>
  applicationViewSchema.parse(
    await request(`/api/campus/applications/${applicationId}/rounds`, json('POST', input)),
  );

export const patchRound = async (id: string, input: UpdateRoundInput): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(`/api/campus/rounds/${id}`, json('PATCH', input)));

export const deleteRound = async (id: string): Promise<ApplicationView> =>
  applicationViewSchema.parse(await request(`/api/campus/rounds/${id}`, { method: 'DELETE' }));

export const fetchStats = async (): Promise<StatsResponse> =>
  statsResponseSchema.parse(await request('/api/campus/stats'));
```

- [ ] **Step 4: Build the page query and mutation shell**

Create `ApplicationsPage.tsx` with query key `['campus', 'applications']`. Every successful mutation invalidates both `['campus', 'applications']` and `['campus', 'stats']`. Do not add optimistic updates.

Use this mutation helper pattern so every failure has a visible error:

```ts
const invalidateCampus = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['campus', 'applications'] }),
    queryClient.invalidateQueries({ queryKey: ['campus', 'stats'] }),
  ]);
};

const createApplicationMutation = useMutation({
  mutationFn: postApplication,
  onSuccess: async () => {
    setCreateForm(INITIAL_APPLICATION_FORM);
    await invalidateCampus();
  },
});
```

Render pending/error/empty states explicitly. The page header is `eyebrow="秋招管理" title="投递总表"`.

- [ ] **Step 5: Implement the application creation and editing forms**

The always-visible create form contains company, position, priority, and deadline date. Send omitted optional values through Zod defaults, not empty strings.

Each application renders in a `Panel` with:

- title `{company} · {position}`;
- chips for priority and derived status;
- deadline, applied date, city, channel, and link when present;
- “标记已投递” only when `appliedAt === null`;
- outcome select with blank, `OC`, `Offer`, `已挂`, and `我拒了` mapped to contract values;
- a delete button requiring `window.confirm('删除该投递及全部轮次？')`;
- an edit `<details>` form containing company, position, companyType, industry, city, channel, referral, priority, deadline date, salary, link, and notes.

Bind the date input directly to `application.applyDeadlineDate ?? ''`. It is already a floating date and must not pass through `Date` or UTC conversion in the browser.

- [ ] **Step 6: Implement round creation, ordering, and outcomes**

Inside each application Panel, render rounds sorted by `sequence`. Each row shows sequence, name, kind, local schedule, format, duration, and outcome. Provide:

- “通过” -> `patchRound(id, { outcome: 'passed' })`;
- “未通过” -> `patchRound(id, { outcome: 'failed' })`;
- “恢复待定” -> `patchRound(id, { outcome: 'pending' })`;
- editable sequence number;
- delete with confirmation;
- notes inside `<details>`.

The add-round form contains name, kind, `datetime-local`, format, and duration. Convert only non-empty local datetimes:

```ts
scheduledAt: scheduledLocal === '' ? null : new Date(scheduledLocal).toISOString();
```

Default `kind` suggestions in the UI: names containing “笔试” -> `written`, “测评” -> `assessment`, “HR” -> `hr`, and names containing “面” -> `technical`; show the kind select and allow correction before submission. Store the selected kind; do not continuously derive it after creation.

- [ ] **Step 7: Run transport, type, and lint checks**

Run:

```bash
npx vitest run modules/campus-recruit/src/ui/api.test.ts
npm run typecheck
npm run lint
```

Expected: PASS. No React rendering tests are added.

- [ ] **Step 8: Commit**

```bash
git add modules/campus-recruit/src/ui/api.ts modules/campus-recruit/src/ui/api.test.ts modules/campus-recruit/src/ui/ApplicationsPage.tsx
git commit -m "feat(campus): add applications page"
```

---

### Task 9: Build the statistics page and module UI definition

**Files:**

- Create: `modules/campus-recruit/src/ui/StatsPage.tsx`
- Create: `modules/campus-recruit/src/ui/index.tsx`

**Interfaces:**

- Consumes: `fetchStats()`, `StatsResponse`, shared UI primitives.
- Produces: `/campus` and `/campus/stats` UI routes and navigation entries.

- [ ] **Step 1: Implement stable percentage formatting**

In `StatsPage.tsx`:

```ts
function formatRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}
```

Use query key `['campus', 'stats']` and `fetchStats`. Render explicit loading and error text.

- [ ] **Step 2: Render counts, funnel, and failed-round distribution**

Use `PageHeader` and `Panel`; do not add a chart library. Render:

1. A responsive grid of count cards for total, pending, applied, assessment, technical, HR, OC + Offer, failed, and shelved.
2. Three funnel rows: 投递 → 笔试测评, 投递 → 技术面, 技术面 → Offer.
3. A failure distribution list using the contract kind labels. Empty state: “还没有失败轮次数据。”

Import `RoundKind` from `../contract.js` and use a semantic label map:

```ts
const KIND_LABEL: Record<RoundKind, string> = {
  assessment: '测评',
  written: '笔试',
  technical: '技术面',
  hr: 'HR 面',
  other: '其他',
};
```

- [ ] **Step 3: Define the UI module**

Create `ui/index.tsx`:

```tsx
import type { UiModuleDefinition } from '@workbench/core';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { ApplicationsPage } from './ApplicationsPage.js';
import { StatsPage } from './StatsPage.js';

export const campusRecruitUiModule: UiModuleDefinition = {
  id: CAMPUS_RECRUIT_MODULE_ID,
  title: '秋招管理',
  nav: [
    { path: '/campus', label: '秋招' },
    { path: '/campus/stats', label: '秋招统计' },
  ],
  routes: [
    { path: '/campus', element: <ApplicationsPage /> },
    { path: '/campus/stats', element: <StatsPage /> },
  ],
};
```

- [ ] **Step 4: Run type and lint checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS; all Tailwind classes are discovered through the existing `@source "../../../modules"` rule.

- [ ] **Step 5: Commit**

```bash
git add modules/campus-recruit/src/ui/StatsPage.tsx modules/campus-recruit/src/ui/index.tsx
git commit -m "feat(campus): add funnel statistics page"
```

---

### Task 10: Register both halves and verify the complete vertical slice

**Files:**

- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/app.test.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/web/src/modules.ts`
- Modify: `packages/web/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `createCampusRecruitServerModule`, `SqliteCampusRecruitRepository`, and `campusRecruitUiModule`.
- Produces: a running server and browser shell with campus routes, real migrations, startup reconciliation, and cross-module Today visibility.

- [ ] **Step 1: Add a failing two-real-module integration test**

In `packages/server/src/app.test.ts`, open the full test handle so the same SQLite connection reaches the adapter:

```ts
it('registers todo and campus modules; campus migration and routes are live', async () => {
  const { db, sqlite } = openTestDatabase();
  const campus = createCampusRecruitServerModule(new SqliteCampusRecruitRepository(sqlite));
  const app = await buildApp({ db, modules: [todoServerModule, campus] });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayDate = localDayOf(nowIso(), zone);

  const created = await app.inject({
    method: 'POST',
    url: '/api/campus/applications',
    payload: {
      company: '星云科技',
      position: '固件工程师',
      priority: 'S',
      applyDeadlineDate: todayDate,
    },
  });
  expect(created.statusCode).toBe(201);

  const today = await app.inject({ method: 'GET', url: '/api/todo/today' });
  expect(today.statusCode).toBe(200);
  expect(today.json().tasks).toContainEqual(
    expect.objectContaining({
      title: '投递 星云科技 固件工程师',
      sourceModule: 'campus-recruit',
    }),
  );

  await app.close();
  sqlite.close();
});
```

Import module server/storage exports and `todoServerModule` directly. This test proves two real modules share core Items without importing each other.

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `npx vitest run packages/server/src/app.test.ts`

Expected: FAIL until the new workspace dependencies and registrations are wired.

- [ ] **Step 3: Register the server module at the composition root**

Change `packages/server/src/index.ts`:

```ts
import { createCampusRecruitServerModule } from '@workbench/module-campus-recruit';
import { SqliteCampusRecruitRepository } from '@workbench/module-campus-recruit/storage';

const { db, sqlite } = openDatabase(DB_PATH);
runCoreMigrations(db);

const campusRecruitServerModule = createCampusRecruitServerModule(
  new SqliteCampusRecruitRepository(sqlite),
);

const app = await buildApp({
  db,
  modules: [todoServerModule, campusRecruitServerModule],
  logger: true,
});
```

Keep the existing DB path, port, host, and startup log unchanged.

- [ ] **Step 4: Register the UI module**

Change `packages/web/src/modules.ts`:

```ts
import { campusRecruitUiModule } from '@workbench/module-campus-recruit/ui';
import { todoUiModule } from '@workbench/module-todo/ui';

export const uiModules: UiModuleDefinition[] = [todoUiModule, campusRecruitUiModule];
```

Add `@workbench/module-campus-recruit: "*"` to both server and web dependencies with workspace-scoped installs, then update `package-lock.json`:

```bash
npm install @workbench/module-campus-recruit -w @workbench/server
npm install @workbench/module-campus-recruit -w @workbench/web
```

- [ ] **Step 5: Run all automated verification**

Run in this order:

```bash
npx vitest run packages/server/src/app.test.ts modules/campus-recruit modules/todo
npm run check
```

Expected: Prettier, TypeScript, ESLint boundary guards, Repository contract, module integration tests, and all existing tests pass.

- [ ] **Step 6: Perform the manual acceptance pass**

Run: `npm run dev`

Verify in the browser:

1. Create S/A/B/C applications and confirm list ordering remains S, A, B, C.
2. Set the deadline to today and confirm the read-only campus task appears in Today with an “秋招” source chip and no checkbox.
3. Mark the application applied and confirm the deadline task leaves the open Today list.
4. Add 一面 and 二面, leave 二面 unscheduled, and confirm status reads `流程中 · 二面`.
5. Schedule both rounds, fail 一面, and confirm 一面 remains historical while future 二面 is cancelled.
6. Restart both processes and confirm records remain and startup reconciliation creates no duplicate Items.
7. Open statistics and confirm zero denominators display `—`, then add data and confirm the three percentages and failure distribution update.
8. Delete a round and an application; confirm their Items disappear while todo Items remain untouched.

Stop the dev server after verification.

- [ ] **Step 7: Review architecture invariants in the final diff**

Run:

```bash
git diff --stat HEAD~9
git diff HEAD~9 -- packages/core packages/data modules/campus-recruit packages/server/src/index.ts packages/web/src/modules.ts eslint.config.js
```

Confirm:

- core changes only add the generic scoped delete method and its contract;
- `packages/data` contains no campus table or campus Repository;
- no production module imports `@workbench/data`;
- SQLite/Drizzle imports under the campus module occur only in `src/storage`;
- all module tables/migrations live under `modules/campus-recruit`;
- todo and campus never import each other.

- [ ] **Step 8: Commit integration wiring**

```bash
git add packages/server packages/web package-lock.json
git commit -m "feat(campus): register complete module"
```

---

## Final Acceptance Checklist

- [ ] `npm run check` passes from the repository root.
- [ ] Core Repository contract includes scoped single deletion and the SQLite implementation passes it.
- [ ] Both module migrations run on a new database and are idempotent on restart.
- [ ] Application status precedence and 90-day boundary are covered by pure tests.
- [ ] Round sequence drives “latest round” and later-round cancellation.
- [ ] Projection reconciliation is idempotent, replaces missing Items, removes orphans, and never mutates/deletes todo Items.
- [ ] Today aggregates all modules and renders campus Items read-only.
- [ ] Application CRUD, round CRUD, outcomes, deletion, and statistics work through HTTP and UI.
- [ ] No Excel import, interview review, job collection, notification, deep-link decorator, recurrence, or Playwright code was added.
