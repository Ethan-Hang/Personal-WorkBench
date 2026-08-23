import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import type { ItemRepository } from '@workbench/core';
import {
  NOTES_API_V1,
  batchResultSchema,
  createTodoResponseSchema,
  folderTreeResponseSchema,
  folderViewSchema,
  noteViewSchema,
  notesPageResponseSchema,
  statsResponseSchema,
  tagsResponseSchema,
  todoLinksResponseSchema,
} from '../contract.js';
import { SqliteNoteRepository } from '../storage/sqlite-repository.js';
import { createNotesServerModule } from './index.js';

const apps: FastifyInstance[] = [];

interface Fixture {
  app: FastifyInstance;
  items: ItemRepository;
}

async function makeApp(): Promise<Fixture> {
  const { sqlite } = openTestDatabase();
  const repo = new SqliteNoteRepository(() => sqlite);
  const app = await buildApp({ getSqlite: () => sqlite, modules: [createNotesServerModule(repo)] });
  apps.push(app);
  return { app, items: new SqliteItemRepository(() => sqlite) };
}

async function createNote(
  app: FastifyInstance,
  payload: Record<string, unknown> = {},
): Promise<ReturnType<typeof noteViewSchema.parse>> {
  const response = await app.inject({ method: 'POST', url: NOTES_API_V1.notes, payload });
  expect(response.statusCode).toBe(201);
  return noteViewSchema.parse(response.json());
}

