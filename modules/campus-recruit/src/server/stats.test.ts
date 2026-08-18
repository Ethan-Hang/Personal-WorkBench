import { describe, expect, it } from 'vitest';
import { applicationFixture, roundFixture } from '../testing/fixtures.js';
import { computeStats } from './stats.js';

const NOW = '2026-11-30T00:00:00.000Z';

describe('computeStats', () => {
  it('computes funnel rates using applications, not number of rounds', () => {
    const apps = [
      applicationFixture({ id: 'a1', appliedAt: NOW, outcome: 'offer' }),
      applicationFixture({ id: 'a2', appliedAt: NOW }),
    ];
    const rounds = [
      roundFixture({ id: 'r1', applicationId: 'a1', kind: 'technical' }),
      roundFixture({ id: 'r2', applicationId: 'a1', kind: 'technical', sequence: 2 }),
      roundFixture({ id: 'r3', applicationId: 'a2', kind: 'assessment' }),
    ];
    const stats = computeStats(apps, rounds, NOW);
    expect(stats.assessment).toBe(1);
    expect(stats.technical).toBe(1);
    expect(stats.rates.applicationToAssessment).toBe(0.5);
    expect(stats.rates.applicationToTechnical).toBe(0.5);
    expect(stats.rates.technicalToOffer).toBe(1);
  });

  it('returns null rather than zero or NaN for an empty denominator', () => {
    const stats = computeStats([], [], NOW);
    expect(stats.rates).toEqual({
      applicationToAssessment: null,
      applicationToTechnical: null,
      technicalToOffer: null,
    });
  });

  it('counts each failed round in failedByKind', () => {
    const applications = [applicationFixture({ id: 'a1', appliedAt: NOW })];
    const rounds = [
      roundFixture({ id: 'r1', applicationId: 'a1', kind: 'technical', outcome: 'failed' }),
      roundFixture({
        id: 'r2',
        applicationId: 'a1',
        sequence: 2,
        kind: 'technical',
        outcome: 'failed',
      }),
      roundFixture({ id: 'r3', applicationId: 'a1', kind: 'hr', outcome: 'failed' }),
    ];
    const stats = computeStats(applications, rounds, NOW);
    expect(stats.failed).toBe(1);
    expect(stats.failedByKind).toEqual([
      { kind: 'technical', count: 2 },
      { kind: 'hr', count: 1 },
    ]);
  });
});
