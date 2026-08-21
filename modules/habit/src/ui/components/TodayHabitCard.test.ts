import { describe, it, expect } from 'vitest';
import { TodayHabitCard } from './TodayHabitCard.js';

describe('TodayHabitCard component', () => {
  it('正确导出 TodayHabitCard 组件', () => {
    expect(TodayHabitCard).toBeDefined();
    expect(typeof TodayHabitCard).toBe('function');
  });
});
