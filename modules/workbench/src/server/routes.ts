import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { ID_PARAM, WORKBENCH_API, scheduleInputSchema } from '../contract.js';
import { listToday, listUnscheduled, scheduleItem, type ServiceOptions } from './service.js';

/** 用系统时区；跨时区支持见 spec §6.5 的已知限制。 */
function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerWorkbenchRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  app.get(WORKBENCH_API.today, async () => listToday(ctx, opts()));

  app.get(WORKBENCH_API.unscheduled, async () => listUnscheduled(ctx, opts()));

  app.patch(WORKBENCH_API.schedule(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少事项 id' });
    }

    const parsed = scheduleInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }

    // 刻意不校验 sourceModule：排程是跨模块能力（ADR-0012）。
    // 存在性检查仍要做，否则 update 会以 500 冒出去而不是 404。
    const existing = await ctx.items.getById(params.data.id);
    if (existing === null) {
      return reply.code(404).send({ error: `事项不存在：${params.data.id}` });
    }

    return scheduleItem(ctx, params.data.id, parsed.data, opts());
  });
}
