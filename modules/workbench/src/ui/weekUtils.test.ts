import { describe, it, expect } from 'vitest';
import {
  getWeekRange,
  getWeekRangeByYearAndWeek,
  getWeeksInYear,
  formatWeekHeaderTitle,
  calculateEventTimelinePosition,
  localTimeToUtcIso,
  getAvailableYears,
} from './weekUtils.js';

describe('weekUtils', () => {
  it('correctly calculates week range for a given date', () => {
    // 2026-08-18 is Tuesday
    const range = getWeekRange('2026-08-18', 'Asia/Shanghai');
    expect(range.from).toBe('2026-08-17'); // Monday
    expect(range.to).toBe('2026-08-23'); // Sunday
    expect(range.year).toBe(2026);
    expect(range.weekNumber).toBe(34);
    expect(range.days).toHaveLength(7);
    expect(range.days[0]?.date).toBe('2026-08-17');
    expect(range.days[0]?.dayName).toBe('周一');
    expect(range.days[6]?.date).toBe('2026-08-23');
    expect(range.days[6]?.dayName).toBe('周日');
  });

  it('correctly computes cross-year week', () => {
    // 2025-12-31 is Wednesday in week 1 of 2026 or week 53 of 2025
    const range = getWeekRange('2025-12-31', 'UTC');
    expect(range.days).toHaveLength(7);
    expect(range.from).toBe('2025-12-29');
    expect(range.to).toBe('2026-01-04');
  });

  it('calculates week range by year and week number', () => {
    const range = getWeekRangeByYearAndWeek(2026, 34, 'Asia/Shanghai');
    expect(range.from).toBe('2026-08-17');
    expect(range.to).toBe('2026-08-23');
    expect(range.weekNumber).toBe(34);
    expect(range.year).toBe(2026);
  });

  it('lists all weeks in a year', () => {
    const weeks = getWeeksInYear(2026, 'Asia/Shanghai');
    expect(weeks.length).toBe(53); // 2026 has 53 ISO weeks
    expect(weeks[0]?.weekNumber).toBe(1);
    expect(weeks[0]?.from).toBe('2025-12-29');
    expect(weeks[0]?.to).toBe('2026-01-04');
    expect(weeks[33]?.weekNumber).toBe(34);
    expect(weeks[33]?.from).toBe('2026-08-17');
    expect(weeks[33]?.to).toBe('2026-08-23');
  });

  it('generates available years list', () => {
    const years = getAvailableYears(2026);
    expect(years).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032,
    ]);
  });

  it('formats week header title appropriately', () => {
    const range = getWeekRange('2026-08-18', 'Asia/Shanghai');
    const title = formatWeekHeaderTitle(range);
    expect(title).toBe('2026 年 第 34 周 · 8 月 17 日 — 8 月 23 日');
  });

  it('calculates timed event positions correctly', () => {
    // 2026-08-18 10:30 to 12:00 in UTC is 18:30 to 20:00 in Asia/Shanghai
    const startIso = '2026-08-18T10:30:00.000Z';
    const endIso = '2026-08-18T12:00:00.000Z';
    const pos = calculateEventTimelinePosition(startIso, endIso, 'Asia/Shanghai', 60);

    expect(pos.timeRangeStr).toBe('18:30 - 20:00');
    // 18.5 hours * 60 = 1110px
    expect(pos.topPx).toBe(1110);
    // 1.5 hours * 60 = 90px
    expect(pos.heightPx).toBe(90);
  });

  it('converts local hour and minute to UTC ISO', () => {
    const utcIso = localTimeToUtcIso('2026-08-18', 14, 30, 'Asia/Shanghai');
    // UTC is 6 hours behind Shanghai (06:30)
    expect(utcIso).toBe('2026-08-18T06:30:00.000Z');
  });
});
