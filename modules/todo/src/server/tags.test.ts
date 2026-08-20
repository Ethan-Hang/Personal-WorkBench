import { beforeEach, describe, expect, it } from 'vitest';
import type { ModuleContext } from '@workbench/core';
import { makeTodoHarness } from '../testing/harness.js';
import type { TodoRepository } from './repository.js';
import { createTag, deleteTag, listTags, setTaskTags, updateTag } from './tags.js';
import { createTask, deleteTaskPermanently, listToday } from './service.js';

const SH = 'Asia/Shanghai';
const NOW = '2026-09-20T02:00:00.000Z';
const OPTS = { zone: SH, now: NOW };

describe('标签', () => {
  let ctx: ModuleContext;
  let repo: TodoRepository;

  beforeEach(() => {
    ({ ctx, repo } = makeTodoHarness());
  });

  it('建标签并列出，按名称排序', async () => {
    await createTag(repo, { name: '工作', color: 'blue' });
    await createTag(repo, { name: '生活' });
    const tags = await listTags(repo);
    expect(tags.map((t) => t.name).sort()).toEqual(['工作', '生活']);
    expect(tags.find((t) => t.name === '生活')?.color).toBeNull();
  });

  it('重名被拒，且大小写不敏感——否则标签列表会长出一堆孪生项', async () => {
    await createTag(repo, { name: 'Work' });
    await expect(createTag(repo, { name: 'work' })).rejects.toThrow('已存在');
    await expect(createTag(repo, { name: 'WORK' })).rejects.toThrow('已存在');
  });

  it('改名时不会跟自己重名', async () => {
    const tag = await createTag(repo, { name: 'Work' });
    const renamed = await updateTag(repo, tag.id, { name: 'work' });
    expect(renamed.name).toBe('work');
  });

  it('改名撞上别的标签会被拒', async () => {
    await createTag(repo, { name: '工作' });
    const other = await createTag(repo, { name: '生活' });
    await expect(updateTag(repo, other.id, { name: '工作' })).rejects.toThrow('已存在');
  });

  it('给待办打标签，随今日视图返回', async () => {
    const work = await createTag(repo, { name: '工作', color: 'blue' });
    const urgent = await createTag(repo, { name: '紧急', color: 'red' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );

    await setTaskTags(ctx, repo, task.id, [work.id, urgent.id]);

    const today = await listToday(ctx, repo, OPTS);
    const view = today.tasks.find((t) => t.id === task.id);
    expect(view?.tags.map((t) => t.name)).toEqual(['工作', '紧急']);
  });

  it('整体替换语义：再设一次会覆盖而不是追加', async () => {
    const a = await createTag(repo, { name: 'A' });
    const b = await createTag(repo, { name: 'B' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );

    await setTaskTags(ctx, repo, task.id, [a.id, b.id]);
    await setTaskTags(ctx, repo, task.id, [b.id]);

    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.find((t) => t.id === task.id)?.tags.map((t) => t.name)).toEqual(['B']);
  });

  it('传空数组即清空', async () => {
    const a = await createTag(repo, { name: 'A' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );
    await setTaskTags(ctx, repo, task.id, [a.id]);
    await setTaskTags(ctx, repo, task.id, []);

    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.find((t) => t.id === task.id)?.tags).toEqual([]);
  });

  it('重复传同一个标签不会产生重复关联', async () => {
    const a = await createTag(repo, { name: 'A' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );
    await setTaskTags(ctx, repo, task.id, [a.id, a.id, a.id]);

    const today = await listToday(ctx, repo, OPTS);
    expect(today.tasks.find((t) => t.id === task.id)?.tags.length).toBe(1);
  });

  it('不存在的标签 id 会被拒', async () => {
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );
    await expect(setTaskTags(ctx, repo, task.id, ['nope'])).rejects.toThrow('标签不存在');
  });

  it('不能给别的模块的 Item 打标签', async () => {
    const tag = await createTag(repo, { name: 'A' });
    const campusItem = await ctx.items.create('campus-recruit', { kind: 'task', title: '笔试' });
    await expect(setTaskTags(ctx, repo, campusItem.id, [tag.id])).rejects.toThrow('不属于');
  });

  it('删标签连带解除关联，待办本身还在', async () => {
    const tag = await createTag(repo, { name: 'A' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );
    await setTaskTags(ctx, repo, task.id, [tag.id]);

    expect(await deleteTag(repo, tag.id)).toBe(true);

    const today = await listToday(ctx, repo, OPTS);
    const view = today.tasks.find((t) => t.id === task.id);
    expect(view).toBeDefined();
    expect(view?.tags).toEqual([]);
  });

  it('彻底删除待办时，标签关联被外键级联清掉，标签本身留着', async () => {
    const tag = await createTag(repo, { name: 'A' });
    const task = await createTask(
      ctx,
      repo,
      { title: '写周报', importance: 'high', dueDate: null },
      OPTS,
    );
    await setTaskTags(ctx, repo, task.id, [tag.id]);

    await deleteTaskPermanently(ctx, task.id);

    expect((await repo.listTagIdsByItemIds([task.id])).length).toBe(0);
    expect((await listTags(repo)).length).toBe(1);
  });
});
