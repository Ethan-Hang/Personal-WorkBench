import type Database from 'better-sqlite3';
import { and, asc, eq, max } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  ApplicationChanges,
  ApplicationRecord,
  CampusRecruitRepository,
  RoundChanges,
  RoundRecord,
  SeasonChanges,
  SeasonRecord,
} from '../server/repository.js';
import * as schema from './schema.js';
import { campusRecruitApplications, campusRecruitRounds, campusRecruitSeasons } from './schema.js';

export class SqliteCampusRecruitRepository implements CampusRecruitRepository {
  private cached?: {
    connection: Database.Database;
    db: BetterSQLite3Database<typeof schema>;
  };

  constructor(private readonly getSqlite: () => Database.Database) {}

  private get db(): BetterSQLite3Database<typeof schema> {
    const connection = this.getSqlite();
    if (this.cached?.connection !== connection) {
      this.cached = { connection, db: drizzle(connection, { schema }) };
    }
    return this.cached.db;
  }

  async listApplications(seasonId?: string): Promise<ApplicationRecord[]> {
    const rows = this.db
      .select()
      .from(campusRecruitApplications)
      .where(seasonId === undefined ? undefined : eq(campusRecruitApplications.seasonId, seasonId))
      .orderBy(asc(campusRecruitApplications.createdAt), asc(campusRecruitApplications.id))
      .all();
    // drizzle 由可空列推出 string | null，而应用层契约是 string。这个断言就是
    // schema.ts 里那处妥协的落点：非空由 contract 必填 + service 存在性校验保证，
    // 不由 DB 保证。
    return rows as ApplicationRecord[];
  }

  async listSeasons(): Promise<SeasonRecord[]> {
    return this.db
      .select()
      .from(campusRecruitSeasons)
      .orderBy(asc(campusRecruitSeasons.createdAt), asc(campusRecruitSeasons.id))
      .all();
  }

  async getSeason(id: string): Promise<SeasonRecord | null> {
    return (
      this.db.select().from(campusRecruitSeasons).where(eq(campusRecruitSeasons.id, id)).get() ??
      null
    );
  }

  async getSeasonByName(name: string): Promise<SeasonRecord | null> {
    return (
      this.db
        .select()
        .from(campusRecruitSeasons)
        .where(eq(campusRecruitSeasons.name, name))
        .get() ?? null
    );
  }

  async insertSeason(record: SeasonRecord): Promise<void> {
    this.db.insert(campusRecruitSeasons).values(record).run();
  }

