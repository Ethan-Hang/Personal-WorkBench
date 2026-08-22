import { randomUUID } from 'node:crypto';
import type { Item, ItemRepository } from '@workbench/core';
import {
  NOTES_PAGE_LIMIT_DEFAULT,
  UNFILED,
  type BatchAction,
  type CreateFolderInput,
  type CreateNoteInput,
  type CreateTodoInput,
  type FolderNode,
  type FolderView,
  type NoteStatus,
  type NoteView,
  type TodoLinkView,
  type UpdateFolderInput,
  type UpdateNoteInput,
} from '../contract.js';
import { conflict, invalid, notFound } from '@workbench/http-kit';
import { deriveExcerpt } from './excerpt.js';
import type {
  FolderRecord,
  ListNotesQuery,
  NoteRecord,
  NoteRepository,
  TodoLinkRecord,
} from './repository.js';

/**
 * 便签模块的编排层。
 *
 * 签名里的 `items` 是 core 的 `ItemRepository`——便签与 core 的唯一交点。
 * **便签自己不投影成 Item**：一条便签不是一件待办，把每条便签都塞进 items
 * 会让日历和今日页被笔记淹没。只有「一键派发」这个显式动作才创建 Item。
 */

function nowInstant(): string {
  return new Date().toISOString();
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // 库里存着坏 JSON 不该让整个列表 500——它只是一个编辑器偏好槽
    return {};
  }
}

function toFolderView(record: FolderRecord, noteCount: number): FolderView {
  return { ...record, noteCount };
}

/**
 * 把平表组装成树。**一次遍历，不递归查库**——文件夹是低基数数据，
 * 整棵读进内存再组装，比按层查快也简单得多。
 *
 * 孤儿节点（父节点已不在）会被提到顶级，而不是静默消失。
 */
function buildTree(records: FolderRecord[], counts: Map<string | null, number>): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const record of records) {
    nodes.set(record.id, { ...toFolderView(record, counts.get(record.id) ?? 0), children: [] });
  }

  const roots: FolderNode[] = [];
  for (const record of records) {
    const node = nodes.get(record.id) as FolderNode;
    const parent = record.parentId === null ? undefined : nodes.get(record.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: FolderNode[]): void => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    for (const child of list) sort(child.children);
  };
  sort(roots);
  return roots;
}

/** 某个文件夹自己 + 它的全部子孙。用于「看这个文件夹下的所有便签」。 */
function descendantsOf(records: FolderRecord[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const record of records) {
    if (record.parentId === null) continue;
    const bucket = childrenOf.get(record.parentId) ?? [];
    bucket.push(record.id);
    childrenOf.set(record.parentId, bucket);
  }

  const collected: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (collected.includes(current)) continue;
    collected.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return collected;
}

