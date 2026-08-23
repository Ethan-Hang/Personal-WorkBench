import { describe, expect, it } from 'vitest';
import {
  CAMPUS_RECRUIT_MODULE_ID,
  createApplicationInputSchema,
  createRoundInputSchema,
} from '../contract.js';
import type { CreateRoundData } from '../contract.js';
import { DomainError } from '@workbench/http-kit';
import { makeCampusHarness } from '../testing/harness.js';
import {
  createApplication,
  createRound,
  deleteApplication,
  deleteRound,
  getStats,
  listApplications,
  markApplicationApplied,
  updateApplication,
  updateRound,
} from './service.js';

const NOW = '2026-09-20T02:00:00.000Z';
const LATER = '2026-09-20T04:00:00.000Z';
const OPTS = { zone: 'Asia/Shanghai', now: NOW } as const;

function pendingApplicationInput() {
  return createApplicationInputSchema.parse({
    company: '星云科技',
    position: '固件工程师',
    priority: 'S',
    applyDeadlineDate: '2026-09-20',
  });
}

function appliedApplicationInput() {
  return createApplicationInputSchema.parse({
    ...pendingApplicationInput(),
    appliedAt: NOW,
  });
}

function roundInput(overrides: Partial<CreateRoundData> = {}): CreateRoundData {
  return createRoundInputSchema.parse({
    kind: 'technical',
    name: '一面',
    scheduledAt: '2026-09-21T02:00:00.000Z',
    durationMin: 60,
    ...overrides,
  });
}

