import { randomUUID } from 'node:crypto';
import { nowIso, truncateToMinute, type IsoInstant, type ModuleContext } from '@workbench/core';
import type {
  ApplicationView,
  CreateApplicationData,
  CreateRoundData,
  StatsResponse,
  UpdateApplicationInput,
  UpdateRoundInput,
} from '../contract.js';
import { deriveApplicationStatus } from './domain.js';
import { reconcileAllProjections, reconcileApplicationProjections } from './projections.js';
import type {
  ApplicationChanges,
  ApplicationRecord,
  CampusRecruitRepository,
  RoundChanges,
  RoundRecord,
} from './repository.js';
import { computeStats } from './stats.js';

export interface CampusServiceOptions {
  zone: string;
  now?: IsoInstant;
}

export class CampusNotFoundError extends Error {}

const PRIORITY_RANK = { S: 0, A: 1, B: 2, C: 3 } as const;

function resolveNow(opts: CampusServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

async function requireApplication(
  repo: CampusRecruitRepository,
  id: string,
): Promise<ApplicationRecord> {
  const application = await repo.getApplication(id);
  if (application === null) throw new CampusNotFoundError(`投递不存在：${id}`);
  return application;
}

async function requireRound(repo: CampusRecruitRepository, id: string): Promise<RoundRecord> {
  const round = await repo.getRound(id);
  if (round === null) throw new CampusNotFoundError(`轮次不存在：${id}`);
  return round;
}

async function applicationView(
  repo: CampusRecruitRepository,
  application: ApplicationRecord,
  now: IsoInstant,
): Promise<ApplicationView> {
  const rounds = (await repo.listRounds(application.id)).sort((a, b) => a.sequence - b.sequence);
  return {
    id: application.id,
    company: application.company,
    position: application.position,
    companyType: application.companyType,
    industry: application.industry,
    city: application.city,
    channel: application.channel,
    referral: application.referral,
    priority: application.priority,
    applyDeadlineDate: application.applyDeadlineDate,
    appliedAt: application.appliedAt,
    outcome: application.outcome,
    outcomeAt: application.outcomeAt,
    salary: application.salary,
    link: application.link,
    notes: application.notes,
    status: deriveApplicationStatus(application, rounds, now),
    rounds: rounds.map((round) => ({
      id: round.id,
      applicationId: round.applicationId,
      sequence: round.sequence,
      kind: round.kind,
      name: round.name,
      scheduledAt: round.scheduledAt,
      format: round.format,
      durationMin: round.durationMin,
      outcome: round.outcome,
      outcomeAt: round.outcomeAt,
      notes: round.notes,
      itemId: round.itemId,
    })),
    deadlineItemId: application.deadlineItemId,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

export async function listApplications(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<{ applications: ApplicationView[] }> {
  const now = resolveNow(opts);
  const applications = await Promise.all(
    (await repo.listApplications()).map((application) => applicationView(repo, application, now)),
  );
  applications.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.company.localeCompare(b.company),
  );
  return { applications };
}

export async function createApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  input: CreateApplicationData,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const now = resolveNow(opts);
  const appliedAt = input.outcome !== null && input.appliedAt === null ? now : input.appliedAt;
  const record: ApplicationRecord = {
    id: randomUUID(),
    company: input.company,
    position: input.position,
    companyType: input.companyType,
    industry: input.industry,
    city: input.city,
    channel: input.channel,
    referral: input.referral,
    priority: input.priority,
    applyDeadlineDate: input.applyDeadlineDate,
    appliedAt,
    outcome: input.outcome,
    outcomeAt: input.outcome === null ? null : now,
    salary: input.salary,
    link: input.link,
    notes: input.notes,
    deadlineItemId: null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertApplication(record);
  await reconcileApplicationProjections(ctx, repo, record.id, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, record.id), now);
}

export async function updateApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  input: UpdateApplicationInput,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const existing = await requireApplication(repo, id);
  const now = resolveNow(opts);
  const changes: ApplicationChanges = { updatedAt: now };
  if (input.company !== undefined) changes.company = input.company;
  if (input.position !== undefined) changes.position = input.position;
  if (input.companyType !== undefined) changes.companyType = input.companyType;
  if (input.industry !== undefined) changes.industry = input.industry;
  if (input.city !== undefined) changes.city = input.city;
  if (input.channel !== undefined) changes.channel = input.channel;
  if (input.referral !== undefined) changes.referral = input.referral;
  if (input.priority !== undefined) changes.priority = input.priority;
  if (input.applyDeadlineDate !== undefined) {
    changes.applyDeadlineDate = input.applyDeadlineDate;
  }
  if (input.appliedAt !== undefined) changes.appliedAt = input.appliedAt;
  if (input.salary !== undefined) changes.salary = input.salary;
  if (input.link !== undefined) changes.link = input.link;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.outcome !== undefined) {
    changes.outcome = input.outcome;
    if (input.outcome === null) changes.outcomeAt = null;
    else if (input.outcome !== existing.outcome) changes.outcomeAt = now;
  }
  const resultingOutcome = input.outcome === undefined ? existing.outcome : input.outcome;
  const resultingAppliedAt = input.appliedAt === undefined ? existing.appliedAt : input.appliedAt;
  if (resultingAppliedAt === null) {
    const hasProgress = resultingOutcome !== null || (await repo.listRounds(id)).length > 0;
    if (hasProgress) changes.appliedAt = now;
  }
  await repo.updateApplication(id, changes);
  await reconcileApplicationProjections(ctx, repo, id, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, id), now);
}