/** 从某个节点一路向上的祖先链（含自身）。移动文件夹时用它挡住成环。 */
function ancestorsOf(records: FolderRecord[], startId: string): string[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const chain: string[] = [];
  let cursor: string | null = startId;
  while (cursor !== null && !chain.includes(cursor)) {
    chain.push(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return chain;
}

async function requireFolder(repo: NoteRepository, id: string): Promise<FolderRecord> {
  const found = await repo.getFolder(id);
  if (!found) throw notFound('文件夹不存在');
  return found;
}

async function requireNote(repo: NoteRepository, id: string): Promise<NoteRecord> {
  const found = await repo.getNote(id);
  if (!found) throw notFound('便签不存在');
  return found;
}

// ---------------------------------------------------------------------------
// 文件夹
// ---------------------------------------------------------------------------

export async function listFolderTree(
  repo: NoteRepository,
): Promise<{ folders: FolderNode[]; unfiledCount: number }> {
  const [records, counts] = await Promise.all([repo.listFolders(), repo.countByFolder()]);
  return { folders: buildTree(records, counts), unfiledCount: counts.get(null) ?? 0 };
}

export async function createFolder(
  repo: NoteRepository,
  input: CreateFolderInput,
): Promise<FolderView> {
  const parentId = input.parentId ?? null;
  if (parentId !== null) await requireFolder(repo, parentId);

  const name = input.name.trim();
  const clash = await repo.findFolderByName(parentId, name);
  if (clash) throw conflict(`同一层级下已有文件夹「${name}」`);

  const created = await repo.createFolder({
    id: randomUUID(),
    name,
    parentId,
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.color === undefined ? {} : { color: input.color ?? null }),
    sortOrder: (await repo.maxFolderSortOrder(parentId)) + 1,
  });
  return toFolderView(created, 0);
}

export async function updateFolder(
  repo: NoteRepository,
  id: string,
  input: UpdateFolderInput,
): Promise<FolderView> {
  const current = await requireFolder(repo, id);
  const all = await repo.listFolders();

  if (input.parentId !== undefined) {
    const target = input.parentId ?? null;
    if (target === id) throw invalid('文件夹不能移动到自己下面');
    if (target !== null) {
      await requireFolder(repo, target);
      // 移到自己的子孙下会把这一支从树上整个切下来——之后它既不在根上，
      // 也不在任何可达路径上，界面里就此消失且不报错。
      if (ancestorsOf(all, target).includes(id)) {
        throw invalid('文件夹不能移动到自己的子文件夹下');
      }
    }
  }

  const nextParent = input.parentId === undefined ? current.parentId : (input.parentId ?? null);
  const nextName = input.name === undefined ? current.name : input.name.trim();
  if (nextName !== current.name || nextParent !== current.parentId) {
    const clash = await repo.findFolderByName(nextParent, nextName);
    if (clash && clash.id !== id) throw conflict(`同一层级下已有文件夹「${nextName}」`);
  }

  const updated = await repo.updateFolder(id, {
    ...(input.name === undefined ? {} : { name: nextName }),
    ...(input.parentId === undefined ? {} : { parentId: input.parentId ?? null }),
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.color === undefined ? {} : { color: input.color ?? null }),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
  });
  if (!updated) throw notFound('文件夹不存在');

  const counts = await repo.countByFolder();
  return toFolderView(updated, counts.get(id) ?? 0);
}

/**
 * 删除文件夹：**子文件夹与其中的便签上移到父文件夹，一条便签都不删。**
 *
 * 级联删除是另一种做法，但「点错一个文件夹丢掉两百条笔记」没有撤销路径——
 * 便签的回收站保护的是单条便签，保护不了这一下。想清空内容请先把便签移进回收站。
 */
export async function deleteFolder(repo: NoteRepository, id: string): Promise<void> {
  const current = await requireFolder(repo, id);
  const all = await repo.listFolders();

  const children = all.filter((folder) => folder.parentId === id).map((folder) => folder.id);
  await repo.reparentFolders(children, current.parentId);
  await repo.moveNotesToFolder([id], current.parentId);
  await repo.deleteFolder(id);
}

// ---------------------------------------------------------------------------
// 便签
// ---------------------------------------------------------------------------

/**
 * 把 core `Item` 的当下状态与链接拼成便签这一侧的视图。
 *
 * `title` / `status` 是**快照，每次读取现查**——链接表里只存 id，因此源模块
 * 改了标题这里立刻跟着变，不会出现「便签上写着旧标题」。
 * 查不到的 Item 直接跳过：外键 `ON DELETE CASCADE` 已经保证这种情况不该发生，
 * 真发生了也不该让整条便签读不出来。
 */
async function toLinkViews(
  items: ItemRepository,
  links: TodoLinkRecord[],
): Promise<TodoLinkView[]> {
  const resolved = await Promise.all(
    links.map(async (link) => {
      const item = await items.getById(link.todoItemId);
      return item === null ? null : { link, item };
    }),
  );

  return resolved
    .filter((entry): entry is { link: TodoLinkRecord; item: Item } => entry !== null)
    .map(({ link, item }) => ({
      todoItemId: item.id,
      title: item.title,
      status: item.status,
      dueAt: item.dueAt,
      sourceModule: item.sourceModule,
      linkedAt: link.createdAt,
    }));
}

