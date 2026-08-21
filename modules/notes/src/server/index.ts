/**
 * 便签模块的服务端入口。
 *
 * TASK-060 只到数据层为止：这里先把仓储契约导出去，`createNotesServerModule`
 * 与路由由 TASK-061 补齐。
 */
export type {
  FolderChanges,
  FolderDraft,
  FolderRecord,
  ListNotesQuery,
  NoteChanges,
  NoteDraft,
  NotePage,
  NoteRecord,
  NoteRepository,
  TagUsage,
  TodoLinkRecord,
} from './repository.js';
