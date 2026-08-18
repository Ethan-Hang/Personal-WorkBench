import { describe, it, expect } from 'vitest';
import { ITEM_STATUSES, IMPORTANCES, ITEM_KINDS, URGENCIES } from '@workbench/core';
import {
  CALENDAR_MAX_DAYS,
  ID_PARAM,
  WORKBENCH_API,
  calendarPath,
  calendarQuerySchema,
  scheduleInputSchema,
  scheduledTimeSchema,
  workbenchItemSchema,
} from './contract.js';

describe('scheduleInputSchema', () => {
  it('接受全天排程', () => {
    const input = { scheduled: { kind: 'all-day' as const, date: '2026-09-20' } };
    expect(scheduleInputSchema.parse(input)).toEqual(input);
  });

  it('接受定时排程，end 可缺省', () => {
    const withEnd = {
      scheduled: {
        kind: 'timed' as const,
        start: '2026-09-20T11:00:00.000Z',
        end: '2026-09-20T12:30:00.000Z',
      },
    };
    expect(scheduleInputSchema.parse(withEnd)).toEqual(withEnd);

    const noEnd = { scheduled: { kind: 'timed' as const, start: '2026-09-20T11:00:00.000Z' } };
    expect(scheduleInputSchema.parse(noEnd)).toEqual(noEnd);
  });

  it('接受 null——取消排程，退回待排程抽屉', () => {
    expect(scheduleInputSchema.parse({ scheduled: null })).toEqual({ scheduled: null });
  });

  it('拒绝非 YYYY-MM-DD 的全天日期', () => {
    expect(
      scheduleInputSchema.safeParse({ scheduled: { kind: 'all-day', date: '2026/09/20' } }).success,
    ).toBe(false);
  });

  it('拒绝把日期当成 start 传', () => {
    expect(
      scheduleInputSchema.safeParse({ scheduled: { kind: 'timed', start: '2026-09-20' } }).success,
    ).toBe(false);
  });

  it('拒绝不带 Z / 不是三位毫秒的时刻', () => {
    expect(
      scheduleInputSchema.safeParse({ scheduled: { kind: 'timed', start: '2026-09-20T11:00:00Z' } })
        .success,
    ).toBe(false);
  });

  it('拒绝 end 早于或等于 start', () => {
    const earlier = {
      scheduled: {
        kind: 'timed',
        start: '2026-09-20T12:00:00.000Z',
        end: '2026-09-20T11:00:00.000Z',
      },
    };
    expect(scheduleInputSchema.safeParse(earlier).success).toBe(false);
  });

  it('拒绝未知的第三种形态', () => {
    expect(
      scheduleInputSchema.safeParse({ scheduled: { kind: 'recurring', rrule: 'FREQ=DAILY' } })
        .success,
    ).toBe(false);
  });
});

describe('calendarQuerySchema', () => {
  it('接受合法区间', () => {
    expect(calendarQuerySchema.parse({ from: '2026-09-14', to: '2026-09-20' })).toEqual({
      from: '2026-09-14',
      to: '2026-09-20',
    });
  });

  it('允许 from === to（单日视图）', () => {
    expect(calendarQuerySchema.safeParse({ from: '2026-09-20', to: '2026-09-20' }).success).toBe(
      true,
    );
  });

  it('拒绝 from 晚于 to', () => {
    expect(calendarQuerySchema.safeParse({ from: '2026-09-21', to: '2026-09-20' }).success).toBe(
      false,
    );
  });

  it(`拒绝超过 ${CALENDAR_MAX_DAYS} 天的区间`, () => {
    expect(calendarQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(
      false,
    );
  });
});

describe('scheduledTimeSchema 与 core 的 ScheduledTime 保持一致', () => {
  it('接受全天分支', () => {
    expect(scheduledTimeSchema.parse({ kind: 'all-day', date: '2026-09-20' })).toEqual({
      kind: 'all-day',
      date: '2026-09-20',
    });
  });

  it('接受定时分支，end 可缺省', () => {
    const parsed = scheduledTimeSchema.parse({
      kind: 'timed',
      start: '2026-09-20T11:00:00.000Z',
    });
    expect(parsed).toMatchObject({ kind: 'timed' });
  });

  it('拒绝未知的第三种形态', () => {
    expect(scheduledTimeSchema.safeParse({ kind: 'recurring', rrule: 'FREQ=DAILY' }).success).toBe(
      false,
    );
  });
});

describe('workbenchItemSchema 的枚举与 core 同步', () => {
  // core 若增删枚举值而接缝没跟上，服务端就能产出前端 parse 不了的形状。
  it('status / importance / kind / urgency 四组枚举与 core 完全一致', () => {
    const shape = workbenchItemSchema.shape;
    expect(shape.status.options).toEqual([...ITEM_STATUSES]);
    expect(shape.importance.options).toEqual([...IMPORTANCES]);
    expect(shape.kind.options).toEqual([...ITEM_KINDS]);
    expect(shape.urgency.options.slice().sort()).toEqual([...URGENCIES].sort());
  });
});

describe('WORKBENCH_API 端点定义', () => {
  it('传占位符得到 Fastify 注册用的模式', () => {
    expect(WORKBENCH_API.schedule(ID_PARAM)).toBe('/api/workbench/items/:id/schedule');
  });

  it('传真实 id 得到转义后的请求路径', () => {
    expect(WORKBENCH_API.schedule('a/b c')).toBe('/api/workbench/items/a%2Fb%20c/schedule');
  });

  it('占位符不得被转义', () => {
    expect(WORKBENCH_API.schedule(ID_PARAM)).toContain(ID_PARAM);
  });

  it('calendarPath 拼出带查询串的请求路径', () => {
    expect(calendarPath('2026-09-14', '2026-09-20')).toBe(
      '/api/workbench/calendar?from=2026-09-14&to=2026-09-20',
    );
  });
});
