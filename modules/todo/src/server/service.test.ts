import { describe, it, expect, beforeEach } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import { makeTodoHarness } from '../testing/harness.js';
import type { TodoRepository } from './repository.js';

import {
  createTask,
  listToday,
  completeTask,
  uncompleteTask,
  updateTask,
  trashTask,
  restoreTask,
  deleteTaskPermanently,
  listTrash,
  clearTrash,
  batchRestoreTrash,
  batchDeleteTrash,
  restoreAllTrash,
} from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z'; // 上海时间 9/20 10:00

/** 每个用例一套全新的 `:memory:` 库（core 迁移 + todo 自有表迁移）。 */
function makeCtx(): { ctx: ModuleContext; repo: TodoRepository } {
  const { ctx, repo } = makeTodoHarness();
  return { ctx, repo };
}

describe('createTask', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;
  beforeEach(() => {
    ({ ctx, repo } = makeCtx());
  });

  it('创建的任务默认排在今天', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).toContain(task.id);
    expect(task.sourceModule).toBe(TODO_MODULE_ID);
  });

  it('dueDate 被补成该本地日的最后一毫秒（spec §5.3 决策 ③）', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '有死线', importance: 'high', dueDate: '2026-09-20' },
      { zone: SH, now: NOW },
    );
    expect(task.dueAt).toBe('2026-09-20T15:59:59.999Z');
  });

  it('带时分的 dueDate 精确转换为对应时区的 UTC instant', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '下午三点半截止', importance: 'high', dueDate: '2026-09-20 15:30' },
      { zone: SH, now: NOW },
    );
    expect(task.dueAt).toBe('2026-09-20T07:30:00.000Z');
  });

  it('产出的视图带 kind，工作台靠它区分任务与事件', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.kind).toBe('task');
  });

  it('无 dueDate 时 urgency 为 none（spec §7.4）', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '无死线', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.urgency).toBe('none');
  });
});

describe('updateTask', () => {
  it('能够更新标题、重要度与截止日', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '旧标题', importance: 'low', dueDate: null },
      { zone: SH, now: NOW },
    );
    const updated = await updateTask(
      ctx,
      repo,
      task.id,
      { title: '新标题', importance: 'high', dueDate: '2026-09-20' },
      { zone: SH, now: NOW },
    );
    expect(updated.title).toBe('新标题');
    expect(updated.importance).toBe('high');
    expect(updated.dueAt).toBe('2026-09-20T15:59:59.999Z');
  });
});

describe('备注', () => {
  it('createTask 存下备注并在视图里透出', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '面试', importance: 'high', dueDate: null, notes: '带身份证与三份简历' },
      { zone: SH, now: NOW },
    );
    expect(task.notes).toBe('带身份证与三份简历');
  });

  it('不传备注时为 null', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.notes).toBeNull();
  });

  it('updateTask 传 null 清空备注', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '面试', importance: 'high', dueDate: null, notes: '带身份证' },
      { zone: SH, now: NOW },
    );
    const cleared = await updateTask(ctx, repo, task.id, { notes: null }, { zone: SH, now: NOW });
    expect(cleared.notes).toBeNull();
  });

  it('updateTask 缺省时不动已有备注', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '面试', importance: 'high', dueDate: null, notes: '带身份证' },
      { zone: SH, now: NOW },
    );
    const renamed = await updateTask(ctx, repo, task.id, { title: '终面' }, { zone: SH, now: NOW });
    expect(renamed.notes).toBe('带身份证');
  });

  it('空串归一成 null——否则库里会有两种「没有备注」', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '面试', importance: 'high', dueDate: null, notes: '' },
      { zone: SH, now: NOW },
    );
    expect(task.notes).toBeNull();

    const withNotes = await createTask(
      ctx,
      repo,
      { title: '二面', importance: 'high', dueDate: null, notes: '带身份证' },
      { zone: SH, now: NOW },
    );
    const cleared = await updateTask(
      ctx,
      repo,
      withNotes.id,
      { notes: '' },
      { zone: SH, now: NOW },
    );
    expect(cleared.notes).toBeNull();
  });
});

