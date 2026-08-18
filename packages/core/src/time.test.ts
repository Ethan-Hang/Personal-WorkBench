import { describe, it, expect } from 'vitest';
import {
  localDayOf,
  localDayRange,
  endOfLocalDayUtc,
  toIsoInstant,
  truncateToMinute,
  resolveDueDateUtc,
} from './time.js';

const SH = 'Asia/Shanghai';
const NY = 'America/New_York';

describe('localDayOf', () => {
  it('按目标时区判断日期，而非 UTC 日期', () => {
    // UTC 的 9/19 16:30 已经是上海的 9/20 00:30
    expect(localDayOf('2026-09-19T16:30:00.000Z', SH)).toBe('2026-09-20');
  });

  it('同一时刻在不同时区可能是不同的一天', () => {
    const instant = '2026-09-20T02:00:00.000Z';
    expect(localDayOf(instant, SH)).toBe('2026-09-20');
    expect(localDayOf(instant, NY)).toBe('2026-09-19');
  });
});

describe('localDayRange', () => {
  it('返回本地日的 UTC 左闭右开区间', () => {
    expect(localDayRange('2026-09-20', SH)).toEqual({
      startUtc: '2026-09-19T16:00:00.000Z',
      endUtc: '2026-09-20T16:00:00.000Z',
    });
  });

  it('跨月边界正确', () => {
    expect(localDayRange('2026-10-01', SH)).toEqual({
      startUtc: '2026-09-30T16:00:00.000Z',
      endUtc: '2026-10-01T16:00:00.000Z',
    });
  });

  it('夏令时切换日的区间长度不是 24 小时', () => {
    // 2026-03-08 是美东夏令时开始日，这一天只有 23 小时
    const { startUtc, endUtc } = localDayRange('2026-03-08', NY);
    const hours = (Date.parse(endUtc) - Date.parse(startUtc)) / 3_600_000;
    expect(hours).toBe(23);
  });

  it('区间是左闭右开：次日零点属于下一天', () => {
    const { endUtc } = localDayRange('2026-09-20', SH);
    expect(localDayOf(endUtc, SH)).toBe('2026-09-21');
  });
});

describe('endOfLocalDayUtc', () => {
  it('把只选到天的 DDL 补成该本地日的最后一毫秒', () => {
    expect(endOfLocalDayUtc('2026-09-20', SH)).toBe('2026-09-20T15:59:59.999Z');
  });
});

describe('toIsoInstant', () => {
  it('输出带毫秒的 UTC ISO8601', () => {
    expect(toIsoInstant(new Date(Date.UTC(2026, 8, 20, 11, 0, 0)))).toBe(
      '2026-09-20T11:00:00.000Z',
    );
  });
});

describe('truncateToMinute', () => {
  it('把秒与毫秒归零', () => {
    expect(truncateToMinute('2026-09-20T11:37:48.512Z')).toBe('2026-09-20T11:37:00.000Z');
  });

  it('已对齐到分钟时原样返回', () => {
    expect(truncateToMinute('2026-09-20T11:37:00.000Z')).toBe('2026-09-20T11:37:00.000Z');
  });

  it('截断而非四舍五入—— 59.999 秒仍归当前分钟', () => {
    expect(truncateToMinute('2026-09-20T11:37:59.999Z')).toBe('2026-09-20T11:37:00.000Z');
  });

  it('带时区偏移的输入先归一到 UTC', () => {
    expect(truncateToMinute('2026-09-20T19:37:48.512+08:00')).toBe('2026-09-20T11:37:00.000Z');
  });

  it('无效输入抛错', () => {
    expect(() => truncateToMinute('not-a-time')).toThrow();
  });
});

describe('resolveDueDateUtc', () => {
  it('支持纯日期 YYYY-MM-DD，补为本地日最后一毫秒的 UTC instant', () => {
    expect(resolveDueDateUtc('2026-09-20', SH)).toBe('2026-09-20T15:59:59.999Z');
  });

  it('支持带时分的本地墙钟时间 YYYY-MM-DD HH:mm，精准按时区转为 UTC instant 并截零到分钟', () => {
    expect(resolveDueDateUtc('2026-09-20 15:30', SH)).toBe('2026-09-20T07:30:00.000Z');
  });

  it('支持 ISO8601 UTC 字符串输入', () => {
    expect(resolveDueDateUtc('2026-09-20T07:30:00.000Z', SH)).toBe('2026-09-20T07:30:00.000Z');
  });

  it('无法识别的格式抛错', () => {
    expect(() => resolveDueDateUtc('invalid-date', SH)).toThrow();
  });
});
