import { describe, it, expect } from 'vitest';
import { HABIT_MODULE_ID, CHECKIN_BACKFILL_DAYS } from '../contract.js';
import { habitUiModule, HabitsPage } from './index.js';
import { addDays, isoWeekdayOf, startOfWeek } from '../server/frequency.js';

describe('habitUiModule & HabitsPage', () => {
  it('正确导出 habitUiModule 并符合 UiModuleDefinition 规范', () => {
    expect(habitUiModule).toBeDefined();
    expect(habitUiModule.id).toBe(HABIT_MODULE_ID);
    expect(habitUiModule.nav).toEqual([{ path: '/habits', label: '习惯' }]);
    expect(habitUiModule.routes).toHaveLength(1);
    expect(habitUiModule.routes[0]?.path).toBe('/habits');
  });

  it('成功导出 HabitsPage React 组件', () => {
    expect(HabitsPage).toBeDefined();
    expect(typeof HabitsPage).toBe('function');
  });

  it('7 天补卡窗口边界计算准确（含今天共 7 天）', () => {
    const today = '2026-08-21';
    const backfillStart = addDays(today, -(CHECKIN_BACKFILL_DAYS - 1));
    expect(backfillStart).toBe('2026-08-15');

    // 窗口内：2026-08-15 到 2026-08-21 共 7 天
    let count = 0;
    let cursor = backfillStart;
    while (cursor <= today) {
      count += 1;
      cursor = addDays(cursor, 1);
    }
    expect(count).toBe(7);

    // 2026-08-14 在窗口外（超出 7 天）
    expect('2026-08-14' < backfillStart).toBe(true);
  });

  it('早于 startDate 的日期不可打卡且判定为非可补卡状态', () => {
    const today = '2026-08-21';
    const startDate = '2026-08-20';
    const backfillStart = addDays(today, -(CHECKIN_BACKFILL_DAYS - 1)); // 2026-08-15

    const dateBeforeStart = '2026-08-18';
    const isWithin7Days = dateBeforeStart >= backfillStart && dateBeforeStart <= today;
    const isBeforeStart = dateBeforeStart < startDate;
    const isBackfillable = isWithin7Days && !isBeforeStart;

    expect(isWithin7Days).toBe(true);
    expect(isBeforeStart).toBe(true);
    expect(isBackfillable).toBe(false);
  });

  it('周起点（周一）计算准确且不跨时区', () => {
    // 2026-08-21 是周五（ISO 5）
    expect(isoWeekdayOf('2026-08-21')).toBe(5);
    expect(startOfWeek('2026-08-21')).toBe('2026-08-17');
    expect(isoWeekdayOf('2026-08-17')).toBe(1); // 周一
  });
});
