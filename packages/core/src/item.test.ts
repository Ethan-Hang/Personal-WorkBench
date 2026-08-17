import { describe, it, expect } from 'vitest';
import { scheduledSortKey, IMPORTANCE_RANK } from './item.js';

describe('scheduledSortKey', () => {
  it('全天事件用浮动日期本身作为排序键', () => {
    expect(scheduledSortKey({ kind: 'all-day', date: '2026-09-20' })).toBe('2026-09-20');
  });

  it('定时事件用 UTC instant 作为排序键', () => {
    expect(scheduledSortKey({ kind: 'timed', start: '2026-09-20T09:00:00.000Z' })).toBe(
      '2026-09-20T09:00:00.000Z',
    );
  });

  it('同日的全天事件排在定时事件之前（spec §6.3 附带收益）', () => {
    const allDay = scheduledSortKey({ kind: 'all-day', date: '2026-09-20' });
    const timed = scheduledSortKey({ kind: 'timed', start: '2026-09-20T09:00:00.000Z' });
    expect(allDay < timed).toBe(true);
  });
});

describe('IMPORTANCE_RANK', () => {
  it('high > normal > low', () => {
    expect(IMPORTANCE_RANK.high).toBeGreaterThan(IMPORTANCE_RANK.normal);
    expect(IMPORTANCE_RANK.normal).toBeGreaterThan(IMPORTANCE_RANK.low);
  });
});
