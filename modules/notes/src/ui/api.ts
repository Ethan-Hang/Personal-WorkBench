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
  type BatchInput,
  type CreateFolderInput,
  type CreateNoteInput,
  type CreateTodoInput,
  type FolderView,
  type LinkTodoInput,
  type NoteStatus,
  type NoteView,
  type UpdateFolderInput,
  type UpdateNoteInput,
} from '../contract.js';
import { apiRequest as request } from '@workbench/ui';
import type { z } from 'zod';

export type {
  BatchAction,
  BatchInput,
  CreateFolderInput,
  CreateNoteInput,
  CreateTodoInput,
  FolderNode,
  FolderView,
  LinkTodoInput,
  NoteColor,
  NoteStatus,
  NoteView,
  TodoLinkView,
  UpdateFolderInput,
  UpdateNoteInput,
} from '../contract.js';

export {
  BATCH_MAX_IDS,
  EXCERPT_LENGTH,
  FOLDER_NAME_MAX,
  NOTES_MODULE_ID,
  NOTES_PAGE_LIMIT_DEFAULT,
  NOTES_PAGE_LIMIT_MAX,
  NOTE_COLORS,
  NOTE_STATUSES,
  NOTE_TITLE_MAX,
  TAG_NAME_MAX,
  UNFILED,
} from '../contract.js';

export type FolderTreeResponse = z.infer<typeof folderTreeResponseSchema>;
export type NotesPageResponse = z.infer<typeof notesPageResponseSchema>;
export type BatchResult = z.infer<typeof batchResultSchema>;
export type TagsResponse = z.infer<typeof tagsResponseSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type TodoLinksResponse = z.infer<typeof todoLinksResponseSchema>;
export type CreateTodoResponse = z.infer<typeof createTodoResponseSchema>;

export interface ListNotesOptions {
  status?: NoteStatus;
  /** 文件夹 id；`unfiled` 是保留字，表示「未分类」 */
  folderId?: string;
  /** 为 true 时把该文件夹的所有子孙也算进来 */
  includeDescendants?: boolean;
  tag?: string;
  keyword?: string;
  pinnedOnly?: boolean;
  cursor?: string;
  limit?: number;
}

/**
 * 获取便签分页列表（支持状态、文件夹、子孙穿透、标签、搜索、置顶过滤）。
 */
export async function fetchNotes(options?: ListNotesOptions): Promise<NotesPageResponse> {
  const params = new URLSearchParams();
  if (options?.status !== undefined) params.set('status', options.status);
  if (options?.folderId !== undefined) params.set('folderId', options.folderId);
  if (options?.includeDescendants !== undefined)
    params.set('includeDescendants', String(options.includeDescendants));
  if (options?.tag !== undefined) params.set('tag', options.tag);
  if (options?.keyword !== undefined) params.set('keyword', options.keyword);
  if (options?.pinnedOnly !== undefined) params.set('pinnedOnly', String(options.pinnedOnly));
  if (options?.cursor !== undefined) params.set('cursor', options.cursor);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));

  const qs = params.toString();
  const url = qs ? `${NOTES_API_V1.notes}?${qs}` : NOTES_API_V1.notes;
  return notesPageResponseSchema.parse(await request(url));
}

/**
 * 获取单条便签详情（包含关联待办列表快照）。
 */
export async function fetchNote(id: string): Promise<NoteView> {
  return noteViewSchema.parse(await request(NOTES_API_V1.note(id)));
}

/**
 * 创建新便签。
 */
export async function postNote(input: CreateNoteInput = {}): Promise<NoteView> {
  return noteViewSchema.parse(
    await request(NOTES_API_V1.notes, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 更新便签信息（修改正文必须带 revision 乐观锁版本号）。
 */
export async function patchNote(id: string, input: UpdateNoteInput): Promise<NoteView> {
  return noteViewSchema.parse(
    await request(NOTES_API_V1.note(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 彻底删除单条便签（不可撤销）。
 */
export async function deleteNote(id: string): Promise<void> {
  await request(NOTES_API_V1.note(id), { method: 'DELETE' });
}

/**
 * 获取多级文件夹树及未分类便签计数。
 */
export async function fetchFolders(): Promise<FolderTreeResponse> {
  return folderTreeResponseSchema.parse(await request(NOTES_API_V1.folders));
}

/**
 * 创建新文件夹。
 */
export async function postFolder(input: CreateFolderInput): Promise<FolderView> {
  return folderViewSchema.parse(
    await request(NOTES_API_V1.folders, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 更新文件夹信息（改名、调序、修改父级目录等）。
 */
export async function patchFolder(id: string, input: UpdateFolderInput): Promise<FolderView> {
  return folderViewSchema.parse(
    await request(NOTES_API_V1.folder(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 删除文件夹（子项与子文件夹自动提升至父级，不级联删除便签）。
 */
export async function deleteFolder(id: string): Promise<void> {
  await request(NOTES_API_V1.folder(id), { method: 'DELETE' });
}

/**
 * 批量操作管道（归档/恢复/移入回收站/彻底删除/移动文件夹/置顶/变色）。
 */
export async function postBatch(input: BatchInput): Promise<BatchResult> {
  return batchResultSchema.parse(
    await request(NOTES_API_V1.batch, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 清空回收站（无 body 的 DELETE 操作，不可撤销）。
 */
export async function deleteTrash(): Promise<BatchResult> {
  return batchResultSchema.parse(await request(NOTES_API_V1.trash, { method: 'DELETE' }));
}

/**
 * 获取全量标签及其引用频次统计。
 */
export async function fetchTags(): Promise<TagsResponse> {
  return tagsResponseSchema.parse(await request(NOTES_API_V1.tags));
}

/**
 * 获取便签模块聚合统计（活跃数、归档数、回收站数、文件夹数、标签数）。
 */
export async function fetchStats(): Promise<StatsResponse> {
  return statsResponseSchema.parse(await request(NOTES_API_V1.stats));
}

/**
 * 获取便签当前关联的待办项列表。
 */
export async function fetchTodoLinks(noteId: string): Promise<TodoLinksResponse> {
  return todoLinksResponseSchema.parse(await request(NOTES_API_V1.todoLinks(noteId)));
}

/**
 * 手动关联已有待办项至便签。
 */
export async function postLinkTodo(
  noteId: string,
  input: LinkTodoInput,
): Promise<TodoLinksResponse> {
  return todoLinksResponseSchema.parse(
    await request(NOTES_API_V1.todoLinks(noteId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 解除便签与某待办项的关联。
 */
export async function deleteTodoLink(noteId: string, todoId: string): Promise<void> {
  await request(NOTES_API_V1.todoLink(noteId, todoId), { method: 'DELETE' });
}

/**
 * 一键将便签派发为待办事项并建立双向回链。
 *
 * 支持无 body 调用（此时默认使用便签标题/摘要作为待办标题）。
 */
export async function postCreateTodo(
  noteId: string,
  input?: CreateTodoInput,
): Promise<CreateTodoResponse> {
  return createTodoResponseSchema.parse(
    await request(NOTES_API_V1.createTodo(noteId), {
      method: 'POST',
      body: input !== undefined ? JSON.stringify(input) : undefined,
    }),
  );
}
