import { describe, expect, it } from 'vitest';
import { planReconciliation, type ReconciliationSnapshot } from './reconcile.js';

function snapshot(overrides: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    stage: 'selected',
    stagingExists: false,
    objectExists: false,
    databaseAssetExists: false,
    databaseLocationState: null,
    observedObjectState: null,
    ...overrides,
  };
}

describe('文件与数据库对账决策', () => {
  it('复制中断留下 staging 时恢复对象提交', () => {
    expect(planReconciliation(snapshot({ stage: 'staged', stagingExists: true }))).toBe(
      'resume-staged-object',
    );
  });

  it('对象已经发布时只清理同批 staging，不覆盖对象', () => {
    expect(
      planReconciliation(snapshot({ stage: 'staged', stagingExists: true, objectExists: true })),
    ).toBe('remove-stale-staging');
  });

  it('文件就位但数据库未提交时登记可解释的孤立对象', () => {
    expect(planReconciliation(snapshot({ objectExists: true }))).toBe('register-orphan-object');
  });

  it('数据库关系已提交但状态未完成时继续最后一步', () => {
    expect(
      planReconciliation(
        snapshot({
          stage: 'database-committed',
          objectExists: true,
          databaseAssetExists: true,
          databaseLocationState: 'pending',
          observedObjectState: 'available',
        }),
      ),
    ).toBe('finish-database-commit');
  });

  it.each([
    ['missing', 'mark-location-missing'],
    ['changed', 'mark-location-changed'],
    ['available', 'mark-location-available'],
  ] as const)('数据库状态与实测 %s 不一致时返回对应动作', (observed, action) => {
    expect(
      planReconciliation(
        snapshot({
          stage: 'available',
          objectExists: observed !== 'missing',
          databaseAssetExists: true,
          databaseLocationState: 'available',
          observedObjectState: observed,
        }),
      ),
    ).toBe(observed === 'available' ? 'none' : action);
  });
});
