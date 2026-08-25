import type { ApplicationRecord, RoundRecord } from '../server/repository.js';

const CREATED = '2026-08-17T00:00:00.000Z';

export function applicationFixture(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 'app-1',
    seasonId: 'season-legacy-autumn',
    company: '星云科技',
    position: '固件工程师',
    companyType: null,
    industry: null,
    city: null,
    channel: null,
    referral: null,
    applyEmail: null,
    applyPhone: null,
    priority: 'B',
    applyDeadlineDate: null,
    appliedAt: '2026-08-17T01:00:00.000Z',
    outcome: null,
    outcomeAt: null,
    shelvedAt: null,
    salary: null,
    link: null,
    notes: null,
    deadlineItemId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function roundFixture(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: 'round-1',
    applicationId: 'app-1',
    sequence: 1,
    kind: 'technical',
    name: '一面',
    scheduledAt: null,
    deadlineAt: null,
    format: null,
    durationMin: null,
    outcome: 'pending',
    outcomeAt: null,
    notes: null,
    itemId: null,
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}
