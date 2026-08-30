import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defineRoute } from '@workbench/http-kit';
import {
  RESEARCH_API_V1,
  addLocalAttachmentInputSchema,
  bulkWorkActionInputSchema,
  canonicalImportPreviewInputSchema,
  createTagInputSchema,
  confirmImportInputSchema,
  createWorkRelationInputSchema,
  createCollectionInputSchema,
  createManualWorkInputSchema,
  createSavedQueryInputSchema,
  deleteCollectionQuerySchema,
  inspectImportInputSchema,
  listImportSessionsQuerySchema,
  listTagsQuerySchema,
  listWorksQuerySchema,
  mergeTagsInputSchema,
  mergeWorksInputSchema,
  permanentDeleteInputSchema,
  pickCanonicalImportSourceInputSchema,
  pickPdfInputSchema,
  portableExportPreviewInputSchema,
  prepareImportInputSchema,
  relinkLocationInputSchema,
  savedQueryRunQuerySchema,
  setWorkCollectionsInputSchema,
  setWorkTagsInputSchema,
  tagCandidatesQuerySchema,
  tagVersionInputSchema,
  structuredSearchInputSchema,
  startManagedRootMigrationInputSchema,
  startCanonicalImportInputSchema,
  startPortableExportInputSchema,
  uploadPdfQuerySchema,
  updateCollectionInputSchema,
  updateTagInputSchema,
  updateWorkMetadataInputSchema,
  workMergePreviewInputSchema,
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
  app.patch(
    RESEARCH_API_V1.workMetadata(':id'),
    defineRoute({ params: idParams, body: updateWorkMetadataInputSchema }, ({ params, body }) =>
      service.updateWorkMetadata(params.id, body),
    ),
  );
  app.post(
    RESEARCH_API_V1.workSearch,
    defineRoute({ body: structuredSearchInputSchema }, ({ body }) =>
      service.structuredSearch(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.workBulkPreview,
    defineRoute({ body: bulkWorkActionInputSchema }, ({ body }) =>
      service.previewBulkWorkAction(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.workBulk,
    defineRoute({ body: bulkWorkActionInputSchema }, ({ body }) =>
      service.applyBulkWorkAction(body),
    ),
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
    RESEARCH_API_V1.workRelations(':id'),
    defineRoute({ params: idParams, body: createWorkRelationInputSchema }, ({ params, body }) =>
      service.addWorkRelation(params.id, body),
    ),
  );
  app.delete(
    RESEARCH_API_V1.workRelation(':id'),
    defineRoute({ params: idParams, status: 204 }, ({ params }) =>
      service.deleteWorkRelation(params.id),
    ),
  );
  app.put(
    RESEARCH_API_V1.workTags(':id'),
    defineRoute({ params: idParams, body: setWorkTagsInputSchema }, ({ params, body }) =>
      service.setWorkTags(params.id, body.tagIds),
    ),
  );
  app.post(
    RESEARCH_API_V1.workMergePreview(':id'),
    defineRoute({ params: idParams, body: workMergePreviewInputSchema }, ({ params, body }) =>
      service.previewWorkMerge(params.id, body.mergedWorkId),
    ),
  );
  app.post(
    RESEARCH_API_V1.workMerge(':id'),
    defineRoute({ params: idParams, body: mergeWorksInputSchema }, ({ params, body }) =>
      service.mergeWorks(params.id, body),
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
  app.patch(
    RESEARCH_API_V1.collection(':id'),
    defineRoute({ params: idParams, body: updateCollectionInputSchema }, ({ params, body }) =>
      service.updateCollection(params.id, body),
    ),
  );
  app.get(
    RESEARCH_API_V1.collectionDeletionPreview(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.collectionDeletionPreview(params.id)),
  );
  app.delete(
    RESEARCH_API_V1.collection(':id'),
    defineRoute({ params: idParams, query: deleteCollectionQuerySchema }, ({ params, query }) =>
      service.deleteCollection(params.id, query.strategy),
    ),
  );
  app.post(
    RESEARCH_API_V1.savedQueries,
    defineRoute({ body: createSavedQueryInputSchema, status: 201 }, ({ body }) =>
      service.createSavedQuery(body),
    ),
  );
  app.get(
    RESEARCH_API_V1.savedQueryRun(':id'),
    defineRoute({ params: idParams, query: savedQueryRunQuerySchema }, ({ params, query }) =>
      service.runSavedQuery(params.id, query.cursor ?? null, query.limit),
    ),
  );
  app.post(RESEARCH_API_V1.searchIndexRebuild, async () => service.rebuildSearchIndex());

  app.get(
    RESEARCH_API_V1.tags,
    defineRoute({ query: listTagsQuerySchema }, ({ query }) =>
      service.listTags(query.status, query.query, query.sort),
    ),
  );
  app.get(
    RESEARCH_API_V1.tagCandidates,
    defineRoute({ query: tagCandidatesQuerySchema }, ({ query }) =>
      service.findTagCandidates(query.name, query.limit),
    ),
  );
  app.post(
    RESEARCH_API_V1.tags,
    defineRoute({ body: createTagInputSchema, status: 201 }, ({ body }) => service.createTag(body)),
  );
  app.patch(
    RESEARCH_API_V1.tag(':id'),
    defineRoute({ params: idParams, body: updateTagInputSchema }, ({ params, body }) =>
      service.updateTag(params.id, body),
    ),
  );
  app.get(
    RESEARCH_API_V1.tagDeletionPreview(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.tagDeletionPreview(params.id)),
  );
  app.delete(
    RESEARCH_API_V1.tag(':id'),
    defineRoute({ params: idParams, body: tagVersionInputSchema }, ({ params, body }) =>
      service.trashTag(params.id, body.expectedUpdatedAt),
    ),
  );
  app.post(
    RESEARCH_API_V1.tagRestore(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.restoreTag(params.id)),
  );
  app.delete(
    RESEARCH_API_V1.tagPermanentDelete(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.permanentlyDeleteTag(params.id)),
  );
  app.post(
    RESEARCH_API_V1.tagMerge,
    defineRoute({ body: mergeTagsInputSchema }, ({ body }) => service.mergeTags(body)),
  );
  app.post(
    RESEARCH_API_V1.mergeUndo(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.undoMerge(params.id)),
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
  app.post(
    RESEARCH_API_V1.attachmentRestore(':id'),
    defineRoute({ params: idParams, status: 204 }, ({ params }) =>
      service.restoreAttachment(params.id),
    ),
  );
  app.get(
    RESEARCH_API_V1.attachmentDeletionPreview(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.attachmentDeletionPreview(params.id)),
  );
  app.post(
    RESEARCH_API_V1.attachmentPermanentDelete(':id'),
    defineRoute({ params: idParams, body: permanentDeleteInputSchema }, ({ params, body }) =>
      service.permanentlyDeleteAttachment(params.id, body.confirmationToken),
    ),
  );
  app.post(
    RESEARCH_API_V1.exportPreview,
    defineRoute({ body: portableExportPreviewInputSchema }, ({ body }) =>
      service.previewPortableExport(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.exports,
    defineRoute({ body: startPortableExportInputSchema, status: 202 }, ({ body }) =>
      service.startPortableExport(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.canonicalImportPickSource,
    defineRoute({ body: pickCanonicalImportSourceInputSchema }, ({ body }) =>
      service.pickCanonicalImportSource(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.canonicalImportPreview,
    defineRoute({ body: canonicalImportPreviewInputSchema }, ({ body }) =>
      service.previewCanonicalImport(body),
    ),
  );
  app.post(
    RESEARCH_API_V1.canonicalImports,
    defineRoute({ body: startCanonicalImportInputSchema }, ({ body }) =>
      service.startCanonicalImport(body),
    ),
  );
  app.get(
    RESEARCH_API_V1.exportJob(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getPortableExport(params.id)),
  );
  app.post(
    RESEARCH_API_V1.exportCancel(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.cancelPortableExport(params.id)),
  );
  app.get(
    RESEARCH_API_V1.managedStorage,
    defineRoute({}, () => service.getManagedStorageStatus()),
  );
  app.post(
    RESEARCH_API_V1.managedRootMigrations,
    defineRoute({ body: startManagedRootMigrationInputSchema, status: 202 }, ({ body }) =>
      service.startManagedRootMigration(body),
    ),
  );
  app.get(
    RESEARCH_API_V1.managedRootMigration(':id'),
    defineRoute({ params: idParams }, ({ params }) => service.getManagedRootMigration(params.id)),
  );
  app.post(
    RESEARCH_API_V1.managedRootMigrationCancel(':id'),
    defineRoute({ params: idParams }, ({ params }) =>
      service.cancelManagedRootMigration(params.id),
    ),
  );
  app.post(
    RESEARCH_API_V1.managedRootMigrationRetry(':id'),
    defineRoute({ params: idParams, status: 202 }, ({ params }) =>
      service.retryManagedRootMigration(params.id),
    ),
  );
  app.post(RESEARCH_API_V1.reconcile, async () => service.reconcile());
}
