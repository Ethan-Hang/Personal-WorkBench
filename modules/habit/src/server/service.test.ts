import { describe, expect, it } from 'vitest';
import { makeHabitHarness } from '../testing/harness.js';
import { DomainError } from './errors.js';
import {
  archiveHabit,
  createHabit,
  deleteCheckin,
  deleteHabit,
  getHistory,
  listHabits,
  listToday,
  putCheckin,
  unarchiveHabit,
  updateHabit,
} from './service.js';

const TODAY = '2026-08-21'; // 周五

function dailyInput(overrides: Record<string, unknown> = {}) {
  return {
    name: '阅读',
    targetValue: 1,
    freqKind: 'daily' as const,
    startDate: '2026-08-01',
    ...overrides,
  };
}

async function expectStatus(run: () => Promise<unknown>, status: number): Promise<DomainError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).status).toBe(status);
    return error as DomainError;
  }
  throw new Error(`期望抛出 ${status}，但没有抛错`);
}

describe('createHabit', () => {
  it('创建后可读回，position 自动排到末尾', async () => {
    const { repo, sqlite } = makeHabitHarness();

    const first = await createHabit(repo, dailyInput());
    const second = await createHabit(repo, dailyInput({ name: '跑步' }));

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    sqlite.close();
  });

  it('重名落成 409，不是 500 —— 领域错误必须是 4xx', async () => {
    const { repo, sqlite } = makeHabitHarness();
    await createHabit(repo, dailyInput());

    await expectStatus(() => createHabit(repo, dailyInput()), 409);
    sqlite.close();
  });

  it('weekdays 频率缺周几时落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();

    await expectStatus(
      () => createHabit(repo, dailyInput({ freqKind: 'weekdays', weekdays: [] })),
      400,
    );
    sqlite.close();
  });

  it('weekly-count 频率缺次数时落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();

    await expectStatus(() => createHabit(repo, dailyInput({ freqKind: 'weekly-count' })), 400);
    sqlite.close();
  });
});

describe('listToday', () => {
  it('带出 dueToday、进度与 streak', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await putCheckin(repo, habit.id, '2026-08-20', { value: 1, clientToday: TODAY });
    await putCheckin(repo, habit.id, TODAY, { value: 1, clientToday: TODAY });

    const { habits } = await listToday(repo, TODAY);

    expect(habits).toHaveLength(1);
    expect(habits[0]?.dueToday).toBe(true);
    expect(habits[0]?.todayValue).toBe(1);
    expect(habits[0]?.progress).toEqual({ current: 1, target: 1 });
    expect(habits[0]?.streak).toBe(2);
    sqlite.close();
  });

  it('每周次数习惯（targetValue > 1）能正确返回今日打卡值与每周达标天数', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(
      repo,
      dailyInput({
        targetValue: 3,
        freqKind: 'weekly-count',
        weeklyCount: 5,
      }),
    );

    // 今日未打卡
    const initial = await listToday(repo, TODAY);
    expect(initial.habits[0]?.todayValue).toBe(0);
    expect(initial.habits[0]?.progress).toEqual({ current: 0, target: 5 });

    // 今日打卡 2 次（未达到 targetValue 3）
    await putCheckin(repo, habit.id, TODAY, { value: 2, clientToday: TODAY });
    const partial = await listToday(repo, TODAY);
    expect(partial.habits[0]?.todayValue).toBe(2);
    expect(partial.habits[0]?.progress).toEqual({ current: 0, target: 5 });

    // 今日打卡 3 次（达到 targetValue 3）
    await putCheckin(repo, habit.id, TODAY, { value: 3, clientToday: TODAY });
    const completed = await listToday(repo, TODAY);
    expect(completed.habits[0]?.todayValue).toBe(3);
    expect(completed.habits[0]?.progress).toEqual({ current: 1, target: 5 });

    sqlite.close();
  });

  it('归档的习惯不出现在今日视图，但历史仍查得到', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await putCheckin(repo, habit.id, TODAY, { value: 1, clientToday: TODAY });

    await archiveHabit(repo, habit.id);

    expect((await listToday(repo, TODAY)).habits).toHaveLength(0);
    const history = await getHistory(repo, habit.id, '2026-08-01', '2026-08-31');
    expect(history.checkins).toHaveLength(1);
    sqlite.close();
  });

  it('恢复后又回到今日视图', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await archiveHabit(repo, habit.id);

    await unarchiveHabit(repo, habit.id);

    expect((await listToday(repo, TODAY)).habits).toHaveLength(1);
    sqlite.close();
  });

  it('一三五习惯在周二 dueToday 为 false，但仍然列出来', async () => {
    const { repo, sqlite } = makeHabitHarness();
    await createHabit(repo, dailyInput({ freqKind: 'weekdays', weekdays: [1, 3, 5] }));

    const { habits } = await listToday(repo, '2026-08-18'); // 周二

    expect(habits).toHaveLength(1);
    expect(habits[0]?.dueToday).toBe(false);
    sqlite.close();
  });
});

