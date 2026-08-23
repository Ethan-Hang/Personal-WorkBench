import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteItemRepository } from '@workbench/data';
import type { ItemRepository } from '@workbench/core';
import { makeNotesHarness } from '../testing/harness.js';
import type { NoteDraft, NoteRepository } from '../server/repository.js';

let repo: NoteRepository;
let items: ItemRepository;

beforeEach(() => {
  const harness = makeNotesHarness();
  repo = harness.repo;
  items = new SqliteItemRepository(() => harness.sqlite);
});

function draft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  return {
    id: overrides.id ?? `note-${Math.random().toString(36).slice(2, 10)}`,
    folderId: overrides.folderId ?? null,
    title: overrides.title ?? '无标题',
    content: overrides.content ?? '',
    excerpt: overrides.excerpt ?? '',
    color: overrides.color ?? 'yellow',
    isPinned: overrides.isPinned ?? false,
    metadata: overrides.metadata ?? '{}',
    tags: overrides.tags ?? [],
  };
}

describe('文件夹树', () => {
  it('存的是 parentId 而不是路径，任意深度都能原样读回', async () => {
    const root = await repo.createFolder({ id: 'f1', name: '工作', parentId: null, sortOrder: 0 });
    const mid = await repo.createFolder({
      id: 'f2',
      name: '项目',
      parentId: root.id,
      sortOrder: 0,
    });
    const leaf = await repo.createFolder({
      id: 'f3',
      name: '周报',
      parentId: mid.id,
      sortOrder: 0,
    });

    const all = await repo.listFolders();
    expect(all).toHaveLength(3);
    expect(all.find((f) => f.id === leaf.id)?.parentId).toBe(mid.id);
    // 存储层只吐平表，树的组装是 service 的事
    expect(all.every((f) => !('children' in f))).toBe(true);
  });

  it('同名判重按「父节点内」进行——不同父节点下允许重名', async () => {
    await repo.createFolder({ id: 'a', name: '归档', parentId: null, sortOrder: 0 });
    await repo.createFolder({ id: 'b', name: '工作', parentId: null, sortOrder: 1 });
    await repo.createFolder({ id: 'c', name: '归档', parentId: 'b', sortOrder: 0 });

    expect((await repo.findFolderByName(null, '归档'))?.id).toBe('a');
    expect((await repo.findFolderByName('b', '归档'))?.id).toBe('c');
    expect(await repo.findFolderByName('b', '不存在')).toBeNull();
  });

  it('maxFolderSortOrder 按父节点各算各的，空节点下返回 -1', async () => {
    await repo.createFolder({ id: 'a', name: '甲', parentId: null, sortOrder: 0 });
    await repo.createFolder({ id: 'b', name: '乙', parentId: null, sortOrder: 5 });
    await repo.createFolder({ id: 'c', name: '丙', parentId: 'a', sortOrder: 2 });

    expect(await repo.maxFolderSortOrder(null)).toBe(5);
    expect(await repo.maxFolderSortOrder('a')).toBe(2);
    expect(await repo.maxFolderSortOrder('b')).toBe(-1);
  });

  it('删除文件夹只删那一行；子项的去向由 reparent / move 显式做掉', async () => {
    await repo.createFolder({ id: 'root', name: '根', parentId: null, sortOrder: 0 });
    await repo.createFolder({ id: 'mid', name: '中', parentId: 'root', sortOrder: 0 });
    await repo.createFolder({ id: 'leaf', name: '叶', parentId: 'mid', sortOrder: 0 });
    await repo.createNote(draft({ id: 'n1', folderId: 'mid' }));

    await repo.reparentFolders(['leaf'], 'root');
    const moved = await repo.moveNotesToFolder(['mid'], 'root');
    expect(await repo.deleteFolder('mid')).toBe(true);

    expect(moved).toBe(1);
    expect((await repo.getFolder('leaf'))?.parentId).toBe('root');
    expect((await repo.getNote('n1'))?.folderId).toBe('root');
    expect(await repo.getFolder('mid')).toBeNull();
  });

  it('moveNotesToFolder 的 null 表示未分类，走 IS NULL 而不是 = NULL', async () => {
    await repo.createFolder({ id: 'box', name: '收纳', parentId: null, sortOrder: 0 });
    await repo.createNote(draft({ id: 'loose', folderId: null }));
    await repo.createNote(draft({ id: 'filed', folderId: 'box' }));

    expect(await repo.moveNotesToFolder([null], 'box')).toBe(1);
    expect((await repo.getNote('loose'))?.folderId).toBe('box');
  });
});