export async function markApplicationApplied(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const application = await requireApplication(repo, id);
  const now = resolveNow(opts);
  if (application.appliedAt === null) {
    await repo.updateApplication(id, { appliedAt: now, updatedAt: now });
  }
  await reconcileApplicationProjections(ctx, repo, id, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, id), now);
}

export async function deleteApplication(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<void> {
  const application = await requireApplication(repo, id);
  const rounds = await repo.listRounds(id);
  for (const itemId of [application.deadlineItemId, ...rounds.map((round) => round.itemId)]) {
    if (itemId !== null) await ctx.items.delete(ctx.moduleId, itemId);
  }
  await repo.deleteApplication(id);
  await reconcileAllProjections(ctx, repo, resolveNow(opts), opts.zone);
}

export async function createRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  applicationId: string,
  input: CreateRoundData,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const application = await requireApplication(repo, applicationId);
  const now = resolveNow(opts);
  if (application.appliedAt === null) {
    await repo.updateApplication(applicationId, { appliedAt: now, updatedAt: now });
  }
  const record: RoundRecord = {
    id: randomUUID(),
    applicationId,
    sequence: await repo.nextRoundSequence(applicationId),
    kind: input.kind,
    name: input.name,
    // 排程颗粒度全局为分钟（ADR-0012），写入前就截零，
    // 而不是只在投影时截——否则库里存的与日历上显示的不是同一个时刻
    scheduledAt: input.scheduledAt === null ? null : truncateToMinute(input.scheduledAt),
    format: input.format,
    durationMin: input.durationMin,
    outcome: input.outcome,
    outcomeAt: input.outcome === 'pending' ? null : now,
    notes: input.notes,
    itemId: null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertRound(record);
  await reconcileApplicationProjections(ctx, repo, applicationId, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, applicationId), now);
}

export async function updateRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  input: UpdateRoundInput,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const existing = await requireRound(repo, id);
  const now = resolveNow(opts);
  if (input.sequence !== undefined && input.sequence !== existing.sequence) {
    await repo.resequenceRound(id, input.sequence, now);
  }
  const changes: RoundChanges = { updatedAt: now };
  if (input.kind !== undefined) changes.kind = input.kind;
  if (input.name !== undefined) changes.name = input.name;
  if (input.scheduledAt !== undefined) {
    changes.scheduledAt = input.scheduledAt === null ? null : truncateToMinute(input.scheduledAt);
  }
  if (input.format !== undefined) changes.format = input.format;
  if (input.durationMin !== undefined) changes.durationMin = input.durationMin;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.outcome !== undefined) {
    changes.outcome = input.outcome;
    if (input.outcome !== existing.outcome) {
      changes.outcomeAt = input.outcome === 'pending' ? null : now;
    }
  }
  await repo.updateRound(id, changes);
  await reconcileApplicationProjections(ctx, repo, existing.applicationId, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, existing.applicationId), now);
}

export async function deleteRound(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const round = await requireRound(repo, id);
  const now = resolveNow(opts);
  if (round.itemId !== null) await ctx.items.delete(ctx.moduleId, round.itemId);
  await repo.deleteRound(id);
  await reconcileApplicationProjections(ctx, repo, round.applicationId, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, round.applicationId), now);
}

export async function getStats(
  repo: CampusRecruitRepository,
  opts: CampusServiceOptions,
): Promise<StatsResponse> {
  const [applications, rounds] = await Promise.all([repo.listApplications(), repo.listRounds()]);
  return computeStats(applications, rounds, resolveNow(opts));
}