async function toNoteView(
  items: ItemRepository,
  record: NoteRecord,
  links: TodoLinkRecord[],
): Promise<NoteView> {
  return {
    id: record.id,
    folderId: record.folderId,
    revision: record.revision,
    title: record.title,
    content: record.content,
    excerpt: record.excerpt,
    color: record.color,
    isPinned: record.isPinned,
    status: record.status,
    metadata: parseMetadata(record.metadata),
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    trashedAt: record.trashedAt,
    todoLinks: await toLinkViews(items, links),
  };
}

export interface ListNotesInput {
  status?: NoteStatus;
  folderId?: string;
  includeDescendants: boolean;
  tag?: string;
  keyword?: string;
  pinnedOnly: boolean;
  cursor?: string;
  limit: number;
}

export async function listNotes(
  repo: NoteRepository,
  items: ItemRepository,
  input: ListNotesInput,
): Promise<{ notes: NoteView[]; nextCursor: string | null }> {
  const query: ListNotesQuery = {
    // 不给 status 时默认只看 active：回收站与归档要显式索取，
    // 否则删掉的东西会自己回到主列表里。
    statuses: [input.status ?? 'active'],
    limit: input.limit || NOTES_PAGE_LIMIT_DEFAULT,
    ...(input.tag === undefined ? {} : { tag: input.tag }),
    ...(input.keyword === undefined ? {} : { keyword: input.keyword }),
    ...(input.pinnedOnly ? { pinnedOnly: true } : {}),
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  };

  if (input.folderId !== undefined) {
    if (input.folderId === UNFILED) {
      query.folderIds = [null];
    } else {
      await requireFolder(repo, input.folderId);
      query.folderIds = input.includeDescendants
        ? descendantsOf(await repo.listFolders(), input.folderId)
        : [input.folderId];
    }
  }

  const page = await repo.listNotes(query);
  const links = await repo.listTodoLinksFor(page.notes.map((note) => note.id));
  const notes = await Promise.all(
    page.notes.map((note) => toNoteView(items, note, links.get(note.id) ?? [])),
  );
  return { notes, nextCursor: page.nextCursor };
}

export async function getNote(
  repo: NoteRepository,
  items: ItemRepository,
  id: string,
): Promise<NoteView> {
  const record = await requireNote(repo, id);
  return toNoteView(items, record, await repo.listTodoLinks(id));
}

export async function createNote(
  repo: NoteRepository,
  items: ItemRepository,
  input: CreateNoteInput,
): Promise<NoteView> {
  const folderId = input.folderId ?? null;
  if (folderId !== null) await requireFolder(repo, folderId);

  const content = input.content ?? '';
  const created = await repo.createNote({
    id: randomUUID(),
    folderId,
    title: input.title?.trim() ?? '',
    content,
    excerpt: deriveExcerpt(content),
    color: input.color ?? 'yellow',
    isPinned: input.isPinned ?? false,
    metadata: JSON.stringify(input.metadata ?? {}),
    tags: (input.tags ?? []).map((tag) => tag.trim()),
  });
  return toNoteView(items, created, []);
}

