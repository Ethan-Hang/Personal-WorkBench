import type {
  ApplicationOutcome,
  ApplicationPriority,
  RoundKind,
  RoundOutcome,
} from '../contract.js';

export interface ApplicationRecord {
  id: string;
  company: string;
  position: string;
  companyType: string | null;
  industry: string | null;
  city: string | null;
  channel: string | null;
  referral: string | null;
  applyEmail: string | null;
  applyPhone: string | null;
  priority: ApplicationPriority;
  applyDeadlineDate: string | null;
  appliedAt: string | null;
  outcome: ApplicationOutcome | null;
  outcomeAt: string | null;
  shelvedAt: string | null;
  salary: string | null;
  link: string | null;
  notes: string | null;
  deadlineItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoundRecord {
  id: string;
  applicationId: string;
  sequence: number;
  kind: RoundKind;
  name: string;
  scheduledAt: string | null;
  format: string | null;
  durationMin: number | null;
  outcome: RoundOutcome;
  outcomeAt: string | null;
  notes: string | null;
  itemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationChanges = Partial<Omit<ApplicationRecord, 'id' | 'createdAt'>>;
export type RoundChanges = Partial<Omit<RoundRecord, 'id' | 'applicationId' | 'createdAt'>>;

export interface CampusRecruitRepository {
  listApplications(): Promise<ApplicationRecord[]>;
  getApplication(id: string): Promise<ApplicationRecord | null>;
  insertApplication(record: ApplicationRecord): Promise<void>;
  updateApplication(id: string, changes: ApplicationChanges): Promise<ApplicationRecord>;
  deleteApplication(id: string): Promise<boolean>;
  listRounds(applicationId?: string): Promise<RoundRecord[]>;
  getRound(id: string): Promise<RoundRecord | null>;
  insertRound(record: RoundRecord): Promise<void>;
  updateRound(id: string, changes: RoundChanges): Promise<RoundRecord>;
  resequenceRound(id: string, targetSequence: number, updatedAt: string): Promise<RoundRecord>;
  deleteRound(id: string): Promise<boolean>;
  nextRoundSequence(applicationId: string): Promise<number>;
  setDeadlineItemId(applicationId: string, itemId: string | null): Promise<void>;
  setRoundItemId(roundId: string, itemId: string | null): Promise<void>;
}
