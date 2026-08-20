import { describe, expect, it } from 'vitest';
import { compareWatermarks } from './compatibility.js';

const local = {
  __drizzle_migrations_packages_data_migrations: 1_700_000_000_000,
  __drizzle_migrations_modules_todo_migrations: 1_800_000_000_000,
};

describe('compareWatermarks', () => {
  it('水位相等 → 可直接恢复', () => {
    expect(compareWatermarks(local, { ...local })).toEqual({ verdict: 'equal' });
  });

  it('备份更旧 → 可恢复，恢复后跑迁移补上', () => {
    const backup = { ...local, __drizzle_migrations_modules_todo_migrations: 1_700_000_000_000 };

    expect(compareWatermarks(local, backup)).toMatchObject({ verdict: 'backup-older' });
  });

  it('备份更新 → 拒绝，并说清是哪条谱系差多少', () => {
    const backup = { ...local, __drizzle_migrations_modules_todo_migrations: 1_900_000_000_000 };

    const result = compareWatermarks(local, backup);

    expect(result.verdict).toBe('backup-newer');
    expect(result.reason).toContain('modules_todo');
    expect(result.reason).toContain('1900000000000');
  });

  it('备份里有本地根本没有的谱系 → 同样算备份更新', () => {
    const backup = { ...local, __drizzle_migrations_modules_habits_migrations: 1 };

    expect(compareWatermarks(local, backup).verdict).toBe('backup-newer');
  });

  it('本地有而备份没有的谱系 → 算备份更旧，恢复后跑迁移建出来', () => {
    const backup = { __drizzle_migrations_packages_data_migrations: 1_700_000_000_000 };

    expect(compareWatermarks(local, backup).verdict).toBe('backup-older');
  });

  it('一条更新一条更旧时，以「更新」为准——向下迁移不存在', () => {
    const backup = {
      __drizzle_migrations_packages_data_migrations: 1_600_000_000_000,
      __drizzle_migrations_modules_todo_migrations: 1_900_000_000_000,
    };

    expect(compareWatermarks(local, backup).verdict).toBe('backup-newer');
  });
});
