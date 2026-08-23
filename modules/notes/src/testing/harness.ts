import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { SqliteNoteRepository } from '../storage/sqlite-repository.js';

/**
 * 真实 SQLite（`:memory:`）+ 真实迁移。**不 mock 数据库**——建库是毫秒级的。
 *
 * `notes_todo_links.todo_item_id` 指向 core 的 `items`，所以这里必须先跑 core 迁移
 * 再跑模块迁移；`openTestDatabase` 已经把 core 那一份做掉了。
 */
export function makeNotesHarness() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/notes/migrations');
  return { db, sqlite, repo: new SqliteNoteRepository(() => sqlite) };
}
