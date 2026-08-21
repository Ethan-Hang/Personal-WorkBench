import type { NoteColor, NoteStatus } from '../contract.js';

/** 一个文件夹在存储中的形态。树的组装在 service 层完成，存储层只吐平表。 */
export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  icon: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderDraft {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  color?: string | null;
  sortOrder: number;
}

export type FolderChanges = Partial<Omit<FolderRecord, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * 一条便签在存储中的形态。
 *
 * `tags` 在这一层已经是 `string[]`——「标签存在另一张表」是 SQLite 的实现细节，
 * 不该泄漏到 service 与 UI（与 habit 把 weekdays 的 CSV 挡在存储层是同一条道理）。
 */
export interface NoteRecord {
  id: string;
  folderId: string | null;
  revision: number;
  title: string;
  content: string;
  excerpt: string;
  color: NoteColor;
  isPinned: boolean;
  status: NoteStatus;
  metadata: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface NoteDraft {
  id: string;
  folderId: string | null;
  title: string;
  content: string;
  excerpt: string;
  color: NoteColor;
  isPinned: boolean;
  metadata: string;
  tags: string[];
}

/**
 * 一次更新想改的字段。**`revision` 不在其中**——它由存储层自增，
 * 调用方能提出的只有「我读到的是第几版」（见 `updateNote` 的 `expectedRevision`）。
 */
export interface NoteChanges {
  folderId?: string | null;
  title?: string;
  content?: string;
  excerpt?: string;
  color?: NoteColor;
  isPinned?: boolean;
  status?: NoteStatus;
  metadata?: string;
  trashedAt?: string | null;
  tags?: string[];
}

/**
 * 列表查询条件。各条件之间取**交集**。
 *
 * `folderIds` 而不是单个 `folderId`：「看某文件夹及其所有子孙」是主列表的默认
 * 行为，而子孙集合只有 service 知道（它手上有整棵树）。存储层不递归。
 */
export interface ListNotesQuery {
  statuses?: NoteStatus[];
  /** null 元素表示「未分类」。空数组表示不施加文件夹过滤 */
  folderIds?: (string | null)[];
  tag?: string;
  /** 标题 / 正文的子串匹配，大小写不敏感 */
  keyword?: string;
  pinnedOnly?: boolean;
  /** 上一页最后一条的游标；不传则从头开始 */
  cursor?: string | null;
  limit: number;
}

/**
 * 一页结果。`nextCursor` 为 null 表示已到末页——**不返回总数**：
 * 每翻一页都做一次 `COUNT(*)` 全表扫描，只为在角落里显示一个没人用的数字。
 */
export interface NotePage {
  notes: NoteRecord[];
  nextCursor: string | null;
}

/** 一条便签 ↔ 待办的关联。 */
export interface TodoLinkRecord {
  id: string;
  noteId: string;
  todoItemId: string;
  createdAt: string;
}

/** 标签及其被使用的次数（只统计未进回收站的便签）。 */
export interface TagUsage {
  name: string;
  count: number;
}

/**
 * 便签模块自有的仓储接口，由模块拥有、由 storage 目录提供 SQLite 适配器（ADR-0008）。
 *
 * 这里**没有 core Item 的影子**：便签不投影成 Item。与 core 的唯一交点是
 * `notes_todo_links.todo_item_id`，而那条链接由 service 用 `ctx.items` 创建，
 * 存储层只负责把 id 记下来。
 */
export interface NoteRepository {
  // ---- 文件夹 ----
  /** 整棵树的平表，按 (parentId, sortOrder, id) 排序。树的组装在 service */
  listFolders(): Promise<FolderRecord[]>;
  getFolder(id: string): Promise<FolderRecord | null>;
  findFolderByName(parentId: string | null, name: string): Promise<FolderRecord | null>;
  createFolder(draft: FolderDraft): Promise<FolderRecord>;
  updateFolder(id: string, changes: FolderChanges): Promise<FolderRecord | null>;
  /** 只删这一行；子文件夹与便签的去向由 service 决定 */
  deleteFolder(id: string): Promise<boolean>;
  /** 把一批文件夹改挂到新父节点下（删除文件夹时子项上移用） */
  reparentFolders(ids: string[], parentId: string | null): Promise<void>;
  /** 把一批便签改挂到新文件夹下 */
  moveNotesToFolder(folderIds: (string | null)[], target: string | null): Promise<number>;
  maxFolderSortOrder(parentId: string | null): Promise<number>;

  // ---- 便签 ----
  listNotes(query: ListNotesQuery): Promise<NotePage>;
  getNote(id: string): Promise<NoteRecord | null>;
  createNote(draft: NoteDraft): Promise<NoteRecord>;
  /**
   * 乐观锁更新。`expectedRevision` 为 null 时不做版本校验（用于归档、置顶这类
   * 不涉及正文的元数据操作）。
   *
   * 返回 null 有两种可能：便签不存在，或版本对不上。**区分这两者是 service 的
   * 事**（它可以再 `getNote` 一次），存储层不替它猜。
   */
  updateNote(
    id: string,
    changes: NoteChanges,
    expectedRevision: number | null,
  ): Promise<NoteRecord | null>;
  /** 彻底删除，连带标签与待办链接 */
  deleteNote(id: string): Promise<boolean>;
  /** 清空回收站，返回被删条数 */
  purgeTrashed(): Promise<number>;
  /** 按状态计数，用于统计接口 */
  countByStatus(): Promise<Record<NoteStatus, number>>;
  /** 每个文件夹下的便签数（不含子孙，且只数未进回收站的） */
  countByFolder(): Promise<Map<string | null, number>>;

  // ---- 标签 ----
  listTags(): Promise<TagUsage[]>;

  // ---- 待办联动 ----
  listTodoLinks(noteId: string): Promise<TodoLinkRecord[]>;
  /** 一次查完多条便签的链接，避免卡片流 N+1 */
  listTodoLinksFor(noteIds: string[]): Promise<Map<string, TodoLinkRecord[]>>;
  /** 按 (noteId, todoItemId) 幂等：重复关联同一条待办不会造出第二行 */
  linkTodo(id: string, noteId: string, todoItemId: string): Promise<TodoLinkRecord>;
  unlinkTodo(noteId: string, todoItemId: string): Promise<boolean>;
}
