import { describe, it, expect } from 'vitest';
import {
  toUtcIso,
  formatUtcToLocal,
  formatUtcShort,
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
  /**
   * 就地编辑表单（招聘轮次那套）把库里的 UTC 时刻用 formatUtcToLocal 摊成本地墙钟填进
   * DatePicker，保存时再 toUtcIso 换回去。这一来一回必须是恒等的——否则「只改了个名字」
   * 也会把时间每存一次挪一格，而且不报错。
   */
  it('分钟精度的时刻经 formatUtcToLocal → toUtcIso 往返恒等', () => {
    const zones = ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'UTC'];
    const instants = [
      '2026-09-21T02:00:00.000Z',
      '2026-09-25T15:59:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-07-01T23:30:00.000Z',
    ];
    for (const zone of zones) {
      for (const utc of instants) {
        expect(toUtcIso(formatUtcToLocal(utc, zone).full, zone)).toBe(utc);
      }
    }
  });
  /**
   * 这个函数存在的全部理由：**它必须按传入的时区渲染**。不带 timeZone 的
   * `Intl.DateTimeFormat` 按宿主机器的时区走，于是设置里换时区界面纹丝不动，
   * 而且不报错——只是显示的一直是另一个时区的钟点。
   */
  it('formatUtcShort 按传入时区渲染，换时区结果就该跟着变', () => {
    const utc = '2026-09-21T02:00:00.000Z';
    expect(formatUtcShort(utc, 'Asia/Shanghai')).toBe('9/21 10:00');
    expect(formatUtcShort(utc, 'UTC')).toBe('9/21 02:00');
    // 纽约此刻还是前一天晚上——跨日的那一格正是最容易看错的地方
    expect(formatUtcShort(utc, 'America/New_York')).toBe('9/20 22:00');
  });

  it('formatUtcShort 遇到坏值原样返回，不抛', () => {
    expect(formatUtcShort('not-a-date', 'Asia/Shanghai')).toBe('not-a-date');
  });
});