async function createFolder(
  app: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<ReturnType<typeof folderViewSchema.parse>> {
  const response = await app.inject({ method: 'POST', url: NOTES_API_V1.folders, payload });
  expect(response.statusCode).toBe(201);
  return folderViewSchema.parse(response.json());
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('便签 CRUD', () => {
  it('走通建、读、改、彻底删的完整生命周期', async () => {
    const { app } = await makeApp();

    const empty = await app.inject({ method: 'GET', url: NOTES_API_V1.notes });
    expect(empty.statusCode).toBe(200);
    expect(notesPageResponseSchema.parse(empty.json())).toEqual({ notes: [], nextCursor: null });

    const created = await createNote(app, { title: '第一条', content: '# 正文\n\n**加粗**' });
    expect(created.revision).toBe(1);
    // 摘要由服务端从正文派生，没有单独设置它的入口
    expect(created.excerpt).toBe('正文 加粗');

    const patched = await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.note(created.id),
      payload: { content: '换了正文', revision: created.revision },
    });
    expect(patched.statusCode).toBe(200);
    const updated = noteViewSchema.parse(patched.json());
    expect(updated.excerpt).toBe('换了正文');
    expect(updated.revision).toBe(2);

    const removed = await app.inject({ method: 'DELETE', url: NOTES_API_V1.note(created.id) });
    expect(removed.statusCode).toBe(204);

    const gone = await app.inject({ method: 'GET', url: NOTES_API_V1.note(created.id) });
    expect(gone.statusCode).toBe(404);
  });

  it('版本冲突落成 409 而不是 500，并把当前版本号写进消息', async () => {
    const { app } = await makeApp();
    const note = await createNote(app, { content: '原文' });

    await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.note(note.id),
      payload: { content: '另一个窗口先保存了', revision: 1 },
    });

    const stale = await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.note(note.id),
      payload: { content: '我拿着旧版本', revision: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toContain('2');

    const current = await app.inject({ method: 'GET', url: NOTES_API_V1.note(note.id) });
    expect(noteViewSchema.parse(current.json()).content).toBe('另一个窗口先保存了');
  });

  it('不带 revision 的元数据更新不受乐观锁约束', async () => {
    const { app } = await makeApp();
    const note = await createNote(app, { title: '置顶试试' });

    const pinned = await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.note(note.id),
      payload: { isPinned: true },
    });
    expect(pinned.statusCode).toBe(200);
    expect(noteViewSchema.parse(pinned.json()).isPinned).toBe(true);
  });

  it('指向不存在文件夹的便签被拒为 404，不会造出一条挂在虚空里的便签', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.notes,
      payload: { title: '孤儿', folderId: '查无此夹' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('入参不合法落成 400', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.notes,
      payload: { color: 'chartreuse' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('列表：过滤与分页', () => {
  it('默认只返回 active——回收站与归档要显式索取', async () => {
    const { app } = await makeApp();
    const live = await createNote(app, { title: '在架上' });
    const gone = await createNote(app, { title: '要丢掉' });

    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [gone.id], action: { kind: 'trash' } },
    });

    const listed = await app.inject({ method: 'GET', url: NOTES_API_V1.notes });
    expect(notesPageResponseSchema.parse(listed.json()).notes.map((n) => n.id)).toEqual([live.id]);

    const trashed = await app.inject({
      method: 'GET',
      url: `${NOTES_API_V1.notes}?status=trashed`,
    });
    expect(notesPageResponseSchema.parse(trashed.json()).notes.map((n) => n.id)).toEqual([gone.id]);
  });

  it('includeDescendants=true 时把子文件夹里的便签也带上', async () => {
    const { app } = await makeApp();
    const root = await createFolder(app, { name: '工作' });
    const child = await createFolder(app, { name: '周报', parentId: root.id });
    const inRoot = await createNote(app, { title: '根下', folderId: root.id });
    const inChild = await createNote(app, { title: '子下', folderId: child.id });

    const shallow = await app.inject({
      method: 'GET',
      url: `${NOTES_API_V1.notes}?folderId=${root.id}`,
    });
    expect(notesPageResponseSchema.parse(shallow.json()).notes.map((n) => n.id)).toEqual([
      inRoot.id,
    ]);

    const deep = await app.inject({
      method: 'GET',
      url: `${NOTES_API_V1.notes}?folderId=${root.id}&includeDescendants=true`,
    });
    expect(
      notesPageResponseSchema
        .parse(deep.json())
        .notes.map((n) => n.id)
        .sort(),
    ).toEqual([inRoot.id, inChild.id].sort());
  });

  it('folderId=unfiled 取未分类——查询串里表达不出 null', async () => {
    const { app } = await makeApp();
    const folder = await createFolder(app, { name: '盒' });
    await createNote(app, { title: '归了档', folderId: folder.id });
    const loose = await createNote(app, { title: '没归档' });

    const response = await app.inject({
      method: 'GET',
      url: `${NOTES_API_V1.notes}?folderId=unfiled`,
    });
    expect(notesPageResponseSchema.parse(response.json()).notes.map((n) => n.id)).toEqual([
      loose.id,
    ]);
  });

  it('游标翻页覆盖全集，不重不漏', async () => {
    const { app } = await makeApp();
    for (let index = 0; index < 5; index += 1) {
      await createNote(app, { title: `第 ${index} 条` });
    }

    const seen: string[] = [];
    let url = `${NOTES_API_V1.notes}?limit=2`;
    for (let guard = 0; guard < 6; guard += 1) {
      const response = await app.inject({ method: 'GET', url });
      const page = notesPageResponseSchema.parse(response.json());
      seen.push(...page.notes.map((note) => note.id));
      if (page.nextCursor === null) break;
      url = `${NOTES_API_V1.notes}?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('关键词与标签过滤取交集', async () => {
    const { app } = await makeApp();
    await createNote(app, { title: 'Fastify 路由', tags: ['后端'] });
    await createNote(app, { title: 'Fastify 前端调用', tags: ['前端'] });

    const response = await app.inject({
      method: 'GET',
      url: `${NOTES_API_V1.notes}?keyword=fastify&tag=${encodeURIComponent('后端')}`,
    });
    const page = notesPageResponseSchema.parse(response.json());
    expect(page.notes.map((n) => n.title)).toEqual(['Fastify 路由']);
  });
});

describe('文件夹树', () => {
  it('返回嵌套树与每层的便签数，未分类单独给', async () => {
    const { app } = await makeApp();
    const root = await createFolder(app, { name: '工作', icon: '💼' });
    const child = await createFolder(app, { name: '周报', parentId: root.id });
    await createNote(app, { title: '在子夹', folderId: child.id });
    await createNote(app, { title: '未分类' });

    const response = await app.inject({ method: 'GET', url: NOTES_API_V1.folders });
    const tree = folderTreeResponseSchema.parse(response.json());

    expect(tree.folders).toHaveLength(1);
    expect(tree.folders[0]?.icon).toBe('💼');
    expect(tree.folders[0]?.children[0]?.name).toBe('周报');
    // noteCount 只数直接挂在本层的，不含子孙
    expect(tree.folders[0]?.noteCount).toBe(0);
    expect(tree.folders[0]?.children[0]?.noteCount).toBe(1);
    expect(tree.unfiledCount).toBe(1);
  });

  it('同层重名落成 409，不同层允许重名', async () => {
    const { app } = await makeApp();
    const root = await createFolder(app, { name: '归档' });

    const clash = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.folders,
      payload: { name: '归档' },
    });
    expect(clash.statusCode).toBe(409);

    const nested = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.folders,
      payload: { name: '归档', parentId: root.id },
    });
    expect(nested.statusCode).toBe(201);
  });

  it('把文件夹移到自己的子孙下会被拒——那一支会从树上整个掉下来', async () => {
    const { app } = await makeApp();
    const root = await createFolder(app, { name: '甲' });
    const child = await createFolder(app, { name: '乙', parentId: root.id });
    const grandchild = await createFolder(app, { name: '丙', parentId: child.id });

    const cycle = await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.folder(root.id),
      payload: { parentId: grandchild.id },
    });
    expect(cycle.statusCode).toBe(400);

    const selfMove = await app.inject({
      method: 'PATCH',
      url: NOTES_API_V1.folder(root.id),
      payload: { parentId: root.id },
    });
    expect(selfMove.statusCode).toBe(400);
  });

  it('删文件夹时子文件夹与便签上移到父级，一条便签都不删', async () => {
    const { app } = await makeApp();
    const root = await createFolder(app, { name: '根' });
    const mid = await createFolder(app, { name: '中', parentId: root.id });
    await createFolder(app, { name: '叶', parentId: mid.id });
    const note = await createNote(app, { title: '别删我', folderId: mid.id });

    const removed = await app.inject({ method: 'DELETE', url: NOTES_API_V1.folder(mid.id) });
    expect(removed.statusCode).toBe(204);

    const tree = folderTreeResponseSchema.parse(
      (await app.inject({ method: 'GET', url: NOTES_API_V1.folders })).json(),
    );
    expect(tree.folders[0]?.children.map((node) => node.name)).toEqual(['叶']);

    const survivor = await app.inject({ method: 'GET', url: NOTES_API_V1.note(note.id) });
    expect(noteViewSchema.parse(survivor.json()).folderId).toBe(root.id);
  });
});

describe('批量管道与回收站', () => {
  it('一个动作作用在一批便签上，缺席的进 skipped 而不是整批失败', async () => {
    const { app } = await makeApp();
    const one = await createNote(app, { title: '甲' });
    const two = await createNote(app, { title: '乙' });

    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [one.id, two.id, '查无此签'], action: { kind: 'archive' } },
    });
    expect(response.statusCode).toBe(200);
    expect(batchResultSchema.parse(response.json())).toEqual({
      affected: 2,
      skipped: ['查无此签'],
    });
  });

  it('trash → restore 走一圈后回到 active，正文与标签原封不动', async () => {
    const { app } = await makeApp();
    const note = await createNote(app, { content: '还想留着', tags: ['重要'] });

    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [note.id], action: { kind: 'trash' } },
    });
    const trashed = noteViewSchema.parse(
      (await app.inject({ method: 'GET', url: NOTES_API_V1.note(note.id) })).json(),
    );
    expect(trashed.status).toBe('trashed');
    expect(trashed.trashedAt).not.toBeNull();

    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [note.id], action: { kind: 'restore' } },
    });
    const restored = noteViewSchema.parse(
      (await app.inject({ method: 'GET', url: NOTES_API_V1.note(note.id) })).json(),
    );
    expect(restored.status).toBe('active');
    expect(restored.trashedAt).toBeNull();
    expect(restored.content).toBe('还想留着');
    expect(restored.tags).toEqual(['重要']);
  });

  it('批量移动到不存在的文件夹整批拒绝，不会先移一半', async () => {
    const { app } = await makeApp();
    const note = await createNote(app, { title: '别乱动' });

    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [note.id], action: { kind: 'move', folderId: '查无此夹' } },
    });
    expect(response.statusCode).toBe(404);
    expect(
      noteViewSchema.parse(
        (await app.inject({ method: 'GET', url: NOTES_API_V1.note(note.id) })).json(),
      ).folderId,
    ).toBeNull();
  });

  it('清空回收站只清 trashed 的', async () => {
    const { app } = await makeApp();
    const live = await createNote(app, { title: '活着' });
    const gone = await createNote(app, { title: '进站' });
    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [gone.id], action: { kind: 'trash' } },
    });

    const purged = await app.inject({ method: 'DELETE', url: NOTES_API_V1.trash });
    expect(batchResultSchema.parse(purged.json()).affected).toBe(1);

    expect((await app.inject({ method: 'GET', url: NOTES_API_V1.note(gone.id) })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'GET', url: NOTES_API_V1.note(live.id) })).statusCode).toBe(
      200,
    );
  });
});

describe('标签与统计', () => {
  it('标签带使用次数，回收站里的不计入', async () => {
    const { app } = await makeApp();
    await createNote(app, { tags: ['共有'] });
    const trashed = await createNote(app, { tags: ['共有', '独有'] });
    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [trashed.id], action: { kind: 'trash' } },
    });

    const response = await app.inject({ method: 'GET', url: NOTES_API_V1.tags });
    expect(tagsResponseSchema.parse(response.json()).tags).toEqual([{ name: '共有', count: 1 }]);
  });

  it('统计给出三种状态、文件夹数与标签数', async () => {
    const { app } = await makeApp();
    await createFolder(app, { name: '盒' });
    await createNote(app, { tags: ['甲'] });
    const archived = await createNote(app, {});
    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.batch,
      payload: { ids: [archived.id], action: { kind: 'archive' } },
    });

    const response = await app.inject({ method: 'GET', url: NOTES_API_V1.stats });
    expect(statsResponseSchema.parse(response.json())).toEqual({
      active: 1,
      archived: 1,
      trashed: 0,
      folders: 1,
      tags: 1,
    });
  });
});

describe('待办联动', () => {
  it('一键派发：新建的 Item 归 notes 所有，并带回链', async () => {
    const { app, items } = await makeApp();
    const note = await createNote(app, { title: '把设计写完' });

    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.createTodo(note.id),
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    const body = createTodoResponseSchema.parse(response.json());

    expect(body.link.title).toBe('把设计写完');
    // sourceModule 是 notes 而不是 todo：ctx.items.create 只接受调用方自己的
    // moduleId，冒充别的模块既做不到也不该做（铁律 1）。
    expect(body.link.sourceModule).toBe('notes');
    expect(body.note.todoLinks).toHaveLength(1);

    const item = await items.getById(body.link.todoItemId);
    expect(item?.notes).toContain(note.id);
  });

  it('没标题时退回用摘要当待办标题；两者都空则 400', async () => {
    const { app } = await makeApp();
    const withContent = await createNote(app, { content: '只有正文没有标题' });
    const dispatched = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.createTodo(withContent.id),
      payload: {},
    });
    expect(createTodoResponseSchema.parse(dispatched.json()).link.title).toBe('只有正文没有标题');

    const blank = await createNote(app, {});
    const rejected = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.createTodo(blank.id),
      payload: {},
    });
    expect(rejected.statusCode).toBe(400);
  });

  it('可以关联任何模块创建的 Item——链接指向 core，不指向 todo 模块', async () => {
    const { app, items } = await makeApp();
    const foreign = await items.create('campus-recruit', { kind: 'event', title: '笔试' });
    const note = await createNote(app, { title: '面经' });

    const linked = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.todoLinks(note.id),
      payload: { todoItemId: foreign.id },
    });
    expect(linked.statusCode).toBe(200);
    const { links } = todoLinksResponseSchema.parse(linked.json());
    expect(links[0]?.sourceModule).toBe('campus-recruit');
  });

  it('关联不存在的 Item 落成 404', async () => {
    const { app } = await makeApp();
    const note = await createNote(app, { title: '面经' });
    const response = await app.inject({
      method: 'POST',
      url: NOTES_API_V1.todoLinks(note.id),
      payload: { todoItemId: '查无此项' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('待办的标题是快照，源模块改了标题这边立刻跟着变', async () => {
    const { app, items } = await makeApp();
    const item = await items.create('todo', { kind: 'task', title: '旧标题' });
    const note = await createNote(app, { title: '便签' });
    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.todoLinks(note.id),
      payload: { todoItemId: item.id },
    });

    await items.update(item.id, { title: '新标题' });

    const response = await app.inject({ method: 'GET', url: NOTES_API_V1.todoLinks(note.id) });
    expect(todoLinksResponseSchema.parse(response.json()).links[0]?.title).toBe('新标题');
  });

  it('解除关联只删链接，Item 本身留着', async () => {
    const { app, items } = await makeApp();
    const item = await items.create('todo', { kind: 'task', title: '还要留着' });
    const note = await createNote(app, { title: '便签' });
    await app.inject({
      method: 'POST',
      url: NOTES_API_V1.todoLinks(note.id),
      payload: { todoItemId: item.id },
    });

    const removed = await app.inject({
      method: 'DELETE',
      url: NOTES_API_V1.todoLink(note.id, item.id),
    });
    expect(removed.statusCode).toBe(204);
    expect(await items.getById(item.id)).not.toBeNull();

    // 再删一次是 404：链接已经不在了
    const again = await app.inject({
      method: 'DELETE',
      url: NOTES_API_V1.todoLink(note.id, item.id),
    });
    expect(again.statusCode).toBe(404);
  });
});
