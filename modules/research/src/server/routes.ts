import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defineRoute } from '@workbench/http-kit';
import {
  RESEARCH_API_V1,
  addLocalAttachmentInputSchema,
  confirmImportInputSchema,
  createCollectionInputSchema,
  createManualWorkInputSchema,
  inspectImportInputSchema,
  listImportSessionsQuerySchema,
  listWorksQuerySchema,
  permanentDeleteInputSchema,
  pickPdfInputSchema,
  prepareImportInputSchema,
  relinkLocationInputSchema,
  setWorkCollectionsInputSchema,
  uploadPdfQuerySchema,
} from '../contract.js';
import type { ResearchService } from './service.js';

const idParams = z.object({ id: z.string().min(1) });
const importItemParams = z.object({
  sessionId: z.string().min(1),
  itemId: z.string().min(1),
});
const uploadStreamSchema = z.custom<AsyncIterable<Uint8Array>>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function',
  '请求体必须是 PDF 文件流',
);

export function registerResearchRoutes(app: FastifyInstance, service: ResearchService): void {
  app.addContentTypeParser('application/pdf', (_request, payload, done) => {
    done(null, payload);
  });
  app.get(
    RESEARCH_API_V1.works,
    defineRoute({ query: listWorksQuerySchema }, ({ query }) => service.listWorks(query)),
  );
  app.get(
    RESEARCH_API_V1.work(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getWork(params.id)),
  );
  app.post(
    RESEARCH_API_V1.workManual,
    defineRoute({ body: createManualWorkInputSchema, status: 201 }, ({ body }) =>
      service.createManualWork(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.editionAttachments(':id'),
    defineRoute(
      { params: idParams, body: addLocalAttachmentInputSchema, status: 201 },
      ({ params, body }) => service.addLocalAttachment(params.id, body),
    ),
  );
  app.put(
    RESEARCH_API_V1.workCollections(':id'),
    defineRoute({ params: idParams, body: setWorkCollectionsInputSchema }, ({ params, body }) =>
      service.setWorkCollections(params.id, body.collectionIds),
    ),
  );
  app.post(
    RESEARCH_API_V1.workTrash(':id'),
    defineRoute({ params: idParams }, async ({ params }) => {
      await service.trashWork(params.id);
      return service.getWork(params.id);
    }),
  );
  app.post(
    RESEARCH_API_V1.workRestore(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.restoreWork(params.id)),
  );
  app.get(
    RESEARCH_API_V1.workDeletionPreview(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.deletionPreview(params.id)),
  );
  app.post(
    RESEARCH_API_V1.workPermanentDelete(':id'),
    defineRoute({ params: idParams, body: permanentDeleteInputSchema }, ({ params, body }) =>
      service.permanentlyDelete(params.id, body.confirmationToken),
    ),
  );

  app.get(RESEARCH_API_V1.collections, async () => service.listCollections());
  app.post(
    RESEARCH_API_V1.collections,
    defineRoute({ body: createCollectionInputSchema, status: 201 }, ({ body }) =>
      service.createCollection(body),
    ),
  );

  app.post(
    RESEARCH_API_V1.importPickFiles,
    defineRoute({ body: pickPdfInputSchema }, ({ body }) =>
      service.pickFiles(body.initialDir, body.multiple),
    ),
  );
  app.post(
    RESEARCH_API_V1.importSessions,
    defineRoute({ body: prepareImportInputSchema, status: 201 }, ({ body }) =>
      service.prepareImport(body),
    ),
  );
  app.get(
    RESEARCH_API_V1.importSessions,
    defineRoute({ query: listImportSessionsQuerySchema }, ({ query }) =>
      service.listImportSessions(query.status, query.limit),
    ),
  );
  app.post(
    RESEARCH_API_V1.importUpload,
    defineRoute(
      { query: uploadPdfQuerySchema, body: uploadStreamSchema, status: 201 },
      ({ query, body }) => service.prepareManagedUpload(body, query.fileName, query.requestId),
    ),
  );
  app.get(
    RESEARCH_API_V1.importSession(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getImportSession(params.id)),
  );
  app.post(
    RESEARCH_API_V1.importInspect(':id'),
    defineRoute({ params: idParams, body: inspectImportInputSchema }, ({ params, body }) =>
      service.inspectImport(params.id, body),
    ),
  );
  app.post(
    RESEARCH_API_V1.importInspectAsync(':id'),
    defineRoute(
      { params: idParams, body: inspectImportInputSchema, status: 202 },
      ({ params, body }) => service.startImportInspection(params.id, body),
    ),
  );
  app.get(
    RESEARCH_API_V1.importInspection(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getImportInspection(params.id)),
  );
  app.put(
    RESEARCH_API_V1.importItemDecision(':sessionId', ':itemId'),
    defineRoute({ params: importItemParams, body: confirmImportInputSchema }, ({ params, body }) =>
      service.saveImportDecision(params.sessionId, params.itemId, body),
    ),
  );
  app.post(
    RESEARCH_API_V1.importItemRetry(':sessionId', ':itemId'),
    defineRoute({ params: importItemParams, body: inspectImportInputSchema }, ({ params, body }) =>
      service.retryImportItem(params.sessionId, params.itemId, body),
    ),
  );
  app.post(
    RESEARCH_API_V1.importCommit(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.commitImportSession(params.id)),
  );
  app.post(
    RESEARCH_API_V1.importCancel(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.cancelImportSession(params.id)),
  );
  app.post(
    RESEARCH_API_V1.importConfirm(':id'),
    defineRoute({ params: idParams, body: confirmImportInputSchema }, ({ params, body }) =>
      service.confirmImport(params.id, body),
    ),
  );

  app.post(
    RESEARCH_API_V1.locationCheck(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.checkLocation(params.id)),
  );
  app.post(
    RESEARCH_API_V1.locationRelink(':id'),
    defineRoute({ params: idParams, body: relinkLocationInputSchema }, ({ params, body }) =>
      service.relinkLocation(params.id, body.path),
    ),
  );
  app.delete(
    RESEARCH_API_V1.attachment(':id'),
    defineRoute({ params: idParams, status: 204 }, ({ params }) =>
      service.recycleAttachment(params.id),
    ),
  );
  app.post(RESEARCH_API_V1.reconcile, async () => service.reconcile());
}