describe('便签 CRUD', () => {
  it('创建后能原样读回，revision 从 1 起', async () => {
    const created = await repo.createNote(
      draft({ id: 'n1', title: '标题', content: '# 正文', excerpt: '正文', color: 'blue' }),
    );
    expect(created.revision).toBe(1);
    expect(created.status).toBe('active');

    const found = await repo.getNote('n1');
    expect(found).toMatchObject({ title: '标题', content: '# 正文', color: 'blue' });
  });

  it('标签在这一层已经是 string[]——「另一张表」是存储细节', async () => {
    await repo.createNote(draft({ id: 'n1', tags: ['读书', '灵感', '读书'] }));
    const found = await repo.getNote('n1');
    // 重复标签被吃掉：同一条便签上同名标签只能有一个
    expect(found?.tags).toEqual(['灵感', '读书']);
  });

  it('传 tags 才替换标签；不传则原样保留', async () => {
    await repo.createNote(draft({ id: 'n1', tags: ['旧'] }));
    await repo.updateNote('n1', { title: '改了标题' }, null);
    expect((await repo.getNote('n1'))?.tags).toEqual(['旧']);

    await repo.updateNote('n1', { tags: ['新一', '新二'] }, null);
    expect((await repo.getNote('n1'))?.tags).toEqual(['新一', '新二']);
  });

  it('乐观锁：版本对不上时不写入，且原记录一个字节都没变', async () => {
    await repo.createNote(draft({ id: 'n1', content: '原文' }));

    const stale = await repo.updateNote('n1', { content: '并发写' }, 99);
    expect(stale).toBeNull();
    expect((await repo.getNote('n1'))?.content).toBe('原文');

    const fresh = await repo.updateNote('n1', { content: '正常写' }, 1);
    expect(fresh?.content).toBe('正常写');
    expect(fresh?.revision).toBe(2);
  });

  it('expectedRevision 为 null 时跳过版本校验，但 revision 照样自增', async () => {
    await repo.createNote(draft({ id: 'n1' }));
    const pinned = await repo.updateNote('n1', { isPinned: true }, null);
    expect(pinned?.isPinned).toBe(true);
    expect(pinned?.revision).toBe(2);
  });

  it('不存在的便签更新返回 null，而不是抛错', async () => {
    expect(await repo.updateNote('查无此签', { title: 'x' }, null)).toBeNull();
  });
});

