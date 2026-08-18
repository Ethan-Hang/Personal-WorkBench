import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { openTestDatabase, runCoreMigrations } from './db.js';
import { items } from './schema.js';

describe('core 迁移', () => {
  it('建出 items 表', () => {
    const { db, sqlite } = openTestDatabase();
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='items'`,
    );
    expect(rows).toHaveLength(1);
    sqlite.close();
  });

  it('迁移可重复执行而不报错（幂等）', () => {
    const { db, sqlite } = openTestDatabase();
    // openTestDatabase 已跑过一次；第二次应被 drizzle 的迁移记录表拦下
    expect(() => runCoreMigrations(db)).not.toThrow();
    sqlite.close();
  });

  it('items 表的默认值生效', () => {
    const { db, sqlite } = openTestDatabase();
    db.insert(items)
      .values({ id: 'x1', kind: 'task', title: '默认值', sourceModule: 'todo' })
      .run();
    const row = db.select().from(items).all()[0]!;
    expect(row.status).toBe('todo');
    expect(row.importance).toBe('normal');
    expect(row.isAllDay).toBe(false);
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    sqlite.close();
  });

  it('title 与 source_module 为 NOT NULL', () => {
    const { db, sqlite } = openTestDatabase();
    expect(() =>
      db.run(sql`INSERT INTO items (id, kind, title) VALUES ('x2', 'task', '缺少 source_module')`),
    ).toThrow();
    expect(() =>
      db.run(sql`INSERT INTO items (id, kind, source_module) VALUES ('x3', 'task', 'todo')`),
    ).toThrow();
    sqlite.close();
  });
});
