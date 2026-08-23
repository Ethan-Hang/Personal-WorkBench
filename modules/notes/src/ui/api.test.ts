import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFolder,
  deleteNote,
  deleteTodoLink,
  deleteTrash,
  fetchFolders,
  fetchNote,
  fetchNotes,
  fetchStats,
  fetchTags,
  fetchTodoLinks,
  patchFolder,
  patchNote,
  postBatch,
  postCreateTodo,
  postFolder,
  postLinkTodo,
  postNote,
} from './api.js';

type CapturedCall = { url: string; init: RequestInit | undefined };

const NOTE_VIEW = {
  id: 'note-1',
  folderId: null,
  revision: 1,
  title: '测试便签',
  content: '# Hello\nWorld',
  excerpt: 'Hello World',
  color: 'yellow' as const,
  isPinned: false,
  status: 'active' as const,
  metadata: {},
  tags: ['工作', '规划'],
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  trashedAt: null,
  todoLinks: [],
};

const FOLDER_VIEW = {
  id: 'folder-1',
  name: '工作',
  parentId: null,
  icon: '📁',
  color: null,
  sortOrder: 0,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  noteCount: 3,
};

const TODO_LINK_VIEW = {
  todoItemId: 'todo-1',
  title: '关联的待办',
  status: 'pending',
  dueAt: '2026-08-21T12:00:00.000Z',
  sourceModule: 'notes',
  linkedAt: '2026-08-21T00:00:00.000Z',
};

let calls: CapturedCall[];
let responses: Array<Response | { ok: boolean; status: number; json: () => Promise<unknown> }>;
let originalFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

