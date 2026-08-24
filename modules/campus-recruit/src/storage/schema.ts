import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_PRIORITIES,
  ROUND_KINDS,
  ROUND_OUTCOMES,
} from '../contract.js';

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

export const campusRecruitApplications = sqliteTable(
  'campus_recruit_applications',
  {
    id: text('id').primaryKey(),
    // 刻意可空：SQLite 给已有表 ADD COLUMN 时带 NOT NULL 就必须带 DEFAULT，
    // 而那个 DEFAULT 会永久留在 schema 里，将来漏传 seasonId 不会报错、
    // 会静默落进 legacy 季。真正的 NOT NULL 需要整表重建，而 rounds 有外键
    // 指向本表，重建风险远大于收益。非空由 contract 的必填 + service 的存在性
    // 校验 + ApplicationRecord.seasonId 的 TS 类型（string）三处共同保证。
    seasonId: text('season_id').references(() => campusRecruitSeasons.id),
    company: text('company').notNull(),
    position: text('position').notNull(),
    companyType: text('company_type'),
    industry: text('industry'),
    city: text('city'),
    channel: text('channel'),
    referral: text('referral'),
    applyEmail: text('apply_email'),
    applyPhone: text('apply_phone'),
    priority: text('priority', { enum: APPLICATION_PRIORITIES }).notNull().default('B'),
    applyDeadlineDate: text('apply_deadline_date'),
    appliedAt: text('applied_at'),
    outcome: text('outcome', { enum: APPLICATION_OUTCOMES }),
    outcomeAt: text('outcome_at'),
    shelvedAt: text('shelved_at'),
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
    check(
      'ck_campus_recruit_applications_priority',
      sql`${table.priority} IN ('S', 'A', 'B', 'C')`,
    ),
    check(
      'ck_campus_recruit_applications_outcome',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('offer', 'oc', 'rejected', 'declined')`,
    ),
    index('idx_campus_recruit_applications_applied_at').on(table.appliedAt),
    index('idx_campus_recruit_applications_outcome').on(table.outcome),
    index('idx_campus_recruit_applications_season_id').on(table.seasonId),
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
    // 截止时刻：「最晚什么时候做完」，与 scheduled_at 的「什么时候做」是两件事
    deadlineAt: text('deadline_at'),
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
    check('ck_campus_recruit_rounds_sequence', sql`${table.sequence} > 0`),
    check(
      'ck_campus_recruit_rounds_kind',
      sql`${table.kind} IN ('screening', 'assessment', 'written', 'technical', 'hr', 'other')`,
    ),
    check(
      'ck_campus_recruit_rounds_outcome',
      sql`${table.outcome} IN ('pending', 'completed', 'passed', 'failed')`,
    ),
    uniqueIndex('uq_campus_recruit_round_sequence').on(table.applicationId, table.sequence),
    index('idx_campus_recruit_rounds_application_id').on(table.applicationId),
    index('idx_campus_recruit_rounds_kind').on(table.kind),
    index('idx_campus_recruit_rounds_scheduled_at').on(table.scheduledAt),
  ],
);
