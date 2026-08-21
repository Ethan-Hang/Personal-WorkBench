import { z } from 'zod';

/**
 * 便签模块的前后端接缝。**服务端与客户端共用这一份**——端点路径与请求/响应形状
 * 都只在这里定义，因此不可能各改一半（spec §7）。
 *
 * 由此得出一条对协作重要的性质：**写前端只需要读本文件，不需要读 `src/server/`。**
 */

export const NOTES_MODULE_ID = 'notes';

/**
 * 便签的三种生命状态。
 *
 * - `active`：正常可见
 * - `archived`：归档，退出主列表但不进回收站
 * - `trashed`：在回收站中，`trashedAt` 记录进站时刻
 *
 * **刻意不借用 core 的 `cancelled`。** todo 的回收站借了那个枚举值，代价是
 * `cancelled` 的含义变成依模块而定（ADR-0009 明确写着「这不是可以照抄的模式」）。
 * 便签有自己的主表，状态就存在自己的列里，core 一个字都不用知道。
 */
export const NOTE_STATUSES = ['active', 'archived', 'trashed'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

/**
 * 便签主题色。存的是**语义色名**而不是十六进制——具体颜色由主题层决定，
 * 深浅色主题各自解释（与 habit 的 `colorToken` 同一条约定）。
 */
export const NOTE_COLORS = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

/** 摘要长度：正文去掉 Markdown 标记后的前 120 个字符。 */
export const EXCERPT_LENGTH = 120;

export const NOTE_TITLE_MAX = 200;
export const FOLDER_NAME_MAX = 60;
export const TAG_NAME_MAX = 32;

/** 单页上限与默认值。上限存在的意义是挡住 `?limit=100000` 那一下。 */
export const NOTES_PAGE_LIMIT_MAX = 100;
export const NOTES_PAGE_LIMIT_DEFAULT = 30;

/** 批量管道单次可处理的便签数上限。 */
export const BATCH_MAX_IDS = 200;

/** **UTC 时刻**，三位毫秒 + `Z`。便签里所有时间都是时刻，没有浮动日期。 */
const instantSchema = z.string().datetime({ precision: 3 });

const idSchema = z.string().min(1).max(64);
const tagNameSchema = z.string().trim().min(1).max(TAG_NAME_MAX);

/** `metadata` 只放编辑器偏好；它必须是一个 JSON 对象，不是任意字符串。 */
const metadataSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// 文件夹
// ---------------------------------------------------------------------------

export const folderViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  icon: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  /** 直接挂在本文件夹下的便签数，**不含子孙**，且不数回收站里的 */
  noteCount: z.number().int(),
});
export type FolderView = z.infer<typeof folderViewSchema>;

/**
 * 树节点。**无限级**，所以类型要递归——Zod 的递归 schema 需要显式标注返回类型。
 */
export type FolderNode = FolderView & { children: FolderNode[] };
export const folderNodeSchema: z.ZodType<FolderNode> = folderViewSchema.extend({
  children: z.lazy(() => z.array(folderNodeSchema)),
});

export const folderTreeResponseSchema = z.object({
  folders: z.array(folderNodeSchema),
  /** 未分类便签数。它不属于任何文件夹，所以只能单独给 */
  unfiledCount: z.number().int(),
});

export const createFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(FOLDER_NAME_MAX),
  parentId: idSchema.nullish(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: z.string().trim().max(24).nullish(),
});
export type CreateFolderInput = z.input<typeof createFolderInputSchema>;

