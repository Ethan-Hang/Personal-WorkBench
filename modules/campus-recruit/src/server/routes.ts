import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import {
  CAMPUS_API,
  ID_PARAM,
  createApplicationInputSchema,
  createRoundInputSchema,
  updateApplicationInputSchema,
  updateRoundInputSchema,
} from '../contract.js';
import type { CampusRecruitRepository } from './repository.js';
import {
  CampusNotFoundError,
  createApplication,
  createRound,
  deleteApplication,
  deleteRound,
  getStats,
  listApplications,
  markApplicationApplied,
  updateApplication,
  updateRound,
} from './service.js';

const idParamsSchema = z.object({ id: z.string().min(1) });

function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function invalid(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.code(400).send({ error: error.issues[0]?.message ?? '请求不合法' });
}

function notFound(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof CampusNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  throw error;
}

export function registerCampusRecruitRoutes(
  app: FastifyInstance,
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
): void {
  app.get(CAMPUS_API.applications, async () => listApplications(repo, { zone: resolveZone() }));

  app.post(CAMPUS_API.applications, async (request, reply) => {
    const input = createApplicationInputSchema.safeParse(request.body);
    if (!input.success) return invalid(reply, input.error);
    return reply
      .code(201)
      .send(await createApplication(ctx, repo, input.data, { zone: resolveZone() }));
  });

  app.patch(CAMPUS_API.application(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    const input = updateApplicationInputSchema.safeParse(request.body);
    if (!input.success) return invalid(reply, input.error);
    try {
      return await updateApplication(ctx, repo, params.data.id, input.data, {
        zone: resolveZone(),
      });
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.post(CAMPUS_API.applyApplication(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await markApplicationApplied(ctx, repo, params.data.id, { zone: resolveZone() });
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.delete(CAMPUS_API.application(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      await deleteApplication(ctx, repo, params.data.id, { zone: resolveZone() });
      return reply.code(204).send();
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.post(CAMPUS_API.applicationRounds(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    const input = createRoundInputSchema.safeParse(request.body);
    if (!input.success) return invalid(reply, input.error);
    try {
      return reply
        .code(201)
        .send(await createRound(ctx, repo, params.data.id, input.data, { zone: resolveZone() }));
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.patch(CAMPUS_API.round(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    const input = updateRoundInputSchema.safeParse(request.body);
    if (!input.success) return invalid(reply, input.error);
    try {
      return await updateRound(ctx, repo, params.data.id, input.data, { zone: resolveZone() });
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.delete(CAMPUS_API.round(ID_PARAM), async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, params.error);
    try {
      return await deleteRound(ctx, repo, params.data.id, { zone: resolveZone() });
    } catch (error) {
      return notFound(reply, error);
    }
  });

  app.get(CAMPUS_API.stats, async () => getStats(repo, { zone: resolveZone() }));
}
