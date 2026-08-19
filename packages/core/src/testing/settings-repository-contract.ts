import { describe, it, expect, beforeEach } from 'vitest';
import type { SettingsRepository } from '../settings.js';

/**
 * SettingsRepository 的行为契约（spec §9 LSP）。
 * 任何实现——SQLite 版、将来的同步版——都必须原样通过这一套测试。
 */
export function runSettingsRepositoryContract(
  name: string,
  makeRepo: () => Promise<SettingsRepository> | SettingsRepository,
): void {
  describe(`SettingsRepository 契约：${name}`, () => {
    let repo: SettingsRepository;

    beforeEach(async () => {
      repo = await makeRepo();
    });

    it('空库的 getAll 返回空对象而非抛错', async () => {
      expect(await repo.getAll()).toEqual({});
    });

    it('setMany 写入后 getAll 原样取回', async () => {
      await repo.setMany({ 'theme.mode': 'dark', 'workbench.showGreeting': false });
      expect(await repo.getAll()).toEqual({
        'theme.mode': 'dark',
        'workbench.showGreeting': false,
      });
    });

    it('同一个键再次 setMany 是覆盖而不是插入第二行', async () => {
      await repo.setMany({ 'theme.mode': 'dark' });
      await repo.setMany({ 'theme.mode': 'light' });
      expect(await repo.getAll()).toEqual({ 'theme.mode': 'light' });
    });

    it('部分写入不影响其他键', async () => {
      await repo.setMany({ 'theme.mode': 'dark', 'theme.palette': 'ocean' });
      await repo.setMany({ 'theme.mode': 'light' });
      expect(await repo.getAll()).toEqual({ 'theme.mode': 'light', 'theme.palette': 'ocean' });
    });

    it('布尔值往返后仍是布尔，不变成 0/1 或 "true"', async () => {
      await repo.setMany({ 'workbench.enableAnimations': false });
      const raw = await repo.getAll();
      expect(raw['workbench.enableAnimations']).toBe(false);
    });

    it('空补丁是 no-op，不抛错也不写行', async () => {
      await repo.setMany({});
      expect(await repo.getAll()).toEqual({});
    });
  });
}
