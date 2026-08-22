import { randomUUID } from 'node:crypto';
import {
  CHECKIN_BACKFILL_DAYS,
  HISTORY_MAX_DAYS,
  type CheckinInput,
  type CreateHabitInput,
  type HabitView,
  type TodayHabit,
  type UpdateHabitInput,
} from '../contract.js';
import { conflict, invalid, notFound } from './errors.js';
import { addDays, isDueOn, progressFor, streakOf, type FrequencyOf } from './frequency.js';
import type { CheckinRecord, HabitRecord, HabitRepository } from './repository.js';

/**
 * 习惯模块的编排层。
 *
 * **签名里没有 `ModuleContext`**：习惯不投影成 core Item，因此不需要
 * `ItemRepository`（ADR-0023）。它是第一个「有自有表、但零 core Item」的模块。
 */

function toView(record: HabitRecord): HabitView {
  return { ...record };
}

function frequencyOf(record: HabitRecord): FrequencyOf {
  return {
    freqKind: record.freqKind,
    weekdays: record.weekdays,
    weeklyCount: record.weeklyCount,
    startDate: record.startDate,
    targetValue: record.targetValue,
  };
}

/** streak 与完成率要看到 startDate 起的全部历史；用一个足够远的下界避免漏算。 */
function historyFloor(record: HabitRecord, today: string): string {
  const horizon = addDays(today, -HISTORY_MAX_DAYS);
  return record.startDate > horizon ? record.startDate : horizon;
}

async function requireHabit(repo: HabitRepository, id: string): Promise<HabitRecord> {
  const found = await repo.getHabit(id);
  if (!found) throw notFound('习惯不存在');
  return found;
}

/** 频率与其配套字段必须自洽。contract 的 Zod 已挡一层，这里挡住绕过 HTTP 的调用。 */
function assertFrequencyComplete(input: {
  freqKind: string;
  weekdays?: number[] | null;
  weeklyCount?: number | null;
}): void {
  if (input.freqKind === 'weekdays' && !input.weekdays?.length) {
    throw invalid('weekdays 频率必须给出至少一个周几');
  }
  if (input.freqKind === 'weekly-count' && input.weeklyCount == null) {
    throw invalid('weekly-count 频率必须给出每周次数');
  }
}

async function assertNameFree(
  repo: HabitRepository,
  name: string,
  exceptId?: string,
): Promise<void> {
  const existing = await repo.findHabitByName(name);
  if (existing && existing.id !== exceptId) throw conflict(`已有同名习惯「${name}」`);
}

export async function getHabit(repo: HabitRepository, id: string): Promise<HabitView> {
  return toView(await requireHabit(repo, id));
}

export async function listHabits(
  repo: HabitRepository,
  options: { includeArchived: boolean },
): Promise<{ habits: HabitView[] }> {
  const records = await repo.listHabits(options);
  return { habits: records.map(toView) };
}

/**
 * 今日视图。
 *
 * `date` 是**前端算出的本地今日**——服务端拿不到时区（`ModuleContext` 只有
 * `moduleId` + `items`），算不出「今天是几号」。
 */
export async function listToday(
  repo: HabitRepository,
  date: string,
): Promise<{ habits: TodayHabit[] }> {
  const records = await repo.listHabits({ includeArchived: false });
  if (records.length === 0) return { habits: [] };

  const floor = records.reduce(
    (earliest, record) => {
      const candidate = historyFloor(record, date);
      return candidate < earliest ? candidate : earliest;
    },
    historyFloor(records[0] as HabitRecord, date),
  );
  const grouped = await repo.listCheckinsFor(
    records.map((record) => record.id),
    floor,
    date,
  );

  return {
    habits: records.map((record) => {
      const checkins = grouped.get(record.id) ?? [];
      const frequency = frequencyOf(record);
      const todayCheckin = checkins.find((c) => c.date === date);
      return {
        habit: toView(record),
        dueToday: isDueOn(frequency, date),
        todayValue: todayCheckin?.value ?? 0,
        progress: progressFor(frequency, date, checkins),
        streak: streakOf(frequency, checkins, date),
      };
    }),
  };
}

