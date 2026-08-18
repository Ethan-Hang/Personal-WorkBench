import type { RecurrenceFreq } from '../contract.js';

/**
 * 重复规则的日期展开。**纯函数，零 IO**——重复逻辑最容易错的部分因此可以被密集测试。
 *
 * 全程只操作浮动日期 `YYYY-MM-DD`，**绝不转 UTC**。重复是「每周三」这种本地日概念，
 * 一旦经过 UTC 换算，某些时区会整体偏移一天（RFC 5545 区分 DATE 与 DATE-TIME 正是为此）。
 */

/** 把 `YYYY-MM-DD` 拆成年月日。不经过 Date，避免任何时区介入。 */
function parts(date: string): { y: number; m: number; d: number } {
  return {
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function format(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** 某年某月有多少天。用 UTC 构造仅为借用日历算术，不涉及本地时区。 */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 浮动日期加 n 天。 */
export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 星期几：0=周日 … 6=周六。 */
export function weekdayOf(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 两个浮动日期相差多少天（b - a）。 */
export function diffDays(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((tb - ta) / 86_400_000);
}

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  /** weekly 用：0=周日 … 6=周六 */
  byWeekday: number[] | null;
  /** monthly 用：几号 */
  byMonthday: number | null;
  startDate: string;
  /** 含此日；null 表示无限 */
  untilDate: string | null;
}

/**
 * 展开 `[from, to]`（含两端）区间内命中的所有日期，升序。
 *
 * 三条 freq 的语义：
 * - `daily`：自 `startDate` 起每 `interval` 天
 * - `weekly`：`byWeekday` 里的每一天，且所在周距起始周为 `interval` 的整数倍
 * - `monthly`：每 `interval` 个月的 `byMonthday` 号。**该月没有这一天就跳过**——
 *   「每月 31 号」在 2 月不生成，而不是顺延到 3/1 或回退到 2/28。顺延会让
 *   一条规则在某些月份生成两次，回退会让「月底」这个语义悄悄变成「月中」。
 */
export function expandOccurrences(rule: RecurrenceRule, from: string, to: string): string[] {
  const lower = from < rule.startDate ? rule.startDate : from;
  const upper = rule.untilDate !== null && rule.untilDate < to ? rule.untilDate : to;
  if (lower > upper) return [];

  switch (rule.freq) {
    case 'daily':
      return expandDaily(rule, lower, upper);
    case 'weekly':
      return expandWeekly(rule, lower, upper);
    case 'monthly':
      return expandMonthly(rule, lower, upper);
  }
}

function expandDaily(rule: RecurrenceRule, lower: string, upper: string): string[] {
  const out: string[] = [];
  const offset = diffDays(rule.startDate, lower);
  // 对齐到不早于 lower 的第一个命中日
  const firstStep = Math.ceil(offset / rule.interval);
  for (let step = Math.max(firstStep, 0); ; step++) {
    const date = addDays(rule.startDate, step * rule.interval);
    if (date > upper) break;
    if (date >= lower) out.push(date);
  }
  return out;
}

/** 该日期所在周的周日。以周日为周首，与 `weekdayOf` 的 0=周日 保持一致。 */
function weekStart(date: string): string {
  return addDays(date, -weekdayOf(date));
}

function expandWeekly(rule: RecurrenceRule, lower: string, upper: string): string[] {
  const weekdays = rule.byWeekday ?? [];
  if (weekdays.length === 0) return [];

  const baseWeek = weekStart(rule.startDate);
  const out: string[] = [];
  for (let cursor = weekStart(lower); cursor <= upper; cursor = addDays(cursor, 7)) {
    const weeksApart = diffDays(baseWeek, cursor) / 7;
    if (weeksApart < 0 || weeksApart % rule.interval !== 0) continue;
    for (const wd of [...weekdays].sort((a, b) => a - b)) {
      const date = addDays(cursor, wd);
      if (date >= lower && date <= upper && date >= rule.startDate) out.push(date);
    }
  }
  return out.sort();
}

function expandMonthly(rule: RecurrenceRule, lower: string, upper: string): string[] {
  const day = rule.byMonthday;
  if (day === null) return [];

  const start = parts(rule.startDate);
  const out: string[] = [];
  // 从起始月开始按 interval 步进，直到越过 upper
  for (let step = 0; ; step++) {
    const monthIndex = start.m - 1 + step * rule.interval;
    const y = start.y + Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    // 越界判断用该月 1 号，避免因跳过的月份提前 break
    if (format(y, m, 1) > upper) break;
    if (day > daysInMonth(y, m)) continue; // 该月没有这一天，整月跳过
    const date = format(y, m, day);
    if (date >= lower && date <= upper && date >= rule.startDate) out.push(date);
  }
  return out;
}