export async function updateNote(
  repo: NoteRepository,
  items: ItemRepository,
  id: string,
  input: UpdateNoteInput,
): Promise<NoteView> {
  const current = await requireNote(repo, id);
  if (input.folderId !== undefined && input.folderId !== null) {
    await requireFolder(repo, input.folderId);
  }

  const updated = await repo.updateNote(
    id,
    {
      ...(input.title === undefined ? {} : { title: input.title.trim() }),
      // 摘要恒由正文派生，**没有单独设置它的入口**——两个字段各写各的，
      // 迟早会对不上，而卡片上显示的是摘要。
      ...(input.content === undefined
        ? {}
        : { content: input.content, excerpt: deriveExcerpt(input.content) }),
      ...(input.folderId === undefined ? {} : { folderId: input.folderId ?? null }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.isPinned === undefined ? {} : { isPinned: input.isPinned }),
      ...(input.metadata === undefined ? {} : { metadata: JSON.stringify(input.metadata) }),
      ...(input.tags === undefined ? {} : { tags: input.tags.map((tag) => tag.trim()) }),
    },
    input.revision ?? null,
  );

  if (!updated) {
    // 走到这里说明版本对不上（便签存在是上面刚确认过的）。把当下版本号报出去，
    // 界面才能给出「重新加载」而不是干巴巴地失败。
    throw conflict(`便签已被其他窗口修改（当前版本 ${current.revision}），请刷新后重试`);
  }
  return toNoteView(items, updated, await repo.listTodoLinks(id));
}

/** 彻底删除单条便签，不经回收站。回收站走 `batch` 的 `trash`。 */
export async function deleteNote(repo: NoteRepository, id: string): Promise<void> {
  await requireNote(repo, id);
  await repo.deleteNote(id);
}

// ---------------------------------------------------------------------------
// 批量管道
// ---------------------------------------------------------------------------

/**
 * 批量管道：一个动作作用在一批便签上。
 *
 * **单条失败不拖垮整批**——批量选中的便签里混进一条已被别处删掉的，
 * 它进 `skipped`，其余照做。整批回滚在这里没有意义：用户要的是「把这些都归档」，
 * 不是一个事务。
 */
export async function runBatch(
  repo: NoteRepository,
  ids: string[],
  action: BatchAction,
): Promise<{ affected: number; skipped: string[] }> {
  if (action.kind === 'move' && action.folderId !== null) {
    await requireFolder(repo, action.folderId);
  }

  const skipped: string[] = [];
  let affected = 0;

  for (const id of ids) {
    const existing = await repo.getNote(id);
    if (!existing) {
      skipped.push(id);
      continue;
    }

    if (action.kind === 'delete') {
      await repo.deleteNote(id);
      affected += 1;
      continue;
    }

    const changes = changesFor(action);
    // expectedRevision 传 null：批量操作改的都是元数据，不碰正文，
    // 拿版本号去卡它只会让「全选归档」在别人正好保存过一次时莫名失败。
    const updated = await repo.updateNote(id, changes, null);
    if (updated) affected += 1;
    else skipped.push(id);
  }

  return { affected, skipped };
}

/**
 * 动作 → 字段改动。**不要给这个 `switch` 加 `default` 分支**——
 * 没有 default，将来加一种批量动作时 TypeScript 会直接编译报错。
 */
function changesFor(
  action: Exclude<BatchAction, { kind: 'delete' }>,
): Parameters<NoteRepository['updateNote']>[1] {
  switch (action.kind) {
    case 'archive':
      return { status: 'archived', trashedAt: null };
    case 'unarchive':
      return { status: 'active', trashedAt: null };
    case 'trash':
      return { status: 'trashed', trashedAt: nowInstant() };
    case 'restore':
      // 从回收站出来一律回到 active，**不回到 archived**：进回收站前是不是
      // 归档状态没有记录，猜错的代价是笔记恢复后依然找不到。
      return { status: 'active', trashedAt: null };
    case 'move':
      return { folderId: action.folderId };
    case 'pin':
      return { isPinned: action.pinned };
    case 'color':
      return { color: action.color };
  }
}

/** 清空回收站。不可撤销，所以它是一条独立端点，不混在 batch 里。 */
export async function purgeTrash(
  repo: NoteRepository,
): Promise<{ affected: number; skipped: string[] }> {
  return { affected: await repo.purgeTrashed(), skipped: [] };
}