  async updateSeason(id: string, changes: SeasonChanges): Promise<SeasonRecord> {
    const row = this.db
      .update(campusRecruitSeasons)
      .set(changes)
      .where(eq(campusRecruitSeasons.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`招聘季不存在：${id}`);
    return row;
  }

  async deleteSeason(id: string): Promise<boolean> {
    return (
      this.db.delete(campusRecruitSeasons).where(eq(campusRecruitSeasons.id, id)).returning().all()
        .length > 0
    );
  }

  async countApplicationsInSeason(seasonId: string): Promise<number> {
    return this.db
      .select({ id: campusRecruitApplications.id })
      .from(campusRecruitApplications)
      .where(eq(campusRecruitApplications.seasonId, seasonId))
      .all().length;
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    return (
      (this.db
        .select()
        .from(campusRecruitApplications)
        .where(eq(campusRecruitApplications.id, id))
        .get() as ApplicationRecord | undefined) ?? null
    );
  }

  async insertApplication(record: ApplicationRecord): Promise<void> {
    this.db.insert(campusRecruitApplications).values(record).run();
  }

  async updateApplication(id: string, changes: ApplicationChanges): Promise<ApplicationRecord> {
    const row = this.db
      .update(campusRecruitApplications)
      .set(changes)
      .where(eq(campusRecruitApplications.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`投递不存在：${id}`);
    return row as ApplicationRecord;
  }

  async deleteApplication(id: string): Promise<boolean> {
    return (
      this.db
        .delete(campusRecruitApplications)
        .where(eq(campusRecruitApplications.id, id))
        .returning({ id: campusRecruitApplications.id })
        .get() !== undefined
    );
  }

  async listRounds(applicationId?: string): Promise<RoundRecord[]> {
    if (applicationId === undefined) {
      return this.db
        .select()
        .from(campusRecruitRounds)
        .orderBy(asc(campusRecruitRounds.applicationId), asc(campusRecruitRounds.sequence))
        .all();
    }
    return this.db
      .select()
      .from(campusRecruitRounds)
      .where(eq(campusRecruitRounds.applicationId, applicationId))
      .orderBy(asc(campusRecruitRounds.sequence))
      .all();
  }

  async getRound(id: string): Promise<RoundRecord | null> {
    return (
      this.db.select().from(campusRecruitRounds).where(eq(campusRecruitRounds.id, id)).get() ?? null
    );
  }

  async insertRound(record: RoundRecord): Promise<void> {
    this.db.insert(campusRecruitRounds).values(record).run();
  }

  async updateRound(id: string, changes: RoundChanges): Promise<RoundRecord> {
    const row = this.db
      .update(campusRecruitRounds)
      .set(changes)
      .where(eq(campusRecruitRounds.id, id))
      .returning()
      .get();
    if (row === undefined) throw new Error(`轮次不存在：${id}`);
    return row;
  }

  async resequenceRound(
    id: string,
    targetSequence: number,
    updatedAt: string,
  ): Promise<RoundRecord> {
    return this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(campusRecruitRounds)
        .where(eq(campusRecruitRounds.id, id))
        .get();
      if (current === undefined) throw new Error(`轮次不存在：${id}`);
      if (current.sequence === targetSequence) return current;

      const occupied = tx
        .select()
        .from(campusRecruitRounds)
        .where(
          and(
            eq(campusRecruitRounds.applicationId, current.applicationId),
            eq(campusRecruitRounds.sequence, targetSequence),
          ),
        )
        .get();

      if (occupied !== undefined) {
        const temporary =
          (tx
            .select({ value: max(campusRecruitRounds.sequence) })
            .from(campusRecruitRounds)
            .where(eq(campusRecruitRounds.applicationId, current.applicationId))
            .get()?.value ?? 0) + 1;
        tx.update(campusRecruitRounds)
          .set({ sequence: temporary, updatedAt })
          .where(eq(campusRecruitRounds.id, occupied.id))
          .run();
      }

      const moved = tx
        .update(campusRecruitRounds)
        .set({ sequence: targetSequence, updatedAt })
        .where(eq(campusRecruitRounds.id, current.id))
        .returning()
        .get()!;

      if (occupied !== undefined) {
        tx.update(campusRecruitRounds)
          .set({ sequence: current.sequence, updatedAt })
          .where(eq(campusRecruitRounds.id, occupied.id))
          .run();
      }
      return moved;
    });
  }

  async deleteRound(id: string): Promise<boolean> {
    return (
      this.db
        .delete(campusRecruitRounds)
        .where(eq(campusRecruitRounds.id, id))
        .returning({ id: campusRecruitRounds.id })
        .get() !== undefined
    );
  }

  async nextRoundSequence(applicationId: string): Promise<number> {
    const row = this.db
      .select({ value: max(campusRecruitRounds.sequence) })
      .from(campusRecruitRounds)
      .where(eq(campusRecruitRounds.applicationId, applicationId))
      .get();
    return (row?.value ?? 0) + 1;
  }

  async setDeadlineItemId(applicationId: string, itemId: string | null): Promise<void> {
    const row = this.db
      .update(campusRecruitApplications)
      .set({ deadlineItemId: itemId })
      .where(eq(campusRecruitApplications.id, applicationId))
      .returning({ id: campusRecruitApplications.id })
      .get();
    if (row === undefined) throw new Error(`投递不存在：${applicationId}`);
  }

  async setRoundItemId(roundId: string, itemId: string | null): Promise<void> {
    const row = this.db
      .update(campusRecruitRounds)
      .set({ itemId })
      .where(eq(campusRecruitRounds.id, roundId))
      .returning({ id: campusRecruitRounds.id })
      .get();
    if (row === undefined) throw new Error(`轮次不存在：${roundId}`);
  }
}
