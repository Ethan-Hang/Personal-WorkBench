import type { ImportItemStage } from '../contract.js';

export interface ReconciliationSnapshot {
  stage: ImportItemStage;
  stagingExists: boolean;
  objectExists: boolean;
  databaseAssetExists: boolean;
  databaseLocationState:
    'pending' | 'available' | 'missing' | 'changed' | 'recycled' | 'error' | null;
  observedObjectState: 'available' | 'missing' | 'changed' | null;
}

export type ReconciliationAction =
  | 'none'
  | 'resume-staged-object'
  | 'remove-stale-staging'
  | 'register-orphan-object'
  | 'finish-database-commit'
  | 'mark-location-available'
  | 'mark-location-missing'
  | 'mark-location-changed';

/**
 * 对账只决定下一步，不在这里直接改文件或数据库。调用方按 action 执行后重新采样，
 * 因此每一步都能重放，进程再次中断也不会跳过状态。
 */
export function planReconciliation(snapshot: ReconciliationSnapshot): ReconciliationAction {
  if (snapshot.stagingExists && !snapshot.objectExists) return 'resume-staged-object';

  if (snapshot.stagingExists && snapshot.objectExists) return 'remove-stale-staging';

  if (snapshot.objectExists && !snapshot.databaseAssetExists) return 'register-orphan-object';

  if (
    snapshot.databaseAssetExists &&
    snapshot.objectExists &&
    (snapshot.stage === 'object-ready' || snapshot.stage === 'database-committed')
  ) {
    return 'finish-database-commit';
  }

  if (
    snapshot.databaseLocationState !== null &&
    snapshot.observedObjectState === 'missing' &&
    snapshot.databaseLocationState !== 'missing'
  ) {
    return 'mark-location-missing';
  }

  if (
    snapshot.databaseLocationState !== null &&
    snapshot.observedObjectState === 'changed' &&
    snapshot.databaseLocationState !== 'changed'
  ) {
    return 'mark-location-changed';
  }

  if (
    snapshot.databaseLocationState !== null &&
    snapshot.observedObjectState === 'available' &&
    snapshot.databaseLocationState !== 'available'
  ) {
    return 'mark-location-available';
  }

  return 'none';
}
