import { describe, expect, it } from 'vitest';
import { applicationFixture, roundFixture } from '../testing/fixtures.js';
import type { ApplicationPriority } from '../contract.js';
import { deriveApplicationStatus, priorityToImportance } from './domain.js';

const NOW = '2026-11-30T00:00:00.000Z';

describe('deriveApplicationStatus', () => {
  it.each([
    ['offer', applicationFixture({ outcome: 'offer' }), [], 'offer'],
    ['oc', applicationFixture({ outcome: 'oc' }), [], 'oc'],
    ['declined', applicationFixture({ outcome: 'declined' }), [], 'declined'],
    ['rejected', applicationFixture({ outcome: 'rejected' }), [], 'failed'],
    ['pending', applicationFixture({ appliedAt: null }), [], 'pending'],
    ['applied', applicationFixture({ appliedAt: '2026-11-01T00:00:00.000Z' }), [], 'applied'],
  ])('%s status', (_name, application, rounds, expected) => {
    expect(deriveApplicationStatus(application, rounds, NOW).code).toBe(expected);
  });

  it('offer wins over a failed round', () => {
    const status = deriveApplicationStatus(
      applicationFixture({ outcome: 'offer' }),
      [roundFixture({ outcome: 'failed', name: '一面' })],
      NOW,
    );
    expect(status.code).toBe('offer');
  });

  it('uses the highest sequence as the latest round even when it has no schedule', () => {
    const status = deriveApplicationStatus(
      // 投递时间取近期：默认 fixture 投于三个月前，轮次又全是待定，会先被判成泡池子
      applicationFixture({ appliedAt: '2026-11-20T00:00:00.000Z' }),
      [
        roundFixture({ id: 'r1', sequence: 1, name: '一面', scheduledAt: NOW }),
        roundFixture({ id: 'r2', sequence: 2, name: '二面', scheduledAt: null }),
      ],
      NOW,
    );
    expect(status).toMatchObject({ code: 'in_progress', label: '流程中 · 二面' });
  });

  it('derives failed round name', () => {
    expect(
      deriveApplicationStatus(
        applicationFixture(),
        [roundFixture({ outcome: 'failed', name: '技术一面' })],
        NOW,
      ),
    ).toEqual({ code: 'failed', label: '已挂 · 技术一面', failedRoundName: '技术一面' });
  });

  it('shelves only after strictly more than 90 days', () => {
    const exactly = applicationFixture({ appliedAt: '2026-09-01T00:00:00.000Z' });
    expect(deriveApplicationStatus(exactly, [], '2026-11-30T00:00:00.000Z').code).toBe('applied');
    expect(deriveApplicationStatus(exactly, [], '2026-11-30T00:00:00.001Z').code).toBe('shelved');
  });

  it('全部轮次仍未出结果时照样泡池子——否则自动补的简历初筛会让这条判定永久失效', () => {
    const old = applicationFixture({ appliedAt: '2026-01-01T00:00:00.000Z' });
    expect(
      deriveApplicationStatus(old, [roundFixture({ kind: 'screening', name: '简历初筛' })], NOW)
        .code,
    ).toBe('shelved');
  });

  it('只要有一轮出过结果就不是泡池子——流程真的动过', () => {
    const old = applicationFixture({ appliedAt: '2026-01-01T00:00:00.000Z' });
    expect(
      deriveApplicationStatus(old, [roundFixture({ outcome: 'passed', name: '一面' })], NOW).code,
    ).toBe('in_progress');
  });

  it('手标的泡池子立刻生效，不必等 90 天', () => {
    const justApplied = applicationFixture({
      appliedAt: '2026-11-29T00:00:00.000Z',
      shelvedAt: '2026-11-29T06:00:00.000Z',
    });
    expect(deriveApplicationStatus(justApplied, [], NOW)).toMatchObject({
      code: 'shelved',
      label: '泡池子',
    });
  });

  it('已挂盖过手标的泡池子——泡着泡着挂了，显示「已挂」更准', () => {
    const shelvedThenFailed = applicationFixture({ shelvedAt: '2026-11-01T00:00:00.000Z' });
    expect(
      deriveApplicationStatus(shelvedThenFailed, [roundFixture({ outcome: 'failed' })], NOW).code,
    ).toBe('failed');
  });

  it.each([
    ['S', 'high'],
    ['A', 'high'],
    ['B', 'normal'],
    ['C', 'low'],
  ] as const)('maps %s priority to %s importance', (priority, expected) => {
    expect(priorityToImportance(priority as ApplicationPriority)).toBe(expected);
  });
});
