import { describe, expect, it } from 'vitest';
import {
  createApplicationInputSchema,
  updateApplicationInputSchema,
  updateRoundInputSchema,
} from './contract.js';

describe('campus recruit contract', () => {
  it('fills application defaults and trims required text', () => {
    const parsed = createApplicationInputSchema.parse({
      company: '  星云科技  ',
      position: '固件工程师',
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
        applyDeadlineDate: '2026/09/20',
      }),
    ).toThrow();
  });

  it('rejects calendar-invalid deadline dates while accepting a leap day', () => {
    for (const applyDeadlineDate of ['2026-13-01', '2026-02-31', '2025-02-29']) {
      expect(() =>
        createApplicationInputSchema.parse({ company: 'A', position: 'B', applyDeadlineDate }),
      ).toThrow();
    }

    expect(
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        applyDeadlineDate: '2024-02-29',
      }).applyDeadlineDate,
    ).toBe('2024-02-29');
  });

  it('accepts only UTC instants with exactly three fractional digits', () => {
    expect(
      createApplicationInputSchema.parse({
        company: 'A',
        position: 'B',
        appliedAt: '2026-09-20T11:00:00.000Z',
      }).appliedAt,
    ).toBe('2026-09-20T11:00:00.000Z');

    for (const appliedAt of [
      '2026-09-20T19:00:00+08:00',
      '2026-09-20T11:00:00Z',
      '2026-09-20T11:00:00.12Z',
    ]) {
      expect(() =>
        createApplicationInputSchema.parse({ company: 'A', position: 'B', appliedAt }),
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
