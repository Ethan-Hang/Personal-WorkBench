import { describe, it, expect } from 'vitest';
import {
  deriveUrgency,
  priorityScore,
  isUrgentQuadrant,
  isImportantQuadrant,
  IMMINENT_HOURS,
  SOON_HOURS,
} from './priority.js';

const NOW = '2026-09-20T00:00:00.000Z';
const hoursLater = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

describe('deriveUrgency', () => {
  it('无 DDL 即 none（spec §7.4 已接受的取舍）', () => {
    expect(deriveUrgency(null, NOW)).toBe('none');
  });

  it('已过 DDL 为 overdue', () => {
    expect(deriveUrgency(hoursLater(-0.001), NOW)).toBe('overdue');
  });

  it('DDL 正好等于 now 不算 overdue', () => {
    expect(deriveUrgency(NOW, NOW)).toBe('imminent');
  });

  it('24 小时内为 imminent', () => {
    expect(deriveUrgency(hoursLater(1), NOW)).toBe('imminent');
  });

  it('边界：正好 24 小时仍为 imminent', () => {
    expect(deriveUrgency(hoursLater(IMMINENT_HOURS), NOW)).toBe('imminent');
  });

  it('边界：刚过 24 小时变为 soon', () => {
    expect(deriveUrgency(hoursLater(IMMINENT_HOURS + 0.001), NOW)).toBe('soon');
  });

  it('边界：正好 72 小时仍为 soon', () => {
    expect(deriveUrgency(hoursLater(SOON_HOURS), NOW)).toBe('soon');
  });

  it('边界：刚过 72 小时变为 later', () => {
    expect(deriveUrgency(hoursLater(SOON_HOURS + 0.001), NOW)).toBe('later');
  });
});

describe('priorityScore', () => {
  it('同等重要时，越紧急分越高', () => {
    expect(priorityScore('normal', 'overdue')).toBeGreaterThan(priorityScore('normal', 'later'));
  });

  it('同等紧急时，越重要分越高', () => {
    expect(priorityScore('high', 'soon')).toBeGreaterThan(priorityScore('low', 'soon'));
  });

  it('重要性优先于紧急性：重要但不急 > 不重要但已逾期', () => {
    expect(priorityScore('high', 'none')).toBeGreaterThan(priorityScore('low', 'overdue'));
  });
});

describe('四象限映射（spec §7.2）', () => {
  it('overdue/imminent/soon 落在紧急侧', () => {
    expect(['overdue', 'imminent', 'soon'].every((u) => isUrgentQuadrant(u as never))).toBe(true);
  });

  it('later/none 落在不紧急侧', () => {
    expect(['later', 'none'].some((u) => isUrgentQuadrant(u as never))).toBe(false);
  });

  it('只有 high 落在重要侧', () => {
    expect(isImportantQuadrant('high')).toBe(true);
    expect(isImportantQuadrant('normal')).toBe(false);
    expect(isImportantQuadrant('low')).toBe(false);
  });
});
