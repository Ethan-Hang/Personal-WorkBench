import { describe, expect, it } from 'vitest';
import type { SeasonView } from '../contract.js';
import { pickInitialSeason } from './useCurrentSeason.js';

const season = (id: string, archivedAt: string | null = null): SeasonView => ({
  id,
  name: id,
  kind: 'social',
  startDate: null,
  endDate: null,
  archivedAt,
  notes: null,
  applicationCount: 0,
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
});

describe('pickInitialSeason', () => {
  it('优先用上次选的那一季', () => {
    expect(pickInitialSeason([season('a'), season('b')], 'b')?.id).toBe('b');
  });

  it('上次选的季已被删除时退回第一个未归档的季', () => {
    const seasons = [season('a', '2026-08-01T00:00:00.000Z'), season('b')];
    expect(pickInitialSeason(seasons, 'gone')?.id).toBe('b');
  });

  it('上次选的季已归档仍然尊重它——归档只影响列举，不该把人踢出正在看的季', () => {
    const archived = season('a', '2026-08-01T00:00:00.000Z');
    expect(pickInitialSeason([archived, season('b')], 'a')?.id).toBe('a');
  });

  it('全部季都归档了也要给出一个，否则页面无季可用', () => {
    const seasons = [season('a', '2026-08-01T00:00:00.000Z')];
    expect(pickInitialSeason(seasons, null)?.id).toBe('a');
  });

  it('一个季都没有时返回 null', () => {
    expect(pickInitialSeason([], null)).toBeNull();
  });
});
