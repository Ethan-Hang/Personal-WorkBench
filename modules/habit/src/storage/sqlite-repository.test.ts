import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import type { HabitRecord } from '../server/repository.js';
import { SqliteHabitRepository } from './sqlite-repository.js';

function makeRepository() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/habit/migrations');
  return { repo: new SqliteHabitRepository(() => sqlite), db, sqlite };
}

const dailyHabit = {
  id: 'h1',
  name: '阅读',
  notes: null,
  targetValue: 1,
  unit: null,
  freqKind: 'daily' as const,
  weekdays: null,
  weeklyCount: null,
  startDate: '2026-08-01',
  colorToken: null,
  position: 0,
};

describe('habit migrations', () => {
  it('建出两张自有表，且没有第三张', () => {
    const { db, sqlite } = makeRepository();

    const names = db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'habit_%'
      ORDER BY name
    `);
    expect(names.map((row) => row.name)).toEqual(['habit_checkins', 'habit_definitions']);

    sqlite.close();
  });

  it('两张表里都没有 item_id —— 习惯不投影成 core Item', () => {
    const { db, sqlite } = makeRepository();

    for (const table of ['habit_definitions', 'habit_checkins']) {
      const columns = db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`));
      expect(columns.map((c) => c.name)).not.toContain('item_id');
    }

    sqlite.close();
  });

  it('打卡以 (habit_id, date) 为复合主键，同一天不会出现两行', () => {
    const { db, sqlite } = makeRepository();
    db.run(sql`
      INSERT INTO habit_definitions (id, name, target_value, freq_kind, start_date, position,
        created_at, updated_at)
      VALUES ('h1', '阅读', 1, 'daily', '2026-08-01', 0, '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z')
    `);
    db.run(sql`
      INSERT INTO habit_checkins (habit_id, date, value, created_at, updated_at)
      VALUES ('h1', '2026-08-21', 1, '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z')
    `);

    expect(() =>
      db.run(sql`
        INSERT INTO habit_checkins (habit_id, date, value, created_at, updated_at)
        VALUES ('h1', '2026-08-21', 1, '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z')
      `),
    ).toThrow();

    sqlite.close();
  });
});

describe('SqliteHabitRepository', () => {
  it('创建后能按 id 读回，周几与次数往返不失真', async () => {
    const { repo, sqlite } = makeRepository();

    await repo.createHabit({
      ...dailyHabit,
      id: 'h2',
      freqKind: 'weekdays',
      weekdays: [1, 3, 5],
    });
    const found = await repo.getHabit('h2');

    expect(found?.weekdays).toEqual([1, 3, 5]);
    expect(found?.freqKind).toBe('weekdays');
    sqlite.close();
  });

  it('列表按 position 排序，默认不含已归档', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit({ ...dailyHabit, id: 'a', position: 1 });
    await repo.createHabit({ ...dailyHabit, id: 'b', position: 0 });
    await repo.createHabit({ ...dailyHabit, id: 'c', position: 2 });
    await repo.archiveHabit('c', '2026-08-21T00:00:00.000Z');

    const active = await repo.listHabits({ includeArchived: false });
    expect(active.map((h: HabitRecord) => h.id)).toEqual(['b', 'a']);

    const all = await repo.listHabits({ includeArchived: true });
    expect(all.map((h: HabitRecord) => h.id)).toEqual(['b', 'a', 'c']);
    sqlite.close();
  });

  it('打卡幂等：同一天写两次只有一行，值取最后一次', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);

    await repo.upsertCheckin('h1', '2026-08-21', 1);
    await repo.upsertCheckin('h1', '2026-08-21', 4);

    const checkins = await repo.listCheckins('h1', '2026-08-01', '2026-08-31');
    expect(checkins).toEqual([{ date: '2026-08-21', value: 4 }]);
    sqlite.close();
  });

  it('按区间取打卡，含两端', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);
    for (const date of ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']) {
      await repo.upsertCheckin('h1', date, 1);
    }

    const checkins = await repo.listCheckins('h1', '2026-08-20', '2026-08-21');
    expect(checkins.map((c) => c.date)).toEqual(['2026-08-20', '2026-08-21']);
    sqlite.close();
  });

  it('取消打卡删掉那一行', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);
    await repo.upsertCheckin('h1', '2026-08-21', 1);

    await repo.deleteCheckin('h1', '2026-08-21');

    expect(await repo.listCheckins('h1', '2026-08-01', '2026-08-31')).toEqual([]);
    sqlite.close();
  });

  it('归档保留全部历史打卡，恢复后仍在', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);
    await repo.upsertCheckin('h1', '2026-08-21', 1);

    await repo.archiveHabit('h1', '2026-08-22T00:00:00.000Z');
    expect((await repo.getHabit('h1'))?.archivedAt).toBe('2026-08-22T00:00:00.000Z');
    expect(await repo.listCheckins('h1', '2026-08-01', '2026-08-31')).toHaveLength(1);

    await repo.unarchiveHabit('h1');
    expect((await repo.getHabit('h1'))?.archivedAt).toBeNull();
    expect(await repo.listCheckins('h1', '2026-08-01', '2026-08-31')).toHaveLength(1);
    sqlite.close();
  });

  it('彻底删除连带清空该习惯的全部打卡', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);
    await repo.upsertCheckin('h1', '2026-08-21', 1);

    await repo.deleteHabit('h1');

    expect(await repo.getHabit('h1')).toBeNull();
    expect(await repo.listCheckins('h1', '2026-08-01', '2026-08-31')).toEqual([]);
    sqlite.close();
  });

  it('按名字查重，用于 service 层的重名校验', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);

    expect(await repo.findHabitByName('阅读')).not.toBeNull();
    expect(await repo.findHabitByName('跑步')).toBeNull();
    sqlite.close();
  });

  it('批量取多个习惯在某区间的打卡，供今日视图一次查完', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.createHabit(dailyHabit);
    await repo.createHabit({ ...dailyHabit, id: 'h2', name: '跑步' });
    await repo.upsertCheckin('h1', '2026-08-21', 1);
    await repo.upsertCheckin('h2', '2026-08-20', 1);

    const map = await repo.listCheckinsFor(['h1', 'h2'], '2026-08-01', '2026-08-31');

    expect(map.get('h1')).toEqual([{ date: '2026-08-21', value: 1 }]);
    expect(map.get('h2')).toEqual([{ date: '2026-08-20', value: 1 }]);
    sqlite.close();
  });
});