describe('campus recruit service', () => {
  it('creates an application, converts deadline date in the configured zone, and projects it', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    expect(created.applyDeadlineDate).toBe('2026-09-20');
    expect(created.status.code).toBe('pending');
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toEqual([
      expect.objectContaining({
        dueAt: '2026-09-20T15:59:59.999Z',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      }),
    ]);
  });

  it('marking applied completes the deadline projection', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const applied = await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    expect(applied.appliedAt).toBe(NOW);
    expect(applied.status.code).toBe('applied');
    const stored = (await h.repo.getApplication(created.id))!;
    expect(await h.items.getById(stored.deadlineItemId!)).toMatchObject({ status: 'done' });
  });

  it('setting a terminal outcome marks an un-applied record as applied', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const rejected = await updateApplication(
      h.ctx,
      h.repo,
      created.id,
      { outcome: 'rejected' },
      OPTS,
    );

    expect(rejected).toMatchObject({ appliedAt: NOW, outcome: 'rejected', outcomeAt: NOW });
    expect(rejected.status.code).toBe('failed');
  });

  it('does not allow an explicit null appliedAt with a terminal outcome', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const rejected = await updateApplication(
      h.ctx,
      h.repo,
      created.id,
      { appliedAt: null, outcome: 'rejected' },
      OPTS,
    );

    expect(rejected).toMatchObject({ appliedAt: NOW, outcome: 'rejected', outcomeAt: NOW });
  });

  it('creates an application with a terminal outcome as applied', async () => {
    const h = makeCampusHarness();
    const input = createApplicationInputSchema.parse({
      ...pendingApplicationInput(),
      outcome: 'offer',
    });

    const created = await createApplication(h.ctx, h.repo, input, OPTS);

    expect(created).toMatchObject({ appliedAt: NOW, outcome: 'offer', outcomeAt: NOW });
    expect(created.status.code).toBe('offer');
  });

  it('clears outcomeAt when an outcome is cleared without changing appliedAt', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    await updateApplication(h.ctx, h.repo, created.id, { outcome: 'offer' }, OPTS);

    const cleared = await updateApplication(h.ctx, h.repo, created.id, { outcome: null }, OPTS);

    expect(cleared).toMatchObject({ appliedAt: NOW, outcome: null, outcomeAt: null });
  });

  it('preserves outcomeAt when the same terminal outcome is written again', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const first = await updateApplication(h.ctx, h.repo, created.id, { outcome: 'offer' }, OPTS);

    const repeated = await updateApplication(
      h.ctx,
      h.repo,
      created.id,
      { outcome: 'offer' },
      { zone: OPTS.zone, now: '2026-09-20T04:00:00.000Z' },
    );

    expect(repeated.outcomeAt).toBe(first.outcomeAt);
  });

  it('deleting an application removes every linked Item', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);

    await deleteApplication(h.ctx, h.repo, app.id, OPTS);

    expect(await h.repo.getApplication(app.id)).toBeNull();
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toEqual([]);
  });

  it('keeps application truth when deleting a linked Item fails', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const originalDelete = h.ctx.items.delete.bind(h.ctx.items);
    h.ctx.items.delete = async () => {
      throw new Error('item storage unavailable');
    };

    await expect(deleteApplication(h.ctx, h.repo, app.id, OPTS)).rejects.toThrow(
      'item storage unavailable',
    );
    expect(await h.repo.getApplication(app.id)).not.toBeNull();
    h.ctx.items.delete = originalDelete;
  });

  it('缺失的投递抛 404 领域错误——而不是落成 500', async () => {
    const h = makeCampusHarness();
    await expect(markApplicationApplied(h.ctx, h.repo, 'missing', OPTS)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(markApplicationApplied(h.ctx, h.repo, 'missing', OPTS)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('allocates round sequence, projects its schedule, and returns sorted rounds', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);

    await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);
    const afterSecond = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ name: '二面', scheduledAt: '2026-09-22T02:00:00.000Z' }),
      OPTS,
    );

    expect(afterSecond.rounds.map(({ sequence }) => sequence)).toEqual([1, 2]);
    expect(afterSecond.rounds[0]).toMatchObject({
      itemId: expect.any(String),
      outcome: 'pending',
    });
    expect(await h.items.getById(afterSecond.rounds[0]!.itemId!)).toMatchObject({
      scheduled: {
        kind: 'timed',
        start: '2026-09-21T02:00:00.000Z',
        end: '2026-09-21T03:00:00.000Z',
      },
    });
  });

  it('resequence swaps an occupied round atomically', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const firstView = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);
    const first = firstView.rounds[0]!;
    const secondView = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '二面' }), OPTS);
    const second = secondView.rounds.find((round) => round.sequence === 2)!;

    const moved = await updateRound(h.ctx, h.repo, second.id, { sequence: 1 }, OPTS);

    expect(moved.rounds.map((round) => [round.id, round.sequence])).toEqual([
      [second.id, 1],
      [first.id, 2],
    ]);
  });

  it('failed round is done and cancels only later future rounds', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const afterFirst = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);
    const first = afterFirst.rounds[0]!;
    const afterSecond = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ name: '二面' }),
      OPTS,
    );
    const second = afterSecond.rounds.find((round) => round.sequence === 2)!;

    await updateRound(h.ctx, h.repo, first.id, { outcome: 'failed' }, OPTS);

    expect(await h.items.getById(first.itemId!)).toMatchObject({ status: 'done' });
    expect(await h.items.getById(second.itemId!)).toMatchObject({ status: 'cancelled' });
  });

  it('creating the first round marks an un-applied application as applied', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    await createRound(h.ctx, h.repo, app.id, roundInput({ name: '一面' }), OPTS);

    expect(await h.repo.getApplication(app.id)).toMatchObject({ appliedAt: NOW });
  });

  it('does not clear appliedAt from an application that already has a round', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);

    const updated = await updateApplication(
      h.ctx,
      h.repo,
      app.id,
      { appliedAt: null },
      { zone: OPTS.zone, now: '2026-09-20T04:00:00.000Z' },
    );

    expect(updated.appliedAt).toBe('2026-09-20T04:00:00.000Z');
    expect(updated.status.code).not.toBe('pending');
  });

  it('stores outcomeAt for an initially completed round', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const view = await createRound(h.ctx, h.repo, app.id, roundInput({ outcome: 'passed' }), OPTS);

    expect(view.rounds[0]).toMatchObject({ outcome: 'passed', outcomeAt: NOW });
  });

  it('preserves a completed round outcomeAt when the same outcome is submitted with resequencing', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withCompleted = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ name: '一面', outcome: 'passed' }),
      OPTS,
    );
    const completed = withCompleted.rounds[0]!;
    const withSecond = await createRound(h.ctx, h.repo, app.id, roundInput({ name: '二面' }), OPTS);
    const second = withSecond.rounds.find((round) => round.sequence === 2)!;

    const repeated = await updateRound(
      h.ctx,
      h.repo,
      completed.id,
      { sequence: 2, outcome: 'passed' },
      { zone: OPTS.zone, now: LATER },
    );

    expect(repeated.rounds.map((round) => [round.id, round.sequence])).toEqual([
      [second.id, 1],
      [completed.id, 2],
    ]);
    expect(repeated.rounds[1]).toMatchObject({ outcome: 'passed', outcomeAt: NOW });
    expect(await h.items.getById(completed.itemId!)).toMatchObject({ completedAt: NOW });
  });

  it('clears outcomeAt when a completed round returns to pending', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withCompleted = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ outcome: 'failed' }),
      OPTS,
    );
    const completed = withCompleted.rounds[0]!;

    const pending = await updateRound(
      h.ctx,
      h.repo,
      completed.id,
      { outcome: 'pending' },
      { zone: OPTS.zone, now: LATER },
    );

    expect(pending.rounds[0]).toMatchObject({ outcome: 'pending', outcomeAt: null });
    expect(await h.items.getById(completed.itemId!)).toMatchObject({ completedAt: null });
  });

  it('sets outcomeAt when a pending round becomes completed', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withPending = await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
    const pending = withPending.rounds[0]!;

    const completed = await updateRound(h.ctx, h.repo, pending.id, { outcome: 'passed' }, OPTS);

    expect(completed.rounds[0]).toMatchObject({ outcome: 'passed', outcomeAt: NOW });
    expect(await h.items.getById(pending.itemId!)).toMatchObject({ completedAt: NOW });
  });

  it('deletes a round Item before its record and returns the parent view', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withRound = await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
    const round = withRound.rounds[0]!;

    const result = await deleteRound(h.ctx, h.repo, round.id, OPTS);

    expect(result.id).toBe(app.id);
    expect(result.rounds).toEqual([]);
    expect(await h.items.getById(round.itemId!)).toBeNull();
  });

  it('缺失的轮次抛 404 领域错误——而不是落成 500', async () => {
    const h = makeCampusHarness();
    await expect(deleteRound(h.ctx, h.repo, 'missing', OPTS)).rejects.toBeInstanceOf(DomainError);
    await expect(deleteRound(h.ctx, h.repo, 'missing', OPTS)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists derived views by priority, update time, and company', async () => {
    const h = makeCampusHarness();
    const later = { zone: OPTS.zone, now: '2026-09-20T03:00:00.000Z' } as const;
    const a = createApplicationInputSchema.parse({ company: 'A', position: 'P', priority: 'B' });
    const z = createApplicationInputSchema.parse({ company: 'Z', position: 'P', priority: 'B' });
    const s = createApplicationInputSchema.parse({ company: 'S', position: 'P', priority: 'S' });
    await createApplication(h.ctx, h.repo, a, OPTS);
    await createApplication(h.ctx, h.repo, z, later);
    await createApplication(h.ctx, h.repo, s, OPTS);

    const listed = await listApplications(h.repo, OPTS);

    expect(listed.applications.map(({ company }) => company)).toEqual(['S', 'Z', 'A']);
    expect(listed.applications.every((application) => application.status.code === 'pending')).toBe(
      true,
    );
  });

  it('computes stats from application and round truth', async () => {
    const h = makeCampusHarness();
    const pending = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const applied = await createApplication(
      h.ctx,
      h.repo,
      createApplicationInputSchema.parse({ company: '远航', position: '研发', appliedAt: NOW }),
      OPTS,
    );
    await createRound(h.ctx, h.repo, applied.id, roundInput({ kind: 'assessment' }), OPTS);

    const stats = await getStats(h.repo, OPTS);

    expect(stats).toMatchObject({ total: 2, pending: 1, applied: 1, assessment: 1 });
    expect(pending.status.code).toBe('pending');
  });
});

describe('面试时刻的颗粒度为分钟（ADR-0012）', () => {
  it('建轮次时把秒与毫秒截零', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const after = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ name: '笔试', scheduledAt: '2026-09-20T11:07:48.512Z' }),
      OPTS,
    );

    expect(after.rounds.at(-1)?.scheduledAt).toBe('2026-09-20T11:07:00.000Z');
  });

  it('改轮次时同样截零', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const created = await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
    const roundId = created.rounds.at(-1)!.id;

    const after = await updateRound(
      h.ctx,
      h.repo,
      roundId,
      { scheduledAt: '2026-09-21T02:30:59.999Z' },
      OPTS,
    );

    expect(after.rounds.at(-1)?.scheduledAt).toBe('2026-09-21T02:30:00.000Z');
  });

  it('截零后的时刻直接体现在 core Item 的排程上', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ scheduledAt: '2026-09-20T11:07:48.512Z', durationMin: 60 }),
      OPTS,
    );

    const items = await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] });
    expect(items).toContainEqual(
      expect.objectContaining({
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T11:07:00.000Z',
          end: '2026-09-20T12:07:00.000Z',
        },
      }),
    );
  });
});