describe('trash & restore & delete', () => {
  it('软删除至回收站后不在今日列表中，但在回收站列表中', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '待删除任务', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, task.id, { zone: SH, now: NOW });

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).not.toContain(task.id);

    const trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items.map((t) => t.id)).toContain(task.id);
  });

  it('从回收站恢复后重新出现在今日列表中', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '恢复任务', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, task.id, { zone: SH, now: NOW });
    await restoreTask(ctx, repo, task.id, { zone: SH, now: NOW });

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).toContain(task.id);
  });

  it('已完成的任务从回收站恢复后仍是已完成', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '已完成后被误删', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, repo, task.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, task.id, { zone: SH, now: NOW });

    const restored = await restoreTask(ctx, repo, task.id, { zone: SH, now: NOW });
    expect(restored.status).toBe('done');

    // completedAt 与 status 必须始终自洽：done 有值，todo 无值
    const item = await ctx.items.getById(task.id);
    expect(item?.completedAt).not.toBeNull();

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.completed.map((t) => t.id)).toContain(task.id);
    expect(today.tasks.map((t) => t.id)).not.toContain(task.id);
  });

  it('未完成的任务从回收站恢复后不带 completedAt', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '未完成被删', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, task.id, { zone: SH, now: NOW });
    const restored = await restoreTask(ctx, repo, task.id, { zone: SH, now: NOW });

    expect(restored.status).toBe('todo');
    const item = await ctx.items.getById(task.id);
    expect(item?.completedAt).toBeNull();
  });

  it('批量恢复与全部恢复同样保留已完成状态', async () => {
    const { ctx, repo } = makeCtx();
    const doneTask = await createTask(
      ctx,
      repo,
      { title: '批量-已完成', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const openTask = await createTask(
      ctx,
      repo,
      { title: '批量-未完成', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, repo, doneTask.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, doneTask.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, openTask.id, { zone: SH, now: NOW });

    expect(await batchRestoreTrash(ctx, [doneTask.id])).toBe(1);
    expect((await ctx.items.getById(doneTask.id))?.status).toBe('done');

    expect(await restoreAllTrash(ctx)).toBe(1);
    expect((await ctx.items.getById(openTask.id))?.status).toBe('todo');
  });

  it('多选批量恢复与批量删除', async () => {
    const { ctx, repo } = makeCtx();
    const t1 = await createTask(
      ctx,
      repo,
      { title: 'B1', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const t2 = await createTask(
      ctx,
      repo,
      { title: 'B2', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const t3 = await createTask(
      ctx,
      repo,
      { title: 'B3', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, t1.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, t2.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, t3.id, { zone: SH, now: NOW });

    // 批量恢复 t1, t2
    const restoredCount = await batchRestoreTrash(ctx, [t1.id, t2.id]);
    expect(restoredCount).toBe(2);

    let trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items.map((i) => i.id)).toEqual([t3.id]);

    // 批量销毁 t3
    const deletedCount = await batchDeleteTrash(ctx, [t3.id]);
    expect(deletedCount).toBe(1);

    trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items).toHaveLength(0);
  });

  it('全部恢复回收站任务', async () => {
    const { ctx, repo } = makeCtx();
    const t1 = await createTask(
      ctx,
      repo,
      { title: 'All1', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const t2 = await createTask(
      ctx,
      repo,
      { title: 'All2', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, t1.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, t2.id, { zone: SH, now: NOW });

    const restored = await restoreAllTrash(ctx);
    expect(restored).toBe(2);

    const trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items).toHaveLength(0);
  });

  it('彻底删除与清空回收站', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '彻底删除', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, task.id, { zone: SH, now: NOW });
    await deleteTaskPermanently(ctx, task.id);

    const trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items).toHaveLength(0);
  });

  it('清空回收站批量清理', async () => {
    const { ctx, repo } = makeCtx();
    const t1 = await createTask(
      ctx,
      repo,
      { title: 'T1', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const t2 = await createTask(
      ctx,
      repo,
      { title: 'T2', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await trashTask(ctx, repo, t1.id, { zone: SH, now: NOW });
    await trashTask(ctx, repo, t2.id, { zone: SH, now: NOW });

    const count = await clearTrash(ctx);
    expect(count).toBe(2);

    const trash = await listTrash(ctx, repo, { zone: SH, now: NOW });
    expect(trash.items).toHaveLength(0);
  });
});

describe('listToday', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;
  beforeEach(() => {
    ({ ctx, repo } = makeCtx());
  });

  it('返回本地日期与时区', async () => {
    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.date).toBe('2026-09-20');
    expect(today.zone).toBe(SH);
  });

  it('按 priorityScore 降序排列', async () => {
    await createTask(
      ctx,
      repo,
      { title: '低', importance: 'low', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      repo,
      { title: '高', importance: 'high', dueDate: null },
      { zone: SH, now: NOW },
    );
    await createTask(
      ctx,
      repo,
      { title: '中', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.title)).toEqual(['高', '中', '低']);
  });

  it('已完成的任务进入 completed 列表', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '已完成项', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, repo, task.id, { zone: SH, now: NOW });

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks).toHaveLength(0);
    expect(today.completed.map((t) => t.id)).toContain(task.id);
  });

  it('逾期任务进 overdue 而不进 tasks', async () => {
    await createTask(
      ctx,
      repo,
      { title: '早就该做完', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.overdue.map((t) => t.title)).toEqual(['早就该做完']);
    expect(today.tasks.map((t) => t.title)).not.toContain('早就该做完');
  });

  it('前几天未完成的任务会被带到今天', async () => {
    const YESTERDAY = '2026-09-19T02:00:00.000Z';
    await createTask(
      ctx,
      repo,
      { title: '昨天没做完', importance: 'normal', dueDate: null },
      { zone: SH, now: YESTERDAY },
    );

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.title)).toContain('昨天没做完');
  });

  it('includes other modules and reports their sourceModule', async () => {
    await ctx.items.create('campus-recruit', {
      kind: 'task',
      title: '投递 星云科技 固件工程师',
      dueAt: '2026-09-20T15:59:59.999Z',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks).toContainEqual(
      expect.objectContaining({
        title: '投递 星云科技 固件工程师',
        sourceModule: 'campus-recruit',
      }),
    );
  });

  it('已完成的任务不出现在 overdue 中', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '逾期但已完成', importance: 'normal', dueDate: '2026-09-01' },
      { zone: SH, now: NOW },
    );
    await completeTask(ctx, repo, task.id, { zone: SH, now: NOW });
    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.overdue).toHaveLength(0);
  });
});

