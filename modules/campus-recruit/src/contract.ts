import { z } from 'zod';

export const CAMPUS_RECRUIT_MODULE_ID = 'campus-recruit';
export const APPLICATION_PRIORITIES = ['S', 'A', 'B', 'C'] as const;
export const APPLICATION_OUTCOMES = ['offer', 'oc', 'rejected', 'declined'] as const;
export const ROUND_KINDS = [
  'screening',
  'assessment',
  'written',
  'technical',
  'hr',
  'other',
] as const;
export const ROUND_OUTCOMES = ['pending', 'passed', 'failed'] as const;
export const SEASON_KINDS = ['campus-autumn', 'campus-spring', 'intern', 'social'] as const;
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
export type SeasonKind = (typeof SEASON_KINDS)[number];

const dateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(([ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?)$/,
    '日期格式须为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm',
  )
  .refine((value) => {
    const datePart = value.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return false;
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return (
      dateObj.getUTCFullYear() === y &&
      dateObj.getUTCMonth() === m - 1 &&
      dateObj.getUTCDate() === d
    );
  }, '日期必须是有效日历日期');
const instantSchema = z.string().datetime({ precision: 3 });
const nullableText = (max: number) => z.string().trim().max(max).nullable();

/**
 * 招聘季的起止是**浮动日期**，只到天。绝不转 UTC（ADR-0004）——
 * 「秋招 8 月 1 日开始」在任何时区都是 8 月 1 日。
 */
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

const applicationFieldSchemas = {
  seasonId: z.string().min(1, '必须指定招聘季'),
  company: z.string().trim().min(1, '公司不能为空').max(100),
  position: z.string().trim().min(1, '岗位不能为空').max(120),
  companyType: nullableText(80),
  industry: nullableText(80),
  city: nullableText(80),
  channel: nullableText(80),
  referral: nullableText(200),
  applyEmail: nullableText(200),
  applyPhone: nullableText(40),
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
  applyEmail: applicationFieldSchemas.applyEmail.default(null),
  applyPhone: applicationFieldSchemas.applyPhone.default(null),
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

export const updateApplicationInputSchema = z
  .object(applicationFieldSchemas)
  .partial()
  // 泡池子刻意不是 outcome：它不是终局，撤销它也不该是「清空终局结果」。
  // 前端只表达意图，落成哪个时刻由服务端决定。
  .extend({ shelved: z.boolean().optional() });
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
  seasonId: z.string(),
  // 冗余季名而不是让前端自己关联：跨季模式（命令面板、全部季列表）下每条结果
  // 都要显示它属于哪一季，只给 id 等于把 join 推给每个消费者
  seasonName: z.string(),
  company: z.string(),
  position: z.string(),
  companyType: z.string().nullable(),
  industry: z.string().nullable(),
  city: z.string().nullable(),
  channel: z.string().nullable(),
  referral: z.string().nullable(),
  applyEmail: z.string().nullable(),
  applyPhone: z.string().nullable(),
  priority: z.enum(APPLICATION_PRIORITIES),
  applyDeadlineDate: dateSchema.nullable(),
  appliedAt: instantSchema.nullable(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  outcomeAt: instantSchema.nullable(),
  shelvedAt: instantSchema.nullable(),
  salary: z.string().nullable(),
  link: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.object({
    code: z.enum(APPLICATION_STATUS_CODES),
    label: z.string(),
    failedRoundName: z.string().nullable(),
  }),
  rounds: z.array(roundViewSchema),
  deadlineItemId: z.string().nullable().optional(),
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

/**
 * 路径参数占位符。把它传给下面的路径构造函数，得到的是 Fastify 注册用的模式；
 * 传真实 id 则得到可直接请求的路径。
 */
export const ID_PARAM = ':id';

function segment(value: string): string {
  return value === ID_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**——
 * 路径不再在 routes.ts 与 api.ts 各写一遍、各改一半。
 *
 * 前端需要知道的一切都在本文件：端点在这里，请求/响应形状在上面的 Zod schema。
 * 不必为了写界面去读服务端代码。
 */
export const CAMPUS_API = {
  /** GET → { applications: ApplicationView[] }；POST CreateApplicationInput → ApplicationView（201） */
  applications: '/api/campus/applications',
  /** PATCH UpdateApplicationInput → ApplicationView；DELETE → 204 */
  application: (id: string): string => `/api/campus/applications/${segment(id)}`,
  /** POST → ApplicationView：标记为已投递 */
  applyApplication: (id: string): string => `/api/campus/applications/${segment(id)}/apply`,
  /** POST → ApplicationView：撤回投递，回到「待投递」（误点的解药） */
  unapplyApplication: (id: string): string => `/api/campus/applications/${segment(id)}/unapply`,
  /** POST CreateRoundInput → ApplicationView：给该投递新增一轮 */
  applicationRounds: (id: string): string => `/api/campus/applications/${segment(id)}/rounds`,
  /** PATCH UpdateRoundInput → ApplicationView；DELETE → 204 */
  round: (id: string): string => `/api/campus/rounds/${segment(id)}`,
  /** GET → { seasons: SeasonView[] }；POST CreateSeasonInput → SeasonView（201） */
  seasons: '/api/campus/seasons',
  /** PATCH UpdateSeasonInput → SeasonView；DELETE → 204 */
  season: (id: string): string => `/api/campus/seasons/${segment(id)}`,
  /** GET → StatsResponse */
  stats: '/api/campus/stats',
} as const;

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
