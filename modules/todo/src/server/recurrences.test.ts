import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { MATERIALIZE_HORIZON_DAYS } from '../contract.js';
import { makeTodoHarness } from '../testing/harness.js';
import { addDays } from './recurrence.js';
import {
  createRecurrence,
  deleteRecurrence,
  listRecurrences,
  materializeAll,
  updateRecurrence,
} from './recurrences.js';
import type { TodoRepository } from './repository.js';
import { completeTask, listToday } from './service.js';

const SH = 'Asia/Shanghai';
/** 上海时间 2026-09-20 10:00，故本地日是 2026-09-20 */
const NOW = '2026-09-20T02:00:00.000Z';
const TODAY = '2026-09-20';
const OPTS = { zone: SH, now: NOW };

describe('重复任务的物化', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;

  beforeEach(() => {
    ({ ctx, repo } = makeTodoHarness());
  });

  it('建规则时立刻物化，今日就能看到——否则「建了但什么都没发生」', async () => {
    await createRecurrence(
      ctx,
      repo,
      { title: '喝水', importance: 'normal', freq: 'daily', interval: 1, startDate: TODAY },
      SH,
      NOW,
    );
    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.map((t) => t.title)).toContain('喝水');
  });

  it('物化到视野尽头，且不多不少', async () => {
    const rec = await createRecurrence(
      ctx,
      repo,
      { title: '喝水', importance: 'normal', freq: 'daily', interval: 1, startDate: TODAY },
      SH,
      NOW,
    );
    const links = await repo.listRecurrenceItems(rec.id);
    // 含今天，共 HORIZON + 1 天
    expect(links.length).toBe(MATERIALIZE_HORIZON_DAYS + 1);
    expect(links[0]?.occurrenceDate).toBe(TODAY);
    expect(links.at(-1)?.occurrenceDate).toBe(addDays(TODAY, MATERIALIZE_HORIZON_DAYS));
  });

  it('物化是幂等的——重复跑不会生成重复实例', async () => {
    const rec = await createRecurrence(
      ctx,
      repo,
      { title: '喝水', importance: 'normal', freq: 'daily', interval: 1, startDate: TODAY },
      SH,
      NOW,
    );
    const before = (await repo.listRecurrenceItems(rec.id)).length;

    await materializeAll(ctx, repo, NOW, SH);
    await materializeAll(ctx, repo, NOW, SH);

    expect((await repo.listRecurrenceItems(rec.id)).length).toBe(before);
  });

  it('不补生成过去的实例——否则会凭空造出一堆逾期待办', async () => {
    const rec = await createRecurrence(
      ctx,
      repo,
      {
        title: '喝水',
        importance: 'normal',
        freq: 'daily',
        interval: 1,
        startDate: '2026-01-01',
      },
      SH,
      NOW,
    );
    const links = await repo.listRecurrenceItems(rec.id);
    expect(links.every((l) => l.occurrenceDate >= TODAY)).toBe(true);
  });

  it('物化出来的实例是全天排程，且带 recurrenceId', async () => {
    await createRecurrence(
      ctx,
      repo,
      { title: '喝水', importance: 'high', freq: 'daily', interval: 1, startDate: TODAY },
      SH,
      NOW,
    );
    const today = await listToday(ctx, repo, OPTS);
    const view = today.tasks.find((t) => t.title === '喝水');
    expect(view?.scheduled).toEqual({ kind: 'all-day', date: TODAY });
    expect(view?.recurrenceId).not.toBeNull();
    expect(view?.importance).toBe('high');
  });

  it('手工建的任务 recurrenceId 为 null', async () => {
    const { createTask } = await import('./service.js');
    const task = await createTask(
      ctx,
      repo,
      { title: '手工的', importance: 'low', dueDate: null },
      OPTS,
    );
    expect(task.recurrenceId).toBeNull();
  });

  it('weekly 规则只在指定星期几生成', async () => {
    // 2026-09-20 是周日
    const rec = await createRecurrence(
      ctx,
      repo,
      {
        title: '健身',
        importance: 'normal',
        freq: 'weekly',
        interval: 1,
        byWeekday: [1, 4],
        startDate: TODAY,
      },
      SH,
      NOW,
    );
    const dates = (await repo.listRecurrenceItems(rec.id)).map((l) => l.occurrenceDate);
    expect(dates).toContain('2026-09-21'); // 周一
    expect(dates).toContain('2026-09-24'); // 周四
    expect(dates).not.toContain('2026-09-22');
  });

  it('untilDate 之后不再生成', async () => {
    const rec = await createRecurrence(
      ctx,
      repo,
      {
        title: '喝水',
        importance: 'normal',
        freq: 'daily',
        interval: 1,
        startDate: TODAY,
        untilDate: '2026-09-23',
      },
      SH,
      NOW,
    );
    const dates = (await repo.listRecurrenceItems(rec.id)).map((l) => l.occurrenceDate);
    expect(dates).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  });
});

describe('改与删重复规则', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;

  beforeEach(() => {
    ({ ctx, repo } = makeTodoHarness());
  });

  async function daily(title = '喝水') {
    return createRecurrence(
      ctx,
      repo,
      { title, importance: 'normal', freq: 'daily', interval: 1, startDate: TODAY },
      SH,
      NOW,
    );
  }

  it('改标题会同步到未来未完成的实例', async () => {
    const rec = await daily();
    await updateRecurrence(ctx, repo, rec.id, { title: '多喝水' }, NOW, SH);

    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.map((t) => t.title)).toContain('多喝水');
    expect(today.tasks.map((t) => t.title)).not.toContain('喝水');
  });

  it('已完成的实例不被改标题波及——那是已经发生过的历史', async () => {
    const rec = await daily();
    const links = await repo.listRecurrenceItems(rec.id);
    const first = links[0]!;
    await completeTask(ctx, repo, first.itemId, OPTS);

    await updateRecurrence(ctx, repo, rec.id, { title: '多喝水' }, NOW, SH);

    const done = await ctx.items.getById(first.itemId);
    expect(done?.title).toBe('喝水');
  });

  it('缩短 untilDate 会砍掉超出的未来实例', async () => {
    const rec = await daily();
    await updateRecurrence(ctx, repo, rec.id, { untilDate: '2026-09-22' }, NOW, SH);

    const dates = (await repo.listRecurrenceItems(rec.id)).map((l) => l.occurrenceDate);
    expect(dates).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
  });

  it('删规则：清掉未完成的实例，保留已完成的历史', async () => {
    const rec = await daily();
    const links = await repo.listRecurrenceItems(rec.id);
    const kept = links[0]!;
    await completeTask(ctx, repo, kept.itemId, OPTS);

    expect(await deleteRecurrence(ctx, repo, rec.id)).toBe(true);
    expect(await listRecurrences(repo)).toEqual([]);

    // 已完成的那条还在
    expect(await ctx.items.getById(kept.itemId)).not.toBeNull();
    // 未完成的都没了
    const remaining = await ctx.items.list({ sourceModules: ['todo'] });
    expect(remaining.map((i) => i.id)).toEqual([kept.itemId]);
  });

  it('删不存在的规则返回 false', async () => {
    expect(await deleteRecurrence(ctx, repo, 'nope')).toBe(false);
  });

  it('两条规则互不干扰', async () => {
    const a = await daily('喝水');
    const b = await daily('拉伸');
    await deleteRecurrence(ctx, repo, a.id);

    expect((await listRecurrences(repo)).map((r) => r.title)).toEqual(['拉伸']);
    expect((await repo.listRecurrenceItems(b.id)).length).toBe(MATERIALIZE_HORIZON_DAYS + 1);
  });
});
