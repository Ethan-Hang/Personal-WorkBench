import type { Importance } from '@workbench/core';
import type { ApplicationStatusCode, ApplicationPriority } from '../contract.js';
import type { ApplicationRecord, RoundRecord } from './repository.js';

export const SHELVED_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DerivedApplicationStatus {
  code: ApplicationStatusCode;
  label: string;
  failedRoundName: string | null;
}

export function priorityToImportance(priority: ApplicationPriority): Importance {
  if (priority === 'S' || priority === 'A') return 'high';
  if (priority === 'B') return 'normal';
  return 'low';
}

export function deriveApplicationStatus(
  application: ApplicationRecord,
  rounds: RoundRecord[],
  now: string,
): DerivedApplicationStatus {
  if (application.outcome === 'offer') {
    return { code: 'offer', label: 'Offer', failedRoundName: null };
  }
  if (application.outcome === 'oc') {
    return { code: 'oc', label: 'OC', failedRoundName: null };
  }
  if (application.outcome === 'declined') {
    return { code: 'declined', label: '我拒了', failedRoundName: null };
  }

  const failedRound = [...rounds]
    .filter((round) => round.outcome === 'failed')
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (application.outcome === 'rejected' || failedRound !== undefined) {
    return {
      code: 'failed',
      label: failedRound === undefined ? '已挂' : `已挂 · ${failedRound.name}`,
      failedRoundName: failedRound?.name ?? null,
    };
  }

  if (application.appliedAt === null) {
    return { code: 'pending', label: '待投递', failedRoundName: null };
  }
  if (
    rounds.length === 0 &&
    Date.parse(now) - Date.parse(application.appliedAt) > SHELVED_DAYS * DAY_MS
  ) {
    return { code: 'shelved', label: '泡池子', failedRoundName: null };
  }
  if (rounds.length === 0) {
    return { code: 'applied', label: '已投递', failedRoundName: null };
  }

  const latest = [...rounds].sort((a, b) => b.sequence - a.sequence)[0]!;
  return { code: 'in_progress', label: `流程中 · ${latest.name}`, failedRoundName: null };
}
