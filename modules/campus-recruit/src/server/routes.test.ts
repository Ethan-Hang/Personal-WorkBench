import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { endOfLocalDayUtc } from '@workbench/core';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { applicationViewSchema, statsResponseSchema } from '../contract.js';
import { applicationFixture } from '../testing/fixtures.js';
import { SqliteCampusRecruitRepository } from '../storage/sqlite-repository.js';
import { createCampusRecruitServerModule } from './index.js';

interface AppHarness {
  app: FastifyInstance;
  repo: SqliteCampusRecruitRepository;
  items: SqliteItemRepository;
}

const apps: FastifyInstance[] = [];

async function makeApp(): Promise<AppHarness> {
  const { db, sqlite } = openTestDatabase();
  const repo = new SqliteCampusRecruitRepository(sqlite);
  const app = await buildApp({ db, modules: [createCampusRecruitServerModule(repo)] });
  apps.push(app);
  return { app, repo, items: new SqliteItemRepository(db) };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('campus recruit HTTP API', () => {
  it('supports the complete application and round lifecycle across all nine endpoints', async () => {
    const { app, items } = await makeApp();

    const empty = await app.inject({ method: 'GET', url: '/api/campus/applications' });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ applications: [] });

    const created = await app.inject({
      method: 'POST',
      url: '/api/campus/applications',
      payload: { company: '星云科技', position: '固件工程师', priority: 'S' },
    });
    expect(created.statusCode).toBe(201);
    const application = applicationViewSchema.parse(created.json());

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/campus/applications/${application.id}`,
      payload: { notes: '校招官网' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ notes: '校招官网' });

    const applied = await app.inject({
      method: 'POST',
      url: `/api/campus/applications/${application.id}/apply`,
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().appliedAt).toEqual(expect.any(String));

    const roundCreated = await app.inject({
      method: 'POST',
      url: `/api/campus/applications/${application.id}/rounds`,
      payload: {
        kind: 'technical',
        name: '一面',
        scheduledAt: '2026-09-21T02:00:00.000Z',
      },
    });
    expect(roundCreated.statusCode).toBe(201);
    const roundView = applicationViewSchema.parse(roundCreated.json());
    const round = roundView.rounds[0]!;
    expect(round.itemId).toEqual(expect.any(String));
    expect(await items.getById(round.itemId!)).not.toBeNull();

    const roundUpdated = await app.inject({
      method: 'PATCH',
      url: `/api/campus/rounds/${round.id}`,
      payload: { outcome: 'passed' },
    });
    expect(roundUpdated.statusCode).toBe(200);
    expect(roundUpdated.json().rounds[0]).toMatchObject({ outcome: 'passed' });

    const stats = await app.inject({ method: 'GET', url: '/api/campus/stats' });
    expect(stats.statusCode).toBe(200);
    expect(statsResponseSchema.parse(stats.json())).toMatchObject({ total: 1, applied: 1 });

    const roundDeleted = await app.inject({
      method: 'DELETE',
      url: `/api/campus/rounds/${round.id}`,
    });
    expect(roundDeleted.statusCode).toBe(200);
    expect(applicationViewSchema.parse(roundDeleted.json()).rounds).toEqual([]);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/campus/applications/${application.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
  });

  it('returns 400 with an error for invalid application input', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/campus/applications',
      payload: { company: '   ', position: '固件工程师' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBeTruthy();
  });

  it('maps a missing application to 404', async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/campus/applications/missing/apply',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBeTruthy();
  });

  it('runs full projection reconciliation after migrations with the system zone', async () => {
    const { db, sqlite } = openTestDatabase();
    runMigrationsFrom(db, 'modules/campus-recruit/migrations');
    const repo = new SqliteCampusRecruitRepository(sqlite);
    await repo.insertApplication(
      applicationFixture({
        id: 'startup-app',
        appliedAt: null,
        applyDeadlineDate: '2026-09-20',
      }),
    );

    const app = await buildApp({ db, modules: [createCampusRecruitServerModule(repo)] });
    apps.push(app);
    const stored = (await repo.getApplication('startup-app'))!;
    const item = await new SqliteItemRepository(db).getById(stored.deadlineItemId!);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(item).toMatchObject({
      dueAt: endOfLocalDayUtc('2026-09-20', zone),
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
  });
});
