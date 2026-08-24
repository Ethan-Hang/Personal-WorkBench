import type { z } from 'zod';
import { apiRequest, jsonBody } from '@workbench/ui';
import {
  RESEARCH_API_V1,
  bulkWorkPreviewSchema,
  bulkWorkResultSchema,
  attachmentDeletionPreviewSchema,
  collectionViewSchema,
  collectionDeletionPreviewSchema,
  collectionsResponseSchema,
  deletionPreviewSchema,
  importCommitResultSchema,
  importInspectionResponseSchema,
  importSessionViewSchema,
  managedRootMigrationJobSchema,
  managedStorageStatusSchema,
  importSessionsResponseSchema,
  mergeRecordViewSchema,
  pickPdfResponseSchema,
  portableExportJobSchema,
  portableExportPreviewSchema,
  relinkLocationResponseSchema,
  searchIndexRebuildResponseSchema,
  tagCandidatesResponseSchema,
  tagDeletionPreviewSchema,
  tagViewSchema,
  tagsResponseSchema,
  workDetailViewSchema,
  workMergePreviewSchema,
  worksPageResponseSchema,
  type AddLocalAttachmentInput,
  type BulkWorkActionInput,
  type ConfirmImportInput,
  type CreateManualWorkInput,
  type CreateSavedQueryInput,
  type CreateTagInput,
  type CreateWorkRelationInput,
  type ImportSessionStatus,
  type InspectImportInput,
  type MergeTagsInput,
  type MergeWorksInput,
  type ManagedRootMigrationJob,
  type ManagedStorageStatus,
  type PrepareImportInput,
  type PortableExportJob,
  type PortableExportPreview,
  type PortableExportPreviewInput,
  type StartPortableExportInput,
  type StructuredSearchInput,
  type RelinkLocationResponse,
  type SystemView,
  type UpdateCollectionInput,
  type UpdateTagInput,
  type UpdateWorkMetadataInput,
  type WorkStatus,
} from '../contract.js';

export type WorksPage = z.infer<typeof worksPageResponseSchema>;
export type WorkDetail = z.infer<typeof workDetailViewSchema>;
export type CollectionsResponse = z.infer<typeof collectionsResponseSchema>;
export type CollectionView = z.infer<typeof collectionViewSchema>;
export type CollectionDeletionPreview = z.infer<typeof collectionDeletionPreviewSchema>;
export type BulkWorkPreview = z.infer<typeof bulkWorkPreviewSchema>;
export type BulkWorkResult = z.infer<typeof bulkWorkResultSchema>;
export type ImportSession = z.infer<typeof importSessionViewSchema>;
export type ImportSessions = z.infer<typeof importSessionsResponseSchema>;
export type ImportInspection = z.infer<typeof importInspectionResponseSchema>;
export type ImportInspectionItem = ImportInspection['items'][number];
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;
export type TagView = z.infer<typeof tagViewSchema>;
export type TagsResponse = z.infer<typeof tagsResponseSchema>;
export type TagCandidates = z.infer<typeof tagCandidatesResponseSchema>;
export type TagDeletionPreview = z.infer<typeof tagDeletionPreviewSchema>;
export type WorkMergePreview = z.infer<typeof workMergePreviewSchema>;
export type MergeRecordView = z.infer<typeof mergeRecordViewSchema>;
export type AttachmentDeletionPreview = z.infer<typeof attachmentDeletionPreviewSchema>;

export async function postPortableExportPreview(
  input: PortableExportPreviewInput,
): Promise<PortableExportPreview> {
  return portableExportPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.exportPreview, jsonBody('POST', input)),
  );
}

export async function postPortableExport(
  input: StartPortableExportInput,
): Promise<PortableExportJob> {
  return portableExportJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.exports, jsonBody('POST', input)),
  );
}

export async function fetchPortableExport(id: string): Promise<PortableExportJob> {
  return portableExportJobSchema.parse(await apiRequest(RESEARCH_API_V1.exportJob(id)));
}

export async function postCancelPortableExport(id: string): Promise<PortableExportJob> {
  return portableExportJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.exportCancel(id), { method: 'POST' }),
  );
}

