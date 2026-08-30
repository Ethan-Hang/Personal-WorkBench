import type { FastifyInstance } from 'fastify';
import type { ServerModuleDefinition } from '@workbench/core';
import { dirname, join } from 'node:path';
import { RESEARCH_MODULE_ID } from '../contract.js';
import type { KnowledgeRepository } from '../knowledge/repository.js';
import { ResearchKnowledgeService } from '../knowledge/service.js';
import type { AnnotationRepository } from '../annotation/repository.js';
import { ResearchAnnotationService } from '../annotation/service.js';
import type { AnnotatedExportRepository } from '../annotated-export/repository.js';
import { ResearchAnnotatedExportService } from '../annotated-export/service.js';
import { ResearchContentStore } from '../files/content-store.js';
import { createMetadataCoordinator } from '../metadata/index.js';
import { ReaderContentSource } from '../reader/content-source.js';
import type { ReaderRepository } from '../reader/repository.js';
import { ResearchReaderService } from '../reader/service.js';
import { ResearchTextIndexService } from '../reader/text-index-service.js';
import type { PageTextExtractor } from '../reader/text-index.js';
import type { TextIndexRepository } from '../reader/text-index-repository.js';
import type { OcrEngine } from '../ocr/engine.js';
import type { OcrRepository } from '../ocr/repository.js';
import { ResearchOcrService } from '../ocr/service.js';
import type { AnnotatedPdfWriter } from '../interop/annotated-export.js';
import {
  systemPdfFilePicker,
  type DocumentFileDialog,
  type PdfFilePicker,
  type PdfOutputDialog,
} from './file-picker.js';
import { registerResearchAnnotatedExportRoutes } from './annotated-export-routes.js';
import { registerResearchAnnotationRoutes } from './annotation-routes.js';
import { registerResearchKnowledgeRoutes } from './knowledge-routes.js';
import { registerResearchReaderRoutes } from './reader-routes.js';
import { registerResearchTextIndexRoutes } from './text-index-routes.js';
import { registerResearchOcrRoutes } from './ocr-routes.js';
import type { ManagedRootController, ResearchRepository } from './repository.js';
import { registerResearchRoutes } from './routes.js';
import { ResearchService } from './service.js';

export interface ResearchServerModuleOptions {
  repository: ResearchRepository &
    ReaderRepository &
    AnnotationRepository &
    TextIndexRepository &
    OcrRepository &
    AnnotatedExportRepository;
  knowledgeRepository?: KnowledgeRepository;
  managedRoot: () => string;
  managedRootController?: ManagedRootController;
  contentStore?: ResearchContentStore;
  readerContentSource?: ReaderContentSource;
  textIndexExtractor?: PageTextExtractor;
  textIndexParserVersion?: string;
  ocrEngine?: OcrEngine;
  ocrEngineVersion?: string;
  ocrLanguagePackVersion?: string;
  ocrCacheRoot?: () => string;
  metadata?: ReturnType<typeof createMetadataCoordinator>;
  filePicker?: PdfFilePicker;
  pdfOutputDialog?: PdfOutputDialog;
  documentDialog?: DocumentFileDialog;
  annotatedExportWriter?: AnnotatedPdfWriter;
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
    documentDialog: options.documentDialog ?? systemPdfFilePicker,
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
  const knowledgeService = options.knowledgeRepository
    ? new ResearchKnowledgeService(options.knowledgeRepository, {
        ...(options.createId ? { createId: options.createId } : {}),
        ...(options.clock ? { now: options.clock } : {}),
        documentDialog: options.documentDialog ?? systemPdfFilePicker,
      })
    : null;
  const ocrService = new ResearchOcrService(options.repository, readerContentSource, {
    cacheRoot: options.ocrCacheRoot ?? (() => join(dirname(managedRoot()), 'ocr-cache')),
    ...(options.ocrEngine ? { engine: options.ocrEngine } : {}),
    ...(options.ocrEngineVersion ? { engineVersion: options.ocrEngineVersion } : {}),
    ...(options.ocrLanguagePackVersion
      ? { languagePackVersion: options.ocrLanguagePackVersion }
      : {}),
    ...(options.createId ? { createId: options.createId } : {}),
    beforeRun: (assetId) => textIndexService.suspendForOcr(assetId),
    afterRun: () => textIndexService.resumeAfterOcr(),
  });
  const annotatedExportService = new ResearchAnnotatedExportService(
    options.repository,
    readerContentSource,
    options.pdfOutputDialog ?? systemPdfFilePicker,
    {
      ...(options.annotatedExportWriter ? { writer: options.annotatedExportWriter } : {}),
      ...(options.createId ? { createId: options.createId } : {}),
      ...(options.clock ? { now: options.clock } : {}),
    },
  );

  return {
    id: RESEARCH_MODULE_ID,
    migrations: [{ folder: 'modules/research/migrations' }],
    registerRoutes(app: unknown) {
      registerResearchRoutes(app as FastifyInstance, service);
      registerResearchReaderRoutes(app as FastifyInstance, readerService, readerContentSource);
      registerResearchTextIndexRoutes(app as FastifyInstance, textIndexService);
      registerResearchOcrRoutes(app as FastifyInstance, ocrService);
      registerResearchAnnotationRoutes(app as FastifyInstance, annotationService);
      if (knowledgeService) {
        registerResearchKnowledgeRoutes(app as FastifyInstance, knowledgeService);
      }
      registerResearchAnnotatedExportRoutes(app as FastifyInstance, annotatedExportService);
      (app as FastifyInstance).addHook('onReady', async () => {
        await textIndexService.recoverInterruptedJobs();
        await ocrService.recoverInterruptedJobs();
        await annotatedExportService.recoverInterruptedJobs();
      });
      (app as FastifyInstance).addHook('onClose', async () => {
        await annotatedExportService.shutdown();
        await ocrService.shutdown();
        await textIndexService.shutdown();
      });
    },
  };
}

export { ResearchService } from './service.js';
export { ResearchReaderService } from '../reader/service.js';
export { ResearchAnnotationService } from '../annotation/service.js';
export { ResearchKnowledgeService } from '../knowledge/service.js';
export { ResearchTextIndexService } from '../reader/text-index-service.js';
export { ResearchOcrService } from '../ocr/service.js';
export { ResearchAnnotatedExportService } from '../annotated-export/service.js';
export type { ResearchRepository } from './repository.js';
