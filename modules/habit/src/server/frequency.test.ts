import { describe, expect, it } from 'vitest';
import type { CheckinRecord } from './repository.js';
import { isDueOn, progressFor, streakOf, type FrequencyOf } from './frequency.js';

/** 2026-08-17 是周一，2026-08-23 是周日。 */
const daily: FrequencyOf = {
  freqKind: 'daily',
  weekdays: null,
  weeklyCount: null,
  startDate: '2026-08-01',
  targetValue: 1,
};
const mwf: FrequencyOf = { ...daily, freqKind: 'weekdays', weekdays: [1, 3, 5] };
const thrice: FrequencyOf = { ...daily, freqKind: 'weekly-count', weeklyCount: 3 };

function checkins(...dates: string[]): CheckinRecord[] {
  return dates.map((date) => ({ date, value: 1 }));
}

describe('isDueOn', () => {
  it('每日习惯从 startDate 起每天都该做', () => {
    expect(isDueOn(daily, '2026-08-21')).toBe(true);
  });

  it('startDate 之前一律不该做 —— 新建的习惯不凭空造出过去的漏打', () => {
    expect(isDueOn(daily, '2026-07-31')).toBe(false);
    expect(isDueOn(daily, '2026-08-01')).toBe(true);
  });

  it('weekdays 只在指定周几该做', () => {
    expect(isDueOn(mwf, '2026-08-17')).toBe(true); // 周一
    expect(isDueOn(mwf, '2026-08-18')).toBe(false); // 周二
    expect(isDueOn(mwf, '2026-08-21')).toBe(true); // 周五
  });

  it('weekly-count 每天都可以做 —— 「每周三次」不指定哪天', () => {
    expect(isDueOn(thrice, '2026-08-18')).toBe(true);
    expect(isDueOn(thrice, '2026-08-23')).toBe(true);
  });
});

describe('progressFor', () => {
  it('每日习惯看当天的值', () => {
    expect(progressFor(daily, '2026-08-21', [{ date: '2026-08-21', value: 1 }])).toEqual({
      current: 1,
      target: 1,
    });
    expect(progressFor(daily, '2026-08-21', [])).toEqual({ current: 0, target: 1 });
  });

  it('有目标值的习惯直接给出实际值与目标值', () => {
    const reading: FrequencyOf = { ...daily, targetValue: 30 };
    expect(progressFor(reading, '2026-08-21', [{ date: '2026-08-21', value: 12 }])).toEqual({
      current: 12,
      target: 30,
    });
  });

  it('weekly-count 按本周已达标的天数结算，与「今天」是周几无关', () => {
    const done = checkins('2026-08-17', '2026-08-19');
    expect(progressFor(thrice, '2026-08-21', done)).toEqual({ current: 2, target: 3 });
  });

  it('weekly-count 的周边界是周一到周日，上一周的打卡不计入本周', () => {
    const done = checkins('2026-08-16', '2026-08-17');
    expect(progressFor(thrice, '2026-08-21', done)).toEqual({ current: 1, target: 3 });
  });

  it('weekly-count 只把达标的那天算作一次', () => {
    const swim: FrequencyOf = { ...thrice, targetValue: 30 };
    const done = [
      { date: '2026-08-17', value: 30 },
      { date: '2026-08-18', value: 10 },
    ];
    expect(progressFor(swim, '2026-08-21', done)).toEqual({ current: 1, target: 3 });
  });
});

describe('streakOf', () => {
  it('每日习惯数连续达标的天数', () => {
    const done = checkins('2026-08-19', '2026-08-20', '2026-08-21');
    expect(streakOf(daily, done, '2026-08-21')).toBe(3);
  });

  it('今天还没打卡不算断 —— 否则每天早上一睁眼 streak 就归零', () => {
    const done = checkins('2026-08-19', '2026-08-20');
    expect(streakOf(daily, done, '2026-08-21')).toBe(2);
  });

  it('昨天断了但今天打了，streak 重新从 1 开始', () => {
    const done = checkins('2026-08-18', '2026-08-21');
    expect(streakOf(daily, done, '2026-08-21')).toBe(1);
  });

  it('昨天和今天都没打，streak 归零', () => {
    const done = checkins('2026-08-18', '2026-08-19');
    expect(streakOf(daily, done, '2026-08-21')).toBe(0);
  });

  it('weekdays 习惯：非该做的日子没打卡不算断', () => {
    // 一三五习惯，周一与周三都做了；今天是周五还没做。周二周四不该做，不算断。
    const done = checkins('2026-08-17', '2026-08-19');
    expect(streakOf(mwf, done, '2026-08-21')).toBe(2);
  });

  it('weekdays 习惯：漏掉一个该做的日子就断', () => {
    // 周三漏了，只剩周五这一天（今天已做）
    const done = checkins('2026-08-17', '2026-08-21');
    expect(streakOf(mwf, done, '2026-08-21')).toBe(1);
  });

  it('startDate 之前不再回溯，早期习惯不会因「史前空白」被判断', () => {
    const born: FrequencyOf = { ...daily, startDate: '2026-08-19' };
    const done = checkins('2026-08-19', '2026-08-20', '2026-08-21');
    expect(streakOf(born, done, '2026-08-21')).toBe(3);
  });

  it('未达目标值的那天不算达标', () => {
    const reading: FrequencyOf = { ...daily, targetValue: 30 };
    const done = [
      { date: '2026-08-20', value: 30 },
      { date: '2026-08-21', value: 5 },
    ];
    expect(streakOf(reading, done, '2026-08-21')).toBe(1);
  });

  it('weekly-count 数的是连续达标的周数，不是天数', () => {
    // 本周（08-17 起）做满 3 次，上周（08-10 起）也做满 3 次
    const done = checkins(
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    );
    expect(streakOf(thrice, done, '2026-08-21')).toBe(2);
  });

  it('weekly-count 本周还没做满不算断 —— 周还没过完', () => {
    const done = checkins('2026-08-10', '2026-08-11', '2026-08-12', '2026-08-17');
    expect(streakOf(thrice, done, '2026-08-21')).toBe(1);
  });

  it('weekly-count 上周没做满就断在那里', () => {
    const done = checkins('2026-08-10', '2026-08-17', '2026-08-18', '2026-08-19');
    expect(streakOf(thrice, done, '2026-08-21')).toBe(1);
  });

  it('没有任何打卡时 streak 是 0', () => {
    expect(streakOf(daily, [], '2026-08-21')).toBe(0);
    expect(streakOf(mwf, [], '2026-08-21')).toBe(0);
    expect(streakOf(thrice, [], '2026-08-21')).toBe(0);
  });
});