export interface FetchWorksOptions {
  status?: WorkStatus;
  systemView?: SystemView;
  collectionId?: string;
  fileStatus?: 'none' | 'available' | 'missing' | 'changed' | 'recycled' | 'mixed';
  query?: string;
  cursor?: string;
  limit?: number;
}

export async function fetchWorks(options: FetchWorksOptions = {}): Promise<WorksPage> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.systemView) params.set('systemView', options.systemView);
  if (options.collectionId) params.set('collectionId', options.collectionId);
  if (options.fileStatus) params.set('fileStatus', options.fileStatus);
  if (options.query) params.set('query', options.query);
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return worksPageResponseSchema.parse(
    await apiRequest(query ? `${RESEARCH_API_V1.works}?${query}` : RESEARCH_API_V1.works),
  );
}

export async function fetchWork(id: string): Promise<WorkDetail> {
  return workDetailViewSchema.parse(await apiRequest(RESEARCH_API_V1.work(id)));
}

export async function fetchManagedStorageStatus(): Promise<ManagedStorageStatus> {
  return managedStorageStatusSchema.parse(await apiRequest(RESEARCH_API_V1.managedStorage));
}

export async function postManagedRootMigration(
  targetRoot: string,
): Promise<ManagedRootMigrationJob> {
  return managedRootMigrationJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.managedRootMigrations, jsonBody('POST', { targetRoot })),
  );
}

export async function fetchManagedRootMigration(id: string): Promise<ManagedRootMigrationJob> {
  return managedRootMigrationJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.managedRootMigration(id)),
  );
}

export async function postCancelManagedRootMigration(id: string): Promise<ManagedRootMigrationJob> {
  return managedRootMigrationJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.managedRootMigrationCancel(id), { method: 'POST' }),
  );
}

export async function postRetryManagedRootMigration(id: string): Promise<ManagedRootMigrationJob> {
  return managedRootMigrationJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.managedRootMigrationRetry(id), { method: 'POST' }),
  );
}

export async function patchWorkMetadata(
  id: string,
  input: UpdateWorkMetadataInput,
): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workMetadata(id), jsonBody('PATCH', input)),
  );
}

export async function postRestoreAttachment(id: string): Promise<void> {
  await apiRequest(RESEARCH_API_V1.attachmentRestore(id), { method: 'POST' });
}

export async function fetchAttachmentDeletionPreview(
  id: string,
): Promise<AttachmentDeletionPreview> {
  return attachmentDeletionPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.attachmentDeletionPreview(id)),
  );
}

export async function postPermanentDeleteAttachment(
  id: string,
  confirmationToken: string,
): Promise<void> {
  await apiRequest(
    RESEARCH_API_V1.attachmentPermanentDelete(id),
    jsonBody('POST', { confirmationToken }),
  );
}

export async function postStructuredSearch(input: StructuredSearchInput): Promise<WorksPage> {
  return worksPageResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.workSearch, jsonBody('POST', input)),
  );
}

export async function postSavedQuery(input: CreateSavedQueryInput): Promise<CollectionView> {
  return collectionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.savedQueries, jsonBody('POST', input)),
  );
}

export async function fetchSavedQuery(
  id: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<WorksPage> {
  const params = new URLSearchParams();
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return worksPageResponseSchema.parse(
    await apiRequest(
      query ? `${RESEARCH_API_V1.savedQueryRun(id)}?${query}` : RESEARCH_API_V1.savedQueryRun(id),
    ),
  );
}

export async function postRebuildSearchIndex(): Promise<{ indexedWorks: number }> {
  return searchIndexRebuildResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.searchIndexRebuild, { method: 'POST' }),
  );
}

export async function fetchCollections(): Promise<CollectionsResponse> {
  return collectionsResponseSchema.parse(await apiRequest(RESEARCH_API_V1.collections));
}

export async function postCollection(input: {
  name: string;
  parentId?: string | null;
}): Promise<CollectionView> {
  return collectionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.collections, jsonBody('POST', input)),
  );
}

export async function patchCollection(
  id: string,
  input: UpdateCollectionInput,
): Promise<CollectionView> {
  return collectionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.collection(id), jsonBody('PATCH', input)),
  );
}

export async function fetchCollectionDeletionPreview(
  id: string,
): Promise<CollectionDeletionPreview> {
  return collectionDeletionPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.collectionDeletionPreview(id)),
  );
}

