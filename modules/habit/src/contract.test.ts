import { describe, expect, it } from 'vitest';
import {
  HABIT_API,
  HABIT_MODULE_ID,
  ID_PARAM,
  DATE_PARAM,
  CHECKIN_BACKFILL_DAYS,
  createHabitInputSchema,
  checkinInputSchema,
} from './contract.js';

describe('HABIT_API', () => {
  it('把 ID_PARAM 原样透出，作为 Fastify 注册模式', () => {
    expect(HABIT_API.habit(ID_PARAM)).toBe('/api/habit/habits/:id');
    expect(HABIT_API.checkin(ID_PARAM, DATE_PARAM)).toBe('/api/habit/habits/:id/checkins/:date');
  });

  it('把真实 id 转义，作为客户端请求路径', () => {
    expect(HABIT_API.habit('a/b')).toBe('/api/habit/habits/a%2Fb');
  });

  it('打卡路径同时带习惯 id 与浮动日期', () => {
    expect(HABIT_API.checkin('h1', '2026-08-21')).toBe('/api/habit/habits/h1/checkins/2026-08-21');
  });

  it('所有路径都挂在本模块的命名空间下', () => {
    expect(HABIT_MODULE_ID).toBe('habit');
    expect(HABIT_API.today).toMatch(/^\/api\/habit\//);
    expect(HABIT_API.habits).toMatch(/^\/api\/habit\//);
  });
});

describe('createHabitInputSchema', () => {
  const base = { name: '阅读', startDate: '2026-08-21' };

  it('接受最简的每日习惯，目标值默认为 1', () => {
    const parsed = createHabitInputSchema.parse({ ...base, freqKind: 'daily' });
    expect(parsed.targetValue).toBe(1);
  });

  it('weekdays 频率必须给出周几', () => {
    expect(() => createHabitInputSchema.parse({ ...base, freqKind: 'weekdays' })).toThrow();
    expect(
      createHabitInputSchema.parse({ ...base, freqKind: 'weekdays', weekdays: [1, 3, 5] }).weekdays,
    ).toEqual([1, 3, 5]);
  });

  it('weekdays 只接受 ISO 周几 1..7', () => {
    expect(() =>
      createHabitInputSchema.parse({ ...base, freqKind: 'weekdays', weekdays: [0] }),
    ).toThrow();
    expect(() =>
      createHabitInputSchema.parse({ ...base, freqKind: 'weekdays', weekdays: [8] }),
    ).toThrow();
  });

  it('weekly-count 必须给出 1..7 的次数', () => {
    expect(() => createHabitInputSchema.parse({ ...base, freqKind: 'weekly-count' })).toThrow();
    expect(() =>
      createHabitInputSchema.parse({ ...base, freqKind: 'weekly-count', weeklyCount: 8 }),
    ).toThrow();
    expect(
      createHabitInputSchema.parse({ ...base, freqKind: 'weekly-count', weeklyCount: 3 })
        .weeklyCount,
    ).toBe(3);
  });

  it('startDate 必须是浮动日期，不接受时刻', () => {
    expect(() =>
      createHabitInputSchema.parse({
        ...base,
        freqKind: 'daily',
        startDate: '2026-08-21T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('目标值至少为 1', () => {
    expect(() =>
      createHabitInputSchema.parse({ ...base, freqKind: 'daily', targetValue: 0 }),
    ).toThrow();
  });
});

describe('checkinInputSchema', () => {
  it('必须同时带 value 与 clientToday —— 服务端不知道用户在哪个时区', () => {
    expect(() => checkinInputSchema.parse({ value: 1 })).toThrow();
    expect(checkinInputSchema.parse({ value: 1, clientToday: '2026-08-21' })).toEqual({
      value: 1,
      clientToday: '2026-08-21',
    });
  });

  it('拒绝负数计数', () => {
    expect(() => checkinInputSchema.parse({ value: -1, clientToday: '2026-08-21' })).toThrow();
  });
});

describe('CHECKIN_BACKFILL_DAYS', () => {
  it('补卡窗口是 7 天', () => {
    expect(CHECKIN_BACKFILL_DAYS).toBe(7);
  });
});

describe('todayHabitSchema', () => {
  it('包含 todayValue 且默认为 0', async () => {
    const { todayHabitSchema } = await import('./contract.js');
    const parsed = todayHabitSchema.parse({
      habit: {
        id: 'h1',
        name: '阅读',
        notes: null,
        targetValue: 3,
        unit: '次',
        freqKind: 'weekly-count',
        weekdays: null,
        weeklyCount: 5,
        startDate: '2026-08-01',
        archivedAt: null,
        colorToken: null,
        position: 0,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      dueToday: true,
      todayValue: 2,
      progress: { current: 1, target: 5 },
      streak: 0,
    });
    expect(parsed.todayValue).toBe(2);
  });
});