describe('completeTask & uncompleteTask', () => {
  it('把状态置为 done 并写入 completedAt，取消完成恢复为 todo', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '做完它', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    const done = await completeTask(ctx, repo, task.id, { zone: SH, now: NOW });
    expect(done.status).toBe('done');

    const stored = await ctx.items.getById(task.id);
    expect(stored!.completedAt).toBe(NOW);

    // 取消完成
    const undone = await uncompleteTask(ctx, repo, task.id, { zone: SH, now: NOW });
    expect(undone.status).toBe('todo');
    const storedAgain = await ctx.items.getById(task.id);
    expect(storedAgain!.completedAt).toBeNull();
  });

  it('对不存在的 id 抛错', async () => {
    const { ctx, repo } = makeCtx();
    await expect(completeTask(ctx, repo, 'nope', { zone: SH, now: NOW })).rejects.toThrow();
  });
});

describe('任务的分钟级排程', () => {
  it('不传 scheduled 时仍然排到今天全天（行为不变）', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '缺省排程', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );
    expect(task.scheduled).toEqual({ kind: 'all-day', date: '2026-09-20' });
  });

  it('建任务时直接指定具体时刻', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      {
        title: '下午三点半开会',
        importance: 'normal',
        dueDate: null,
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T07:30:00.000Z',
          end: '2026-09-20T08:30:00.000Z',
        },
      },
      { zone: SH, now: NOW },
    );

    expect(task.scheduled).toEqual({
      kind: 'timed',
      start: '2026-09-20T07:30:00.000Z',
      end: '2026-09-20T08:30:00.000Z',
    });
  });

  it('秒与毫秒被截零', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      {
        title: '带秒',
        importance: 'normal',
        dueDate: null,
        scheduled: { kind: 'timed', start: '2026-09-20T07:30:48.512Z' },
      },
      { zone: SH, now: NOW },
    );
    expect(task.scheduled).toEqual({ kind: 'timed', start: '2026-09-20T07:30:00.000Z' });
  });

  it('显式传 null 则不排程，任务直接进待排程抽屉', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '先收集不排期', importance: 'normal', dueDate: null, scheduled: null },
      { zone: SH, now: NOW },
    );

    expect(task.scheduled).toBeNull();
    const today = await listToday(ctx, repo, { zone: SH, now: NOW });
    expect(today.tasks.map((t) => t.id)).not.toContain(task.id);
  });

  it('编辑时改排程，不传则不动', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      { title: '改排程', importance: 'normal', dueDate: null },
      { zone: SH, now: NOW },
    );

    const renamed = await updateTask(
      ctx,
      repo,
      task.id,
      { title: '只改名' },
      { zone: SH, now: NOW },
    );
    expect(renamed.scheduled).toEqual({ kind: 'all-day', date: '2026-09-20' });

    const rescheduled = await updateTask(
      ctx,
      repo,
      task.id,
      { scheduled: { kind: 'timed', start: '2026-09-21T01:00:00.000Z' } },
      { zone: SH, now: NOW },
    );
    expect(rescheduled.scheduled).toEqual({ kind: 'timed', start: '2026-09-21T01:00:00.000Z' });
  });

  it('排程不影响 dueAt——死线与意图是两回事（spec §5.3 决策 ①）', async () => {
    const { ctx, repo } = makeCtx();
    const task = await createTask(
      ctx,
      repo,
      {
        title: '两回事',
        importance: 'normal',
        dueDate: '2026-09-25',
        scheduled: { kind: 'timed', start: '2026-09-21T01:00:00.000Z' },
      },
      { zone: SH, now: NOW },
    );

    expect(task.dueAt).toBe('2026-09-25T15:59:59.999Z');
    expect(task.scheduled).toEqual({ kind: 'timed', start: '2026-09-21T01:00:00.000Z' });
  });
});
