import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { makeTodoHarness } from '../testing/harness.js';
import type { TodoRepository } from './repository.js';
import { createSubtask, deleteSubtask, reorderSubtasks, updateSubtask } from './subtasks.js';
import { createTask, deleteTaskPermanently, listToday } from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z';
const OPTS = { zone: SH, now: NOW };

describe('子任务', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;
  let taskId: string;

  beforeEach(async () => {
    ({ ctx, repo } = makeTodoHarness());
    const task = await createTask(
      ctx,
      repo,
      { title: '搬家', importance: 'normal', dueDate: null },
      OPTS,
    );
    taskId = task.id;
  });

  it('新建的子任务未勾选，position 从 0 递增', async () => {
    const a = await createSubtask(ctx, repo, taskId, { title: '订车' });
    const b = await createSubtask(ctx, repo, taskId, { title: '打包' });
    expect(a.done).toBe(false);
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it('勾选与改标题', async () => {
    const sub = await createSubtask(ctx, repo, taskId, { title: '订车' });
    expect((await updateSubtask(repo, sub.id, { done: true })).done).toBe(true);
    expect((await updateSubtask(repo, sub.id, { title: '订搬家车' })).title).toBe('订搬家车');
    // 勾选状态不因改标题而丢失
    expect((await repo.getSubtask(sub.id))?.done).toBe(1);
  });

  it('子任务随今日视图一并返回，按 position 升序', async () => {
    await createSubtask(ctx, repo, taskId, { title: '订车' });
    await createSubtask(ctx, repo, taskId, { title: '打包' });
    const today = await listToday(ctx, repo, OPTS);
    const task = today.tasks.find((t) => t.id === taskId);
    expect(task?.subtasks.map((s) => s.title)).toEqual(['订车', '打包']);
  });

  it('无子任务时是空数组，不是 null', async () => {
    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.find((t) => t.id === taskId)?.subtasks).toEqual([]);
  });

  it('整条重排', async () => {
    const a = await createSubtask(ctx, repo, taskId, { title: '订车' });
    const b = await createSubtask(ctx, repo, taskId, { title: '打包' });
    const c = await createSubtask(ctx, repo, taskId, { title: '退租' });

    const reordered = await reorderSubtasks(ctx, repo, taskId, [c.id, a.id, b.id]);
    expect(reordered.map((s) => s.title)).toEqual(['退租', '订车', '打包']);
    expect(reordered.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('重排必须给出全部子任务——给一半会被拒', async () => {
    const a = await createSubtask(ctx, repo, taskId, { title: '订车' });
    await createSubtask(ctx, repo, taskId, { title: '打包' });
    await expect(reorderSubtasks(ctx, repo, taskId, [a.id])).rejects.toThrow('全部');
  });

  it('重排里混入别的任务的子任务会被拒', async () => {
    const other = await createTask(
      ctx,
      repo,
      { title: '另一件事', importance: 'low', dueDate: null },
      OPTS,
    );
    const mine = await createSubtask(ctx, repo, taskId, { title: '订车' });
    const theirs = await createSubtask(ctx, repo, other.id, { title: '不相干' });
    await expect(reorderSubtasks(ctx, repo, taskId, [mine.id, theirs.id])).rejects.toThrow(
      '不属于该任务',
    );
  });

  it('不能给别的模块的 Item 挂子任务', async () => {
    const campusItem = await ctx.items.create('campus-recruit', {
      kind: 'task',
      title: '笔试',
    });
    await expect(createSubtask(ctx, repo, campusItem.id, { title: '不该成功' })).rejects.toThrow(
      '不属于',
    );
  });

  it('彻底删除待办时，子任务被外键级联清掉', async () => {
    await createSubtask(ctx, repo, taskId, { title: '订车' });
    expect((await repo.listSubtasksByItemIds([taskId])).length).toBe(1);

    await deleteTaskPermanently(ctx, taskId);
    expect((await repo.listSubtasksByItemIds([taskId])).length).toBe(0);
  });

  it('删单个子任务', async () => {
    const sub = await createSubtask(ctx, repo, taskId, { title: '订车' });
    expect(await deleteSubtask(repo, sub.id)).toBe(true);
    expect(await deleteSubtask(repo, sub.id)).toBe(false);
  });
});
