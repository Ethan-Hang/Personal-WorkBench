import type { FreqKind } from '../contract.js';
import type { CheckinRecord } from './repository.js';

/**
 * 习惯频率的展开与派生。**纯函数，零 IO**——这个模块里唯一有真正逻辑的地方，
 * 因此可以被密集测试。
 *
 * 全程只操作浮动日期 `YYYY-MM-DD`，**绝不转 UTC**。「今天打没打卡」是本地日概念，
 * 一旦经过 UTC 换算，某些时区会整体偏移一天。
 *
 * 与 todo 的 `recurrence.ts` 刻意**不共用代码**（设计 §4.3）：那边处理「每月 31 号
 * 整月跳过」这类日历规则并绑着 core Item 的物化，语义不同；而铁律 1 也禁止模块间依赖。
 * 一处可见的差异：这里的周几用 **ISO 编号（1=周一 … 7=周日）**，todo 用 0=周日。
 */

/** 一条习惯里与频率派生相关的部分。刻意只取需要的字段，便于测试构造。 */
export interface FrequencyOf {
  freqKind: FreqKind;
  weekdays: number[] | null;
  weeklyCount: number | null;
  startDate: string;
  targetValue: number;
}

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

/** 浮动日期加 n 天。用 UTC 构造仅为借用日历算术，不涉及任何时区语义。 */
export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1, 2)}-${pad(t.getUTCDate(), 2)}`;
}

/** ISO 周几：1 = 周一 … 7 = 周日。 */
export function isoWeekdayOf(date: string): number {
  const { y, m, d } = parts(date);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** 本周的周一。周边界固定为周一到周日。 */
export function startOfWeek(date: string): string {
  return addDays(date, -(isoWeekdayOf(date) - 1));
}

function valueOn(checkins: CheckinRecord[], date: string): number {
  return checkins.find((checkin) => checkin.date === date)?.value ?? 0;
}

function isMet(habit: FrequencyOf, checkins: CheckinRecord[], date: string): boolean {
  return valueOn(checkins, date) >= habit.targetValue;
}

/**
 * 今天该不该做。
 *
 * `switch` **没有 `default` 分支**：将来加第四种频率时，TypeScript 会因为
 * 「函数并非所有路径都有返回值」直接编译报错，而不是静默走进兜底分支。
 */
export function isDueOn(habit: FrequencyOf, date: string): boolean {
  if (date < habit.startDate) return false;

  switch (habit.freqKind) {
    case 'daily':
      return true;
    case 'weekdays':
      return habit.weekdays?.includes(isoWeekdayOf(date)) ?? false;
    case 'weekly-count':
      // 「每周三次」不指定哪天，所以每天都可以做——进度按周算，不按天算。
      return true;
  }
}

/** 今天（或本周）的完成度。 */
export function progressFor(
  habit: FrequencyOf,
  date: string,
  checkins: CheckinRecord[],
): { current: number; target: number } {
  switch (habit.freqKind) {
    case 'daily':
    case 'weekdays':
      return { current: valueOn(checkins, date), target: habit.targetValue };
    case 'weekly-count': {
      const weekStart = startOfWeek(date);
      let current = 0;
      for (let offset = 0; offset < 7; offset += 1) {
        if (isMet(habit, checkins, addDays(weekStart, offset))) current += 1;
      }
      return { current, target: habit.weeklyCount ?? 0 };
    }
  }
}

/** 某一周是否达标（仅 weekly-count 用）。 */
function isWeekMet(habit: FrequencyOf, checkins: CheckinRecord[], weekStart: string): boolean {
  const { current, target } = progressFor(habit, weekStart, checkins);
  return target > 0 && current >= target;
}

/**
 * 连续多久。
 *
 * **今天还没到晚上，不算断**：从今天起回溯时，今天没达标只是跳过，不终止；
 * 从昨天（或上一个该做的日子）起才开始真正判断。否则每天早上一睁眼 streak 就归零。
 *
 * `weekdays` 频率**只看该做的日子**——「一三五健身」的周二没打卡不算断，
 * 否则它的 streak 永远是 1。
 */
export function streakOf(habit: FrequencyOf, checkins: CheckinRecord[], today: string): number {
  if (habit.freqKind === 'weekly-count') {
    let week = startOfWeek(today);
    let streak = 0;
    // 本周尚未过完：达标则计入，未达标只是跳过，不终止。
    if (isWeekMet(habit, checkins, week)) streak += 1;
    week = addDays(week, -7);

    while (week >= startOfWeek(habit.startDate) && isWeekMet(habit, checkins, week)) {
      streak += 1;
      week = addDays(week, -7);
    }
    return streak;
  }

  let cursor = today;
  let streak = 0;

  // 今天若该做却还没达标，跳过它继续回溯（今天还没过完）。
  if (isDueOn(habit, cursor)) {
    if (isMet(habit, checkins, cursor)) streak += 1;
    cursor = addDays(cursor, -1);
  }

  while (cursor >= habit.startDate) {
    if (!isDueOn(habit, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isMet(habit, checkins, cursor)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
