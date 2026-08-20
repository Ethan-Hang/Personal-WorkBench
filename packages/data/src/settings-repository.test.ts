import { describe, it, expect } from 'vitest';
import { runSettingsRepositoryContract } from '@workbench/core/testing';
import { openTestDatabase } from './db.js';
import { SqliteSettingsRepository } from './settings-repository.js';

runSettingsRepositoryContract('SqliteSettingsRepository', () => {
  const { sqlite } = openTestDatabase();
  return new SqliteSettingsRepository(() => sqlite);
});

describe('SqliteSettingsRepository 的存储细节', () => {
  it('值以 JSON 文本落库，读出时还原为原类型', async () => {
    const { sqlite } = openTestDatabase();
    const repo = new SqliteSettingsRepository(() => sqlite);
    await repo.setMany({ 'theme.mode': 'dark', 'workbench.showGreeting': false });

    const rows = sqlite
      .prepare('SELECT key, value_json FROM app_settings ORDER BY key')
      .all() as Array<{ key: string; value_json: string }>;
    expect(rows).toEqual([
      { key: 'theme.mode', value_json: '"dark"' },
      { key: 'workbench.showGreeting', value_json: 'false' },
    ]);
  });

  it('库里存了坏 JSON 时跳过该行，其余照常返回', async () => {
    const { sqlite } = openTestDatabase();
    const repo = new SqliteSettingsRepository(() => sqlite);
    await repo.setMany({ 'theme.mode': 'dark' });
    sqlite
      .prepare('INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('theme.palette', '{not json', '2026-08-19T00:00:00.000Z');

    expect(await repo.getAll()).toEqual({ 'theme.mode': 'dark' });
  });

  it('updated_at 是带 Z 与三位毫秒的 UTC ISO8601', async () => {
    const { sqlite } = openTestDatabase();
    await new SqliteSettingsRepository(() => sqlite).setMany({ 'theme.mode': 'dark' });
    const row = sqlite.prepare('SELECT updated_at FROM app_settings').get() as {
      updated_at: string;
    };
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
