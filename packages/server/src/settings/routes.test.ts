import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@workbench/core';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '../app.js';

async function makeApp() {
  const { sqlite } = openTestDatabase();
  return buildApp({ getSqlite: () => sqlite, modules: [] });
}

describe('GET /api/settings', () => {
  it('空库返回全套默认值，storedKeys 为空', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ settings: DEFAULT_SETTINGS, storedKeys: [] });
    await app.close();
  });
});

describe('PATCH /api/settings', () => {
  it('写入后返回完整设置，storedKeys 只含真正落库的键', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'dark' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settings['theme.mode']).toBe('dark');
    expect(body.settings['theme.palette']).toBe('warm');
    expect(body.storedKeys).toEqual(['theme.mode']);
    await app.close();
  });

  it('写入在 GET 里可见', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'timezone.id': 'Europe/Paris' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.json().settings['timezone.id']).toBe('Europe/Paris');
    expect(res.json().storedKeys).toEqual(['timezone.id']);
    await app.close();
  });

  it('未知键返回 400 并带请求编号，不写库', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.nope': 'x' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('theme.nope');
    expect(res.json().requestId).toBeTruthy();

    const after = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(after.json().storedKeys).toEqual([]);
    await app.close();
  });

  it('值不合法返回 400', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'chartreuse' } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('缺少 settings 字段返回 400 而非 500', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/settings', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('一次写多个键是原子的：其中一个不合法则一个都不写', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { settings: { 'theme.mode': 'dark', 'theme.palette': 'nonsense' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.json().storedKeys).toEqual([]);
    await app.close();
  });
});
