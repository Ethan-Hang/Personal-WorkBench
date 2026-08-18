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

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
  .refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, '日期必须是有效日历日期');
const instantSchema = z.string().datetime({ precision: 3 });
const nullableText = (max: number) => z.string().trim().max(max).nullable();

const applicationFieldSchemas = {
  company: z.string().trim().min(1, '公司不能为空').max(100),
  position: z.string().trim().min(1, '岗位不能为空').max(120),
  companyType: nullableText(80),
  industry: nullableText(80),
  city: nullableText(80),
  channel: nullableText(80),
  referral: nullableText(200),
  priority: z.enum(APPLICATION_PRIORITIES),
  applyDeadlineDate: dateSchema.nullable(),
  appliedAt: instantSchema.nullable(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  salary: nullableText(120),
  link: nullableText(1000),
  notes: nullableText(4000),
};

export const createApplicationInputSchema = z.object({
  ...applicationFieldSchemas,
  companyType: applicationFieldSchemas.companyType.default(null),
  industry: applicationFieldSchemas.industry.default(null),
  city: applicationFieldSchemas.city.default(null),
  channel: applicationFieldSchemas.channel.default(null),
  referral: applicationFieldSchemas.referral.default(null),
  priority: applicationFieldSchemas.priority.default('B'),
  applyDeadlineDate: applicationFieldSchemas.applyDeadlineDate.default(null),
  appliedAt: applicationFieldSchemas.appliedAt.default(null),
  outcome: applicationFieldSchemas.outcome.default(null),
  salary: applicationFieldSchemas.salary.default(null),
  link: applicationFieldSchemas.link.default(null),
  notes: applicationFieldSchemas.notes.default(null),
});
export type CreateApplicationInput = z.input<typeof createApplicationInputSchema>;
export type CreateApplicationData = z.output<typeof createApplicationInputSchema>;

export const updateApplicationInputSchema = z.object(applicationFieldSchemas).partial();
export type UpdateApplicationInput = z.infer<typeof updateApplicationInputSchema>;

const roundFieldSchemas = {
  kind: z.enum(ROUND_KINDS),
  name: z.string().trim().min(1, '轮次名称不能为空').max(100),
  scheduledAt: instantSchema.nullable(),
  format: nullableText(80),
  durationMin: z.number().int().positive().max(1440).nullable(),
  outcome: z.enum(ROUND_OUTCOMES),
  notes: nullableText(4000),
};

export const createRoundInputSchema = z.object({
  ...roundFieldSchemas,
  scheduledAt: roundFieldSchemas.scheduledAt.default(null),
  format: roundFieldSchemas.format.default(null),
  durationMin: roundFieldSchemas.durationMin.default(null),
  outcome: roundFieldSchemas.outcome.default('pending'),
  notes: roundFieldSchemas.notes.default(null),
});
export type CreateRoundInput = z.input<typeof createRoundInputSchema>;
export type CreateRoundData = z.output<typeof createRoundInputSchema>;

export const updateRoundInputSchema = z.object(roundFieldSchemas).partial().extend({
  sequence: z.number().int().positive().optional(),
});
export type UpdateRoundInput = z.infer<typeof updateRoundInputSchema>;

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
