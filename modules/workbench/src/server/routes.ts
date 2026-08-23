import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { defineRoute, notFound } from '@workbench/http-kit';
import { ID_PARAM, WORKBENCH_API, calendarQuerySchema, scheduleInputSchema } from '../contract.js';
import {
  listCalendar,
  listToday,
  listUnscheduled,
  scheduleItem,
  type ServiceOptions,
} from './service.js';

/** 用系统时区；跨时区支持见 spec §6.5 的已知限制。 */
function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** 消息显式给出，是为了让 400 的响应体与收敛前逐字一致。 */
const idParamsSchema = z.object({ id: z.string().min(1, '缺少事项 id') });

export function registerWorkbenchRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  app.get(WORKBENCH_API.today, async () => listToday(ctx, opts()));

  app.get(WORKBENCH_API.unscheduled, async () => listUnscheduled(ctx, opts()));

  app.get(
    WORKBENCH_API.calendar,
    defineRoute({ query: calendarQuerySchema }, ({ query }) => listCalendar(ctx, query, opts())),
  );

  app.patch(
    WORKBENCH_API.schedule(ID_PARAM),
    defineRoute({ params: idParamsSchema, body: scheduleInputSchema }, async ({ params, body }) => {
      // 刻意不校验 sourceModule：排程是跨模块能力（ADR-0012）。
      // 存在性检查仍要做，否则 update 会以 500 冒出去而不是 404。
      const existing = await ctx.items.getById(params.id);
      if (existing === null) throw notFound(`事项不存在：${params.id}`);

      return scheduleItem(ctx, params.id, body, opts());
    }),
  );
}
