import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { applicationFixture, roundFixture } from '../testing/fixtures.js';
import { campusRecruitApplications, campusRecruitRounds } from './schema.js';
import { SqliteCampusRecruitRepository } from './sqlite-repository.js';

function makeRepository() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/campus-recruit/migrations');
  return {
    repo: new SqliteCampusRecruitRepository(sqlite),
    items: new SqliteItemRepository(db),
    sqlite,
  };
}

describe('campus recruit migrations', () => {
  it('creates both owned tables and enforces round sequence uniqueness', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');

    const names = db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'campus_recruit_%'
      ORDER BY name
    `);
    expect(names.map((row) => row.name)).toEqual([
      'campus_recruit_applications',
      'campus_recruit_rounds',
    ]);

    sqlite.close();
  });

  it('enforces sequence uniqueness per application', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    db.run(sql`
      INSERT INTO campus_recruit_applications (id, company, position)
      VALUES ('a1', '星云科技', '固件工程师')
    `);
    db.run(sql`
      INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
      VALUES ('r1', 'a1', 1, 'technical', '一面')
    `);
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
        VALUES ('r2', 'a1', 1, 'hr', 'HR 面')
      `),
    ).toThrow();
    sqlite.close();
  });

  it('enforces application and round domain constraints', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_applications (id, company, position, priority)
        VALUES ('bad-priority', '星云科技', '固件工程师', 'P')
      `),
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_applications (id, company, position, outcome)
        VALUES ('bad-outcome', '星云科技', '固件工程师', 'unknown')
      `),
    ).toThrow();
    db.run(sql`
      INSERT INTO campus_recruit_applications (id, company, position)
      VALUES ('a1', '星云科技', '固件工程师')
    `);
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
        VALUES ('bad-sequence', 'a1', 0, 'technical', '一面')
      `),
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name)
        VALUES ('bad-kind', 'a1', 1, 'unknown', '一面')
      `),
    ).toThrow();
    expect(() =>
      db.run(sql`
        INSERT INTO campus_recruit_rounds (id, application_id, sequence, kind, name, outcome)
        VALUES ('bad-round-outcome', 'a1', 1, 'technical', '一面', 'unknown')
      `),
    ).toThrow();
    sqlite.close();
  });

  it('declares domain checks and a named unique index in schema and migration', () => {
    const applicationSchema = getTableConfig(campusRecruitApplications);
    const roundSchema = getTableConfig(campusRecruitRounds);
    expect(applicationSchema.checks.map((check) => check.name).sort()).toEqual([
      'ck_campus_recruit_applications_outcome',
      'ck_campus_recruit_applications_priority',
    ]);
    expect(roundSchema.checks.map((check) => check.name).sort()).toEqual([
      'ck_campus_recruit_rounds_kind',
      'ck_campus_recruit_rounds_outcome',
      'ck_campus_recruit_rounds_sequence',
    ]);
    expect(
      roundSchema.indexes.find((index) => index.config.name === 'uq_campus_recruit_round_sequence')
        ?.config.unique,
    ).toBe(true);

    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    const indexes = db.all<{ name: string; unique: number }>(
      sql`PRAGMA index_list('campus_recruit_rounds')`,
    );
    expect(
      indexes.some(
        (index) => index.name === 'uq_campus_recruit_round_sequence' && index.unique === 1,
      ),
    ).toBe(true);
    sqlite.close();
  });

  it('keeps foreign keys pointing from module tables to application and core Item', () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    const roundTargets = db.all<{ table: string }>(
      sql`PRAGMA foreign_key_list('campus_recruit_rounds')`,
    );
    const applicationTargets = db.all<{ table: string }>(
      sql`PRAGMA foreign_key_list('campus_recruit_applications')`,
    );
    expect(roundTargets.map((row) => row.table).sort()).toEqual([
      'campus_recruit_applications',
      'items',
    ]);
    expect(applicationTargets.map((row) => row.table)).toEqual(['items']);
    sqlite.close();
  });
});

