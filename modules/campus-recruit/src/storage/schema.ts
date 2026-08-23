import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
    check('ck_campus_recruit_rounds_sequence', sql`${table.sequence} > 0`),
    check(
      'ck_campus_recruit_rounds_kind',
      sql`${table.kind} IN ('screening', 'assessment', 'written', 'technical', 'hr', 'other')`,
    ),
    check(
      'ck_campus_recruit_rounds_outcome',
      sql`${table.outcome} IN ('pending', 'passed', 'failed')`,
    ),
    uniqueIndex('uq_campus_recruit_round_sequence').on(table.applicationId, table.sequence),
    index('idx_campus_recruit_rounds_application_id').on(table.applicationId),
    index('idx_campus_recruit_rounds_kind').on(table.kind),
    index('idx_campus_recruit_rounds_scheduled_at').on(table.scheduledAt),
  ],
);
