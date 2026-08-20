import { DateTime } from 'luxon';

/** UTC ISO8601 时刻，形如 '2026-09-20T11:00:00.000Z'。字典序等于时间序。 */
export type IsoInstant = string;

/** 浮动日期 'YYYY-MM-DD'，不带时区。用于全天排程（spec §6.2）。 */
export type PlainDate = string;

function assertValid(dt: DateTime, input: string): DateTime {
  if (!dt.isValid) {
    throw new Error(`无效的时间输入 "${input}"：${dt.invalidReason ?? 'unknown'}`);
  }
  return dt;
}

export function toIsoInstant(d: Date): IsoInstant {
  return d.toISOString();
}

export function nowIso(): IsoInstant {
  return new Date().toISOString();
}

/** 该时刻落在目标时区的哪一天。 */
export function localDayOf(instant: IsoInstant, zone: string): PlainDate {
  const dt = assertValid(DateTime.fromISO(instant, { zone }), instant);
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * 本地日对应的 UTC 区间，左闭右开。
 * 时区换算集中在这里，SQL 层只做字符串比较（spec §6.4）。
 */
export function localDayRange(
  date: PlainDate,
  zone: string,
): { startUtc: IsoInstant; endUtc: IsoInstant } {
  const start = assertValid(DateTime.fromISO(date, { zone }), date).startOf('day');
  const end = start.plus({ days: 1 });
  return {
    startUtc: new Date(start.toUTC().toMillis()).toISOString(),
    endUtc: new Date(end.toUTC().toMillis()).toISOString(),
  };
}

/** 把"只精确到天"的 DDL 补成该本地日最后一毫秒的 instant（spec §5.3 决策 ③）。 */
export function endOfLocalDayUtc(date: PlainDate, zone: string): IsoInstant {
  const end = assertValid(DateTime.fromISO(date, { zone }), date).endOf('day');
  return new Date(end.toUTC().toMillis()).toISOString();
}

/**
 * 把时刻截到分钟（秒与毫秒归零）。
 *
 * 排程的颗粒度是 1 分钟，这条由服务端保证而非靠调用方自觉——
 * 前端从日期选择器拿到的时刻可能带着秒，直接入库会让同一分钟里出现
 * 多个不相等的排程值，日历上就成了肉眼看不出差别的重叠块。
 */
export function truncateToMinute(instant: IsoInstant): IsoInstant {
  const dt = assertValid(DateTime.fromISO(instant, { zone: 'utc' }), instant);
  return new Date(dt.startOf('minute').toMillis()).toISOString();
}

/**
 * 把前端传来的 dueDate（支持 "YYYY-MM-DD"、"YYYY-MM-DD HH:mm" 或 UTC ISO 字符串）
 * 统一解析为 UTC IsoInstant。
 * - 若只到天（YYYY-MM-DD）：补成该本地日最后一毫秒（23:59:59.999）的 UTC instant；
 * - 若包含时分（YYYY-MM-DD HH:mm）：按目标时区换算为 UTC instant 并截零到分钟；
 * - 若已经是 ISO 字符串（带 T 或 Z）：解析并转换。
 */
export function resolveDueDateUtc(input: string, zone: string): IsoInstant {
  const trimmed = input.trim();
  // 1. 纯日期 "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return endOfLocalDayUtc(trimmed, zone);
  }
  // 2. 带时分的本地墙钟时间 "YYYY-MM-DD HH:mm"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
    const dt = DateTime.fromFormat(trimmed, 'yyyy-MM-dd HH:mm', { zone });
    if (!dt.isValid) {
      throw new Error(`无效的日期时间输入 "${input}"：${dt.invalidReason ?? 'unknown'}`);
    }
    return new Date(dt.toUTC().startOf('minute').toMillis()).toISOString();
  }
  // 3. ISO 8601 字符串 (形如 2026-08-18T15:30 或 2026-08-18T07:30:00.000Z)
  const isoDt = DateTime.fromISO(trimmed, { zone });
  if (isoDt.isValid) {
    return new Date(isoDt.toUTC().startOf('minute').toMillis()).toISOString();
  }
  throw new Error(`无法识别的日期时间格式 "${input}"`);
}
