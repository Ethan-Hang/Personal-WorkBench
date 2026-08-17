import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { createTaskInputSchema } from '../contract.js';
import { completeTask, createTask, listToday, type ServiceOptions } from './service.js';

/** 迭代 1 用系统时区；跨时区支持见 spec §6.5 的已知限制。 */
function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const idParamsSchema = z.object({ id: z.string().min(1) });

export function registerTodoRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const opts = (): ServiceOptions => ({ zone: resolveZone() });

  app.get('/api/todo/today', async () => listToday(ctx, opts()));

  app.post('/api/todo/tasks', async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? '请求不合法' });
    }
    const task = await createTask(ctx, parsed.data, opts());
    return reply.code(201).send(task);
  });

  app.post('/api/todo/tasks/:id/complete', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: '缺少任务 id' });
    }

    const existing = await ctx.items.getById(params.data.id);
    if (existing === null || existing.sourceModule !== ctx.moduleId) {
      return reply.code(404).send({ error: `任务不存在：${params.data.id}` });
    }

    return completeTask(ctx, params.data.id, opts());
  });
}