export const updateFolderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(FOLDER_NAME_MAX).optional(),
    /** 传 null 表示移到顶级；不传表示不动 */
    parentId: idSchema.nullish(),
    icon: z.string().trim().min(1).max(8).optional(),
    color: z.string().trim().max(24).nullish(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少要改一个字段');
export type UpdateFolderInput = z.infer<typeof updateFolderInputSchema>;

// ---------------------------------------------------------------------------
// 便签
// ---------------------------------------------------------------------------

/**
 * 关联待办在便签这一侧的形态。
 *
 * **`title` / `status` 是 core `Item` 的快照，不是便签自己的数据**——每次读取
 * 都现查，因此不会与源模块的改动脱节。
 */
export const todoLinkViewSchema = z.object({
  todoItemId: z.string(),
  title: z.string(),
  status: z.string(),
  dueAt: instantSchema.nullable(),
  /** 创建它的模块。便签一键派发出的待办，这里是 `notes` */
  sourceModule: z.string(),
  linkedAt: instantSchema,
});
export type TodoLinkView = z.infer<typeof todoLinkViewSchema>;

export const noteViewSchema = z.object({
  id: z.string(),
  folderId: z.string().nullable(),
  /** 乐观锁版本。改正文时原样带回来，服务端据此拒绝覆盖别人的写入 */
  revision: z.number().int(),
  title: z.string(),
  content: z.string(),
  excerpt: z.string(),
  color: z.enum(NOTE_COLORS),
  isPinned: z.boolean(),
  status: z.enum(NOTE_STATUSES),
  metadata: metadataSchema,
  tags: z.array(z.string()),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  trashedAt: instantSchema.nullable(),
  todoLinks: z.array(todoLinkViewSchema),
});
export type NoteView = z.infer<typeof noteViewSchema>;

export const notesPageResponseSchema = z.object({
  notes: z.array(noteViewSchema),
  /** null = 已到末页。**刻意不返回总数**：每翻一页做一次全表 COUNT 不值得 */
  nextCursor: z.string().nullable(),
});

export const createNoteInputSchema = z.object({
  title: z.string().trim().max(NOTE_TITLE_MAX).optional(),
  content: z.string().optional(),
  folderId: idSchema.nullish(),
  color: z.enum(NOTE_COLORS).optional(),
  isPinned: z.boolean().optional(),
  tags: z.array(tagNameSchema).max(20).optional(),
  metadata: metadataSchema.optional(),
});
export type CreateNoteInput = z.input<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z
  .object({
    title: z.string().trim().max(NOTE_TITLE_MAX).optional(),
    content: z.string().optional(),
    folderId: idSchema.nullish(),
    color: z.enum(NOTE_COLORS).optional(),
    isPinned: z.boolean().optional(),
    tags: z.array(tagNameSchema).max(20).optional(),
    metadata: metadataSchema.optional(),
    /**
     * 客户端读到的版本号。**改正文时必须带**——编辑器是防抖自动保存的，
     * 不带就等于宣布「我愿意覆盖任何人的写入」。不改正文的元数据操作可以不带。
     */
    revision: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'revision'), '至少要改一个字段');
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

/** 列表查询。全部走 query string，所以入参在解析前都是字符串。 */
export const listNotesQuerySchema = z.object({
  status: z.enum(NOTE_STATUSES).optional(),
  /** 文件夹 id；`unfiled` 是保留字，表示「未分类」 */
  folderId: z.string().min(1).optional(),
  /** `'true'` 时把该文件夹的所有子孙也算进来 */
  includeDescendants: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  tag: tagNameSchema.optional(),
  keyword: z.string().trim().min(1).max(200).optional(),
  pinnedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(NOTES_PAGE_LIMIT_MAX).default(NOTES_PAGE_LIMIT_DEFAULT),
});

/** `folderId` 的保留字：查询串里表达不出 `null`。 */
export const UNFILED = 'unfiled';

// ---------------------------------------------------------------------------
// 批量管道
// ---------------------------------------------------------------------------

/**
 * 批量动作。**discriminated union**，处理它的 `switch` 不要加 `default` 分支——
 * 没有 default，将来加一种动作时 TypeScript 会直接编译报错（与 core 的
 * `ScheduledTime` 是同一条约定）。
 */
export const batchActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('archive') }),
  z.object({ kind: z.literal('unarchive') }),
  z.object({ kind: z.literal('trash') }),
  z.object({ kind: z.literal('restore') }),
  /** 彻底删除，不可撤销 */
  z.object({ kind: z.literal('delete') }),
  z.object({ kind: z.literal('move'), folderId: idSchema.nullable() }),
  z.object({ kind: z.literal('pin'), pinned: z.boolean() }),
  z.object({ kind: z.literal('color'), color: z.enum(NOTE_COLORS) }),
]);
export type BatchAction = z.infer<typeof batchActionSchema>;

export const batchInputSchema = z.object({
  ids: z.array(idSchema).min(1).max(BATCH_MAX_IDS),
  action: batchActionSchema,
});
export type BatchInput = z.infer<typeof batchInputSchema>;

