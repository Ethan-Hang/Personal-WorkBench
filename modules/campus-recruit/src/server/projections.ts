import {
  endOfLocalDayUtc,
  type CreateItemInput,
  type Importance,
  type Item,
  type ItemKind,
  type ItemStatus,
  type ModuleContext,
  type ScheduledTime,
} from '@workbench/core';
import { priorityToImportance } from './domain.js';
import type { ApplicationRecord, CampusRecruitRepository, RoundRecord } from './repository.js';

interface DesiredProjection {
  kind: ItemKind;
  title: string;
  importance: Importance;
  dueAt: string | null;
  scheduled: ScheduledTime | null;
  status: ItemStatus;
  completedAt: string | null;
}

async function ownedItem(ctx: ModuleContext, id: string | null): Promise<Item | null> {
  if (id === null) return null;
  const item = await ctx.items.getById(id);
  return item?.sourceModule === ctx.moduleId ? item : null;
}

function sameScheduled(left: ScheduledTime | null, right: ScheduledTime | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'all-day' && right.kind === 'all-day') return left.date === right.date;
  if (left.kind === 'timed' && right.kind === 'timed') {
    return left.start === right.start && left.end === right.end;
  }
  return false;
}

function projectionMatches(item: Item, desired: DesiredProjection): boolean {
  return (
    item.title === desired.title &&
    item.importance === desired.importance &&
    item.dueAt === desired.dueAt &&
    sameScheduled(item.scheduled, desired.scheduled) &&
    item.status === desired.status &&
    item.completedAt === desired.completedAt
  );
}

async function reconcileItem(
  ctx: ModuleContext,
  storedId: string | null,
  desired: DesiredProjection | null,
  setStoredId: (id: string | null) => Promise<void>,
): Promise<void> {
  const current = await ownedItem(ctx, storedId);

  if (desired === null) {
    if (current !== null) await ctx.items.delete(ctx.moduleId, current.id);
    if (storedId !== null) await setStoredId(null);
    return;
  }

  if (current === null || current.kind !== desired.kind) {
    const replacedOwnedItem = current;
    const createInput: CreateItemInput = {
      kind: desired.kind,
      title: desired.title,
      importance: desired.importance,
      dueAt: desired.dueAt,
      scheduled: desired.scheduled,
      status: desired.status,
    };
    const created = await ctx.items.create(ctx.moduleId, createInput);
    if (desired.completedAt !== null) {
      await ctx.items.update(created.id, { completedAt: desired.completedAt });
    }
    await setStoredId(created.id);
    if (replacedOwnedItem !== null) {
      await ctx.items.delete(ctx.moduleId, replacedOwnedItem.id);
    }
    return;
  }

  if (!projectionMatches(current, desired)) {
    await ctx.items.update(current.id, {
      title: desired.title,
      importance: desired.importance,
      dueAt: desired.dueAt,
      scheduled: desired.scheduled,
      status: desired.status,
      completedAt: desired.completedAt,
    });
  }
}

function deadlineProjection(
  application: ApplicationRecord,
  zone: string,
): DesiredProjection | null {
  if (
    application.applyDeadlineDate === null ||
    (application.appliedAt !== null && application.deadlineItemId === null)
  ) {
    return null;
  }
  return {
    kind: 'task',
    title: `投递 ${application.company} ${application.position}`,
    importance: priorityToImportance(application.priority),
    dueAt: endOfLocalDayUtc(application.applyDeadlineDate, zone),
    scheduled: { kind: 'all-day', date: application.applyDeadlineDate },
    status: application.appliedAt === null ? 'todo' : 'done',
    completedAt: application.appliedAt,
  };
}

function roundStatus(
  application: ApplicationRecord,
  rounds: RoundRecord[],
  round: RoundRecord & { scheduledAt: string },
  now: string,
): ItemStatus {
  if (round.outcome === 'passed' || round.outcome === 'failed') return 'done';
  const isFuture = Date.parse(round.scheduledAt) > Date.parse(now);
  const failedBefore = rounds.some(
    (candidate) => candidate.outcome === 'failed' && candidate.sequence < round.sequence,
  );
  if (
    isFuture &&
    (application.outcome === 'rejected' || application.outcome === 'declined' || failedBefore)
  ) {
    return 'cancelled';
  }
  return 'todo';
}

function roundProjection(
  application: ApplicationRecord,
  rounds: RoundRecord[],
  round: RoundRecord,
  now: string,
): DesiredProjection | null {
  if (round.scheduledAt === null) return null;
  const scheduledRound = { ...round, scheduledAt: round.scheduledAt };
  const end =
    round.durationMin === null
      ? undefined
      : new Date(Date.parse(round.scheduledAt) + round.durationMin * 60_000).toISOString();
  const scheduled =
    end === undefined
      ? { kind: 'timed' as const, start: round.scheduledAt }
      : { kind: 'timed' as const, start: round.scheduledAt, end };
  const isComplete = round.outcome === 'passed' || round.outcome === 'failed';
  return {
    kind: 'event',
    title: `${application.company} ${round.name}`,
    importance: priorityToImportance(application.priority),
    dueAt: null,
    scheduled,
    status: roundStatus(application, rounds, scheduledRound, now),
    completedAt: isComplete ? (round.outcomeAt ?? now) : null,
  };
}

export async function reconcileApplicationProjections(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  applicationId: string,
  now: string,
  zone: string,
): Promise<void> {
  const application = await repo.getApplication(applicationId);
  if (application === null) return;
  const rounds = await repo.listRounds(applicationId);

  await reconcileItem(
    ctx,
    application.deadlineItemId,
    deadlineProjection(application, zone),
    (itemId) => repo.setDeadlineItemId(application.id, itemId),
  );

  for (const round of rounds) {
    await reconcileItem(
      ctx,
      round.itemId,
      roundProjection(application, rounds, round, now),
      (itemId) => repo.setRoundItemId(round.id, itemId),
    );
  }
}

export async function reconcileAllProjections(
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
  now: string,
  zone: string,
): Promise<void> {
  const applications = await repo.listApplications();
  for (const application of applications) {
    await reconcileApplicationProjections(ctx, repo, application.id, now, zone);
  }

  const refreshedApplications = await repo.listApplications();
  const refreshedRounds = await repo.listRounds();
  const referencedIds = new Set<string>();
  for (const application of refreshedApplications) {
    if (application.deadlineItemId !== null) referencedIds.add(application.deadlineItemId);
  }
  for (const round of refreshedRounds) {
    if (round.itemId !== null) referencedIds.add(round.itemId);
  }

  const owned = await ctx.items.list({ sourceModules: [ctx.moduleId] });
  for (const item of owned) {
    if (!referencedIds.has(item.id)) {
      await ctx.items.delete(ctx.moduleId, item.id);
    }
  }
}
