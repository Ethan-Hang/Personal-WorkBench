import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { endOfLocalDayUtc } from '@workbench/core';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { buildApp } from '@workbench/server';
import {
  applicationViewSchema,
  seasonViewSchema,
  seasonsResponseSchema,
  statsResponseSchema,
} from '../contract.js';
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
  const { sqlite } = openTestDatabase();
  const getSqlite = () => sqlite;
  const repo = new SqliteCampusRecruitRepository(getSqlite);
  const app = await buildApp({ getSqlite, modules: [createCampusRecruitServerModule(repo)] });
  apps.push(app);
  return { app, repo, items: new SqliteItemRepository(getSqlite) };
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
      payload: {
        company: '星云科技',
        position: '固件工程师',
        priority: 'S',
        seasonId: 'season-legacy-autumn',
      },
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
    // 标记已投递会自动补一轮「简历初筛」，后面的断言都要绕开它
    expect(applied.json().rounds).toEqual([expect.objectContaining({ name: '简历初筛' })]);

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
    const round = roundView.rounds.find((r) => r.name === '一面')!;
    expect(round.itemId).toEqual(expect.any(String));
    expect(await items.getById(round.itemId!)).not.toBeNull();

    const roundUpdated = await app.inject({
      method: 'PATCH',
      url: `/api/campus/rounds/${round.id}`,
      payload: { outcome: 'passed' },
    });
    expect(roundUpdated.statusCode).toBe(200);
    expect(
      applicationViewSchema.parse(roundUpdated.json()).rounds.find((r) => r.name === '一面'),
    ).toMatchObject({ outcome: 'passed' });

    const stats = await app.inject({ method: 'GET', url: '/api/campus/stats' });
    expect(stats.statusCode).toBe(200);
    expect(statsResponseSchema.parse(stats.json())).toMatchObject({ total: 1, applied: 1 });

    const roundDeleted = await app.inject({
      method: 'DELETE',
      url: `/api/campus/rounds/${round.id}`,
    });
    expect(roundDeleted.statusCode).toBe(200);
    expect(applicationViewSchema.parse(roundDeleted.json()).rounds).toEqual([
      expect.objectContaining({ name: '简历初筛' }),
    ]);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/campus/applications/${application.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
  });

  it('撤回投递的端点把状态退回待投递，有真实轮次时回 409', async () => {
    const { app } = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/campus/applications',
      payload: {
        company: '星云科技',
        position: '固件工程师',
        priority: 'S',
        seasonId: 'season-legacy-autumn',
      },
    });
    const application = applicationViewSchema.parse(created.json());

    await app.inject({ method: 'POST', url: `/api/campus/applications/${application.id}/apply` });
    const reverted = await app.inject({
      method: 'POST',
      url: `/api/campus/applications/${application.id}/unapply`,
    });
    expect(reverted.statusCode).toBe(200);
    expect(applicationViewSchema.parse(reverted.json())).toMatchObject({
      appliedAt: null,
      rounds: [],
    });

    await app.inject({
      method: 'POST',
      url: `/api/campus/applications/${application.id}/rounds`,
      payload: { kind: 'technical', name: '一面', scheduledAt: '2026-09-21T02:00:00.000Z' },
    });
    const refused = await app.inject({
      method: 'POST',
      url: `/api/campus/applications/${application.id}/unapply`,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBeTruthy();
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
    const getSqlite = () => sqlite;
    const repo = new SqliteCampusRecruitRepository(getSqlite);
    await repo.insertApplication(
      applicationFixture({
        id: 'startup-app',
        appliedAt: null,
        applyDeadlineDate: '2026-09-20',
      }),
    );

    const app = await buildApp({ getSqlite, modules: [createCampusRecruitServerModule(repo)] });
    apps.push(app);
    const stored = (await repo.getApplication('startup-app'))!;
    const item = await new SqliteItemRepository(getSqlite).getById(stored.deadlineItemId!);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(item).toMatchObject({
      dueAt: endOfLocalDayUtc('2026-09-20', zone),
      scheduled: { kind: 'all-day', date: '2026-09-20' },
    });
  });
  it('招聘季端点：列表 / 新建 / 改名 / 归档 / 删除，两种 409', async () => {
    const { app } = await makeApp();

    const listed = await app.inject({ method: 'GET', url: '/api/campus/seasons' });
    expect(listed.statusCode).toBe(200);
    expect(seasonsResponseSchema.parse(listed.json()).seasons).toEqual([
      expect.objectContaining({ id: 'season-legacy-autumn', name: '秋招', applicationCount: 0 }),
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/api/campus/seasons',
      payload: { name: '2027 春招', kind: 'campus-spring' },
    });
    expect(created.statusCode).toBe(201);
    const season = seasonViewSchema.parse(created.json());

    const dup = await app.inject({
      method: 'POST',
      url: '/api/campus/seasons',
      payload: { name: '2027 春招', kind: 'social' },
    });
    expect(dup.statusCode).toBe(409);

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/campus/seasons/${season.id}`,
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);
    expect(seasonViewSchema.parse(archived.json()).archivedAt).toEqual(expect.any(String));

    // 归档后 legacy 季是最后一个未归档的，删它要被拒
    const refused = await app.inject({
      method: 'DELETE',
      url: '/api/campus/seasons/season-legacy-autumn',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBeTruthy();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/campus/seasons/${season.id}` });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
  });

  it('投递列表与统计接受 seasonId 查询参数', async () => {
    const { app } = await makeApp();
    await app.inject({
      method: 'POST',
      url: '/api/campus/applications',
      payload: {
        company: '星云科技',
        position: '固件工程师',
        priority: 'S',
        seasonId: 'season-legacy-autumn',
      },
    });

    const scoped = await app.inject({
      method: 'GET',
      url: '/api/campus/applications?seasonId=season-legacy-autumn',
    });
    expect(scoped.json().applications).toHaveLength(1);
    expect(scoped.json().applications[0]).toMatchObject({ seasonName: '秋招' });

    const other = await app.inject({
      method: 'GET',
      url: '/api/campus/applications?seasonId=nope',
    });
    expect(other.json().applications).toHaveLength(0);

    const stats = await app.inject({
      method: 'GET',
      url: '/api/campus/stats?seasonId=season-legacy-autumn',
    });
    expect(statsResponseSchema.parse(stats.json())).toMatchObject({ total: 1 });
  });
});
