import type Database from 'better-sqlite3';
import { and, asc, eq, max } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  ApplicationChanges,
  ApplicationRecord,
  CampusRecruitRepository,
  RoundChanges,
  RoundRecord,
} from '../server/repository.js';
import * as schema from './schema.js';
import { campusRecruitApplications, campusRecruitRounds } from './schema.js';

export class SqliteCampusRecruitRepository implements CampusRecruitRepository {
  private readonly db: BetterSQLite3Database<typeof schema>;

  constructor(sqlite: Database.Database) {
    this.db = drizzle(sqlite, { schema });
  }

  async listApplications(): Promise<ApplicationRecord[]> {
    return this.db
      .select()
      .from(campusRecruitApplications)
      .orderBy(asc(campusRecruitApplications.createdAt), asc(campusRecruitApplications.id))
      .all();
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    return (
      this.db
        .select()
        .from(campusRecruitApplications)
        .where(eq(campusRecruitApplications.id, id))
        .get() ?? null
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
    return row;
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
