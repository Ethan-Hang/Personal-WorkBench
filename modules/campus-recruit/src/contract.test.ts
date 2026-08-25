import { describe, expect, it } from 'vitest';
import {
  CAMPUS_API,
  ID_PARAM,
  applicationsQuery,
  createApplicationInputSchema,
  createSeasonInputSchema,
  statsQuery,
  updateApplicationInputSchema,
  updateRoundInputSchema,
  updateSeasonInputSchema,
} from './contract.js';

describe('campus recruit contract', () => {
  it('fills application defaults and trims required text', () => {
    const parsed = createApplicationInputSchema.parse({
      company: '  星云科技  ',
      position: '固件工程师',
      seasonId: 'season-legacy-autumn',
    });
    expect(parsed.company).toBe('星云科技');
    expect(parsed.priority).toBe('B');
    expect(parsed.applyDeadlineDate).toBeNull();
    expect(parsed.outcome).toBeNull();
  });

  it('rejects an invalid deadline date', () => {
    expect(() =>
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        seasonId: 's1',
        applyDeadlineDate: '2026/09/20',
      }),
    ).toThrow();
  });

  it('rejects calendar-invalid deadline dates while accepting a leap day', () => {
    for (const applyDeadlineDate of ['2026-13-01', '2026-02-31', '2025-02-29']) {
      expect(() =>
        createApplicationInputSchema.parse({
          company: 'A',
          position: 'B',
          seasonId: 's1',
          applyDeadlineDate,
        }),
      ).toThrow();
    }

    expect(
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        seasonId: 's1',
        applyDeadlineDate: '2024-02-29',
      }).applyDeadlineDate,
    ).toBe('2024-02-29');
  });

  it('accepts only UTC instants with exactly three fractional digits', () => {
    expect(
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        seasonId: 's1',
        appliedAt: '2026-09-20T11:00:00.000Z',
      }).appliedAt,
    ).toBe('2026-09-20T11:00:00.000Z');

    for (const appliedAt of [
      '2026-09-20T19:00:00+08:00',
      '2026-09-20T11:00:00Z',
      '2026-09-20T11:00:00.12Z',
    ]) {
      expect(() =>
        createApplicationInputSchema.parse({
          company: 'A',
          position: 'B',
          seasonId: 's1',
          appliedAt,
        }),
      ).toThrow();
    }
  });

  it('requires a positive round sequence when supplied', () => {
    expect(() => updateRoundInputSchema.parse({ sequence: 0 })).toThrow();
  });

  it('does not inject create defaults into omitted application update fields', () => {
    expect(updateApplicationInputSchema.parse({ city: '上海' })).toEqual({ city: '上海' });
  });

  it('does not inject create defaults into omitted round update fields', () => {
    expect(updateRoundInputSchema.parse({ outcome: 'failed' })).toEqual({ outcome: 'failed' });
  });

  it('preserves explicit nullable and default-valued update fields', () => {
    expect(
      updateApplicationInputSchema.parse({
        applyDeadlineDate: null,
        priority: 'B',
        outcome: null,
      }),
    ).toEqual({ applyDeadlineDate: null, priority: 'B', outcome: null });
    expect(
      updateRoundInputSchema.parse({
        scheduledAt: null,
        format: null,
        durationMin: null,
        outcome: 'pending',
        notes: null,
        sequence: 1,
      }),
    ).toEqual({
      scheduledAt: null,
      format: null,
      durationMin: null,
      outcome: 'pending',
      notes: null,
      sequence: 1,
    });
  });
});

describe('CAMPUS_API 端点定义', () => {
  it('传占位符得到 Fastify 注册用的模式', () => {
    expect(CAMPUS_API.application(ID_PARAM)).toBe('/api/campus/applications/:id');
    expect(CAMPUS_API.round(ID_PARAM)).toBe('/api/campus/rounds/:id');
    expect(CAMPUS_API.applicationRounds(ID_PARAM)).toBe('/api/campus/applications/:id/rounds');
  });

  it('传真实 id 得到转义后的请求路径', () => {
    expect(CAMPUS_API.application('a b/c')).toBe('/api/campus/applications/a%20b%2Fc');
  });

  /**
   * 这条守的是一个会静默炸掉的改动：若有人「简化」segment() 去掉占位符直通，
   * ':id' 会被转义成 '%3Aid'，Fastify 于是注册了一个字面量路径——
   * 所有带参数的路由全部失效，且不报任何错。
   */
  it('占位符不得被转义', () => {
    expect(CAMPUS_API.application(ID_PARAM)).not.toContain('%3A');
  });
  it('招聘季的形状与端点', () => {
    expect(CAMPUS_API.seasons).toBe('/api/campus/seasons');
    expect(CAMPUS_API.season('s1')).toBe('/api/campus/seasons/s1');
    expect(CAMPUS_API.season('s/1')).toBe('/api/campus/seasons/s%2F1');
    expect(CAMPUS_API.season(ID_PARAM)).toBe('/api/campus/seasons/:id');

    // 季筛选是查询参数，省略即全部季（命令面板要跨季搜索）
    expect(applicationsQuery()).toBe('/api/campus/applications');
    expect(applicationsQuery('s1')).toBe('/api/campus/applications?seasonId=s1');
    expect(statsQuery('s/1')).toBe('/api/campus/stats?seasonId=s%2F1');

    expect(createSeasonInputSchema.parse({ name: ' 2027 春招 ', kind: 'campus-spring' })).toEqual({
      name: '2027 春招',
      kind: 'campus-spring',
      startDate: null,
      endDate: null,
      notes: null,
    });

    expect(() => createSeasonInputSchema.parse({ name: '  ', kind: 'social' })).toThrow();
    expect(() => createSeasonInputSchema.parse({ name: 'x', kind: '实习' })).toThrow();
    // 起止是浮动日期，不接受时刻
    expect(() =>
      createSeasonInputSchema.parse({
        name: 'x',
        kind: 'social',
        startDate: '2027-02-01T00:00:00Z',
      }),
    ).toThrow();

    expect(updateSeasonInputSchema.parse({ archived: true })).toEqual({ archived: true });
  });

  it('创建投递必须指定招聘季，改季即移动投递', () => {
    expect(() => createApplicationInputSchema.parse({ company: 'A', position: 'B' })).toThrow();
    expect(
      createApplicationInputSchema.parse({ company: 'A', position: 'B', seasonId: 's1' }).seasonId,
    ).toBe('s1');
    expect(updateApplicationInputSchema.parse({ seasonId: 's2' })).toEqual({ seasonId: 's2' });
  });
});