describe('列表：过滤与 keyset 分页', () => {
  it('按状态、文件夹、标签、关键词过滤，各条件取交集', async () => {
    await repo.createFolder({ id: 'box', name: '盒', parentId: null, sortOrder: 0 });
    await repo.createNote(
      draft({ id: 'a', folderId: 'box', title: 'Fastify 路由', tags: ['后端'] }),
    );
    await repo.createNote(draft({ id: 'b', folderId: 'box', title: '读书笔记', tags: ['读书'] }));
    await repo.createNote(
      draft({ id: 'c', folderId: null, title: 'Fastify 插件', tags: ['后端'] }),
    );

    const byFolder = await repo.listNotes({ folderIds: ['box'], limit: 10 });
    expect(byFolder.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);

    const byTag = await repo.listNotes({ tag: '后端', limit: 10 });
    expect(byTag.notes.map((n) => n.id).sort()).toEqual(['a', 'c']);

    // 关键词大小写不敏感
    const byKeyword = await repo.listNotes({ keyword: 'fastify', limit: 10 });
    expect(byKeyword.notes.map((n) => n.id).sort()).toEqual(['a', 'c']);

    const both = await repo.listNotes({ folderIds: ['box'], tag: '后端', limit: 10 });
    expect(both.notes.map((n) => n.id)).toEqual(['a']);
  });

  it('folderIds 含 null 时把未分类也带上', async () => {
    await repo.createFolder({ id: 'box', name: '盒', parentId: null, sortOrder: 0 });
    await repo.createNote(draft({ id: 'a', folderId: 'box' }));
    await repo.createNote(draft({ id: 'b', folderId: null }));

    const page = await repo.listNotes({ folderIds: ['box', null], limit: 10 });
    expect(page.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('置顶恒在最前，其余按 updatedAt 倒序', async () => {
    await repo.createNote(draft({ id: 'old' }));
    await repo.createNote(draft({ id: 'new' }));
    await repo.updateNote('new', { title: '刚改过' }, null);
    await repo.updateNote('old', { isPinned: true }, null);

    const page = await repo.listNotes({ limit: 10 });
    expect(page.notes[0]?.id).toBe('old');
  });

  it('游标分页：翻完所有页恰好覆盖全集，不重不漏', async () => {
    for (let index = 0; index < 7; index += 1) {
      await repo.createNote(draft({ id: `n${index}` }));
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const page: Awaited<ReturnType<NoteRepository['listNotes']>> = await repo.listNotes({
        limit: 3,
        cursor,
      });
      seen.push(...page.notes.map((note) => note.id));
      cursor = page.nextCursor;
      if (cursor === null) break;
    }

    expect(cursor).toBeNull();
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('最后一页的 nextCursor 是 null——多取一条来判断，不再打一次 COUNT(*)', async () => {
    await repo.createNote(draft({ id: 'only' }));
    const page = await repo.listNotes({ limit: 3 });
    expect(page.nextCursor).toBeNull();
  });

  it('坏掉的游标当作「从头开始」，不抛错', async () => {
    await repo.createNote(draft({ id: 'n1' }));
    const page = await repo.listNotes({ limit: 3, cursor: '这不是-base64-游标' });
    expect(page.notes.map((n) => n.id)).toEqual(['n1']);
  });
});

describe('软删除与统计', () => {
  it('进回收站只改 status 与 trashedAt，正文与标签原封不动', async () => {
    await repo.createNote(draft({ id: 'n1', content: '还想留着', tags: ['重要'] }));
    const trashed = await repo.updateNote(
      'n1',
      { status: 'trashed', trashedAt: '2026-08-21T00:00:00.000Z' },
      null,
    );

    expect(trashed?.status).toBe('trashed');
    expect(trashed?.trashedAt).toBe('2026-08-21T00:00:00.000Z');
    expect(trashed?.content).toBe('还想留着');
    expect(trashed?.tags).toEqual(['重要']);
  });

  it('默认列表不含回收站与归档——由调用方给出 statuses', async () => {
    await repo.createNote(draft({ id: 'live' }));
    await repo.createNote(draft({ id: 'gone' }));
    await repo.updateNote('gone', { status: 'trashed', trashedAt: 'x' }, null);

    const page = await repo.listNotes({ statuses: ['active'], limit: 10 });
    expect(page.notes.map((n) => n.id)).toEqual(['live']);
  });

  it('清空回收站只删 trashed 的，连带清掉它们的标签与链接', async () => {
    const item = await items.create('notes', { kind: 'task', title: '派发出去的待办' });
    await repo.createNote(draft({ id: 'live', tags: ['留着'] }));
    await repo.createNote(draft({ id: 'gone', tags: ['丢掉'] }));
    await repo.linkTodo('link-1', 'gone', item.id);
    await repo.updateNote('gone', { status: 'trashed', trashedAt: 'x' }, null);

    expect(await repo.purgeTrashed()).toBe(1);
    expect(await repo.getNote('gone')).toBeNull();
    expect(await repo.getNote('live')).not.toBeNull();
    expect(await repo.listTodoLinks('gone')).toEqual([]);
    expect((await repo.listTags()).map((tag) => tag.name)).toEqual(['留着']);
  });

  it('countByStatus 三种状态都给出，没有的记 0', async () => {
    await repo.createNote(draft({ id: 'a' }));
    await repo.createNote(draft({ id: 'b' }));
    await repo.updateNote('b', { status: 'archived' }, null);

    expect(await repo.countByStatus()).toEqual({ active: 1, archived: 1, trashed: 0 });
  });

  it('countByFolder 不数回收站里的，未分类归在 null 键下', async () => {
    await repo.createFolder({ id: 'box', name: '盒', parentId: null, sortOrder: 0 });
    await repo.createNote(draft({ id: 'a', folderId: 'box' }));
    await repo.createNote(draft({ id: 'b', folderId: null }));
    await repo.createNote(draft({ id: 'c', folderId: 'box' }));
    await repo.updateNote('c', { status: 'trashed', trashedAt: 'x' }, null);

    const counts = await repo.countByFolder();
    expect(counts.get('box')).toBe(1);
    expect(counts.get(null)).toBe(1);
  });

  it('listTags 统计使用次数，且不数回收站里的便签', async () => {
    await repo.createNote(draft({ id: 'a', tags: ['共有'] }));
    await repo.createNote(draft({ id: 'b', tags: ['共有', '独有'] }));
    await repo.createNote(draft({ id: 'c', tags: ['共有'] }));
    await repo.updateNote('c', { status: 'trashed', trashedAt: 'x' }, null);

    expect(await repo.listTags()).toEqual([
      { name: '共有', count: 2 },
      { name: '独有', count: 1 },
    ]);
  });
});

describe('待办关联', () => {
  it('链接指向 core 的 items，而不是 todo 模块的任何一张表', async () => {
    const item = await items.create('todo', { kind: 'task', title: '把便签写完' });
    await repo.createNote(draft({ id: 'n1' }));

    const link = await repo.linkTodo('link-1', 'n1', item.id);
    expect(link.todoItemId).toBe(item.id);
    expect(await repo.listTodoLinks('n1')).toHaveLength(1);
  });

  it('重复关联同一条待办是幂等的，不会撞唯一约束', async () => {
    const item = await items.create('todo', { kind: 'task', title: '同一条' });
    await repo.createNote(draft({ id: 'n1' }));

    const first = await repo.linkTodo('link-1', 'n1', item.id);
    const second = await repo.linkTodo('link-2', 'n1', item.id);
    expect(second.id).toBe(first.id);
    expect(await repo.listTodoLinks('n1')).toHaveLength(1);
  });

  it('Item 被源模块彻底删除时链接跟着消失——不留点不开的死链', async () => {
    const item = await items.create('todo', { kind: 'task', title: '会被删掉' });
    await repo.createNote(draft({ id: 'n1' }));
    await repo.linkTodo('link-1', 'n1', item.id);

    expect(await items.delete('todo', item.id)).toBe(true);
    expect(await repo.listTodoLinks('n1')).toEqual([]);
  });

  it('listTodoLinksFor 一次查完多条便签，避免卡片流 N+1', async () => {
    const one = await items.create('todo', { kind: 'task', title: '一' });
    const two = await items.create('todo', { kind: 'task', title: '二' });
    await repo.createNote(draft({ id: 'n1' }));
    await repo.createNote(draft({ id: 'n2' }));
    await repo.linkTodo('l1', 'n1', one.id);
    await repo.linkTodo('l2', 'n2', two.id);

    const grouped = await repo.listTodoLinksFor(['n1', 'n2', 'n3']);
    expect(grouped.get('n1')?.[0]?.todoItemId).toBe(one.id);
    expect(grouped.get('n2')?.[0]?.todoItemId).toBe(two.id);
    expect(grouped.has('n3')).toBe(false);
  });

  it('解除关联只删链接，不动 Item 本身', async () => {
    const item = await items.create('todo', { kind: 'task', title: '还要留着' });
    await repo.createNote(draft({ id: 'n1' }));
    await repo.linkTodo('l1', 'n1', item.id);

    expect(await repo.unlinkTodo('n1', item.id)).toBe(true);
    expect(await repo.unlinkTodo('n1', item.id)).toBe(false);
    expect(await items.getById(item.id)).not.toBeNull();
  });

  it('彻底删除便签会带走它的标签与链接', async () => {
    const item = await items.create('todo', { kind: 'task', title: '陪葬' });
    await repo.createNote(draft({ id: 'n1', tags: ['要删'] }));
    await repo.linkTodo('l1', 'n1', item.id);

    expect(await repo.deleteNote('n1')).toBe(true);
    expect(await repo.listTags()).toEqual([]);
    expect(await repo.listTodoLinks('n1')).toEqual([]);
    // Item 是 core 的，不该被便签的删除牵连
    expect(await items.getById(item.id)).not.toBeNull();
  });
});
