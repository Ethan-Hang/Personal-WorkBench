import { describe, it, expect } from 'vitest';
import { ITEM_STATUSES, IMPORTANCES, ITEM_KINDS, URGENCIES } from '@workbench/core';
import {
  ID_PARAM,
  WORKBENCH_API,
  scheduleInputSchema,
  scheduledTimeSchema,
  workbenchItemSchema,
} from './contract.js';

describe('scheduleInputSchema', () => {
  it('接受合法日期', () => {
    expect(scheduleInputSchema.parse({ date: '2026-09-20' })).toEqual({ date: '2026-09-20' });
  });

  it('接受 null——取消排程，退回待排程抽屉', () => {
    expect(scheduleInputSchema.parse({ date: null })).toEqual({ date: null });
  });

  it('拒绝非 YYYY-MM-DD 的日期', () => {
    expect(scheduleInputSchema.safeParse({ date: '2026/09/20' }).success).toBe(false);
  });

  it('拒绝带时刻的排程——排程只到天（spec §14.3）', () => {
    expect(scheduleInputSchema.safeParse({ date: '2026-09-20T19:00:00.000Z' }).success).toBe(false);
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
});
