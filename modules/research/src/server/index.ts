import type { FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { RESEARCH_MODULE_ID } from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import { createMetadataCoordinator } from '../metadata/index.js';
import { systemPdfFilePicker, type PdfFilePicker } from './file-picker.js';
import type { ManagedRootController, ResearchRepository } from './repository.js';
import { registerResearchRoutes } from './routes.js';
import { ResearchService } from './service.js';

export interface ResearchServerModuleOptions {
  repository: ResearchRepository;
  managedRoot: () => string;
  managedRootController?: ManagedRootController;
  contentStore?: ResearchContentStore;
  metadata?: ReturnType<typeof createMetadataCoordinator>;
  filePicker?: PdfFilePicker;
  clock?: () => Date;
  createId?: () => string;
}

export function createResearchServerModule(
  options: ResearchServerModuleOptions,
): ServerModuleDefinition {
  const managedRoot = options.managedRootController
    ? () => options.managedRootController!.current()
    : options.managedRoot;
  const contentStore = options.contentStore ?? new ResearchContentStore(managedRoot);
  const metadata =
    options.metadata ??
    createMetadataCoordinator({
      repository: options.repository,
      ...(options.clock ? { now: options.clock } : {}),
      ...(options.createId ? { createId: options.createId } : {}),
    });
  const service = new ResearchService({
    repository: options.repository,
    contentStore,
    metadata,
    filePicker: options.filePicker ?? systemPdfFilePicker,
    ...(options.managedRootController
      ? { managedRootController: options.managedRootController }
      : {}),
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.createId ? { createId: options.createId } : {}),
  });

  return {
    id: RESEARCH_MODULE_ID,
    migrations: [{ folder: 'modules/research/migrations' }],
    registerRoutes(app: unknown) {
      registerResearchRoutes(app as FastifyInstance, service);
    },
  };
}

export { ResearchService } from './service.js';
export type { ResearchRepository } from './repository.js';