export async function createHabit(
  repo: HabitRepository,
  input: CreateHabitInput,
): Promise<HabitView> {
  assertFrequencyComplete(input);
  await assertNameFree(repo, input.name);

  const created = await repo.createHabit({
    id: randomUUID(),
    name: input.name,
    notes: input.notes ?? null,
    targetValue: input.targetValue ?? 1,
    unit: input.unit ?? null,
    freqKind: input.freqKind,
    weekdays: input.weekdays ?? null,
    weeklyCount: input.weeklyCount ?? null,
    startDate: input.startDate,
    colorToken: input.colorToken ?? null,
    position: (await repo.maxPosition()) + 1,
  });
  return toView(created);
}

export async function updateHabit(
  repo: HabitRepository,
  id: string,
  input: UpdateHabitInput,
): Promise<HabitView> {
  const existing = await requireHabit(repo, id);
  if (input.freqKind) {
    assertFrequencyComplete({
      freqKind: input.freqKind,
      weekdays: input.weekdays ?? existing.weekdays,
      weeklyCount: input.weeklyCount ?? existing.weeklyCount,
    });
  }
  if (input.name !== undefined) await assertNameFree(repo, input.name, id);

  const updated = await repo.updateHabit(id, {
    ...input,
    notes: input.notes ?? undefined,
    unit: input.unit ?? undefined,
    weekdays: input.weekdays ?? undefined,
    weeklyCount: input.weeklyCount ?? undefined,
    colorToken: input.colorToken ?? undefined,
  });
  if (!updated) throw notFound('习惯不存在');
  return toView(updated);
}

/** 归档：不再出现在今日卡片，**历史打卡全部保留**，可重新启用。 */
export async function archiveHabit(repo: HabitRepository, id: string): Promise<HabitView> {
  await requireHabit(repo, id);
  const archived = await repo.archiveHabit(id, new Date().toISOString());
  if (!archived) throw notFound('习惯不存在');
  return toView(archived);
}

export async function unarchiveHabit(repo: HabitRepository, id: string): Promise<HabitView> {
  await requireHabit(repo, id);
  const restored = await repo.unarchiveHabit(id);
  if (!restored) throw notFound('习惯不存在');
  return toView(restored);
}

/** 彻底删除：连历史打卡一并清空，不可恢复。 */
export async function deleteHabit(repo: HabitRepository, id: string): Promise<void> {
  await requireHabit(repo, id);
  await repo.deleteHabit(id);
}

/**
 * 校验补卡窗口。
 *
 * `clientToday` 由前端提供——服务端只知道自己进程的时区，算不出用户的「今天」
 * （ADR-0023 §3）。窗口是**含今天在内的 7 天**，且不能预支未来、不能早于
 * 该习惯的 `startDate`。
 */
function assertWithinBackfillWindow(record: HabitRecord, date: string, clientToday: string): void {
  if (date > clientToday) throw invalid('不能给未来的日期打卡');
  const earliest = addDays(clientToday, -(CHECKIN_BACKFILL_DAYS - 1));
  if (date < earliest) throw invalid(`只能补最近 ${CHECKIN_BACKFILL_DAYS} 天的打卡`);
  if (date < record.startDate) throw invalid('该日期早于习惯的起始日');
}

export async function putCheckin(
  repo: HabitRepository,
  id: string,
  date: string,
  input: CheckinInput,
): Promise<CheckinRecord> {
  const habit = await requireHabit(repo, id);
  assertWithinBackfillWindow(habit, date, input.clientToday);
  return repo.upsertCheckin(id, date, input.value);
}

export async function deleteCheckin(
  repo: HabitRepository,
  id: string,
  date: string,
  clientToday: string,
): Promise<void> {
  const habit = await requireHabit(repo, id);
  assertWithinBackfillWindow(habit, date, clientToday);
  await repo.deleteCheckin(id, date);
}

/** 热力图取数，含两端。 */
export async function getHistory(
  repo: HabitRepository,
  id: string,
  from: string,
  to: string,
): Promise<{ habit: HabitView; checkins: CheckinRecord[] }> {
  const habit = await requireHabit(repo, id);
  if (from > to) throw invalid('起始日期不能晚于结束日期');
  if (addDays(from, HISTORY_MAX_DAYS - 1) < to) {
    throw invalid(`单次最多查询 ${HISTORY_MAX_DAYS} 天`);
  }
  return { habit: toView(habit), checkins: await repo.listCheckins(id, from, to) };
}
