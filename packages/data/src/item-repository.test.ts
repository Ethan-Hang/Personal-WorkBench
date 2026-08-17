import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { runItemRepositoryContract } from '@workbench/core/testing';
import { openTestDatabase } from './db.js';
import { SqliteItemRepository } from './item-repository.js';

runItemRepositoryContract('SqliteItemRepository', () => {
  const { db } = openTestDatabase();
  return new SqliteItemRepository(db);
});

describe('SqliteItemRepository 的存储细节', () => {
  it('全天排程在 SQL 层就是裸的 YYYY-MM-DD，没有被转成 UTC（spec §6.2）', async () => {
    const { db } = openTestDatabase();
    const repo = new SqliteItemRepository(db);
    await repo.create('todo', {
      kind: 'event',
      title: '全天',
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });

    const rows = db.all<{ scheduled_start: string; is_all_day: number }>(
      sql`SELECT scheduled_start, is_all_day FROM items`,
    );
    expect(rows[0]!.scheduled_start).toBe('2026-09-20');
    expect(rows[0]!.is_all_day).toBe(1);
  });
});
