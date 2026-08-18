import { ROUND_KINDS, type RoundKind, type StatsResponse } from '../contract.js';
import { deriveApplicationStatus } from './domain.js';
import type { ApplicationRecord, RoundRecord } from './repository.js';

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function computeStats(
  applications: ApplicationRecord[],
  rounds: RoundRecord[],
  now: string,
): StatsResponse {
  const assessmentIds = new Set(
    rounds
      .filter((round) => round.kind === 'assessment' || round.kind === 'written')
      .map((round) => round.applicationId),
  );
  const technicalIds = new Set(
    rounds.filter((round) => round.kind === 'technical').map((round) => round.applicationId),
  );
  const hrIds = new Set(
    rounds.filter((round) => round.kind === 'hr').map((round) => round.applicationId),
  );
  const roundsByApplication = new Map<string, RoundRecord[]>();
  for (const round of rounds) {
    const list = roundsByApplication.get(round.applicationId) ?? [];
    list.push(round);
    roundsByApplication.set(round.applicationId, list);
  }
  const statuses = applications.map((application) =>
    deriveApplicationStatus(application, roundsByApplication.get(application.id) ?? [], now),
  );
  const applied = applications.filter((application) => application.appliedAt !== null).length;
  const offers = statuses.filter(
    (status) => status.code === 'offer' || status.code === 'oc',
  ).length;

  const failedCounts = new Map<RoundKind, number>();
  for (const round of rounds) {
    if (round.outcome === 'failed') {
      failedCounts.set(round.kind, (failedCounts.get(round.kind) ?? 0) + 1);
    }
  }

  return {
    total: applications.length,
    pending: statuses.filter((status) => status.code === 'pending').length,
    applied,
    assessment: assessmentIds.size,
    technical: technicalIds.size,
    hr: hrIds.size,
    offers,
    failed: statuses.filter((status) => status.code === 'failed').length,
    shelved: statuses.filter((status) => status.code === 'shelved').length,
    rates: {
      applicationToAssessment: ratio(assessmentIds.size, applied),
      applicationToTechnical: ratio(technicalIds.size, applied),
      technicalToOffer: ratio(offers, technicalIds.size),
    },
    failedByKind: ROUND_KINDS.flatMap((kind) => {
      const count = failedCounts.get(kind) ?? 0;
      return count === 0 ? [] : [{ kind, count }];
    }),
  };
}