describe('SqliteCampusRecruitRepository', () => {
  it('orders applications by createdAt then id for a stable result', async () => {
    const { repo, sqlite } = makeRepository();
    const createdAt = '2026-08-17T00:00:00.000Z';
    await repo.insertApplication(applicationFixture({ id: 'z-app', createdAt }));
    await repo.insertApplication(applicationFixture({ id: 'a-app', createdAt }));

    expect((await repo.listApplications()).map((application) => application.id)).toEqual([
      'a-app',
      'z-app',
    ]);
    sqlite.close();
  });

  it('round-trips an application and its rounds', async () => {
    const { repo, sqlite } = makeRepository();
    const app = applicationFixture({ id: 'app-1' });
    const round = roundFixture({ id: 'round-1', applicationId: app.id, sequence: 1 });
    await repo.insertApplication(app);
    await repo.insertRound(round);

    expect(await repo.getApplication(app.id)).toEqual(app);
    expect(await repo.listRounds(app.id)).toEqual([round]);
    sqlite.close();
  });

  it('allocates max sequence plus one per application', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 2 }));

    expect(await repo.nextRoundSequence('app-1')).toBe(3);
    sqlite.close();
  });

  it('allocates sequence one when an application has no rounds', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));

    expect(await repo.nextRoundSequence('app-1')).toBe(1);
    sqlite.close();
  });

  it('isolates next sequence allocation by application', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertApplication(applicationFixture({ id: 'app-2' }));
    await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 2 }));
    await repo.insertRound(roundFixture({ id: 'r2', applicationId: 'app-2', sequence: 99 }));

    expect(await repo.nextRoundSequence('app-1')).toBe(3);
    sqlite.close();
  });

  it('resequence swaps with an occupied sequence atomically', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 1 }));
    await repo.insertRound(roundFixture({ id: 'r2', applicationId: 'app-1', sequence: 2 }));
    await repo.resequenceRound('r2', 1, '2026-09-21T00:00:00.000Z');

    expect((await repo.listRounds('app-1')).map((round) => [round.id, round.sequence])).toEqual([
      ['r2', 1],
      ['r1', 2],
    ]);
    sqlite.close();
  });

  it('rolls back a resequence when the target update fails mid-transaction', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 1 }));
    await repo.insertRound(roundFixture({ id: 'r2', applicationId: 'app-1', sequence: 2 }));
    sqlite.exec(`
      CREATE TRIGGER fail_r2_target_sequence
      BEFORE UPDATE OF sequence ON campus_recruit_rounds
      WHEN NEW.id = 'r2' AND NEW.sequence = 1
      BEGIN
        SELECT RAISE(FAIL, 'forced resequence failure');
      END;
    `);

    await expect(repo.resequenceRound('r2', 1, '2026-09-21T00:00:00.000Z')).rejects.toThrow(
      'forced resequence failure',
    );
    expect((await repo.listRounds('app-1')).map((round) => [round.id, round.sequence])).toEqual([
      ['r1', 1],
      ['r2', 2],
    ]);
    sqlite.close();
  });

  it('deleting an application cascades its rounds', async () => {
    const { repo, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertRound(roundFixture({ id: 'r1', applicationId: 'app-1', sequence: 1 }));

    expect(await repo.deleteApplication('app-1')).toBe(true);
    expect(await repo.listRounds('app-1')).toEqual([]);
    sqlite.close();
  });

  it('updates records and projection links; missing deletion returns false', async () => {
    const { repo, items, sqlite } = makeRepository();
    await repo.insertApplication(applicationFixture({ id: 'app-1' }));
    await repo.insertRound(roundFixture({ id: 'round-1', applicationId: 'app-1', sequence: 1 }));

    expect(
      await repo.updateApplication('app-1', {
        city: '上海',
        updatedAt: '2026-09-21T00:00:00.000Z',
      }),
    ).toMatchObject({ city: '上海' });
    expect(
      await repo.updateRound('round-1', {
        name: '技术一面',
        updatedAt: '2026-09-21T00:00:00.000Z',
      }),
    ).toMatchObject({ name: '技术一面' });

    const deadlineItem = await items.create('campus-recruit', { kind: 'task', title: '截止' });
    const roundItem = await items.create('campus-recruit', { kind: 'event', title: '一面' });
    await repo.setDeadlineItemId('app-1', deadlineItem.id);
    await repo.setRoundItemId('round-1', roundItem.id);
    expect(await repo.getApplication('app-1')).toMatchObject({ deadlineItemId: deadlineItem.id });
    expect(await repo.getRound('round-1')).toMatchObject({ itemId: roundItem.id });
    expect(await repo.deleteRound('missing')).toBe(false);
    expect(await repo.deleteApplication('missing')).toBe(false);
    sqlite.close();
  });
});
