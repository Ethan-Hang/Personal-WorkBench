import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { TODO_MODULE_ID } from '../contract.js';
import { SqliteTodoRepository } from '../storage/sqlite-repository.js';

/**
 * `:memory:` 库 + core 迁移 + todo 自有表迁移。
 *
 * 不 mock 数据库（spec §12.2）：建一个内存库是毫秒级的，而 mock 出来的仓储
 * 永远证明不了迁移是对的——而迁移正是唯一「写错会毁掉真实数据」的地方。
 */
export function makeTodoHarness() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/todo/migrations');
  const getSqlite = () => sqlite;
  const repo = new SqliteTodoRepository(getSqlite);
  const items = new SqliteItemRepository(getSqlite);
  const ctx: ModuleContext = { moduleId: TODO_MODULE_ID, items };
  return { db, sqlite, repo, items, ctx };
}
