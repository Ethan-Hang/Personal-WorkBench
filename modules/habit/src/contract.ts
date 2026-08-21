import { z } from 'zod';

export const HABIT_MODULE_ID = 'habit';

/**
 * 频率的三种形态。处理它的 `switch` **不要加 `default` 分支**——
 * 没有 default，将来加第四种频率时 TypeScript 会直接编译报错（设计 §3）。
 */
export const FREQ_KINDS = ['daily', 'weekdays', 'weekly-count'] as const;
export type FreqKind = (typeof FREQ_KINDS)[number];

/** 补卡窗口：只能补最近 7 天（含今天）。由服务端用 `clientToday` 校验。 */
export const CHECKIN_BACKFILL_DAYS = 7;

/** 热力图单次取数上限，含两端。 */
export const HISTORY_MAX_DAYS = 366;

/**
 * **浮动日期** `YYYY-MM-DD`，绝不转 UTC。
 *
 * 「今天打没打卡」是本地日历概念：转 UTC 会让出差一趟的历史记录整体偏一天
 * （RFC 5545 区分 DATE 与 DATE-TIME 正是为此）。
 */
const floatingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return false;
    const probe = new Date(Date.UTC(y, m - 1, d));
    return (
      probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    );
  }, '日期必须是有效日历日期');

/** **UTC 时刻**，三位毫秒 + `Z`。与浮动日期刻意不同类型。 */
const instantSchema = z.string().datetime({ precision: 3 });

/** ISO 周几：1 = 周一 … 7 = 周日。 */
const isoWeekdaySchema = z.number().int().min(1).max(7);

const habitNameSchema = z.string().trim().min(1).max(60);

/**
 * 频率字段是扁平存放的（与表结构同形），跨字段约束由 `superRefine` 表达：
 * `weekdays` 必须给周几，`weekly-count` 必须给次数。
 */
function refineFrequency(
  value: { freqKind: FreqKind; weekdays?: number[] | null; weeklyCount?: number | null },
  ctx: z.RefinementCtx,
): void {
  switch (value.freqKind) {
    case 'daily':
      return;
    case 'weekdays':
      if (!value.weekdays || value.weekdays.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'weekdays 频率必须给出至少一个周几' });
      }
      return;
    case 'weekly-count':
      if (value.weeklyCount == null) {
        ctx.addIssue({ code: 'custom', message: 'weekly-count 频率必须给出每周次数' });
      }
      return;
  }
}

const habitFieldsSchema = z.object({
  name: habitNameSchema,
  notes: z.string().trim().max(2000).nullish(),
  targetValue: z.number().int().min(1).default(1),
  unit: z.string().trim().max(16).nullish(),
  freqKind: z.enum(FREQ_KINDS),
  weekdays: z.array(isoWeekdaySchema).min(1).max(7).nullish(),
  weeklyCount: z.number().int().min(1).max(7).nullish(),
  startDate: floatingDateSchema,
  colorToken: z.string().trim().max(24).nullish(),
});

export const createHabitInputSchema = habitFieldsSchema.superRefine(refineFrequency);
export type CreateHabitInput = z.input<typeof createHabitInputSchema>;

export const updateHabitInputSchema = habitFieldsSchema
  .partial()
  .extend({ position: z.number().int().min(0).optional() })
  .superRefine((value, ctx) => {
    if (value.freqKind) refineFrequency({ ...value, freqKind: value.freqKind }, ctx);
  });
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;

/**
 * 打卡入参。
 *
 * **`clientToday` 不是冗余字段。** `ModuleContext` 只有 `moduleId` + `items`，
 * 拿不到 `SettingsRepository`，所以服务端算不出「今天是几号」——它只知道自己
 * 进程的时区。本地日期一律由前端算好再发，与排程的 `start`/`end` 由前端换算成
 * UTC 再发是同一条道理（ADR-0023 §3）。
 */
export const checkinInputSchema = z.object({
  value: z.number().int().min(0),
  clientToday: floatingDateSchema,
});
export type CheckinInput = z.infer<typeof checkinInputSchema>;

export const habitViewSchema = z.object({
  id: z.string(),
  name: habitNameSchema,
  notes: z.string().nullable(),
  targetValue: z.number().int(),
  unit: z.string().nullable(),
  freqKind: z.enum(FREQ_KINDS),
  weekdays: z.array(isoWeekdaySchema).nullable(),
  weeklyCount: z.number().int().nullable(),
  startDate: floatingDateSchema,
  archivedAt: instantSchema.nullable(),
  colorToken: z.string().nullable(),
  position: z.number().int(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type HabitView = z.infer<typeof habitViewSchema>;

export const todayHabitSchema = z.object({
  habit: habitViewSchema,
  dueToday: z.boolean(),
  progress: z.object({ current: z.number().int(), target: z.number().int() }),
  streak: z.number().int().min(0),
});
export type TodayHabit = z.infer<typeof todayHabitSchema>;

export const todayResponseSchema = z.object({ habits: z.array(todayHabitSchema) });
export const habitsResponseSchema = z.object({ habits: z.array(habitViewSchema) });

export const checkinSchema = z.object({
  date: floatingDateSchema,
  value: z.number().int().min(0),
});
export const historyResponseSchema = z.object({
  habit: habitViewSchema,
  checkins: z.array(checkinSchema),
});

export const ID_PARAM = ':id';
export const DATE_PARAM = ':date';

function segment(value: string): string {
  return value === ID_PARAM || value === DATE_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**——
 * 传 `ID_PARAM` 得到 Fastify 注册模式，传真实 id 得到转义后的请求路径。
 *
 * 写前端只需要读本文件，不需要读 `src/server/`。
 */
export const HABIT_API = {
  /** GET `?date=` → { habits: TodayHabit[] }。`date` 是前端算出的本地今日 */
  today: '/api/habit/today',
  /** GET `?includeArchived=` → { habits: HabitView[] }；POST CreateHabitInput → HabitView（201） */
  habits: '/api/habit/habits',
  /** PATCH UpdateHabitInput → HabitView；DELETE → 204（连历史一并删除） */
  habit: (id: string): string => `/api/habit/habits/${segment(id)}`,
  /** POST（无 body）→ HabitView */
  archive: (id: string): string => `/api/habit/habits/${segment(id)}/archive`,
  /** POST（无 body）→ HabitView */
  unarchive: (id: string): string => `/api/habit/habits/${segment(id)}/unarchive`,
  /** GET `?from=&to=` → { habit, checkins }，含两端，上限 HISTORY_MAX_DAYS 天 */
  history: (id: string): string => `/api/habit/habits/${segment(id)}/history`,
  /** PUT CheckinInput → 该习惯的打卡；DELETE `?clientToday=` → 204。按 (habitId, date) 幂等 */
  checkin: (id: string, date: string): string =>
    `/api/habit/habits/${segment(id)}/checkins/${segment(date)}`,
} as const;
