import { describe, it, expect, beforeEach } from 'vitest';
import type { ItemRepository } from '../repository.js';

/**
 * ItemRepository 的行为契约（spec §9 LSP）。
 * 任何实现——SQLite 版、将来的同步版——都必须原样通过这一套测试。
 */
export function runItemRepositoryContract(
  name: string,
  makeRepo: () => Promise<ItemRepository> | ItemRepository,
): void {
  describe(`ItemRepository 契约：${name}`, () => {
    let repo: ItemRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('create 后可按 id 取回，且带上 sourceModule', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '写周报' });
      const found = await repo.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('写周报');
      expect(found!.sourceModule).toBe('todo');
    });

    it('create 应用默认值：status=todo, importance=normal', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '默认值' });
      expect(created.status).toBe('todo');
      expect(created.importance).toBe('normal');
    });

    it('getById 对不存在的 id 返回 null 而非抛错', async () => {
      expect(await repo.getById('does-not-exist')).toBeNull();
    });

    it('往返保持 all-day 排程的浮动日期，不做时区偏移', async () => {
      const created = await repo.create('todo', {
        kind: 'event',
        title: '全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      const found = await repo.getById(created.id);
      expect(found!.scheduled).toEqual({ kind: 'all-day', date: '2026-09-20' });
    });

    it('往返保持 timed 排程的 UTC instant', async () => {
      const created = await repo.create('campus-recruit', {
        kind: 'event',
        title: '笔试',
        scheduled: {
          kind: 'timed',
          start: '2026-09-20T11:00:00.000Z',
          end: '2026-09-20T13:00:00.000Z',
        },
      });
      const found = await repo.getById(created.id);
      expect(found!.scheduled).toEqual({
        kind: 'timed',
        start: '2026-09-20T11:00:00.000Z',
        end: '2026-09-20T13:00:00.000Z',
      });
    });

    it('update 修改字段并推进 updatedAt', async () => {
      const created = await repo.create('todo', { kind: 'task', title: '旧标题' });
      await new Promise((r) => setTimeout(r, 2));
      const updated = await repo.update(created.id, { title: '新标题', status: 'done' });
      expect(updated.title).toBe('新标题');
      expect(updated.status).toBe('done');
      expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
    });

    it('update 不存在的 id 应抛错', async () => {
      await expect(repo.update('does-not-exist', { title: 'x' })).rejects.toThrow();
    });

    it('list 按 scheduledWithin 过滤定时排程', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '区间内',
        scheduled: { kind: 'timed', start: '2026-09-20T02:00:00.000Z' },
      });
      await repo.create('todo', {
        kind: 'event',
        title: '区间外',
        scheduled: { kind: 'timed', start: '2026-09-25T02:00:00.000Z' },
      });

      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found.map((i) => i.title)).toEqual(['区间内']);
    });

    it('list 的区间右端点是排除的', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '恰在右端点',
        scheduled: { kind: 'timed', start: '2026-09-20T16:00:00.000Z' },
      });
      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found).toHaveLength(0);
    });

    // 左端点必须单独测：只测右端点排除的话，实现把 >= 写成 > 也照样通过，
    // 而那会让恰好排在本地零点的事项从"今天"里静默消失。
    it('list 的区间左端点是包含的', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '恰在左端点',
        scheduled: { kind: 'timed', start: '2026-09-19T16:00:00.000Z' },
      });
      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(found.map((i) => i.title)).toEqual(['恰在左端点']);
    });

    it('list 同时给出 scheduledWithin 与 scheduledOnDate 时取并集', async () => {
      await repo.create('todo', {
        kind: 'event',
        title: '定时',
        scheduled: { kind: 'timed', start: '2026-09-20T02:00:00.000Z' },
      });
      await repo.create('todo', {
        kind: 'event',
        title: '全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });

      const found = await repo.list({
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
        scheduledOnDate: '2026-09-20',
      });
      expect(found.map((i) => i.title).sort()).toEqual(['全天', '定时']);
    });

    it('list 按 scheduledOnOrBeforeDate 带出更早的全天排程', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '前天的',
        scheduled: { kind: 'all-day', date: '2026-09-18' },
      });
      await repo.create('todo', {
        kind: 'task',
        title: '今天的',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      await repo.create('todo', {
        kind: 'task',
        title: '明天的',
        scheduled: { kind: 'all-day', date: '2026-09-21' },
      });

      const found = await repo.list({ scheduledOnOrBeforeDate: '2026-09-20' });
      expect(found.map((i) => i.title).sort()).toEqual(['今天的', '前天的']);
    });

    it('list 按 statuses 过滤', async () => {
      await repo.create('todo', { kind: 'task', title: '未完成' });
      const done = await repo.create('todo', { kind: 'task', title: '已完成' });
      await repo.update(done.id, { status: 'done' });

      const found = await repo.list({ statuses: ['done'] });
      expect(found.map((i) => i.title)).toEqual(['已完成']);
    });

    it('list 按 dueBefore 过滤，用于逾期摘要', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '已逾期',
        dueAt: '2026-09-01T00:00:00.000Z',
      });
      await repo.create('todo', {
        kind: 'task',
        title: '未逾期',
        dueAt: '2026-12-01T00:00:00.000Z',
      });

      const found = await repo.list({ dueBefore: '2026-09-20T00:00:00.000Z' });
      expect(found.map((i) => i.title)).toEqual(['已逾期']);
    });

    it('list 按 scheduledDateBetween 取区间内的全天事项（含端点）', async () => {
      for (const date of ['2026-09-18', '2026-09-20', '2026-09-22', '2026-09-24']) {
        await repo.create('todo', {
          kind: 'task',
          title: date,
          scheduled: { kind: 'all-day', date },
        });
      }

      const found = await repo.list({
        scheduledDateBetween: { from: '2026-09-20', to: '2026-09-22' },
      });
      expect(found.map((i) => i.title).sort()).toEqual(['2026-09-20', '2026-09-22']);
    });

    it('scheduledDateBetween 不抓定时事项，与 scheduledWithin 取并集', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      await repo.create('campus-recruit', {
        kind: 'event',
        title: '定时',
        scheduled: { kind: 'timed', start: '2026-09-20T11:00:00.000Z' },
      });

      // 单给日期区间：只得到全天的
      const dateOnly = await repo.list({
        scheduledDateBetween: { from: '2026-09-20', to: '2026-09-20' },
      });
      expect(dateOnly.map((i) => i.title)).toEqual(['全天']);

      // 两个条件同时给出：并集，日历需要的正是这个
      const both = await repo.list({
        scheduledDateBetween: { from: '2026-09-20', to: '2026-09-20' },
        scheduledWithin: {
          startUtc: '2026-09-19T16:00:00.000Z',
          endUtc: '2026-09-20T16:00:00.000Z',
        },
      });
      expect(both.map((i) => i.title).sort()).toEqual(['全天', '定时']);
    });

    it('list 按 unscheduled 只取未排程的 Item', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '已排全天',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      await repo.create('todo', {
        kind: 'event',
        title: '已排定时',
        scheduled: { kind: 'timed', start: '2026-09-20T11:00:00.000Z' },
      });
      await repo.create('todo', { kind: 'task', title: '未排程', scheduled: null });
      await repo.create('todo', { kind: 'task', title: '未给 scheduled' });

      const found = await repo.list({ unscheduled: true });
      expect(found.map((i) => i.title).sort()).toEqual(['未排程', '未给 scheduled']);
    });

    it('unscheduled 与其他条件取交集，不是并集', async () => {
      await repo.create('todo', { kind: 'task', title: 'todo 的未排程' });
      await repo.create('campus-recruit', { kind: 'task', title: '秋招的未排程' });

      const found = await repo.list({ unscheduled: true, sourceModules: ['todo'] });
      expect(found.map((i) => i.title)).toEqual(['todo 的未排程']);
    });

    it('unscheduled: false 不施加任何过滤', async () => {
      await repo.create('todo', {
        kind: 'task',
        title: '已排',
        scheduled: { kind: 'all-day', date: '2026-09-20' },
      });
      await repo.create('todo', { kind: 'task', title: '未排' });

      const found = await repo.list({ unscheduled: false });
      expect(found).toHaveLength(2);
    });

    it('delete 删除自己的 Item，并返回 true', async () => {
      const own = await repo.create('campus-recruit', { kind: 'task', title: '截止任务' });

      expect(await repo.delete('campus-recruit', own.id)).toBe(true);
      expect(await repo.getById(own.id)).toBeNull();
    });

    it('delete 不得删除其他模块的 Item', async () => {
      const todo = await repo.create('todo', { kind: 'task', title: 'todo 的任务' });

      expect(await repo.delete('campus-recruit', todo.id)).toBe(false);
      expect(await repo.getById(todo.id)).toMatchObject({ id: todo.id, sourceModule: 'todo' });
    });

    it('delete 不存在的 Item 返回 false', async () => {
      expect(await repo.delete('campus-recruit', 'does-not-exist')).toBe(false);
    });

    it('deleteBySourceModule 只删该模块的 Item（spec §5.6）', async () => {
      await repo.create('todo', { kind: 'task', title: '留下' });
      await repo.create('campus-recruit', { kind: 'event', title: '删掉 1' });
      await repo.create('campus-recruit', { kind: 'event', title: '删掉 2' });

      const deleted = await repo.deleteBySourceModule('campus-recruit');
      expect(deleted).toBe(2);

      const remaining = await repo.list({});
      expect(remaining.map((i) => i.title)).toEqual(['留下']);
    });
  });
}