beforeEach(() => {
  calls = [];
  responses = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(responses.shift() ?? jsonResponse(NOTE_VIEW));
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('request 的 Content-Type 处理与 415 守卫', () => {
  it('无 body 的 POST（如 postCreateTodo 未传 input）不得声明 JSON content-type', async () => {
    responses.push(
      jsonResponse({
        link: TODO_LINK_VIEW,
        note: NOTE_VIEW,
      }),
    );

    await postCreateTodo('note-1');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/v1/notes/note-1/create-todo');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();
  });

  it('无 body 的 DELETE（如 deleteTrash / deleteNote / deleteFolder / deleteTodoLink）不得声明 JSON content-type', async () => {
    responses.push(
      jsonResponse({ affected: 2, skipped: [] }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );

    await deleteTrash();
    await deleteNote('note-1');
    await deleteFolder('folder-1');
    await deleteTodoLink('note-1', 'todo-1');

    expect(calls).toHaveLength(4);
    expect(calls[0]!.url).toBe('/api/v1/notes/trash');
    expect(calls[0]!.init?.method).toBe('DELETE');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBeNull();

    expect(headerOf(calls[1]!.init, 'Content-Type')).toBeNull();
    expect(headerOf(calls[2]!.init, 'Content-Type')).toBeNull();
    expect(headerOf(calls[3]!.init, 'Content-Type')).toBeNull();
  });

  it('无 body 的 GET 请求（fetchNotes / fetchNote / fetchFolders / fetchTags / fetchStats / fetchTodoLinks）不得声明 JSON content-type', async () => {
    responses.push(
      jsonResponse({ notes: [NOTE_VIEW], nextCursor: null }),
      jsonResponse(NOTE_VIEW),
      jsonResponse({ folders: [{ ...FOLDER_VIEW, children: [] }], unfiledCount: 0 }),
      jsonResponse({ tags: [{ name: '工作', count: 1 }] }),
      jsonResponse({ active: 1, archived: 0, trashed: 0, folders: 1, tags: 1 }),
      jsonResponse({ links: [TODO_LINK_VIEW] }),
    );

    await fetchNotes();
    await fetchNote('note-1');
    await fetchFolders();
    await fetchTags();
    await fetchStats();
    await fetchTodoLinks('note-1');

    expect(calls).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(headerOf(calls[i]!.init, 'Content-Type')).toBeNull();
    }
  });

  it('有 body 的 POST / PATCH 请求必须声明 JSON content-type 并序列化 body', async () => {
    responses.push(
      jsonResponse(NOTE_VIEW),
      jsonResponse(NOTE_VIEW),
      jsonResponse(FOLDER_VIEW),
      jsonResponse(FOLDER_VIEW),
      jsonResponse({ affected: 1, skipped: [] }),
      jsonResponse({ links: [TODO_LINK_VIEW] }),
      jsonResponse({ link: TODO_LINK_VIEW, note: NOTE_VIEW }),
    );

    const noteInput = { title: '新便签', content: '内容' };
    await postNote(noteInput);

    const patchNoteInput = { title: '改标题', revision: 1 };
    await patchNote('note-1', patchNoteInput);

    const folderInput = { name: '新文件夹' };
    await postFolder(folderInput);

    const patchFolderInput = { name: '改文件夹名' };
    await patchFolder('folder-1', patchFolderInput);

    const batchInput = { ids: ['note-1'], action: { kind: 'archive' as const } };
    await postBatch(batchInput);

    const linkInput = { todoItemId: 'todo-1' };
    await postLinkTodo('note-1', linkInput);

    const createTodoInput = { title: '自定待办标题', importance: 'high' as const };
    await postCreateTodo('note-1', createTodoInput);

    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toBe(JSON.stringify(noteInput));
    expect(headerOf(calls[0]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[1]!.init?.method).toBe('PATCH');
    expect(calls[1]!.init?.body).toBe(JSON.stringify(patchNoteInput));
    expect(headerOf(calls[1]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[2]!.init?.method).toBe('POST');
    expect(calls[2]!.init?.body).toBe(JSON.stringify(folderInput));
    expect(headerOf(calls[2]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[3]!.init?.method).toBe('PATCH');
    expect(calls[3]!.init?.body).toBe(JSON.stringify(patchFolderInput));
    expect(headerOf(calls[3]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[4]!.init?.method).toBe('POST');
    expect(calls[4]!.init?.body).toBe(JSON.stringify(batchInput));
    expect(headerOf(calls[4]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[5]!.init?.method).toBe('POST');
    expect(calls[5]!.init?.body).toBe(JSON.stringify(linkInput));
    expect(headerOf(calls[5]!.init, 'Content-Type')).toBe('application/json');

    expect(calls[6]!.init?.method).toBe('POST');
    expect(calls[6]!.init?.body).toBe(JSON.stringify(createTodoInput));
    expect(headerOf(calls[6]!.init, 'Content-Type')).toBe('application/json');
  });
});

describe('便签前端传输层各个端点调用与参数编码', () => {
  it('fetchNotes: 无参数与全套查询参数均能正确构造 query string', async () => {
    responses.push(
      jsonResponse({ notes: [NOTE_VIEW], nextCursor: null }),
      jsonResponse({ notes: [NOTE_VIEW], nextCursor: 'cur-123' }),
    );

    const r1 = await fetchNotes();
    expect(calls[0]!.url).toBe('/api/v1/notes');
    expect(r1.notes).toHaveLength(1);

    const r2 = await fetchNotes({
      status: 'active',
      folderId: 'folder/1',
      includeDescendants: true,
      tag: '工作',
      keyword: '周报',
      pinnedOnly: true,
      cursor: 'cur-abc',
      limit: 50,
    });

    const searchParams = new URLSearchParams(calls[1]!.url.split('?')[1]);
    expect(searchParams.get('status')).toBe('active');
    expect(searchParams.get('folderId')).toBe('folder/1');
    expect(searchParams.get('includeDescendants')).toBe('true');
    expect(searchParams.get('tag')).toBe('工作');
    expect(searchParams.get('keyword')).toBe('周报');
    expect(searchParams.get('pinnedOnly')).toBe('true');
    expect(searchParams.get('cursor')).toBe('cur-abc');
    expect(searchParams.get('limit')).toBe('50');
    expect(r2.nextCursor).toBe('cur-123');
  });

  it('fetchNote / patchNote / deleteNote: 正确转义 URL 路径中的特殊字符', async () => {
    responses.push(
      jsonResponse(NOTE_VIEW),
      jsonResponse(NOTE_VIEW),
      new Response(null, { status: 204 }),
    );

    await fetchNote('a/b+c');
    await patchNote('a/b+c', { title: '新标题' });
    await deleteNote('a/b+c');

    expect(calls[0]!.url).toBe('/api/v1/notes/a%2Fb%2Bc');
    expect(calls[1]!.url).toBe('/api/v1/notes/a%2Fb%2Bc');
    expect(calls[2]!.url).toBe('/api/v1/notes/a%2Fb%2Bc');
    expect(calls[2]!.init?.method).toBe('DELETE');
  });

  it('fetchFolders / patchFolder / deleteFolder: 正确转义文件夹路径与参数', async () => {
    responses.push(
      jsonResponse({ folders: [{ ...FOLDER_VIEW, children: [] }], unfiledCount: 2 }),
      jsonResponse(FOLDER_VIEW),
      new Response(null, { status: 204 }),
    );

    const tree = await fetchFolders();
    expect(calls[0]!.url).toBe('/api/v1/notes/folders');
    expect(tree.unfiledCount).toBe(2);

    await patchFolder('f/1', { name: '新名' });
    expect(calls[1]!.url).toBe('/api/v1/notes/folders/f%2F1');

    await deleteFolder('f/1');
    expect(calls[2]!.url).toBe('/api/v1/notes/folders/f%2F1');
  });

  it('postBatch 与 deleteTrash: 批量与回收站管道返回 BatchResult', async () => {
    responses.push(
      jsonResponse({ affected: 3, skipped: ['absent-1'] }),
      jsonResponse({ affected: 5, skipped: [] }),
    );

    const batchRes = await postBatch({
      ids: ['n1', 'n2'],
      action: { kind: 'trash' },
    });
    expect(calls[0]!.url).toBe('/api/v1/notes/batch');
    expect(batchRes).toEqual({ affected: 3, skipped: ['absent-1'] });

    const trashRes = await deleteTrash();
    expect(calls[1]!.url).toBe('/api/v1/notes/trash');
    expect(trashRes).toEqual({ affected: 5, skipped: [] });
  });

  it('fetchTags 与 fetchStats: 正确解析聚合响应', async () => {
    responses.push(
      jsonResponse({ tags: [{ name: '灵感', count: 4 }] }),
      jsonResponse({ active: 10, archived: 2, trashed: 1, folders: 3, tags: 5 }),
    );

    const tags = await fetchTags();
    expect(calls[0]!.url).toBe('/api/v1/notes/tags');
    expect(tags.tags[0]).toEqual({ name: '灵感', count: 4 });

    const stats = await fetchStats();
    expect(calls[1]!.url).toBe('/api/v1/notes/stats');
    expect(stats.active).toBe(10);
    expect(stats.folders).toBe(3);
  });

  it('待办联动端点: 正确构造路径与转义', async () => {
    responses.push(
      jsonResponse({ links: [TODO_LINK_VIEW] }),
      jsonResponse({ links: [TODO_LINK_VIEW] }),
      new Response(null, { status: 204 }),
      jsonResponse({ link: TODO_LINK_VIEW, note: NOTE_VIEW }),
    );

    await fetchTodoLinks('note/1');
    expect(calls[0]!.url).toBe('/api/v1/notes/note%2F1/todos');

    await postLinkTodo('note/1', { todoItemId: 'todo-1' });
    expect(calls[1]!.url).toBe('/api/v1/notes/note%2F1/todos');

    await deleteTodoLink('note/1', 'todo/2');
    expect(calls[2]!.url).toBe('/api/v1/notes/note%2F1/todos/todo%2F2');
    expect(calls[2]!.init?.method).toBe('DELETE');

    await postCreateTodo('note/1', { title: '新待办' });
    expect(calls[3]!.url).toBe('/api/v1/notes/note%2F1/create-todo');
  });

  it('204 响应不尝试解析 JSON 响应体', async () => {
    const json = vi.fn<() => Promise<unknown>>();
    responses.push({ ok: true, status: 204, json });

    await expect(deleteNote('n1')).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('响应体结构不合法时由 Zod 校验拦截报错', async () => {
    responses.push(jsonResponse({ id: 'n1' })); // 缺少 revision / title / content 等众多必填字段

    await expect(fetchNote('n1')).rejects.toThrow();
  });
});

describe('错误处理与请求编号', () => {
  it('服务端返回 409 乐观锁冲突或业务错误时透出错误提示', async () => {
    responses.push(jsonResponse({ error: '便签正文已被修改（版本冲突），请重新载入' }, 409));

    await expect(patchNote('n1', { content: '新正文', revision: 1 })).rejects.toThrow(
      '便签正文已被修改（版本冲突），请重新载入',
    );
  });

  it('服务端附带请求编号时，在错误提示中拼接编号', async () => {
    responses.push(jsonResponse({ error: '服务内部异常', requestId: 'req-note-456' }, 500));

    await expect(fetchNote('n1')).rejects.toThrow('服务内部异常（编号 req-note-456）');
  });

  it('服务端未附带请求编号时，不凭空生成编号后缀', async () => {
    responses.push(jsonResponse({ error: '文件夹名称不能为空' }, 400));

    await expect(postFolder({ name: '' })).rejects.toThrow('文件夹名称不能为空');
    await expect(postFolder({ name: '' })).rejects.not.toThrow('编号');
  });
});
