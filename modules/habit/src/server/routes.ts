import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defineRoute } from '@workbench/http-kit';
import {
  HABIT_API,
  ID_PARAM,
  DATE_PARAM,
  checkinInputSchema,
  createHabitInputSchema,
  updateHabitInputSchema,
} from '../contract.js';
import type { HabitRepository } from './repository.js';
import {
  archiveHabit,
  createHabit,
  deleteCheckin,
  deleteHabit,
  getHabit,
  getHistory,
  listHabits,
  listToday,
  putCheckin,
  unarchiveHabit,
  updateHabit,
} from './service.js';

const floatingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD');
const idParams = z.object({ id: z.string().min(1) });
const checkinParams = z.object({ id: z.string().min(1), date: floatingDate });

/**
 * `date` / `clientToday` 是**必填**的。
 *
 * 服务端拿不到时区（`ModuleContext` 只有 `moduleId` + `items`），所以它不能
 * 在缺参时用 `new Date()` 兜底——那在跨时区时会静默算错一天。宁可 400。
 */
const todayQuery = z.object({ date: floatingDate });
const historyQuery = z.object({ from: floatingDate, to: floatingDate });
const clientTodayQuery = z.object({ clientToday: floatingDate });
const listQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/**
 * 习惯模块的路由。**没有 `ModuleContext` 参数**——它不碰 core 的 `items`。
 *
 * 校验与错误映射经 `defineRoute`（`@workbench/http-kit`，ADR-0024）统一完成。
 */
export function registerHabitRoutes(app: FastifyInstance, repo: HabitRepository): void {
  app.get(
    HABIT_API.today,
    defineRoute({ query: todayQuery }, ({ query }) => listToday(repo, query.date)),
  );

  app.get(
    HABIT_API.habits,
    defineRoute({ query: listQuery }, ({ query }) =>
      listHabits(repo, { includeArchived: query.includeArchived }),
    ),
  );

  app.post(
    HABIT_API.habits,
    defineRoute({ body: createHabitInputSchema, status: 201 }, ({ body }) =>
      createHabit(repo, body),
    ),
  );

  app.get(
    HABIT_API.habit(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) => getHabit(repo, params.id)),
  );

  app.patch(
    HABIT_API.habit(ID_PARAM),
    defineRoute({ params: idParams, body: updateHabitInputSchema }, ({ params, body }) =>
      updateHabit(repo, params.id, body),
    ),
  );

  app.delete(
    HABIT_API.habit(ID_PARAM),
    defineRoute({ params: idParams, status: 204 }, ({ params }) => deleteHabit(repo, params.id)),
  );

  // 归档 / 恢复是**无 body 的 POST**：浏览器 fetch 不带 content-type，Fastify 默认
  // 会回 415，而 app.inject() 复现不了这个形状。buildApp 已注册接受空 body 的
  // content type parser，守卫测试在客户端传输层（见 ui/api.test.ts）。
  app.post(
    HABIT_API.archive(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) => archiveHabit(repo, params.id)),
  );

  app.post(
    HABIT_API.unarchive(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) => unarchiveHabit(repo, params.id)),
  );

  app.get(
    HABIT_API.history(ID_PARAM),
    defineRoute({ params: idParams, query: historyQuery }, ({ params, query }) =>
      getHistory(repo, params.id, query.from, query.to),
    ),
  );

  app.put(
    HABIT_API.checkin(ID_PARAM, DATE_PARAM),
    defineRoute({ params: checkinParams, body: checkinInputSchema }, ({ params, body }) =>
      putCheckin(repo, params.id, params.date, body),
    ),
  );

  app.delete(
    HABIT_API.checkin(ID_PARAM, DATE_PARAM),
    defineRoute(
      { params: checkinParams, query: clientTodayQuery, status: 204 },
      ({ params, query }) => deleteCheckin(repo, params.id, params.date, query.clientToday),
    ),
  );
}
