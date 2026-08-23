import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { defineRoute } from '@workbench/http-kit';
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

const idParams = z.object({ id: z.string().min(1) });

function resolveZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * 秋招模块的路由。
 *
 * 此前本文件自成一套错误处理：service 侧一个 `CampusNotFoundError`，route 侧两个内联的
 * `invalid()` / `notFound()` helper，外加每个 handler 各写一遍 try/catch——与 todo /
 * habit / notes 那份 `errors.ts` 形状完全不同，于是「模块模板」有了两种长相。
 * 现已统一到 `@workbench/http-kit`（ADR-0024）：领域错误经 `DomainError` 表达，
 * `defineRoute` 吃掉 safeParse → 400 → try/catch 这套样板，本文件退化成
 * 「路径 ↔ service」的对照表。
 */
export function registerCampusRecruitRoutes(
  app: FastifyInstance,
  ctx: ModuleContext,
  repo: CampusRecruitRepository,
): void {
  app.get(CAMPUS_API.applications, async () => listApplications(repo, { zone: resolveZone() }));

  app.post(
    CAMPUS_API.applications,
    defineRoute({ body: createApplicationInputSchema, status: 201 }, ({ body }) =>
      createApplication(ctx, repo, body, { zone: resolveZone() }),
    ),
  );

  app.patch(
    CAMPUS_API.application(ID_PARAM),
    defineRoute({ params: idParams, body: updateApplicationInputSchema }, ({ params, body }) =>
      updateApplication(ctx, repo, params.id, body, { zone: resolveZone() }),
    ),
  );

  app.post(
    CAMPUS_API.applyApplication(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) =>
      markApplicationApplied(ctx, repo, params.id, { zone: resolveZone() }),
    ),
  );

  app.delete(
    CAMPUS_API.application(ID_PARAM),
    defineRoute({ params: idParams, status: 204 }, ({ params }) =>
      deleteApplication(ctx, repo, params.id, { zone: resolveZone() }),
    ),
  );

  app.post(
    CAMPUS_API.applicationRounds(ID_PARAM),
    defineRoute(
      { params: idParams, body: createRoundInputSchema, status: 201 },
      ({ params, body }) => createRound(ctx, repo, params.id, body, { zone: resolveZone() }),
    ),
  );

  app.patch(
    CAMPUS_API.round(ID_PARAM),
    defineRoute({ params: idParams, body: updateRoundInputSchema }, ({ params, body }) =>
      updateRound(ctx, repo, params.id, body, { zone: resolveZone() }),
    ),
  );

  app.delete(
    CAMPUS_API.round(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) =>
      deleteRound(ctx, repo, params.id, { zone: resolveZone() }),
    ),
  );

  app.get(CAMPUS_API.stats, async () => getStats(repo, { zone: resolveZone() }));
}
