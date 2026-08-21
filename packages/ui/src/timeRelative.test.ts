import { describe, expect, it } from 'vitest';
import { formatRelativeBackupTime } from './timeRelative.js';

describe('formatRelativeBackupTime', () => {
  const BASE_TIME = new Date('2026-08-21T12:00:00.000Z');

  it('未提供时间或空值返回「未备份」', () => {
    expect(formatRelativeBackupTime(null)).toBe('未备份');
    expect(formatRelativeBackupTime(undefined)).toBe('未备份');
    expect(formatRelativeBackupTime('')).toBe('未备份');
    expect(formatRelativeBackupTime('invalid-date')).toBe('未备份');
  });

  it('时间差小于1分钟或负值返回「刚刚」', () => {
    // 0 秒
    expect(formatRelativeBackupTime(BASE_TIME, { now: BASE_TIME })).toBe('刚刚');
    // 30 秒前
    const thirtySecAgo = new Date('2026-08-21T11:59:30.000Z');
    expect(formatRelativeBackupTime(thirtySecAgo, { now: BASE_TIME })).toBe('刚刚');
    // 负数（时钟偏快）
    const future = new Date('2026-08-21T12:00:10.000Z');
    expect(formatRelativeBackupTime(future, { now: BASE_TIME })).toBe('刚刚');
  });

  it('1分钟到59分钟返回「几分钟前」', () => {
    const oneMinAgo = new Date('2026-08-21T11:59:00.000Z');
    expect(formatRelativeBackupTime(oneMinAgo, { now: BASE_TIME })).toBe('1分钟前');

    const fiveMinsAgo = new Date('2026-08-21T11:55:00.000Z');
    expect(formatRelativeBackupTime(fiveMinsAgo, { now: BASE_TIME })).toBe('5分钟前');

    const fortyTwoMinsAgo = new Date('2026-08-21T11:18:00.000Z');
    expect(formatRelativeBackupTime(fortyTwoMinsAgo, { now: BASE_TIME })).toBe('42分钟前');
  });

  it('1小时到24小时返回「几h几m前」或「几h前」', () => {
    const oneHourAgo = new Date('2026-08-21T11:00:00.000Z');
    expect(formatRelativeBackupTime(oneHourAgo, { now: BASE_TIME })).toBe('1h前');

    const oneHourTwentyMinsAgo = new Date('2026-08-21T10:40:00.000Z');
    expect(formatRelativeBackupTime(oneHourTwentyMinsAgo, { now: BASE_TIME })).toBe('1h20m前');

    const twoHoursAgo = new Date('2026-08-21T10:00:00.000Z');
    expect(formatRelativeBackupTime(twoHoursAgo, { now: BASE_TIME })).toBe('2h前');

    const fiveHoursNineMinsAgo = new Date('2026-08-21T06:51:00.000Z');
    expect(formatRelativeBackupTime(fiveHoursNineMinsAgo, { now: BASE_TIME })).toBe('5h9m前');
  });

  it('1天到7天返回「几d几h前」或「几d前」', () => {
    const oneDayAgo = new Date('2026-08-20T12:00:00.000Z');
    expect(formatRelativeBackupTime(oneDayAgo, { now: BASE_TIME })).toBe('1d前');

    const oneDayThreeHoursAgo = new Date('2026-08-20T09:00:00.000Z');
    expect(formatRelativeBackupTime(oneDayThreeHoursAgo, { now: BASE_TIME })).toBe('1d3h前');

    const fourDaysTwelveHoursAgo = new Date('2026-08-17T00:00:00.000Z');
    expect(formatRelativeBackupTime(fourDaysTwelveHoursAgo, { now: BASE_TIME })).toBe('4d12h前');
  });

  it('超过7天返回具体年月日与时分', () => {
    const tenDaysAgo = '2026-08-11T06:30:00.000Z';
    // Shanghai 是 UTC+8 -> 2026-08-11 14:30
    expect(
      formatRelativeBackupTime(tenDaysAgo, { now: BASE_TIME, timeZone: 'Asia/Shanghai' }),
    ).toBe('2026-08-11 14:30');
  });
});
