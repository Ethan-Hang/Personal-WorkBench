import type { FastifyInstance } from 'fastify';
import { nowIso, type ModuleContext, type ServerModuleDefinition } from '@workbench/core';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { reconcileAllProjections } from './projections.js';
import type { CampusRecruitRepository } from './repository.js';
import { registerCampusRecruitRoutes } from './routes.js';

export function createCampusRecruitServerModule(
  repository: CampusRecruitRepository,
): ServerModuleDefinition {
  return {
    id: CAMPUS_RECRUIT_MODULE_ID,
    migrations: [{ folder: 'modules/campus-recruit/migrations' }],
    async registerRoutes(app: unknown, ctx: ModuleContext) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await reconcileAllProjections(ctx, repository, nowIso(), zone);
      registerCampusRecruitRoutes(app as FastifyInstance, ctx, repository);
    },
  };
}

export type { CampusRecruitRepository } from './repository.js';