describe('putCheckin 的补卡窗口', () => {
  it('打今天的卡', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    const result = await putCheckin(repo, habit.id, TODAY, { value: 1, clientToday: TODAY });

    expect(result).toEqual({ date: TODAY, value: 1 });
    sqlite.close();
  });

  it('第 7 天可以补 —— 窗口含今天共 7 天', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    const result = await putCheckin(repo, habit.id, '2026-08-15', {
      value: 1,
      clientToday: TODAY,
    });

    expect(result.date).toBe('2026-08-15');
    sqlite.close();
  });

  it('第 8 天落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    await expectStatus(
      () => putCheckin(repo, habit.id, '2026-08-14', { value: 1, clientToday: TODAY }),
      400,
    );
    sqlite.close();
  });

  it('未来的日期落成 400 —— 不能预支打卡', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    await expectStatus(
      () => putCheckin(repo, habit.id, '2026-08-22', { value: 1, clientToday: TODAY }),
      400,
    );
    sqlite.close();
  });

  it('startDate 之前的日期落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput({ startDate: '2026-08-20' }));

    await expectStatus(
      () => putCheckin(repo, habit.id, '2026-08-19', { value: 1, clientToday: TODAY }),
      400,
    );
    sqlite.close();
  });

  it('同一天写两次是幂等的，只有一行，值取最后一次', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput({ targetValue: 30 }));

    await putCheckin(repo, habit.id, TODAY, { value: 10, clientToday: TODAY });
    await putCheckin(repo, habit.id, TODAY, { value: 25, clientToday: TODAY });

    const history = await getHistory(repo, habit.id, '2026-08-01', '2026-08-31');
    expect(history.checkins).toEqual([{ date: TODAY, value: 25 }]);
    sqlite.close();
  });

  it('给不存在的习惯打卡落成 404', async () => {
    const { repo, sqlite } = makeHabitHarness();

    await expectStatus(
      () => putCheckin(repo, 'nope', TODAY, { value: 1, clientToday: TODAY }),
      404,
    );
    sqlite.close();
  });

  it('取消打卡同样受窗口约束', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await putCheckin(repo, habit.id, TODAY, { value: 1, clientToday: TODAY });

    await deleteCheckin(repo, habit.id, TODAY, TODAY);
    expect((await getHistory(repo, habit.id, '2026-08-01', '2026-08-31')).checkins).toEqual([]);

    await expectStatus(() => deleteCheckin(repo, habit.id, '2026-08-14', TODAY), 400);
    sqlite.close();
  });
});

describe('updateHabit', () => {
  it('改频率不需要回填或清理历史 —— 派生的结果自然跟着变', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await putCheckin(repo, habit.id, '2026-08-18', { value: 1, clientToday: TODAY });

    const updated = await updateHabit(repo, habit.id, {
      freqKind: 'weekdays',
      weekdays: [1, 3, 5],
    });

    expect(updated.freqKind).toBe('weekdays');
    expect((await getHistory(repo, habit.id, '2026-08-01', '2026-08-31')).checkins).toHaveLength(1);
    sqlite.close();
  });

  it('改成与别的习惯重名落成 409', async () => {
    const { repo, sqlite } = makeHabitHarness();
    await createHabit(repo, dailyInput());
    const other = await createHabit(repo, dailyInput({ name: '跑步' }));

    await expectStatus(() => updateHabit(repo, other.id, { name: '阅读' }), 409);
    sqlite.close();
  });

  it('改回自己原来的名字不算重名', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    const updated = await updateHabit(repo, habit.id, { name: '阅读', targetValue: 20 });

    expect(updated.targetValue).toBe(20);
    sqlite.close();
  });

  it('改不存在的习惯落成 404', async () => {
    const { repo, sqlite } = makeHabitHarness();

    await expectStatus(() => updateHabit(repo, 'nope', { name: 'x' }), 404);
    sqlite.close();
  });
});

describe('deleteHabit', () => {
  it('彻底删除连带清空该习惯的全部打卡', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());
    await putCheckin(repo, habit.id, TODAY, { value: 1, clientToday: TODAY });

    await deleteHabit(repo, habit.id);

    await expectStatus(() => getHistory(repo, habit.id, '2026-08-01', '2026-08-31'), 404);
    expect((await listHabits(repo, { includeArchived: true })).habits).toHaveLength(0);
    sqlite.close();
  });

  it('删不存在的习惯落成 404', async () => {
    const { repo, sqlite } = makeHabitHarness();

    await expectStatus(() => deleteHabit(repo, 'nope'), 404);
    sqlite.close();
  });
});

describe('getHistory', () => {
  it('区间超过上限落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    await expectStatus(() => getHistory(repo, habit.id, '2025-01-01', '2026-12-31'), 400);
    sqlite.close();
  });

  it('from 晚于 to 落成 400', async () => {
    const { repo, sqlite } = makeHabitHarness();
    const habit = await createHabit(repo, dailyInput());

    await expectStatus(() => getHistory(repo, habit.id, '2026-08-21', '2026-08-01'), 400);
    sqlite.close();
  });
});
