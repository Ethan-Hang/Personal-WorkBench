import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { SqliteHabitRepository } from '../storage/sqlite-repository.js';

/**
 * 真实 SQLite（`:memory:`）+ 真实迁移。**不 mock 数据库**——建库是毫秒级的。
 *
 * 刻意不构造 `ModuleContext`：习惯模块不碰 `ctx.items`，service 的签名里
 * 也就没有它的位置（ADR-0023）。
 */
export function makeHabitHarness() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/habit/migrations');
  return { db, sqlite, repo: new SqliteHabitRepository(() => sqlite) };
}
