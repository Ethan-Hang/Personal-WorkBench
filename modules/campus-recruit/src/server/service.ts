import { randomUUID } from 'node:crypto';
import { nowIso, truncateToMinute, type IsoInstant, type ModuleContext } from '@workbench/core';
import { conflict, notFound } from '@workbench/http-kit';
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

const PRIORITY_RANK = { S: 0, A: 1, B: 2, C: 3 } as const;

/** 标记已投递时自动补的那一轮的名字。撤回投递靠它认出「这轮不是用户建的」。 */
const AUTO_SCREENING_ROUND_NAME = '简历初筛';

function resolveNow(opts: CampusServiceOptions): IsoInstant {
  return opts.now ?? nowIso();
}

async function requireApplication(
  repo: CampusRecruitRepository,
  id: string,
): Promise<ApplicationRecord> {
  const application = await repo.getApplication(id);
  if (application === null) throw notFound(`投递不存在：${id}`);
  return application;
}

async function requireRound(repo: CampusRecruitRepository, id: string): Promise<RoundRecord> {
  const round = await repo.getRound(id);
  if (round === null) throw notFound(`轮次不存在：${id}`);
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
    applyEmail: application.applyEmail,
    applyPhone: application.applyPhone,
    priority: application.priority,
    applyDeadlineDate: application.applyDeadlineDate,
    appliedAt: application.appliedAt,
    outcome: application.outcome,
    outcomeAt: application.outcomeAt,
    shelvedAt: application.shelvedAt,
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
    applyEmail: input.applyEmail,
    applyPhone: input.applyPhone,
    priority: input.priority,
    applyDeadlineDate: input.applyDeadlineDate,
    appliedAt,
    outcome: input.outcome,
    outcomeAt: input.outcome === null ? null : now,
    shelvedAt: null,
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
  if (input.applyEmail !== undefined) changes.applyEmail = input.applyEmail;
  if (input.applyPhone !== undefined) changes.applyPhone = input.applyPhone;
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
  if (input.shelved !== undefined) {
    // 已经泡着的再标一次不刷新时刻——「从哪天开始没消息」才是有用的那个信息
    changes.shelvedAt = input.shelved ? (existing.shelvedAt ?? now) : null;
  }
  const resultingOutcome = input.outcome === undefined ? existing.outcome : input.outcome;
  const resultingShelved =
    input.shelved === undefined ? existing.shelvedAt !== null : input.shelved;
  const resultingAppliedAt = input.appliedAt === undefined ? existing.appliedAt : input.appliedAt;
  if (resultingAppliedAt === null) {
    const hasProgress =
      resultingOutcome !== null || resultingShelved || (await repo.listRounds(id)).length > 0;
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
    // 投递流程的第一步恒为简历初筛，补一轮省得每次手工建。
    // 两个条件都是幂等护栏：只在「这次真的从待投递变已投递」且一轮都还没有时补，
    // 重复点或已手工建过轮次的都不会凭空多出一轮。
    // scheduledAt 为 null，因此不产生 core Item——日历与今日不受影响。
    if ((await repo.listRounds(id)).length === 0) {
      await repo.insertRound({
        id: randomUUID(),
        applicationId: id,
        sequence: await repo.nextRoundSequence(id),
        kind: 'screening',
        name: AUTO_SCREENING_ROUND_NAME,
        scheduledAt: null,
        format: null,
        durationMin: null,
        outcome: 'pending',
        outcomeAt: null,
        notes: null,
        itemId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  await reconcileApplicationProjections(ctx, repo, id, now, opts.zone);
  return applicationView(repo, await requireApplication(repo, id), now);
}

/**
 * 「标记已投递」自动补出来的那一轮长什么样——三处签名缺一不可：
 * 简历初筛、没排时间、还没有结果，且没被写过备注。
 *
 * 撤回投递时只删掉这一种轮次。判据刻意收得很紧：手工建过的轮次哪怕只写了句备注，
 * 也宁可让撤回失败去提示先删轮次，也不悄悄吞掉用户录进去的信息。
 */
function isAutoScreeningRound(round: RoundRecord): boolean {
  return (
    round.kind === 'screening' &&
    round.name === AUTO_SCREENING_ROUND_NAME &&
    round.scheduledAt === null &&
    round.outcome === 'pending' &&
    round.outcomeAt === null &&
    round.notes === null
  );
}

/**
 * 撤回投递：把状态退回「待投递」。
 *
 * 存在的理由只有一个——「标记已投递」是个一键动作，很容易误点，而在此之前
 * 唯一的退路是手改 `appliedAt`，且 `updateApplication` 的兜底会因为「有轮次」
 * 把它立刻改回来（那条兜底是为了别让有进展的投递停在待投递，对撤回是反效果）。
 *
 * 只在真正干净的情况下放行，其余一律 409 并说明先做什么：
 * - 有终局结果（offer / OC / 已挂 / 我拒了）→ 先把终局结果清成「流程中 / 未定」；
 * - 有自动补的简历初筛之外的轮次 → 先删掉那些轮次。
 *
 * 「泡池子」会被一并清掉：没投出去就无所谓泡不泡，留着只会让状态自相矛盾。
 */
export async function unmarkApplicationApplied(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  id: string,
  opts: CampusServiceOptions,
): Promise<ApplicationView> {
  const application = await requireApplication(repo, id);
  const now = resolveNow(opts);
  // 幂等：本来就是待投递，什么都不做（重复点、或两个标签页各点一次）
  if (application.appliedAt === null) return applicationView(repo, application, now);

  if (application.outcome !== null) {
    throw conflict('这条投递已有终局结果，撤回前请先把「终局结果」改回「流程中 / 未定」');
  }
  const rounds = await repo.listRounds(id);
  if (rounds.some((round) => !isAutoScreeningRound(round))) {
    throw conflict('这条投递已经记了面试轮次，撤回前请先删除这些轮次');
  }
  for (const round of rounds) {
    if (round.itemId !== null) await ctx.items.delete(ctx.moduleId, round.itemId);
    await repo.deleteRound(round.id);
  }
  await repo.updateApplication(id, { appliedAt: null, shelvedAt: null, updatedAt: now });
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