// ---------------------------------------------------------------------------
// 标签与统计
// ---------------------------------------------------------------------------

export async function listTags(
  repo: NoteRepository,
): Promise<{ tags: { name: string; count: number }[] }> {
  return { tags: await repo.listTags() };
}

export async function getStats(repo: NoteRepository): Promise<{
  active: number;
  archived: number;
  trashed: number;
  folders: number;
  tags: number;
}> {
  const [counts, folders, tags] = await Promise.all([
    repo.countByStatus(),
    repo.listFolders(),
    repo.listTags(),
  ]);
  return { ...counts, folders: folders.length, tags: tags.length };
}

// ---------------------------------------------------------------------------
// 待办联动
// ---------------------------------------------------------------------------

export async function listTodoLinks(
  repo: NoteRepository,
  items: ItemRepository,
  noteId: string,
): Promise<{ links: TodoLinkView[] }> {
  await requireNote(repo, noteId);
  return { links: await toLinkViews(items, await repo.listTodoLinks(noteId)) };
}

/**
 * 关联一条**已经存在**的待办。
 *
 * 它可以来自任何模块——链接指向 core 的 `Item`，便签不知道 todo 模块存在
 * （铁律 1）。所以这里只校验「这条 Item 在不在」，不校验它归谁。
 */
export async function linkTodo(
  repo: NoteRepository,
  items: ItemRepository,
  noteId: string,
  todoItemId: string,
): Promise<{ links: TodoLinkView[] }> {
  await requireNote(repo, noteId);
  const item = await items.getById(todoItemId);
  if (!item) throw notFound('待办不存在');

  await repo.linkTodo(randomUUID(), noteId, todoItemId);
  return { links: await toLinkViews(items, await repo.listTodoLinks(noteId)) };
}

/** 只解链接，**不动 Item 本身**——待办的生死属于创建它的模块。 */
export async function unlinkTodo(
  repo: NoteRepository,
  noteId: string,
  todoItemId: string,
): Promise<void> {
  await requireNote(repo, noteId);
  const removed = await repo.unlinkTodo(noteId, todoItemId);
  if (!removed) throw notFound('关联不存在');
}

/**
 * 一键把便签派发成待办。
 *
 * **新建的 Item 的 `sourceModule` 是 `notes`，不是 `todo`。** `ctx.items.create`
 * 只接受调用方自己的 moduleId，冒充别的模块既做不到也不该做（铁律 1）。
 * 后果是明确的：它会出现在工作台今日页与日历（那两处本就跨模块聚合），
 * 但 todo 模块的编辑 / 子任务 / 标签不认它——那些写操作只认
 * `sourceModule === 'todo'`。想让两边共用一套写操作，正确的机制是 core 的
 * `itemActions` 能力槽（`docs/superpowers/specs/2026-08-18-item-actions-registry-design.md`），
 * 不是在这里伪造来源。
 */
export async function createTodoFromNote(
  repo: NoteRepository,
  items: ItemRepository,
  moduleId: string,
  noteId: string,
  input: CreateTodoInput,
): Promise<{ link: TodoLinkView; note: NoteView }> {
  const note = await requireNote(repo, noteId);

  const title = input.title?.trim() || note.title.trim() || note.excerpt.trim();
  if (!title) throw invalid('便签既没有标题也没有正文，无法派发成待办');

  const item = await items.create(moduleId, {
    kind: 'task',
    title,
    // 回链写进 notes：打开待办时能顺着找回这条便签，而不必反查链接表
    notes: `来自便签 ${noteId}`,
    importance: input.importance ?? 'normal',
    ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt ?? null }),
  });

  await repo.linkTodo(randomUUID(), noteId, item.id);
  const links = await repo.listTodoLinks(noteId);
  const views = await toLinkViews(items, links);
  const link = views.find((view) => view.todoItemId === item.id) as TodoLinkView;

  return { link, note: await toNoteView(items, note, links) };
}
