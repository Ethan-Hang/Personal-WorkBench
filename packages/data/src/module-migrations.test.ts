import { describe, expect, it } from 'vitest';
import { openTestDatabase, runMigrationsFrom } from './db.js';

/**
 * drizzle 的迁移器用**一张表里的一个全局水位**判断某条迁移该不该跑：
 * `Number(lastDbMigration.created_at) < migration.folderMillis`。
 *
 * 所有模块共用 `__drizzle_migrations` 时，先跑的模块只要时间戳更新，
 * 后跑模块的迁移就会被静默跳过——没有报错，只有后续查询时的
 * 「no such table」。2026-08 加 todo 自有表时真的踩到了：todo 排在秋招前面，
 * 时间戳更新，秋招的表就没建出来。
 *
 * 这条测试锁住「每个模块的迁移记账表独立」这个修法。
 */
describe('模块迁移互不干扰', () => {
  it('时间戳更新的模块先跑，不会让时间戳更旧的模块被跳过', () => {
    const { db, sqlite } = openTestDatabase();

    // todo 的 journal.when 比 campus-recruit 的新，且刻意先跑
    runMigrationsFrom(db, 'modules/todo/migrations');
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);

    // 两个模块的表都必须真的建出来
    expect(tables).toContain('todo_subtasks');
    expect(tables).toContain('todo_tags');
    expect(tables).toContain('todo_recurrences');
    expect(tables).toContain('campus_recruit_applications');
    expect(tables).toContain('campus_recruit_rounds');
  });

  it('反序也一样——顺序不该影响结果', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    runMigrationsFrom(db, 'modules/todo/migrations');

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);

    expect(tables).toContain('todo_subtasks');
    expect(tables).toContain('campus_recruit_applications');
  });

  it('重复执行是幂等的', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/todo/migrations');
    expect(() => runMigrationsFrom(db, 'modules/todo/migrations')).not.toThrow();

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain('todo_subtasks');
  });

  it('每个模块有自己的记账表，不共用一个水位', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/todo/migrations');
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');

    const bookkeeping = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '__drizzle%'")
      .all()
      .map((r) => (r as { name: string }).name);

    // core 用默认表，两个模块各有一张
    expect(bookkeeping.length).toBeGreaterThanOrEqual(3);
    expect(bookkeeping.filter((n) => n.includes('todo')).length).toBe(1);
    expect(bookkeeping.filter((n) => n.includes('campus')).length).toBe(1);
  });
});
