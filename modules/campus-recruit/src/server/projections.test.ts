import { describe, expect, it } from 'vitest';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { applicationFixture, roundFixture } from '../testing/fixtures.js';
import { makeCampusHarness } from '../testing/harness.js';
import { reconcileAllProjections, reconcileApplicationProjections } from './projections.js';

const NOW = '2026-09-20T02:00:00.000Z';
const SH = 'Asia/Shanghai';

describe('campus recruit Item projections', () => {
  it('creates one deadline task and remains idempotent', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({
        id: 'a1',
        priority: 'S',
        applyDeadlineDate: '2026-09-20',
        appliedAt: null,
      }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    const first = (await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] }))[0]!;
    h.sqlite
      .prepare('UPDATE items SET updated_at = ? WHERE id = ?')
      .run('2000-01-01T00:00:00.000Z', first.id);

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const projected = await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] });
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      kind: 'task',
      title: '投递 星云科技 固件工程师',
      importance: 'high',
      dueAt: '2026-09-20T15:59:59.999Z',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
      status: 'todo',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    expect((await h.repo.getApplication('a1'))!.deadlineItemId).toBe(projected[0]!.id);
  });

  it('creates timed deadline task when applyDeadlineDate has HH:mm', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({
        id: 'a1',
        priority: 'S',
        applyDeadlineDate: '2026-09-20 18:00',
        appliedAt: null,
      }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    const projected = await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] });
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      kind: 'task',
      title: '投递 星云科技 固件工程师',
      importance: 'high',
      dueAt: '2026-09-20T10:00:00.000Z',
      scheduled: { kind: 'timed', start: '2026-09-20T10:00:00.000Z' },
      status: 'todo',
    });
  });

  it('marks an existing deadline task done after application', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({ id: 'a1', applyDeadlineDate: '2026-09-20', appliedAt: null }),
    );
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    await h.repo.updateApplication('a1', { appliedAt: NOW, updatedAt: NOW });

    await reconcileApplicationProjections(h.ctx, h.repo, 'a1', NOW, SH);

    const app = (await h.repo.getApplication('a1'))!;
    expect(await h.items.getById(app.deadlineItemId!)).toMatchObject({
      status: 'done',
      completedAt: NOW,
    });
  });

  it('creates a completed timed round with its duration', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(applicationFixture({ id: 'a1', priority: 'A', appliedAt: NOW }));
    await h.repo.insertRound(
      roundFixture({
        id: 'r1',
        applicationId: 'a1',
        scheduledAt: '2026-09-21T02:00:00.000Z',
        durationMin: 90,
        outcome: 'passed',
        outcomeAt: '2026-09-21T04:00:00.000Z',
      }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const round = (await h.repo.getRound('r1'))!;
    expect(await h.items.getById(round.itemId!)).toMatchObject({
      kind: 'event',
      title: '星云科技 一面',
      importance: 'high',
      dueAt: null,
      scheduled: {
        kind: 'timed',
        start: '2026-09-21T02:00:00.000Z',
        end: '2026-09-21T03:30:00.000Z',
      },
      status: 'done',
      completedAt: '2026-09-21T04:00:00.000Z',
    });
  });

  it('replaces a missing linked Item without leaving a duplicate', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({ id: 'a1', applyDeadlineDate: '2026-09-20', appliedAt: null }),
    );
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    const oldId = (await h.repo.getApplication('a1'))!.deadlineItemId!;
    await h.items.delete(CAMPUS_RECRUIT_MODULE_ID, oldId);

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const newId = (await h.repo.getApplication('a1'))!.deadlineItemId!;
    expect(newId).not.toBe(oldId);
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
  });

  it('deletes unreferenced campus Items', async () => {
    const h = makeCampusHarness();
    const orphan = await h.items.create(CAMPUS_RECRUIT_MODULE_ID, {
      kind: 'task',
      title: '孤儿投影',
    });

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    expect(await h.items.getById(orphan.id)).toBeNull();
  });

  it('never updates or deletes a todo Item stored in a bad module link', async () => {
    const h = makeCampusHarness();
    const todo = await h.items.create('todo', { kind: 'task', title: 'todo 原文' });
    await h.repo.insertApplication(
      applicationFixture({
        id: 'a1',
        applyDeadlineDate: '2026-09-20',
        appliedAt: null,
        deadlineItemId: todo.id,
      }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    expect(await h.items.getById(todo.id)).toMatchObject({
      title: 'todo 原文',
      sourceModule: 'todo',
    });
    const deadlineItemId = (await h.repo.getApplication('a1'))!.deadlineItemId;
    expect(deadlineItemId).not.toBeNull();
    expect(deadlineItemId).not.toBe(todo.id);
    expect(await h.items.getById(deadlineItemId!)).toMatchObject({
      sourceModule: CAMPUS_RECRUIT_MODULE_ID,
    });
  });

  it('keeps completed deadline intent until a foreign-link replacement succeeds', async () => {
    const h = makeCampusHarness();
    const todo = await h.items.create('todo', { kind: 'task', title: 'todo 原文' });
    await h.repo.insertApplication(
      applicationFixture({
        id: 'a1',
        applyDeadlineDate: '2026-09-20',
        appliedAt: NOW,
        deadlineItemId: todo.id,
      }),
    );
    h.sqlite.exec(`
      CREATE TRIGGER reject_completed_deadline_replacement
      BEFORE UPDATE OF completed_at ON items
      BEGIN
        SELECT RAISE(FAIL, 'forced deadline completion failure');
      END;
    `);

    await expect(reconcileAllProjections(h.ctx, h.repo, NOW, SH)).rejects.toThrow(
      'forced deadline completion failure',
    );
    expect((await h.repo.getApplication('a1'))!.deadlineItemId).toBe(todo.id);
    expect(await h.items.getById(todo.id)).toMatchObject({
      title: 'todo 原文',
      sourceModule: 'todo',
    });

    h.sqlite.exec('DROP TRIGGER reject_completed_deadline_replacement');
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const deadlineItemId = (await h.repo.getApplication('a1'))!.deadlineItemId;
    expect(deadlineItemId).not.toBeNull();
    expect(deadlineItemId).not.toBe(todo.id);
    expect(await h.items.getById(deadlineItemId!)).toMatchObject({
      sourceModule: CAMPUS_RECRUIT_MODULE_ID,
      status: 'done',
      completedAt: NOW,
    });
    expect(await h.items.getById(todo.id)).toMatchObject({
      title: 'todo 原文',
      sourceModule: 'todo',
    });
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
  });

  it('links a completed projection only after its guarded update succeeds', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(applicationFixture({ id: 'a1', appliedAt: NOW }));
    await h.repo.insertRound(
      roundFixture({
        id: 'r1',
        applicationId: 'a1',
        scheduledAt: '2026-09-21T02:00:00.000Z',
        outcome: 'failed',
        outcomeAt: NOW,
      }),
    );
    h.sqlite.exec(`
      CREATE TRIGGER reject_projection_completion
      BEFORE UPDATE OF completed_at ON items
      BEGIN
        SELECT RAISE(FAIL, 'forced completion failure');
      END;
    `);

    await expect(reconcileAllProjections(h.ctx, h.repo, NOW, SH)).rejects.toThrow(
      'forced completion failure',
    );
    expect((await h.repo.getRound('r1'))!.itemId).toBeNull();
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);

    h.sqlite.exec('DROP TRIGGER reject_projection_completion');
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const round = (await h.repo.getRound('r1'))!;
    expect(round.itemId).not.toBeNull();
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toHaveLength(1);
    expect(await h.items.getById(round.itemId!)).toMatchObject({
      status: 'done',
      completedAt: NOW,
    });
  });

  it.each([
    ['failed round itself', 'failed', 1, '2026-09-21T02:00:00.000Z', 'done'],
    ['later future round', 'pending', 2, '2026-09-22T02:00:00.000Z', 'cancelled'],
    ['later past round', 'pending', 2, '2026-09-19T02:00:00.000Z', 'todo'],
  ] as const)(
    '%s outcome=%s sequence=%i schedule=%s -> %s',
    async (_name, outcome, sequence, scheduledAt, expected) => {
      const h = makeCampusHarness();
      await h.repo.insertApplication(applicationFixture({ id: 'a1', appliedAt: NOW }));
      if (sequence > 1) {
        await h.repo.insertRound(
          roundFixture({
            id: 'failed-first',
            applicationId: 'a1',
            sequence: 1,
            outcome: 'failed',
            outcomeAt: NOW,
            scheduledAt: '2026-09-20T01:00:00.000Z',
          }),
        );
      }
      await h.repo.insertRound(
        roundFixture({ id: 'target', applicationId: 'a1', sequence, outcome, scheduledAt }),
      );

      await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

      const target = (await h.repo.getRound('target'))!;
      expect(await h.items.getById(target.itemId!)).toMatchObject({ status: expected });
    },
  );

  it('declined application cancels every future pending round', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({ id: 'a1', appliedAt: NOW, outcome: 'declined', outcomeAt: NOW }),
    );
    await h.repo.insertRound(
      roundFixture({ id: 'r1', applicationId: 'a1', scheduledAt: '2026-09-22T02:00:00.000Z' }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const round = (await h.repo.getRound('r1'))!;
    expect(await h.items.getById(round.itemId!)).toMatchObject({ status: 'cancelled' });
  });

  it('rejected application cancels every future pending round', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({ id: 'a1', appliedAt: NOW, outcome: 'rejected', outcomeAt: NOW }),
    );
    await h.repo.insertRound(
      roundFixture({ id: 'r1', applicationId: 'a1', scheduledAt: '2026-09-22T02:00:00.000Z' }),
    );

    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);

    const round = (await h.repo.getRound('r1'))!;
    expect(await h.items.getById(round.itemId!)).toMatchObject({ status: 'cancelled' });
  });

  it('removes projections that are no longer desired and clears their links', async () => {
    const h = makeCampusHarness();
    await h.repo.insertApplication(
      applicationFixture({ id: 'a1', applyDeadlineDate: '2026-09-20', appliedAt: null }),
    );
    await h.repo.insertRound(
      roundFixture({ id: 'r1', applicationId: 'a1', scheduledAt: '2026-09-22T02:00:00.000Z' }),
    );
    await reconcileAllProjections(h.ctx, h.repo, NOW, SH);
    await h.repo.updateApplication('a1', { applyDeadlineDate: null, updatedAt: NOW });
    await h.repo.updateRound('r1', { scheduledAt: null, updatedAt: NOW });

    await reconcileApplicationProjections(h.ctx, h.repo, 'a1', NOW, SH);

    expect((await h.repo.getApplication('a1'))!.deadlineItemId).toBeNull();
    expect((await h.repo.getRound('r1'))!.itemId).toBeNull();
    expect(await h.items.list({ sourceModules: [CAMPUS_RECRUIT_MODULE_ID] })).toEqual([]);
  });
});
