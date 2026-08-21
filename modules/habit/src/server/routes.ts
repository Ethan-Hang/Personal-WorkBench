import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  HABIT_API,
  ID_PARAM,
  DATE_PARAM,
  checkinInputSchema,
  createHabitInputSchema,
  updateHabitInputSchema,
} from '../contract.js';
import { toHttp } from './errors.js';
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

function badRequest(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.code(400).send({ error: error.issues[0]?.message ?? '请求不合法' });
}

/**
 * 习惯模块的路由。**没有 `ModuleContext` 参数**——它不碰 core 的 `items`。
 */
export function registerHabitRoutes(app: FastifyInstance, repo: HabitRepository): void {
  app.get(HABIT_API.today, async (request, reply) => {
    const query = todayQuery.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error);
    return toHttp(reply, () => listToday(repo, query.data.date));
  });

  app.get(HABIT_API.habits, async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error);
    return toHttp(reply, () => listHabits(repo, { includeArchived: query.data.includeArchived }));
  });

  app.post(HABIT_API.habits, async (request, reply) => {
    const input = createHabitInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, async () => reply.code(201).send(await createHabit(repo, input.data)));
  });

  app.get(HABIT_API.habit(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, () => getHabit(repo, params.data.id));
  });

  app.patch(HABIT_API.habit(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const input = updateHabitInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => updateHabit(repo, params.data.id, input.data));
  });

  app.delete(HABIT_API.habit(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, async () => {
      await deleteHabit(repo, params.data.id);
      return reply.code(204).send();
    });
  });

  // 归档 / 恢复是**无 body 的 POST**：浏览器 fetch 不带 content-type，Fastify 默认
  // 会回 415，而 app.inject() 复现不了这个形状。buildApp 已注册接受空 body 的
  // content type parser，守卫测试在客户端传输层（见 ui/api.test.ts）。
  app.post(HABIT_API.archive(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, () => archiveHabit(repo, params.data.id));
  });

  app.post(HABIT_API.unarchive(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    return toHttp(reply, () => unarchiveHabit(repo, params.data.id));
  });

  app.get(HABIT_API.history(ID_PARAM), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const query = historyQuery.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error);
    return toHttp(reply, () => getHistory(repo, params.data.id, query.data.from, query.data.to));
  });

  app.put(HABIT_API.checkin(ID_PARAM, DATE_PARAM), async (request, reply) => {
    const params = checkinParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const input = checkinInputSchema.safeParse(request.body);
    if (!input.success) return badRequest(reply, input.error);
    return toHttp(reply, () => putCheckin(repo, params.data.id, params.data.date, input.data));
  });

  app.delete(HABIT_API.checkin(ID_PARAM, DATE_PARAM), async (request, reply) => {
    const params = checkinParams.safeParse(request.params);
    if (!params.success) return badRequest(reply, params.error);
    const query = clientTodayQuery.safeParse(request.query);
    if (!query.success) return badRequest(reply, query.error);
    return toHttp(reply, async () => {
      await deleteCheckin(repo, params.data.id, params.data.date, query.data.clientToday);
      return reply.code(204).send();
    });
  });
}
