import type { FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { RESEARCH_MODULE_ID } from '../contract.js';
import type { AnnotationRepository } from '../annotation/repository.js';
import { ResearchAnnotationService } from '../annotation/service.js';
import { ResearchContentStore } from '../files/content-store.js';
import { createMetadataCoordinator } from '../metadata/index.js';
import { ReaderContentSource } from '../reader/content-source.js';
import type { ReaderRepository } from '../reader/repository.js';
import { ResearchReaderService } from '../reader/service.js';
import { ResearchTextIndexService } from '../reader/text-index-service.js';
import type { PageTextExtractor } from '../reader/text-index.js';
import type { TextIndexRepository } from '../reader/text-index-repository.js';
import { systemPdfFilePicker, type PdfFilePicker } from './file-picker.js';
import { registerResearchAnnotationRoutes } from './annotation-routes.js';
import { registerResearchReaderRoutes } from './reader-routes.js';
import { registerResearchTextIndexRoutes } from './text-index-routes.js';
import type { ManagedRootController, ResearchRepository } from './repository.js';
import { registerResearchRoutes } from './routes.js';
import { ResearchService } from './service.js';

export interface ResearchServerModuleOptions {
  repository: ResearchRepository & ReaderRepository & AnnotationRepository & TextIndexRepository;
  managedRoot: () => string;
  managedRootController?: ManagedRootController;
  contentStore?: ResearchContentStore;
  readerContentSource?: ReaderContentSource;
  textIndexExtractor?: PageTextExtractor;
  textIndexParserVersion?: string;
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
  const readerContentSource =
    options.readerContentSource ?? new ReaderContentSource(options.repository, managedRoot);
  const readerService = new ResearchReaderService(options.repository, readerContentSource);
  const textIndexService = new ResearchTextIndexService(options.repository, readerContentSource, {
    ...(options.textIndexExtractor ? { extractor: options.textIndexExtractor } : {}),
    ...(options.textIndexParserVersion ? { parserVersion: options.textIndexParserVersion } : {}),
  });
  const annotationService = new ResearchAnnotationService(options.repository, {
    ...(options.createId ? { createId: options.createId } : {}),
  });

  return {
    id: RESEARCH_MODULE_ID,
    migrations: [{ folder: 'modules/research/migrations' }],
    registerRoutes(app: unknown) {
      registerResearchRoutes(app as FastifyInstance, service);
      registerResearchReaderRoutes(app as FastifyInstance, readerService, readerContentSource);
      registerResearchTextIndexRoutes(app as FastifyInstance, textIndexService);
      registerResearchAnnotationRoutes(app as FastifyInstance, annotationService);
      (app as FastifyInstance).addHook('onReady', () => textIndexService.recoverInterruptedJobs());
      (app as FastifyInstance).addHook('onClose', () => textIndexService.shutdown());
    },
  };
}

export { ResearchService } from './service.js';
export { ResearchReaderService } from '../reader/service.js';
export { ResearchAnnotationService } from '../annotation/service.js';
export { ResearchTextIndexService } from '../reader/text-index-service.js';
export type { ResearchRepository } from './repository.js';
