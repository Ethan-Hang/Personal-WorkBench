import type {
  ApplicationOutcome,
  ApplicationPriority,
  RoundKind,
  RoundOutcome,
} from '../contract.js';

export type SeasonKind = 'campus-autumn' | 'campus-spring' | 'intern' | 'social';

export interface SeasonRecord {
  id: string;
  name: string;
  kind: SeasonKind;
  /** 浮动日期 YYYY-MM-DD，绝不转 UTC */
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord {
  id: string;
  /**
   * 这条投递属于哪个招聘季。
   *
   * 类型是 `string` 而非 `string | null`，尽管 DB 列可空——非空由 contract 的必填、
   * service 的存在性校验与本类型三处共同保证。理由见迁移 0003 顶部。
   */
  seasonId: string;
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
  /** 截止时刻（UTC ISO）。与 scheduledAt 是两件事：一个「什么时候做」，一个「最晚做完」 */
  deadlineAt: string | null;
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
export type SeasonChanges = Partial<Omit<SeasonRecord, 'id' | 'createdAt'>>;
export type RoundChanges = Partial<Omit<RoundRecord, 'id' | 'applicationId' | 'createdAt'>>;

export interface CampusRecruitRepository {
  /** 省略 seasonId 即全部季 */
  listApplications(seasonId?: string): Promise<ApplicationRecord[]>;
  listSeasons(): Promise<SeasonRecord[]>;
  getSeason(id: string): Promise<SeasonRecord | null>;
  getSeasonByName(name: string): Promise<SeasonRecord | null>;
  insertSeason(record: SeasonRecord): Promise<void>;
  updateSeason(id: string, changes: SeasonChanges): Promise<SeasonRecord>;
  deleteSeason(id: string): Promise<boolean>;
  countApplicationsInSeason(seasonId: string): Promise<number>;
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
