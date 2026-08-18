import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInMonth,
  diffDays,
  expandOccurrences,
  weekdayOf,
  type RecurrenceRule,
} from './recurrence.js';

function rule(overrides: Partial<RecurrenceRule>): RecurrenceRule {
  return {
    freq: 'daily',
    interval: 1,
    byWeekday: null,
    byMonthday: null,
    startDate: '2026-09-01',
    untilDate: null,
    ...overrides,
  };
}

describe('日期算术', () => {
  it('跨月加天', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('跨年加天', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('减天', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('闰年二月', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('星期几：2026-09-01 是周二', () => {
    expect(weekdayOf('2026-09-01')).toBe(2);
  });

  it('相差天数', () => {
    expect(diffDays('2026-09-01', '2026-09-08')).toBe(7);
    expect(diffDays('2026-09-08', '2026-09-01')).toBe(-7);
  });
});

describe('daily 展开', () => {
  it('每天', () => {
    const dates = expandOccurrences(rule({}), '2026-09-01', '2026-09-04');
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  });

  it('每 3 天，锚定在 startDate 上', () => {
    const dates = expandOccurrences(rule({ interval: 3 }), '2026-09-01', '2026-09-10');
    expect(dates).toEqual(['2026-09-01', '2026-09-04', '2026-09-07', '2026-09-10']);
  });

  it('区间起点晚于 startDate 时，相位不变', () => {
    const dates = expandOccurrences(rule({ interval: 3 }), '2026-09-05', '2026-09-11');
    // 相位仍是 9/1 起算的 0,3,6,9…，故命中 9/7 与 9/10，而不是从 9/5 重新起算
    expect(dates).toEqual(['2026-09-07', '2026-09-10']);
  });

  it('untilDate 截断，且含当日', () => {
    const dates = expandOccurrences(rule({ untilDate: '2026-09-03' }), '2026-09-01', '2026-09-10');
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('区间完全早于 startDate 时为空', () => {
    expect(expandOccurrences(rule({}), '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('weekly 展开', () => {
  it('每周一三五', () => {
    // 2026-09-01 是周二
    const dates = expandOccurrences(
      rule({ freq: 'weekly', byWeekday: [1, 3, 5] }),
      '2026-09-01',
      '2026-09-14',
    );
    expect(dates).toEqual([
      '2026-09-02', // 周三
      '2026-09-04', // 周五
      '2026-09-07', // 周一
      '2026-09-09',
      '2026-09-11',
      '2026-09-14',
    ]);
  });

  it('不早于 startDate——同周里 startDate 之前的那些天不生成', () => {
    // startDate 是周二，本周的周一（8/31）不该出现
    const dates = expandOccurrences(
      rule({ freq: 'weekly', byWeekday: [1] }),
      '2026-08-25',
      '2026-09-10',
    );
    expect(dates).toEqual(['2026-09-07']);
  });

  it('每两周一次，隔周的那一周整周跳过', () => {
    const dates = expandOccurrences(
      rule({ freq: 'weekly', interval: 2, byWeekday: [3] }),
      '2026-09-01',
      '2026-09-30',
    );
    expect(dates).toEqual(['2026-09-02', '2026-09-16', '2026-09-30']);
  });

  it('byWeekday 为空时不生成任何日期', () => {
    expect(
      expandOccurrences(rule({ freq: 'weekly', byWeekday: [] }), '2026-09-01', '2026-09-30'),
    ).toEqual([]);
  });
});

describe('monthly 展开', () => {
  it('每月 15 号', () => {
    const dates = expandOccurrences(
      rule({ freq: 'monthly', byMonthday: 15 }),
      '2026-09-01',
      '2026-12-31',
    );
    expect(dates).toEqual(['2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']);
  });

  it('每月 31 号：没有 31 号的月份整月跳过，不顺延也不回退', () => {
    const dates = expandOccurrences(
      rule({ freq: 'monthly', byMonthday: 31, startDate: '2026-01-31' }),
      '2026-01-01',
      '2026-12-31',
    );
    // 2、4、6、9、11 月没有 31 号
    expect(dates).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
  });

  it('每两个月一次', () => {
    const dates = expandOccurrences(
      rule({ freq: 'monthly', interval: 2, byMonthday: 1 }),
      '2026-09-01',
      '2027-03-31',
    );
    expect(dates).toEqual(['2026-09-01', '2026-11-01', '2027-01-01', '2027-03-01']);
  });

  it('跨年推进', () => {
    const dates = expandOccurrences(
      rule({ freq: 'monthly', byMonthday: 1, startDate: '2026-11-01' }),
      '2026-11-01',
      '2027-02-28',
    );
    expect(dates).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });
});

describe('区间边界', () => {
  it('untilDate 早于 from 时为空', () => {
    expect(
      expandOccurrences(rule({ untilDate: '2026-08-15' }), '2026-09-01', '2026-09-30'),
    ).toEqual([]);
  });

  it('单日区间', () => {
    expect(expandOccurrences(rule({}), '2026-09-05', '2026-09-05')).toEqual(['2026-09-05']);
  });
});
