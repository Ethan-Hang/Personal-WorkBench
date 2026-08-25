import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModuleContext } from '@workbench/core';
import { defineRoute } from '@workbench/http-kit';
import {
  CAMPUS_API,
  ID_PARAM,
  createApplicationInputSchema,
  createRoundInputSchema,
  createSeasonInputSchema,
  updateApplicationInputSchema,
  updateRoundInputSchema,
  updateSeasonInputSchema,
} from '../contract.js';
import type { CampusRecruitRepository } from './repository.js';
import {
  createApplication,
  createRound,
  createSeason,
  deleteApplication,
  deleteRound,
  deleteSeason,
  getStats,
  listApplications,
  listSeasons,
  markApplicationApplied,
  unmarkApplicationApplied,
  updateApplication,
  updateRound,
  updateSeason,
} from './service.js';

const idParams = z.object({ id: z.string().min(1) });
/** 招聘季筛选：省略即全部季（命令面板要跨季搜索） */
const seasonQuery = z.object({ seasonId: z.string().min(1).optional() });

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
  app.get(
    CAMPUS_API.applications,
    defineRoute({ query: seasonQuery }, ({ query }) =>
      listApplications(repo, { zone: resolveZone(), seasonId: query.seasonId }),
    ),
  );

  app.get(CAMPUS_API.seasons, async () => listSeasons(repo));

  app.post(
    CAMPUS_API.seasons,
    defineRoute({ body: createSeasonInputSchema, status: 201 }, ({ body }) =>
      createSeason(repo, body, { zone: resolveZone() }),
    ),
  );

  app.patch(
    CAMPUS_API.season(ID_PARAM),
    defineRoute({ params: idParams, body: updateSeasonInputSchema }, ({ params, body }) =>
      updateSeason(repo, params.id, body, { zone: resolveZone() }),
    ),
  );

  app.delete(
    CAMPUS_API.season(ID_PARAM),
    defineRoute({ params: idParams, status: 204 }, ({ params }) => deleteSeason(repo, params.id)),
  );

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

  app.post(
    CAMPUS_API.unapplyApplication(ID_PARAM),
    defineRoute({ params: idParams }, ({ params }) =>
      unmarkApplicationApplied(ctx, repo, params.id, { zone: resolveZone() }),
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

  app.get(
    CAMPUS_API.stats,
    defineRoute({ query: seasonQuery }, ({ query }) =>
      getStats(repo, { zone: resolveZone(), seasonId: query.seasonId }),
    ),
  );
}