/**
 * 批量结果。
 *
 * **`skipped` 不是错误**：批量选中的便签里混进一条已被别处删掉的，整批不该失败。
 * 谁被跳过原样报回来，界面可以据此刷新。
 */
export const batchResultSchema = z.object({
  affected: z.number().int(),
  skipped: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// 标签、统计与待办联动
// ---------------------------------------------------------------------------

export const tagsResponseSchema = z.object({
  tags: z.array(z.object({ name: z.string(), count: z.number().int() })),
});

export const statsResponseSchema = z.object({
  active: z.number().int(),
  archived: z.number().int(),
  trashed: z.number().int(),
  folders: z.number().int(),
  tags: z.number().int(),
});

export const todoLinksResponseSchema = z.object({ links: z.array(todoLinkViewSchema) });

export const linkTodoInputSchema = z.object({ todoItemId: idSchema });
export type LinkTodoInput = z.infer<typeof linkTodoInputSchema>;

/**
 * 一键把便签派发成待办。
 *
 * 不传 `title` 时用便签标题；便签没标题就用摘要。
 */
export const createTodoInputSchema = z.object({
  title: z.string().trim().min(1).max(NOTE_TITLE_MAX).optional(),
  importance: z.enum(['high', 'normal', 'low']).optional(),
  /** **UTC 时刻**，由前端换算好再发——服务端只知道自己进程的时区 */
  dueAt: instantSchema.nullish(),
});
export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;

export const createTodoResponseSchema = z.object({
  link: todoLinkViewSchema,
  note: noteViewSchema,
});

// ---------------------------------------------------------------------------
// 端点
// ---------------------------------------------------------------------------

export const ID_PARAM = ':id';
export const TODO_ID_PARAM = ':todoId';

function segment(value: string): string {
  return value === ID_PARAM || value === TODO_ID_PARAM ? value : encodeURIComponent(value);
}

/**
 * 本模块的 HTTP 端点。服务端注册与前端调用**共用同一份定义**——
 * 传 `ID_PARAM` 得到 Fastify 注册模式，传真实 id 得到转义后的请求路径。
 *
 * 路径带 `/v1/`：便签的响应形状会随富 Markdown 渲染层演进，留一个版本段
 * 比日后在同一条路径上做兼容判断便宜得多。
 *
 * **这里没有 `export` 端点。** 设计 §3 的草案里有一条，但四种导出格式
 * （PNG / PDF / Markdown / HTML）全部在浏览器侧完成：正文已经由 `note(id)`
 * 返回，服务端再加一条只会把 TASK-063 的渲染器在 Node 里重写一遍。
 */
export const NOTES_API_V1 = {
  /** GET listNotesQuery → notesPageResponse；POST CreateNoteInput → NoteView（201） */
  notes: '/api/v1/notes',
  /** GET → NoteView；PATCH UpdateNoteInput → NoteView；DELETE → 204（彻底删除） */
  note: (id: string): string => `/api/v1/notes/${segment(id)}`,

  /** GET → folderTreeResponse；POST CreateFolderInput → FolderView（201） */
  folders: '/api/v1/notes/folders',
  /** PATCH UpdateFolderInput → FolderView；DELETE → 204（子项上移到父文件夹） */
  folder: (id: string): string => `/api/v1/notes/folders/${segment(id)}`,

  /** POST BatchInput → batchResult */
  batch: '/api/v1/notes/batch',
  /** DELETE（无 body）→ batchResult。清空回收站，不可撤销 */
  trash: '/api/v1/notes/trash',

  /** GET → tagsResponse */
  tags: '/api/v1/notes/tags',
  /** GET → statsResponse */
  stats: '/api/v1/notes/stats',

  /** GET → todoLinksResponse；POST LinkTodoInput → todoLinksResponse（关联已有待办） */
  todoLinks: (id: string): string => `/api/v1/notes/${segment(id)}/todos`,
  /** DELETE → 204 */
  todoLink: (id: string, todoId: string): string =>
    `/api/v1/notes/${segment(id)}/todos/${segment(todoId)}`,
  /** POST CreateTodoInput → createTodoResponse（201）。新建 core Item 并回链 */
  createTodo: (id: string): string => `/api/v1/notes/${segment(id)}/create-todo`,
} as const;