export async function deleteCollection(
  id: string,
  strategy: 'parent' | 'unclassified',
): Promise<void> {
  await apiRequest(`${RESEARCH_API_V1.collection(id)}?strategy=${strategy}`, {
    method: 'DELETE',
  });
}

export async function postWorkRelation(
  workId: string,
  input: CreateWorkRelationInput,
): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workRelations(workId), jsonBody('POST', input)),
  );
}

export async function deleteWorkRelation(id: string): Promise<void> {
  await apiRequest(RESEARCH_API_V1.workRelation(id), { method: 'DELETE' });
}

export async function postBulkWorkPreview(input: BulkWorkActionInput): Promise<BulkWorkPreview> {
  return bulkWorkPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workBulkPreview, jsonBody('POST', input)),
  );
}

export async function postBulkWorkAction(input: BulkWorkActionInput): Promise<BulkWorkResult> {
  return bulkWorkResultSchema.parse(
    await apiRequest(RESEARCH_API_V1.workBulk, jsonBody('POST', input)),
  );
}

export async function putWorkCollections(id: string, collectionIds: string[]): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workCollections(id), jsonBody('PUT', { collectionIds })),
  );
}

export async function fetchTags(
  options: {
    status?: 'active' | 'trashed' | 'all';
    query?: string;
    sort?: 'usage' | 'name' | 'recent';
  } = {},
): Promise<TagsResponse> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.query) params.set('query', options.query);
  if (options.sort) params.set('sort', options.sort);
  const query = params.toString();
  return tagsResponseSchema.parse(
    await apiRequest(query ? `${RESEARCH_API_V1.tags}?${query}` : RESEARCH_API_V1.tags),
  );
}

