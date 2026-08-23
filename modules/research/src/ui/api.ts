import type { z } from 'zod';
import { apiRequest, jsonBody } from '@workbench/ui';
import {
  RESEARCH_API_V1,
  collectionViewSchema,
  collectionsResponseSchema,
  deletionPreviewSchema,
  importCommitResultSchema,
  importInspectionResponseSchema,
  importSessionViewSchema,
  importSessionsResponseSchema,
  pickPdfResponseSchema,
  relinkLocationResponseSchema,
  workDetailViewSchema,
  worksPageResponseSchema,
  type AddLocalAttachmentInput,
  type ConfirmImportInput,
  type CreateManualWorkInput,
  type ImportSessionStatus,
  type InspectImportInput,
  type PrepareImportInput,
  type RelinkLocationResponse,
  type WorkStatus,
} from '../contract.js';

export type WorksPage = z.infer<typeof worksPageResponseSchema>;
export type WorkDetail = z.infer<typeof workDetailViewSchema>;
export type CollectionsResponse = z.infer<typeof collectionsResponseSchema>;
export type CollectionView = z.infer<typeof collectionViewSchema>;
export type ImportSession = z.infer<typeof importSessionViewSchema>;
export type ImportSessions = z.infer<typeof importSessionsResponseSchema>;
export type ImportInspection = z.infer<typeof importInspectionResponseSchema>;
export type ImportInspectionItem = ImportInspection['items'][number];
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;

export interface FetchWorksOptions {
  status?: WorkStatus;
  collectionId?: string;
  fileStatus?: 'none' | 'available' | 'missing' | 'changed' | 'recycled' | 'mixed';
  query?: string;
  cursor?: string;
  limit?: number;
}

export async function fetchWorks(options: FetchWorksOptions = {}): Promise<WorksPage> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
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

export async function putWorkCollections(id: string, collectionIds: string[]): Promise<WorkDetail> {
  return workDetailViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.workCollections(id), jsonBody('PUT', { collectionIds })),
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
