import { describe, it, expect } from 'vitest';
import {
  toUtcIso,
  formatUtcToLocal,
  getTimezoneInfo,
  WORLD_TIMEZONES,
  DEFAULT_TIMEZONE,
} from './TimezoneContext.js';

describe('TimezoneContext & UTC conversion utilities', () => {
  it('默认时区为 Asia/Shanghai (北京/上海)', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Shanghai');
  });

  it('WORLD_TIMEZONES 包含上海、伦敦、纽约、东京等主要枢纽时区且坐标完整', () => {
    const shanghai = WORLD_TIMEZONES.find((t) => t.id === 'Asia/Shanghai');
    expect(shanghai).toBeDefined();
    expect(shanghai?.offsetHours).toBe(8);
    expect(shanghai?.coords.x).toBeGreaterThan(0);
    expect(shanghai?.coords.y).toBeGreaterThan(0);

    const london = WORLD_TIMEZONES.find((t) => t.id === 'Europe/London');
    expect(london).toBeDefined();

    const newYork = WORLD_TIMEZONES.find((t) => t.id === 'America/New_York');
    expect(newYork).toBeDefined();
  });

  it('toUtcIso 将上海时区 (UTC+8) 的墙钟时间精准换算为 UTC ISO 时刻', () => {
    // 2026-08-18 15:30 in Asia/Shanghai should be 2026-08-18T07:30:00.000Z
    const utcIso = toUtcIso('2026-08-18 15:30', 'Asia/Shanghai');
    expect(utcIso).toBe('2026-08-18T07:30:00.000Z');
  });

  it('toUtcIso 处理只有日期的情况，默认以 00:00 计算', () => {
    const utcIso = toUtcIso('2026-08-18', 'Asia/Shanghai');
    expect(utcIso).toBe('2026-08-17T16:00:00.000Z');
  });

  it('formatUtcToLocal 将 UTC ISO 时刻在指定时区下格式化为当地时间', () => {
    const local = formatUtcToLocal('2026-08-18T07:30:00.000Z', 'Asia/Shanghai');
    expect(local.date).toBe('2026-08-18');
    expect(local.time).toBe('15:30');
    expect(local.full).toBe('2026-08-18 15:30');
  });

  it('getTimezoneInfo 正确返回时区偏移信息', () => {
    const info = getTimezoneInfo('Asia/Shanghai');
    expect(info.timeZone).toBe('Asia/Shanghai');
    expect(info.offsetStr).toBe('UTC+08:00');
    expect(info.hasDst).toBe(false);
  });
});
