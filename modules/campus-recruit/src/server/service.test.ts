import { describe, expect, it } from 'vitest';
import {
  CAMPUS_RECRUIT_MODULE_ID,
  createApplicationInputSchema,
  createRoundInputSchema,
  createSeasonInputSchema,
} from '../contract.js';
import type { CreateRoundData } from '../contract.js';
import { DomainError } from '@workbench/http-kit';
import { makeCampusHarness } from '../testing/harness.js';
import {
  createApplication,
  createSeason,
  deleteSeason,
  listSeasons,
  updateSeason,
  createRound,
  deleteApplication,
  deleteRound,
  getStats,
  listApplications,
  markApplicationApplied,
  unmarkApplicationApplied,
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
    seasonId: 'season-legacy-autumn',
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

  it('往返存取投递用的邮箱与手机号——回头找验证码时要查的是这一套账号', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(
      h.ctx,
      h.repo,
      createApplicationInputSchema.parse({
        ...pendingApplicationInput(),
        applyEmail: '校园招聘邮箱 zhaopin@example.com',
        applyPhone: '13800138000',
      }),
      OPTS,
    );

    expect(created).toMatchObject({
      applyEmail: '校园招聘邮箱 zhaopin@example.com',
      applyPhone: '13800138000',
    });

    const updated = await updateApplication(
      h.ctx,
      h.repo,
      created.id,
      { applyEmail: null, applyPhone: '13900139000' },
      OPTS,
    );

    expect(updated).toMatchObject({ applyEmail: null, applyPhone: '13900139000' });
  });

  it('手标泡池子记下时刻并顺带补齐投递时间，撤销时清掉', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const shelved = await updateApplication(h.ctx, h.repo, created.id, { shelved: true }, OPTS);
    expect(shelved).toMatchObject({ shelvedAt: NOW, appliedAt: NOW });
    expect(shelved.status.code).toBe('shelved');

    const kept = await updateApplication(
      h.ctx,
      h.repo,
      created.id,
      { shelved: true },
      {
        ...OPTS,
        now: LATER,
      },
    );
    expect(kept.shelvedAt).toBe(NOW);

    const revived = await updateApplication(h.ctx, h.repo, created.id, { shelved: false }, OPTS);
    expect(revived.shelvedAt).toBeNull();
    expect(revived.status.code).toBe('applied');
  });

  it('marking applied completes the deadline projection', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const applied = await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    expect(applied.appliedAt).toBe(NOW);
    // 自动补的「简历初筛」让状态从「已投递」进到「流程中」——这是投递流程的第一步
    expect(applied.status.code).toBe('in_progress');
    const stored = (await h.repo.getApplication(created.id))!;
    expect(await h.items.getById(stored.deadlineItemId!)).toMatchObject({ status: 'done' });
  });

  it('标记已投递会自动补一轮「简历初筛」，且不落成日历上的一件事', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const applied = await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    expect(applied.rounds).toEqual([
      expect.objectContaining({
        sequence: 1,
        kind: 'screening',
        name: '简历初筛',
        outcome: 'pending',
        scheduledAt: null,
        itemId: null,
      }),
    ]);
  });

  it('重复标记已投递不会重复补初筛，已有轮次的投递也不补', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    const again = await markApplicationApplied(h.ctx, h.repo, created.id, {
      ...OPTS,
      now: LATER,
    });
    expect(again.rounds).toHaveLength(1);

    const other = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await createRound(h.ctx, h.repo, other.id, roundInput(), OPTS);
    const otherApplied = await markApplicationApplied(h.ctx, h.repo, other.id, OPTS);

    expect(otherApplied.rounds).toHaveLength(1);
    expect(otherApplied.rounds[0]).toMatchObject({ kind: 'technical', name: '一面' });
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

  it('撤回投递退回待投递，并把自动补的初筛与已完成的投递事项一并收回', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    const reverted = await unmarkApplicationApplied(h.ctx, h.repo, created.id, {
      ...OPTS,
      now: LATER,
    });

    expect(reverted.appliedAt).toBeNull();
    expect(reverted.rounds).toEqual([]);
    expect(reverted.status.code).toBe('pending');
    const stored = (await h.repo.getApplication(created.id))!;
    expect(await h.items.getById(stored.deadlineItemId!)).toMatchObject({
      status: 'todo',
      completedAt: null,
    });
  });

  it('撤回投递顺手清掉泡池子——没投出去就无所谓泡不泡', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await markApplicationApplied(h.ctx, h.repo, created.id, OPTS);
    await updateApplication(h.ctx, h.repo, created.id, { shelved: true }, OPTS);

    const reverted = await unmarkApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    expect(reverted).toMatchObject({ appliedAt: null, shelvedAt: null });
    expect(reverted.status.code).toBe('pending');
  });

  it('重复撤回是幂等的：本来就待投递就原样返回', async () => {
    const h = makeCampusHarness();
    const created = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const reverted = await unmarkApplicationApplied(h.ctx, h.repo, created.id, OPTS);

    expect(reverted.appliedAt).toBeNull();
    expect(reverted.status.code).toBe('pending');
  });

  it('有真实轮次或终局结果时拒绝撤回，并落成 409 而不是悄悄丢数据', async () => {
    const h = makeCampusHarness();
    const withRound = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    await createRound(h.ctx, h.repo, withRound.id, roundInput(), OPTS);

    await expect(unmarkApplicationApplied(h.ctx, h.repo, withRound.id, OPTS)).rejects.toMatchObject(
      { status: 409 },
    );
    // 轮次一条都没少
    expect(await h.repo.listRounds(withRound.id)).toHaveLength(1);

    const settled = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    await updateApplication(h.ctx, h.repo, settled.id, { outcome: 'offer' }, OPTS);

    await expect(unmarkApplicationApplied(h.ctx, h.repo, settled.id, OPTS)).rejects.toMatchObject({
      status: 409,
    });
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

  it('只有截止时刻的轮次投影成一件带 due 的任务——测评/笔试最常见的形态', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withRound = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({
        kind: 'assessment',
        name: '测评',
        scheduledAt: null,
        durationMin: null,
        deadlineAt: '2026-09-25T15:59:59.999Z',
      }),
      OPTS,
    );
    const round = withRound.rounds.find((r) => r.name === '测评')!;

    expect(round.deadlineAt).toBe('2026-09-25T15:59:00.000Z'); // 秒与毫秒截零（ADR-0012）
    expect(await h.items.getById(round.itemId!)).toMatchObject({
      kind: 'task',
      title: '星云科技 测评（截止）',
      dueAt: '2026-09-25T15:59:00.000Z',
      scheduled: { kind: 'timed', start: '2026-09-25T15:59:00.000Z' },
      status: 'todo',
    });
  });

  it('轮次的截止时刻落在已约时间的轮次上时只作 dueAt，日历块仍是那场面试', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withRound = await createRound(
      h.ctx,
      h.repo,
      app.id,
      roundInput({ deadlineAt: '2026-09-22T02:00:00.000Z' }),
      OPTS,
    );
    const round = withRound.rounds.find((r) => r.name === '一面')!;

    expect(await h.items.getById(round.itemId!)).toMatchObject({
      kind: 'event',
      dueAt: '2026-09-22T02:00:00.000Z',
      scheduled: { kind: 'timed', start: '2026-09-21T02:00:00.000Z' },
    });
  });

  it('「已完成」是出过结果的中间态：记下时刻、投影收尾，但投递没有变成已挂', async () => {
    const h = makeCampusHarness();
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withRound = await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
    const round = withRound.rounds.find((r) => r.name === '一面')!;

    const done = await updateRound(h.ctx, h.repo, round.id, { outcome: 'completed' }, OPTS);

    expect(done.rounds.find((r) => r.name === '一面')).toMatchObject({
      outcome: 'completed',
      outcomeAt: NOW,
    });
    expect(done.status.code).toBe('in_progress');
    expect(await h.items.getById(round.itemId!)).toMatchObject({
      status: 'done',
      completedAt: NOW,
    });
  });

  it('「已完成」算出过结果，因此解除 90 天自动泡池子判定', async () => {
    const h = makeCampusHarness();
    const long = { zone: OPTS.zone, now: '2027-01-20T02:00:00.000Z' } as const;
    const app = await createApplication(h.ctx, h.repo, appliedApplicationInput(), OPTS);
    const withRound = await createRound(h.ctx, h.repo, app.id, roundInput(), OPTS);
    const round = withRound.rounds.find((r) => r.name === '一面')!;

    const stillPending = await listApplications(h.repo, long);
    expect(stillPending.applications[0]!.status.code).toBe('shelved');

    await updateRound(h.ctx, h.repo, round.id, { outcome: 'completed' }, long);

    const after = await listApplications(h.repo, long);
    expect(after.applications[0]!.status.code).toBe('in_progress');
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
    const a = createApplicationInputSchema.parse({
      company: 'A',
      position: 'P',
      priority: 'B',
      seasonId: 'season-legacy-autumn',
    });
    const z = createApplicationInputSchema.parse({
      company: 'Z',
      position: 'P',
      priority: 'B',
      seasonId: 'season-legacy-autumn',
    });
    const s = createApplicationInputSchema.parse({
      company: 'S',
      position: 'P',
      priority: 'S',
      seasonId: 'season-legacy-autumn',
    });
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
      createApplicationInputSchema.parse({
        company: '远航',
        position: '研发',
        appliedAt: NOW,
        seasonId: 'season-legacy-autumn',
      }),
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

describe('招聘季', () => {
  it('新建、改名、归档，归档不影响投影', async () => {
    const h = makeCampusHarness();
    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    expect(spring).toMatchObject({ name: '2027 春招', archivedAt: null, applicationCount: 0 });

    const { seasons } = await listSeasons(h.repo);
    expect(seasons.map((s) => s.id)).toEqual(['season-legacy-autumn', spring.id]);

    // 这一季里有一条带截止日的投递，归档后它的 core Item 必须还在
    const app = await createApplication(
      h.ctx,
      h.repo,
      { ...pendingApplicationInput(), seasonId: spring.id },
      OPTS,
    );
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);

    const archived = await updateSeason(h.repo, spring.id, { archived: true }, OPTS);
    expect(archived.archivedAt).toBe(NOW);
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
    expect(await h.repo.getApplication(app.id)).not.toBeNull();

    // 再归档一次不刷新时刻：「从哪天起不再看它」才是有用的信息
    const again = await updateSeason(
      h.repo,
      spring.id,
      { archived: true },
      { ...OPTS, now: LATER },
    );
    expect(again.archivedAt).toBe(NOW);

    const revived = await updateSeason(h.repo, spring.id, { archived: false }, OPTS);
    expect(revived.archivedAt).toBeNull();
  });

  it('重名回 409', async () => {
    const h = makeCampusHarness();
    await expect(
      createSeason(h.repo, createSeasonInputSchema.parse({ name: '秋招', kind: 'social' }), OPTS),
    ).rejects.toMatchObject({ status: 409 });

    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    await expect(updateSeason(h.repo, spring.id, { name: '秋招' }, OPTS)).rejects.toMatchObject({
      status: 409,
    });
    // 改成自己现在的名字不算重名
    await expect(
      updateSeason(h.repo, spring.id, { name: '2027 春招' }, OPTS),
    ).resolves.toMatchObject({ name: '2027 春招' });
  });

  it('季里有投递、或它是最后一个未归档的季，都拒绝删除', async () => {
    const h = makeCampusHarness();

    // 最后一个未归档的季：删了就没地方放新投递
    await expect(deleteSeason(h.repo, 'season-legacy-autumn')).rejects.toMatchObject({
      status: 409,
    });

    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    await createApplication(
      h.ctx,
      h.repo,
      { ...pendingApplicationInput(), seasonId: spring.id },
      OPTS,
    );
    // 有投递：不级联删除，让操作失败并提示
    await expect(deleteSeason(h.repo, spring.id)).rejects.toMatchObject({ status: 409 });
    expect(await h.repo.getSeason(spring.id)).not.toBeNull();

    const empty = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 社招', kind: 'social' }),
      OPTS,
    );
    await expect(deleteSeason(h.repo, empty.id)).resolves.toBeUndefined();
    expect(await h.repo.getSeason(empty.id)).toBeNull();
  });

  it('不存在的季回 404', async () => {
    const h = makeCampusHarness();
    await expect(updateSeason(h.repo, 'missing', { name: 'x' }, OPTS)).rejects.toMatchObject({
      status: 404,
    });
    await expect(deleteSeason(h.repo, 'missing')).rejects.toMatchObject({ status: 404 });
  });

  it('列表与统计按季过滤，轮次跟着投递一起被过滤', async () => {
    const h = makeCampusHarness();
    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );

    const autumnApp = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);
    const springApp = await createApplication(
      h.ctx,
      h.repo,
      { ...pendingApplicationInput(), seasonId: spring.id },
      OPTS,
    );
    await createRound(h.ctx, h.repo, autumnApp.id, roundInput(), OPTS);

    const autumnOnly = await listApplications(h.repo, {
      ...OPTS,
      seasonId: 'season-legacy-autumn',
    });
    expect(autumnOnly.applications.map((a) => a.id)).toEqual([autumnApp.id]);
    expect(autumnOnly.applications[0]).toMatchObject({
      seasonId: 'season-legacy-autumn',
      seasonName: '秋招',
    });

    expect((await listApplications(h.repo, OPTS)).applications).toHaveLength(2);

    // 统计只算这一季：春招那条没有轮次，秋招那条有一轮 technical
    const springStats = await getStats(h.repo, { ...OPTS, seasonId: spring.id });
    expect(springStats).toMatchObject({ total: 1, technical: 0 });
    // 春招那条还没标记已投递，applied=0——分母为零时口径是 null，不是 0
    expect(springStats.rates.applicationToTechnical).toBeNull();
    expect(springApp.seasonName).toBe('2027 春招');
  });

  it('创建投递时季必须存在；改季即移动投递', async () => {
    const h = makeCampusHarness();
    await expect(
      createApplication(h.ctx, h.repo, { ...pendingApplicationInput(), seasonId: 'missing' }, OPTS),
    ).rejects.toMatchObject({ status: 404 });

    const spring = await createSeason(
      h.repo,
      createSeasonInputSchema.parse({ name: '2027 春招', kind: 'campus-spring' }),
      OPTS,
    );
    const app = await createApplication(h.ctx, h.repo, pendingApplicationInput(), OPTS);

    const moved = await updateApplication(h.ctx, h.repo, app.id, { seasonId: spring.id }, OPTS);
    expect(moved).toMatchObject({ seasonId: spring.id, seasonName: '2027 春招' });

    await expect(
      updateApplication(h.ctx, h.repo, app.id, { seasonId: 'missing' }, OPTS),
    ).rejects.toMatchObject({ status: 404 });
  });
});
