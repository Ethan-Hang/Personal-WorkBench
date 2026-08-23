import {
  HABIT_API,
  checkinSchema,
  habitsResponseSchema,
  habitViewSchema,
  historyResponseSchema,
  todayResponseSchema,
  type CheckinInput,
  type CreateHabitInput,
  type HabitView,
  type UpdateHabitInput,
} from '../contract.js';
import { apiRequest as request } from '@workbench/ui';
import type { z } from 'zod';

export type {
  CheckinInput,
  CreateHabitInput,
  FreqKind,
  HabitView,
  TodayHabit,
  UpdateHabitInput,
} from '../contract.js';

export type Checkin = z.infer<typeof checkinSchema>;
export type TodayResponse = z.infer<typeof todayResponseSchema>;
export type HabitsResponse = z.infer<typeof habitsResponseSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

/**
 * 获取今日习惯视图（包含每个启用中习惯的 dueToday / progress / streak）。
 *
 * `date` 是前端算出的本地日期 `YYYY-MM-DD`（服务端不知道用户时区）。
 */
export async function fetchToday(date: string): Promise<TodayResponse> {
  return todayResponseSchema.parse(
    await request(`${HABIT_API.today}?date=${encodeURIComponent(date)}`),
  );
}

/**
 * 获取习惯管理列表。
 */
export async function fetchHabits(options?: {
  includeArchived?: boolean;
}): Promise<HabitsResponse> {
  const url =
    options?.includeArchived !== undefined
      ? `${HABIT_API.habits}?includeArchived=${options.includeArchived}`
      : HABIT_API.habits;
  return habitsResponseSchema.parse(await request(url));
}

/**
 * 获取单个习惯详情。
 */
export async function fetchHabit(id: string): Promise<HabitView> {
  return habitViewSchema.parse(await request(HABIT_API.habit(id)));
}

/**
 * 创建新习惯。
 */
export async function postHabit(input: CreateHabitInput): Promise<HabitView> {
  return habitViewSchema.parse(
    await request(HABIT_API.habits, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 编辑习惯（更新基础信息、频率或排序）。
 */
export async function patchHabit(id: string, input: UpdateHabitInput): Promise<HabitView> {
  return habitViewSchema.parse(
    await request(HABIT_API.habit(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 归档习惯（无 body 的 POST）。
 *
 * 历史打卡保留，不再出现在今日视图，可重新启用。
 */
export async function postArchive(id: string): Promise<HabitView> {
  return habitViewSchema.parse(await request(HABIT_API.archive(id), { method: 'POST' }));
}

/**
 * 恢复归档的习惯（无 body 的 POST）。
 */
export async function postUnarchive(id: string): Promise<HabitView> {
  return habitViewSchema.parse(await request(HABIT_API.unarchive(id), { method: 'POST' }));
}

/**
 * 彻底删除习惯及其所有历史打卡记录。
 */
export async function deleteHabit(id: string): Promise<void> {
  await request(HABIT_API.habit(id), { method: 'DELETE' });
}

/**
 * 获取习惯历史打卡数据（热力图，含两端，上限 366 天）。
 */
export async function fetchHistory(id: string, from: string, to: string): Promise<HistoryResponse> {
  return historyResponseSchema.parse(
    await request(
      `${HABIT_API.history(id)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  );
}

/**
 * 习惯打卡 / 更新打卡数值（幂等 upsert）。
 */
export async function putCheckin(id: string, date: string, input: CheckinInput): Promise<Checkin> {
  return checkinSchema.parse(
    await request(HABIT_API.checkin(id, date), {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  );
}

/**
 * 取消某天的打卡记录。
 *
 * `clientToday` 用于服务端校验 7 天补卡窗口。
 */
export async function deleteCheckin(id: string, date: string, clientToday: string): Promise<void> {
  await request(`${HABIT_API.checkin(id, date)}?clientToday=${encodeURIComponent(clientToday)}`, {
    method: 'DELETE',
  });
}