export async function fetchTagCandidates(name: string): Promise<TagCandidates> {
  const params = new URLSearchParams({ name });
  return tagCandidatesResponseSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.tagCandidates}?${params.toString()}`),
  );
}

export async function postTag(input: CreateTagInput): Promise<TagView> {
  return tagViewSchema.parse(await apiRequest(RESEARCH_API_V1.tags, jsonBody('POST', input)));
}

export async function patchTag(id: string, input: UpdateTagInput): Promise<TagView> {
  return tagViewSchema.parse(await apiRequest(RESEARCH_API_V1.tag(id), jsonBody('PATCH', input)));
}

export async function putWorkTags(id: string, tagIds: string[]): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workTags(id), jsonBody('PUT', { tagIds })),
  );
}

export async function fetchTagDeletionPreview(id: string): Promise<TagDeletionPreview> {
  return tagDeletionPreviewSchema.parse(await apiRequest(RESEARCH_API_V1.tagDeletionPreview(id)));
}

export async function deleteTag(id: string, expectedUpdatedAt: string): Promise<TagView> {
  return tagViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.tag(id), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedUpdatedAt }),
    }),
  );
}

export async function postRestoreTag(id: string): Promise<TagView> {
  return tagViewSchema.parse(await apiRequest(RESEARCH_API_V1.tagRestore(id), { method: 'POST' }));
}

export async function deleteTagPermanently(id: string): Promise<void> {
  await apiRequest(RESEARCH_API_V1.tagPermanentDelete(id), { method: 'DELETE' });
}

export async function postMergeTags(input: MergeTagsInput): Promise<MergeRecordView> {
  return mergeRecordViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.tagMerge, jsonBody('POST', input)),
  );
}

export async function postWorkMergePreview(
  survivorId: string,
  mergedWorkId: string,
): Promise<WorkMergePreview> {
  return workMergePreviewSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.workMergePreview(survivorId),
      jsonBody('POST', { mergedWorkId }),
    ),
  );
}

export async function postMergeWorks(
  survivorId: string,
  input: MergeWorksInput,
): Promise<MergeRecordView> {
  return mergeRecordViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workMerge(survivorId), jsonBody('POST', input)),
  );
}

export async function postUndoMerge(id: string): Promise<MergeRecordView> {
  return mergeRecordViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.mergeUndo(id), { method: 'POST' }),
  );
}

export async function postPickPdf(options: {
  initialDir?: string;
  multiple?: boolean;
}): Promise<z.infer<typeof pickPdfResponseSchema>> {
  return pickPdfResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.importPickFiles, jsonBody('POST', options)),
  );
}

export async function postPrepareImport(input: PrepareImportInput): Promise<ImportSession> {
  return importSessionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.importSessions, jsonBody('POST', input)),
  );
}

export async function fetchImportSessions(
  options: {
    status?: ImportSessionStatus;
    limit?: number;
  } = {},
): Promise<ImportSessions> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return importSessionsResponseSchema.parse(
    await apiRequest(
      query ? `${RESEARCH_API_V1.importSessions}?${query}` : RESEARCH_API_V1.importSessions,
    ),
  );
}

export async function fetchImportSession(sessionId: string): Promise<ImportSession> {
  return importSessionViewSchema.parse(await apiRequest(RESEARCH_API_V1.importSession(sessionId)));
}

export async function postUploadPdf(file: File, requestId: string): Promise<ImportSession> {
  const params = new URLSearchParams({ fileName: file.name, requestId });
  return importSessionViewSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.importUpload}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    }),
  );
}

export async function postInspectImport(
  sessionId: string,
  input: InspectImportInput,
): Promise<ImportInspection> {
  return importInspectionResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.importInspect(sessionId), jsonBody('POST', input)),
  );
}

export async function postStartImportInspection(
  sessionId: string,
  input: InspectImportInput,
): Promise<ImportSession> {
  return importSessionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.importInspectAsync(sessionId), jsonBody('POST', input)),
  );
}

export async function fetchImportInspection(sessionId: string): Promise<ImportInspection> {
  return importInspectionResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.importInspection(sessionId)),
  );
}

export async function putImportDecision(
  sessionId: string,
  itemId: string,
  input: ConfirmImportInput,
): Promise<ImportSession> {
  return importSessionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.importItemDecision(sessionId, itemId), jsonBody('PUT', input)),
  );
}

export async function postRetryImportItem(
  sessionId: string,
  itemId: string,
  input: InspectImportInput,
): Promise<ImportInspection> {
  return importInspectionResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.importItemRetry(sessionId, itemId), jsonBody('POST', input)),
  );
}

export async function postCommitImport(sessionId: string): Promise<ImportCommitResult> {
  return importCommitResultSchema.parse(
    await apiRequest(RESEARCH_API_V1.importCommit(sessionId), { method: 'POST' }),
  );
}

export async function postCancelImport(sessionId: string): Promise<ImportSession> {
  return importSessionViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.importCancel(sessionId), { method: 'POST' }),
  );
}

export async function postConfirmImport(
  sessionId: string,
  input: ConfirmImportInput,
): Promise<unknown> {
  return apiRequest(RESEARCH_API_V1.importConfirm(sessionId), jsonBody('POST', input));
}

export async function postCreateManualWork(input: CreateManualWorkInput): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workManual, jsonBody('POST', input)),
  );
}

export async function postAddLocalAttachment(
  editionId: string,
  input: AddLocalAttachmentInput,
): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.editionAttachments(editionId), jsonBody('POST', input)),
  );
}

export async function postCheckLocation(id: string): Promise<unknown> {
  return apiRequest(RESEARCH_API_V1.locationCheck(id), { method: 'POST' });
}

export async function postRelinkLocation(
  id: string,
  path: string,
): Promise<RelinkLocationResponse> {
  return relinkLocationResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.locationRelink(id), jsonBody('POST', { path })),
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  await apiRequest(RESEARCH_API_V1.attachment(id), { method: 'DELETE' });
}

export async function postTrashWork(id: string): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workTrash(id), { method: 'POST' }),
  );
}

export async function postRestoreWork(id: string): Promise<unknown> {
  return apiRequest(RESEARCH_API_V1.workRestore(id), { method: 'POST' });
}

export async function fetchDeletionPreview(id: string): Promise<DeletionPreview> {
  return deletionPreviewSchema.parse(await apiRequest(RESEARCH_API_V1.workDeletionPreview(id)));
}

export async function postPermanentDelete(id: string, confirmationToken: string): Promise<unknown> {
  return apiRequest(
    RESEARCH_API_V1.workPermanentDelete(id),
    jsonBody('POST', { confirmationToken }),
  );
}

export async function postReconcile(): Promise<unknown> {
  return apiRequest(RESEARCH_API_V1.reconcile, { method: 'POST' });
}
