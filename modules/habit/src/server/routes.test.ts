import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '@workbench/server';
import { HABIT_API, habitViewSchema, todayResponseSchema } from '../contract.js';
import { SqliteHabitRepository } from '../storage/sqlite-repository.js';
import { createHabitServerModule } from './index.js';

const apps: FastifyInstance[] = [];
const TODAY = '2026-08-21';

async function makeApp(): Promise<FastifyInstance> {
  const { sqlite } = openTestDatabase();
  const repo = new SqliteHabitRepository(() => sqlite);
  const app = await buildApp({ getSqlite: () => sqlite, modules: [createHabitServerModule(repo)] });
  apps.push(app);
  return app;
}

async function createHabit(app: FastifyInstance, name = '阅读'): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: HABIT_API.habits,
    payload: { name, freqKind: 'daily', startDate: '2026-08-01' },
  });
  expect(created.statusCode).toBe(201);
  return habitViewSchema.parse(created.json()).id;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('habit HTTP API', () => {
  it('走通增删改查、归档与打卡的完整生命周期', async () => {
    const app = await makeApp();

    const empty = await app.inject({ method: 'GET', url: `${HABIT_API.today}?date=${TODAY}` });
    expect(empty.statusCode).toBe(200);
    expect(todayResponseSchema.parse(empty.json())).toEqual({ habits: [] });

    const id = await createHabit(app);

    const checked = await app.inject({
      method: 'PUT',
      url: HABIT_API.checkin(id, TODAY),
      payload: { value: 1, clientToday: TODAY },
    });
    expect(checked.statusCode).toBe(200);

    const today = await app.inject({ method: 'GET', url: `${HABIT_API.today}?date=${TODAY}` });
    const parsed = todayResponseSchema.parse(today.json());
    expect(parsed.habits[0]?.streak).toBe(1);
    expect(parsed.habits[0]?.progress).toEqual({ current: 1, target: 1 });

    const renamed = await app.inject({
      method: 'PATCH',
      url: HABIT_API.habit(id),
      payload: { name: '深度阅读' },
    });
    expect(habitViewSchema.parse(renamed.json()).name).toBe('深度阅读');

    const removed = await app.inject({ method: 'DELETE', url: HABIT_API.habit(id) });
    expect(removed.statusCode).toBe(204);
  });

  it('归档与恢复是无 body 的 POST', async () => {
    const app = await makeApp();
    const id = await createHabit(app);

    const archived = await app.inject({ method: 'POST', url: HABIT_API.archive(id) });
    expect(archived.statusCode).toBe(200);
    expect(habitViewSchema.parse(archived.json()).archivedAt).not.toBeNull();

    const today = await app.inject({ method: 'GET', url: `${HABIT_API.today}?date=${TODAY}` });
    expect(todayResponseSchema.parse(today.json()).habits).toHaveLength(0);

    const restored = await app.inject({ method: 'POST', url: HABIT_API.unarchive(id) });
    expect(habitViewSchema.parse(restored.json()).archivedAt).toBeNull();
  });

  it('今日视图缺少 date 参数时落成 400 —— 服务端不猜用户的今天', async () => {
    const app = await makeApp();

    const response = await app.inject({ method: 'GET', url: HABIT_API.today });

    expect(response.statusCode).toBe(400);
  });

  it('领域错误落成 4xx 而不是 500', async () => {
    const app = await makeApp();
    const id = await createHabit(app);

    const duplicate = await app.inject({
      method: 'POST',
      url: HABIT_API.habits,
      payload: { name: '阅读', freqKind: 'daily', startDate: '2026-08-01' },
    });
    expect(duplicate.statusCode).toBe(409);

    const tooOld = await app.inject({
      method: 'PUT',
      url: HABIT_API.checkin(id, '2026-08-14'),
      payload: { value: 1, clientToday: TODAY },
    });
    expect(tooOld.statusCode).toBe(400);

    const missing = await app.inject({ method: 'GET', url: HABIT_API.habit('nope') });
    expect(missing.statusCode).toBe(404);
  });

  it('入参不合法时落成 400', async () => {
    const app = await makeApp();

    const bad = await app.inject({
      method: 'POST',
      url: HABIT_API.habits,
      payload: { name: '健身', freqKind: 'weekdays', startDate: '2026-08-01' },
    });

    expect(bad.statusCode).toBe(400);
  });

  it('取消打卡要带 clientToday', async () => {
    const app = await makeApp();
    const id = await createHabit(app);
    await app.inject({
      method: 'PUT',
      url: HABIT_API.checkin(id, TODAY),
      payload: { value: 1, clientToday: TODAY },
    });

    const missingToday = await app.inject({
      method: 'DELETE',
      url: HABIT_API.checkin(id, TODAY),
    });
    expect(missingToday.statusCode).toBe(400);

    const removed = await app.inject({
      method: 'DELETE',
      url: `${HABIT_API.checkin(id, TODAY)}?clientToday=${TODAY}`,
    });
    expect(removed.statusCode).toBe(204);
  });

  it('热力图端点返回习惯与区间内的打卡', async () => {
    const app = await makeApp();
    const id = await createHabit(app);
    await app.inject({
      method: 'PUT',
      url: HABIT_API.checkin(id, TODAY),
      payload: { value: 1, clientToday: TODAY },
    });

    const history = await app.inject({
      method: 'GET',
      url: `${HABIT_API.history(id)}?from=2026-08-01&to=2026-08-31`,
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().checkins).toEqual([{ date: TODAY, value: 1 }]);
  });
});
