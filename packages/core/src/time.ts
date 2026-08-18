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
