import type { z } from 'zod';
import { apiRequest, jsonBody } from '@workbench/ui';
import {
  RESEARCH_API_V1,
  annotatedExportJobSchema,
  annotatedExportOpenLocationResponseSchema,
  annotatedExportPreviewSchema,
  annotationRevisionSchema,
  annotationSchema,
  bulkWorkPreviewSchema,
  bulkWorkResultSchema,
  canonicalImportPreviewSchema,
  canonicalImportReportSchema,
  attachmentDeletionPreviewSchema,
  collectionViewSchema,
  claimEvidenceSchema,
  claimSchema,
  claimsPageSchema,
  collectionDeletionPreviewSchema,
  collectionsResponseSchema,
  deletionPreviewSchema,
  evidenceDetailSchema,
  evidencePageSchema,
  evidenceRebindPreviewSchema,
  importCommitResultSchema,
  commitInteropImportResultSchema,
  importInspectionResponseSchema,
  importSessionViewSchema,
  interopImportJobViewSchema,
  interopImportRecordsPageSchema,
  interopRecordViewSchema,
  interopExportPreviewSchema,
  interopExportJobViewSchema,
  pickInteropExportTargetResponseSchema,
  citationKeyPreferenceSchema,
  citationRenderResultSchema,
  knowledgeSearchRebuildResponseSchema,
  knowledgeSearchResponseSchema,
  knowledgeExportPreviewSchema,
  knowledgeExportReportSchema,
  managedRootMigrationJobSchema,
  managedStorageStatusSchema,
  matricesPageSchema,
  matrixCandidatesSchema,
  matrixCellEvidenceSchema,
  matrixCellSchema,
  matrixCellWindowSchema,
  matrixDetailSchema,
  importSessionsResponseSchema,
  mergeRecordViewSchema,
  noteLinkSchema,
  notesPageSchema,
  ocrJobSchema,
  pickPdfResponseSchema,
  pickInteropSourceResponseSchema,
  pickDocumentPathResponseSchema,
  pickAnnotatedExportTargetResponseSchema,
  portableExportJobSchema,
  portableExportPreviewSchema,
  pageTextSearchResponseSchema,
  relinkLocationResponseSchema,
  readerManifestSchema,
  readerStateSchema,
  readingContextCatalogSchema,
  readingContextSchema,
  researchNoteSchema,
  collectionReadingContextSchema,
  searchIndexRebuildResponseSchema,
  tagCandidatesResponseSchema,
  tagDeletionPreviewSchema,
  tagViewSchema,
  textIndexJobSchema,
  tagsResponseSchema,
  workDetailViewSchema,
  workMergePreviewSchema,
  worksPageResponseSchema,
  writingBlockSchema,
  writingDocumentDetailSchema,
  writingDocumentsPageSchema,
  type AddLocalAttachmentInput,
  type AnnotatedExportJob,
  type AnnotatedExportPreview,
  type AnnotatedExportPreviewInput,
  type BulkWorkActionInput,
  type CanonicalImportPreview,
  type CanonicalImportPreviewInput,
  type CanonicalImportReport,
  type ConfirmImportInput,
  type CreateAnnotationInput,
  type CreateClaimEvidenceInput,
  type CreateClaimInput,
  type CreateEvidenceRequest,
  type CreateNoteInput,
  type CreateReadingContextInput,
  type CreateManualWorkInput,
  type CreateMatrixCellEvidenceInput,
  type CreateMatrixCellInput,
  type CreateMatrixInput,
  type CreateNoteLinkInput,
  type CreateSavedQueryInput,
  type CreateTagInput,
  type CreateWorkRelationInput,
  type CreateWritingDocumentInput,
  type ImportSessionStatus,
  type CreateInteropImportInput,
  type InteropFormat,
  type PreviewInteropExportInput,
  type StartInteropExportInput,
  type RenderCitationInput,
  type UpdateInteropRecordDecisionInput,
  type KnowledgeSearchInput,
  type KnowledgeExportPreview,
  type KnowledgeExportPreviewInput,
  type KnowledgeExportReport,
  type KnowledgeSearchRebuildResponse,
  type KnowledgeSearchResponse,
  type ConfirmEvidenceRebindInput,
  type InspectImportInput,
  type MergeTagsInput,
  type MergeWorksInput,
  type ManagedRootMigrationJob,
  type ManagedStorageStatus,
  type OcrJob,
  type OcrLanguage,
  type PrepareImportInput,
  type PickAnnotatedExportTargetInput,
  type PickCanonicalImportSourceInput,
  type PickKnowledgeExportTargetInput,
  type PickAnnotatedExportTargetResponse,
  type PortableExportJob,
  type PortableExportPreview,
  type PortableExportPreviewInput,
  type PageTextSearchResult,
  type PreviewEvidenceRebindInput,
  type StartPortableExportInput,
  type StartCanonicalImportInput,
  type StartKnowledgeExportInput,
  type StructuredSearchInput,
  type TextIndexJob,
  type RelinkLocationResponse,
  type ReaderManifest,
  type ReaderState,
  type Annotation,
  type AnnotationRevision,
  type CollectionReadingContext,
  type ReadingContext,
  type ReadingContextCatalog,
  type SaveReaderStateInput,
  type RetryAnnotatedExportInput,
  type StartAnnotatedExportInput,
  type SystemView,
  type UpdateAnnotationInput,
  type UpdateEvidenceInput,
  type UpdateClaimEvidenceInput,
  type UpdateClaimInput,
  type UpdateMatrixCellInput,
  type UpdateMatrixInput,
  type UpdateMatrixStructureInput,
  type UpdateNoteInput,
  type UpdateCollectionInput,
  type UpdateTagInput,
  type UpdateWorkMetadataInput,
  type UpdateWritingBlockInput,
  type UpdateWritingDocumentInput,
  type UpdateWritingStructureInput,
  type WorkStatus,
  type NoteLink,
  type Claim,
  type ClaimEvidence,
  type ClaimStatus,
  type MatrixCandidates,
  type MatrixCell,
  type MatrixCellEvidence,
  type MatrixCellWindow,
  type MatrixDetail,
  type MatrixStatus,
  type WritingBlock,
  type WritingDocumentDetail,
  type WritingDocumentStatus,
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
export type InteropImportJob = z.infer<typeof interopImportJobViewSchema>;
export type InteropRecord = z.infer<typeof interopRecordViewSchema>;
export type InteropRecordsPage = z.infer<typeof interopImportRecordsPageSchema>;
export type InteropCommitResult = z.infer<typeof commitInteropImportResultSchema>;
export type InteropExportPreview = z.infer<typeof interopExportPreviewSchema>;
export type InteropExportJob = z.infer<typeof interopExportJobViewSchema>;
export type CitationRenderResult = z.infer<typeof citationRenderResultSchema>;
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;
export type TagView = z.infer<typeof tagViewSchema>;
export type TagsResponse = z.infer<typeof tagsResponseSchema>;
export type TagCandidates = z.infer<typeof tagCandidatesResponseSchema>;
export type TagDeletionPreview = z.infer<typeof tagDeletionPreviewSchema>;
export type WorkMergePreview = z.infer<typeof workMergePreviewSchema>;
export type MergeRecordView = z.infer<typeof mergeRecordViewSchema>;
export type AttachmentDeletionPreview = z.infer<typeof attachmentDeletionPreviewSchema>;
export type KnowledgeNotesPage = z.infer<typeof notesPageSchema>;
export type KnowledgeEvidencePage = z.infer<typeof evidencePageSchema>;
export type EvidenceDetail = z.infer<typeof evidenceDetailSchema>;
export type EvidenceRebindPreview = z.infer<typeof evidenceRebindPreviewSchema>;
export type KnowledgeClaimsPage = z.infer<typeof claimsPageSchema>;
export type KnowledgeMatricesPage = z.infer<typeof matricesPageSchema>;
export type KnowledgeWritingDocumentsPage = z.infer<typeof writingDocumentsPageSchema>;

export async function fetchKnowledgeSearch(
  input: KnowledgeSearchInput,
): Promise<KnowledgeSearchResponse> {
  const params = knowledgeListParams(input);
  params.set('query', input.query);
  if (input.workId) params.set('workId', input.workId);
  if (input.entityTypes.length > 0) params.set('entityTypes', input.entityTypes.join(','));
  if (input.statuses.length > 0) params.set('statuses', input.statuses.join(','));
  if (input.sourceStates) params.set('sourceStates', input.sourceStates.join(','));
  return knowledgeSearchResponseSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.knowledgeSearch}?${params.toString()}`),
  );
}

export async function postRebuildKnowledgeSearch(): Promise<KnowledgeSearchRebuildResponse> {
  return knowledgeSearchRebuildResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.knowledgeSearchRebuild, { method: 'POST' }),
  );
}

export async function postKnowledgeExportPreview(
  input: KnowledgeExportPreviewInput,
): Promise<KnowledgeExportPreview> {
  return knowledgeExportPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.knowledgeExportPreview, jsonBody('POST', input)),
  );
}

export async function postPickKnowledgeExportTarget(input: PickKnowledgeExportTargetInput) {
  return pickDocumentPathResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.knowledgeExportPickTarget, jsonBody('POST', input)),
  );
}

export async function postKnowledgeExport(
  input: StartKnowledgeExportInput,
): Promise<KnowledgeExportReport> {
  return knowledgeExportReportSchema.parse(
    await apiRequest(RESEARCH_API_V1.knowledgeExports, jsonBody('POST', input)),
  );
}

export async function postPickCanonicalImportSource(input: PickCanonicalImportSourceInput) {
  return pickDocumentPathResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.canonicalImportPickSource, jsonBody('POST', input)),
  );
}

export async function postCanonicalImportPreview(
  input: CanonicalImportPreviewInput,
): Promise<CanonicalImportPreview> {
  return canonicalImportPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.canonicalImportPreview, jsonBody('POST', input)),
  );
}

export async function postCanonicalImport(
  input: StartCanonicalImportInput,
): Promise<CanonicalImportReport> {
  return canonicalImportReportSchema.parse(
    await apiRequest(RESEARCH_API_V1.canonicalImports, jsonBody('POST', input)),
  );
}

export async function fetchReaderManifest(assetId: string): Promise<ReaderManifest> {
  return readerManifestSchema.parse(await apiRequest(RESEARCH_API_V1.readerManifest(assetId)));
}

export async function fetchReaderState(assetId: string): Promise<ReaderState> {
  return readerStateSchema.parse(await apiRequest(RESEARCH_API_V1.readerState(assetId)));
}

export async function putReaderState(
  assetId: string,
  input: SaveReaderStateInput,
): Promise<ReaderState> {
  return readerStateSchema.parse(
    await apiRequest(RESEARCH_API_V1.readerState(assetId), jsonBody('PUT', input)),
  );
}

export async function fetchTextIndexJob(assetId: string): Promise<TextIndexJob | null> {
  const response = (await apiRequest(RESEARCH_API_V1.assetTextIndex(assetId))) as { job: unknown };
  return textIndexJobSchema.nullable().parse(response.job);
}

async function postTextIndexAction(
  url: string,
  priorityPage?: number | null,
): Promise<TextIndexJob> {
  return textIndexJobSchema.parse(
    await apiRequest(
      url,
      priorityPage === undefined ? { method: 'POST' } : jsonBody('POST', { priorityPage }),
    ),
  );
}

export async function postStartTextIndex(
  assetId: string,
  priorityPage: number,
): Promise<TextIndexJob> {
  return postTextIndexAction(RESEARCH_API_V1.assetTextIndexStart(assetId), priorityPage);
}

export async function postPauseTextIndex(assetId: string): Promise<TextIndexJob> {
  return postTextIndexAction(RESEARCH_API_V1.assetTextIndexPause(assetId));
}

export async function postCancelTextIndex(assetId: string): Promise<TextIndexJob> {
  return postTextIndexAction(RESEARCH_API_V1.assetTextIndexCancel(assetId));
}

export async function postResumeTextIndex(
  assetId: string,
  priorityPage: number,
): Promise<TextIndexJob> {
  return postTextIndexAction(RESEARCH_API_V1.assetTextIndexResume(assetId), priorityPage);
}

export async function postRebuildTextIndex(
  assetId: string,
  priorityPage: number,
): Promise<TextIndexJob> {
  return postTextIndexAction(RESEARCH_API_V1.assetTextIndexRebuild(assetId), priorityPage);
}

export async function fetchOcrJob(assetId: string): Promise<OcrJob | null> {
  const response = (await apiRequest(RESEARCH_API_V1.assetOcr(assetId))) as { job: unknown };
  return ocrJobSchema.nullable().parse(response.job);
}

async function postOcrAction(url: string, languages?: OcrLanguage[]): Promise<OcrJob> {
  return ocrJobSchema.parse(
    await apiRequest(
      url,
      languages ? jsonBody('POST', { languages, confirmed: true }) : { method: 'POST' },
    ),
  );
}

export async function postStartOcr(assetId: string, languages: OcrLanguage[]): Promise<OcrJob> {
  return postOcrAction(RESEARCH_API_V1.assetOcrStart(assetId), languages);
}

export async function postPauseOcr(assetId: string): Promise<OcrJob> {
  return postOcrAction(RESEARCH_API_V1.assetOcrPause(assetId));
}

export async function postCancelOcr(assetId: string): Promise<OcrJob> {
  return postOcrAction(RESEARCH_API_V1.assetOcrCancel(assetId));
}

export async function postResumeOcr(assetId: string): Promise<OcrJob> {
  return postOcrAction(RESEARCH_API_V1.assetOcrResume(assetId));
}

export async function postRebuildOcr(assetId: string, languages: OcrLanguage[]): Promise<OcrJob> {
  return postOcrAction(RESEARCH_API_V1.assetOcrRebuild(assetId), languages);
}

export async function fetchPageTextSearch(
  query: string,
  options: { assetId?: string; limit?: number } = {},
): Promise<PageTextSearchResult[]> {
  const params = new URLSearchParams({ query });
  if (options.assetId) params.set('assetId', options.assetId);
  if (options.limit) params.set('limit', String(options.limit));
  return pageTextSearchResponseSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.pageTextSearch}?${params.toString()}`),
  ).results;
}

export async function fetchReadingContexts(
  status: 'active' | 'archived' | 'all' = 'active',
): Promise<ReadingContextCatalog> {
  const params = new URLSearchParams({ status });
  return readingContextCatalogSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.readingContexts}?${params.toString()}`),
  );
}

export async function postReadingContext(
  input: CreateReadingContextInput,
): Promise<ReadingContext> {
  return readingContextSchema.parse(
    await apiRequest(RESEARCH_API_V1.readingContexts, jsonBody('POST', input)),
  );
}

export async function fetchCollectionReadingContext(
  collectionId: string,
): Promise<CollectionReadingContext> {
  return collectionReadingContextSchema.parse(
    await apiRequest(RESEARCH_API_V1.collectionReadingContext(collectionId)),
  );
}

export async function putCollectionReadingContext(
  collectionId: string,
  contextId: string | null,
): Promise<CollectionReadingContext> {
  return collectionReadingContextSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.collectionReadingContext(collectionId),
      jsonBody('PUT', { contextId }),
    ),
  );
}

export async function fetchAnnotations(
  assetId: string,
  options: {
    contextIds: string[];
    includeGeneral: boolean;
    includeDeleted?: boolean;
  },
): Promise<Annotation[]> {
  const params = new URLSearchParams({
    includeGeneral: String(options.includeGeneral),
    includeDeleted: String(options.includeDeleted ?? false),
  });
  if (options.contextIds.length > 0) params.set('contextIds', options.contextIds.join(','));
  return annotationSchema
    .array()
    .parse(await apiRequest(`${RESEARCH_API_V1.assetAnnotations(assetId)}?${params.toString()}`));
}

export async function fetchAnnotation(id: string): Promise<Annotation> {
  return annotationSchema.parse(await apiRequest(RESEARCH_API_V1.annotation(id)));
}

export async function postAnnotation(
  assetId: string,
  input: CreateAnnotationInput,
): Promise<Annotation> {
  return annotationSchema.parse(
    await apiRequest(RESEARCH_API_V1.assetAnnotations(assetId), jsonBody('POST', input)),
  );
}

export async function patchAnnotation(
  id: string,
  input: UpdateAnnotationInput,
): Promise<Annotation> {
  return annotationSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotation(id), jsonBody('PATCH', input)),
  );
}

export async function deleteResearchAnnotation(
  id: string,
  expectedRevision: number,
): Promise<Annotation> {
  return annotationSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotation(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreAnnotation(
  id: string,
  expectedRevision: number,
): Promise<Annotation> {
  return annotationSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotationRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function fetchAnnotationRevisions(id: string): Promise<AnnotationRevision[]> {
  return annotationRevisionSchema
    .array()
    .parse(await apiRequest(RESEARCH_API_V1.annotationRevisions(id)));
}

function knowledgeListParams(options: {
  contextId?: string | null;
  status?: string;
  cursor?: string | null;
  limit?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  if ('contextId' in options) params.set('contextId', options.contextId ?? 'general');
  if (options.status) params.set('status', options.status);
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit) params.set('limit', String(options.limit));
  return params;
}

export async function fetchKnowledgeNotes(
  options: {
    contextId?: string | null;
    status?: 'active' | 'deleted';
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<KnowledgeNotesPage> {
  const params = knowledgeListParams(options);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return notesPageSchema.parse(await apiRequest(`${RESEARCH_API_V1.notes}${suffix}`));
}

export async function postKnowledgeNote(input: CreateNoteInput) {
  return researchNoteSchema.parse(await apiRequest(RESEARCH_API_V1.notes, jsonBody('POST', input)));
}

export async function patchKnowledgeNote(id: string, input: UpdateNoteInput) {
  return researchNoteSchema.parse(
    await apiRequest(RESEARCH_API_V1.note(id), jsonBody('PATCH', input)),
  );
}

export async function deleteKnowledgeNote(id: string, expectedRevision: number) {
  return researchNoteSchema.parse(
    await apiRequest(RESEARCH_API_V1.note(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreKnowledgeNote(id: string, expectedRevision: number) {
  return researchNoteSchema.parse(
    await apiRequest(RESEARCH_API_V1.noteRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function fetchNoteLinks(noteId: string, includeDeleted = false): Promise<NoteLink[]> {
  const params = new URLSearchParams({ includeDeleted: String(includeDeleted) });
  return noteLinkSchema
    .array()
    .parse(await apiRequest(`${RESEARCH_API_V1.noteLinks(noteId)}?${params.toString()}`));
}

export async function postNoteLink(noteId: string, input: CreateNoteLinkInput): Promise<NoteLink> {
  return noteLinkSchema.parse(
    await apiRequest(RESEARCH_API_V1.noteLinks(noteId), jsonBody('POST', input)),
  );
}

export async function deleteNoteLink(id: string, expectedRevision: number): Promise<NoteLink> {
  return noteLinkSchema.parse(
    await apiRequest(RESEARCH_API_V1.noteLink(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreNoteLink(id: string, expectedRevision: number): Promise<NoteLink> {
  return noteLinkSchema.parse(
    await apiRequest(RESEARCH_API_V1.noteLinkRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function fetchKnowledgeEvidence(
  options: {
    contextId?: string | null;
    workId?: string;
    sourceState?: EvidenceDetail['sourceState'];
    status?: 'active' | 'deleted';
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<KnowledgeEvidencePage> {
  const params = knowledgeListParams(options);
  if (options.workId) params.set('workId', options.workId);
  if (options.sourceState) params.set('sourceState', options.sourceState);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return evidencePageSchema.parse(await apiRequest(`${RESEARCH_API_V1.evidence}${suffix}`));
}

export async function fetchEvidenceDetail(id: string): Promise<EvidenceDetail> {
  return evidenceDetailSchema.parse(await apiRequest(RESEARCH_API_V1.evidenceItem(id)));
}

export async function postKnowledgeEvidence(input: CreateEvidenceRequest): Promise<EvidenceDetail> {
  return evidenceDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.evidence, jsonBody('POST', input)),
  );
}

export async function patchKnowledgeEvidence(id: string, input: UpdateEvidenceInput) {
  return evidenceDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.evidenceItem(id), jsonBody('PATCH', input)),
  );
}

export async function deleteKnowledgeEvidence(id: string, expectedRevision: number) {
  return evidenceDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.evidenceItem(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreKnowledgeEvidence(id: string, expectedRevision: number) {
  return evidenceDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.evidenceRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function postEvidenceRebindPreview(
  id: string,
  input: PreviewEvidenceRebindInput,
): Promise<EvidenceRebindPreview> {
  return evidenceRebindPreviewSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.evidenceRebind(id),
      jsonBody('POST', { mode: 'preview', ...input }),
    ),
  );
}

export async function postConfirmEvidenceRebind(
  id: string,
  input: ConfirmEvidenceRebindInput,
): Promise<EvidenceDetail> {
  return evidenceDetailSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.evidenceRebind(id),
      jsonBody('POST', { mode: 'confirm', ...input }),
    ),
  );
}

export async function fetchKnowledgeClaims(
  options: {
    contextId?: string | null;
    status?: ClaimStatus;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<KnowledgeClaimsPage> {
  const params = knowledgeListParams(options);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return claimsPageSchema.parse(await apiRequest(`${RESEARCH_API_V1.claims}${suffix}`));
}

export async function postKnowledgeClaim(input: CreateClaimInput): Promise<Claim> {
  return claimSchema.parse(await apiRequest(RESEARCH_API_V1.claims, jsonBody('POST', input)));
}

export async function patchKnowledgeClaim(id: string, input: UpdateClaimInput): Promise<Claim> {
  return claimSchema.parse(await apiRequest(RESEARCH_API_V1.claim(id), jsonBody('PATCH', input)));
}

export async function deleteKnowledgeClaim(id: string, expectedRevision: number): Promise<Claim> {
  return claimSchema.parse(
    await apiRequest(RESEARCH_API_V1.claim(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreKnowledgeClaim(
  id: string,
  expectedRevision: number,
): Promise<Claim> {
  return claimSchema.parse(
    await apiRequest(RESEARCH_API_V1.claimRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function fetchClaimEvidence(
  claimId: string,
  includeDeleted = false,
): Promise<ClaimEvidence[]> {
  const params = new URLSearchParams({ includeDeleted: String(includeDeleted) });
  return claimEvidenceSchema
    .array()
    .parse(await apiRequest(`${RESEARCH_API_V1.claimEvidence(claimId)}?${params.toString()}`));
}

export async function postClaimEvidence(
  claimId: string,
  input: CreateClaimEvidenceInput,
): Promise<ClaimEvidence> {
  return claimEvidenceSchema.parse(
    await apiRequest(RESEARCH_API_V1.claimEvidence(claimId), jsonBody('POST', input)),
  );
}

export async function patchClaimEvidence(
  id: string,
  input: UpdateClaimEvidenceInput,
): Promise<ClaimEvidence> {
  return claimEvidenceSchema.parse(
    await apiRequest(RESEARCH_API_V1.claimEvidenceItem(id), jsonBody('PATCH', input)),
  );
}

export async function deleteClaimEvidence(
  id: string,
  expectedRevision: number,
): Promise<ClaimEvidence> {
  return claimEvidenceSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.claimEvidenceItem(id),
      jsonBody('DELETE', { expectedRevision }),
    ),
  );
}

export async function postRestoreClaimEvidence(
  id: string,
  expectedRevision: number,
): Promise<ClaimEvidence> {
  return claimEvidenceSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.claimEvidenceRestore(id),
      jsonBody('POST', { expectedRevision }),
    ),
  );
}

export async function fetchKnowledgeMatrices(
  options: {
    contextId?: string | null;
    status?: MatrixStatus;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<KnowledgeMatricesPage> {
  const params = knowledgeListParams(options);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return matricesPageSchema.parse(await apiRequest(`${RESEARCH_API_V1.matrices}${suffix}`));
}

export async function fetchKnowledgeMatrix(
  id: string,
  includeDeleted = false,
): Promise<MatrixDetail> {
  const params = new URLSearchParams({ includeDeleted: String(includeDeleted) });
  return matrixDetailSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.matrix(id)}?${params.toString()}`),
  );
}

export async function postKnowledgeMatrix(input: CreateMatrixInput): Promise<MatrixDetail> {
  return matrixDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrices, jsonBody('POST', input)),
  );
}

export async function patchKnowledgeMatrix(
  id: string,
  input: UpdateMatrixInput,
): Promise<MatrixDetail> {
  return matrixDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrix(id), jsonBody('PATCH', input)),
  );
}

export async function deleteKnowledgeMatrix(
  id: string,
  expectedRevision: number,
): Promise<MatrixDetail> {
  return matrixDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrix(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreKnowledgeMatrix(
  id: string,
  expectedRevision: number,
): Promise<MatrixDetail> {
  return matrixDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixRestore(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function putKnowledgeMatrixStructure(
  id: string,
  input: UpdateMatrixStructureInput,
): Promise<MatrixDetail> {
  return matrixDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixStructure(id), jsonBody('PUT', input)),
  );
}

export async function fetchWritingDocuments(
  options: {
    contextId?: string | null;
    status?: WritingDocumentStatus;
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<KnowledgeWritingDocumentsPage> {
  const params = knowledgeListParams(options);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return writingDocumentsPageSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.writingDocuments}${suffix}`),
  );
}

export async function fetchWritingDocument(
  id: string,
  includeDeletedStructure = false,
): Promise<WritingDocumentDetail> {
  const params = new URLSearchParams({
    includeDeletedStructure: String(includeDeletedStructure),
  });
  return writingDocumentDetailSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.writingDocument(id)}?${params.toString()}`),
  );
}

export async function postWritingDocument(
  input: CreateWritingDocumentInput,
): Promise<WritingDocumentDetail> {
  return writingDocumentDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.writingDocuments, jsonBody('POST', input)),
  );
}

export async function patchWritingDocument(
  id: string,
  input: UpdateWritingDocumentInput,
): Promise<WritingDocumentDetail> {
  return writingDocumentDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.writingDocument(id), jsonBody('PATCH', input)),
  );
}

export async function deleteWritingDocument(
  id: string,
  expectedRevision: number,
): Promise<WritingDocumentDetail> {
  return writingDocumentDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.writingDocument(id), jsonBody('DELETE', { expectedRevision })),
  );
}

export async function postRestoreWritingDocument(
  id: string,
  expectedRevision: number,
): Promise<WritingDocumentDetail> {
  return writingDocumentDetailSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.writingDocumentRestore(id),
      jsonBody('POST', { expectedRevision }),
    ),
  );
}

export async function putWritingStructure(
  id: string,
  input: UpdateWritingStructureInput,
): Promise<WritingDocumentDetail> {
  return writingDocumentDetailSchema.parse(
    await apiRequest(RESEARCH_API_V1.writingDocumentStructure(id), jsonBody('PUT', input)),
  );
}

export async function patchWritingBlock(
  id: string,
  input: UpdateWritingBlockInput,
): Promise<WritingBlock> {
  return writingBlockSchema.parse(
    await apiRequest(RESEARCH_API_V1.writingBlock(id), jsonBody('PATCH', input)),
  );
}

export async function fetchMatrixCandidates(
  matrixId: string,
  rowId: string,
  columnId: string,
): Promise<MatrixCandidates> {
  const params = new URLSearchParams({ rowId, columnId });
  return matrixCandidatesSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.matrixCandidates(matrixId)}?${params.toString()}`),
  );
}

export async function postMatrixCell(
  matrixId: string,
  input: CreateMatrixCellInput,
): Promise<MatrixCell> {
  return matrixCellSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixCells(matrixId), jsonBody('POST', input)),
  );
}

export async function fetchMatrixCell(id: string): Promise<MatrixCell> {
  return matrixCellSchema.parse(await apiRequest(RESEARCH_API_V1.matrixCell(id)));
}

export async function fetchMatrixCellWindow(
  matrixId: string,
  columnOffset: number,
  columnLimit: number,
  rowOffset: number,
  rowLimit: number,
): Promise<MatrixCellWindow> {
  const params = new URLSearchParams({
    columnOffset: String(columnOffset),
    columnLimit: String(columnLimit),
    rowOffset: String(rowOffset),
    rowLimit: String(rowLimit),
  });
  return matrixCellWindowSchema.parse(
    await apiRequest(`${RESEARCH_API_V1.matrixCells(matrixId)}?${params.toString()}`),
  );
}

export async function patchMatrixCell(
  id: string,
  input: UpdateMatrixCellInput,
): Promise<MatrixCell> {
  return matrixCellSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixCell(id), jsonBody('PATCH', input)),
  );
}

export async function postReviewMatrixCell(
  id: string,
  expectedRevision: number,
): Promise<MatrixCell> {
  return matrixCellSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixCellReview(id), jsonBody('POST', { expectedRevision })),
  );
}

export async function fetchMatrixCellEvidence(
  cellId: string,
  includeDeleted = false,
): Promise<MatrixCellEvidence[]> {
  const params = new URLSearchParams({ includeDeleted: String(includeDeleted) });
  return matrixCellEvidenceSchema
    .array()
    .parse(await apiRequest(`${RESEARCH_API_V1.matrixCellEvidence(cellId)}?${params.toString()}`));
}

export async function postMatrixCellEvidence(
  cellId: string,
  input: CreateMatrixCellEvidenceInput,
): Promise<MatrixCellEvidence> {
  return matrixCellEvidenceSchema.parse(
    await apiRequest(RESEARCH_API_V1.matrixCellEvidence(cellId), jsonBody('POST', input)),
  );
}

export async function deleteMatrixCellEvidence(
  id: string,
  expectedRevision: number,
): Promise<MatrixCellEvidence> {
  return matrixCellEvidenceSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.matrixCellEvidenceItem(id),
      jsonBody('DELETE', { expectedRevision }),
    ),
  );
}

export async function postRestoreMatrixCellEvidence(
  id: string,
  expectedRevision: number,
): Promise<MatrixCellEvidence> {
  return matrixCellEvidenceSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.matrixCellEvidenceRestore(id),
      jsonBody('POST', { expectedRevision }),
    ),
  );
}

export async function postAnnotatedExportPreview(
  assetId: string,
  input: AnnotatedExportPreviewInput,
): Promise<AnnotatedExportPreview> {
  return annotatedExportPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.assetAnnotatedExportPreview(assetId), jsonBody('POST', input)),
  );
}

export async function postPickAnnotatedExportTarget(
  assetId: string,
  input: PickAnnotatedExportTargetInput,
): Promise<PickAnnotatedExportTargetResponse> {
  return pickAnnotatedExportTargetResponseSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.assetAnnotatedExportPickTarget(assetId),
      jsonBody('POST', input),
    ),
  );
}

export async function postAnnotatedExport(
  assetId: string,
  input: StartAnnotatedExportInput,
): Promise<AnnotatedExportJob> {
  return annotatedExportJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.assetAnnotatedExports(assetId), jsonBody('POST', input)),
  );
}

export async function fetchAnnotatedExport(id: string): Promise<AnnotatedExportJob> {
  return annotatedExportJobSchema.parse(await apiRequest(RESEARCH_API_V1.annotatedExportJob(id)));
}

export async function postCancelAnnotatedExport(id: string): Promise<AnnotatedExportJob> {
  return annotatedExportJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotatedExportCancel(id), { method: 'POST' }),
  );
}

export async function postRetryAnnotatedExport(
  id: string,
  input: RetryAnnotatedExportInput,
): Promise<AnnotatedExportJob> {
  return annotatedExportJobSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotatedExportRetry(id), jsonBody('POST', input)),
  );
}

export async function postOpenAnnotatedExportLocation(id: string): Promise<{ opened: true }> {
  return annotatedExportOpenLocationResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.annotatedExportOpenLocation(id), { method: 'POST' }),
  );
}

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

export async function postPickInteropSource(format?: InteropFormat) {
  return pickInteropSourceResponseSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.interopImportPickSource,
      jsonBody('POST', format ? { format } : {}),
    ),
  );
}

export async function postCreateInteropImport(
  input: CreateInteropImportInput,
): Promise<InteropImportJob> {
  return interopImportJobViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopImports, jsonBody('POST', input)),
  );
}

export async function fetchInteropImport(id: string): Promise<InteropImportJob> {
  return interopImportJobViewSchema.parse(await apiRequest(RESEARCH_API_V1.interopImport(id)));
}

export async function postStartInteropImport(id: string): Promise<InteropImportJob> {
  return interopImportJobViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopImportParse(id), { method: 'POST' }),
  );
}

export async function fetchInteropImportRecords(
  id: string,
  options: { offset?: number; limit?: number; status?: InteropRecord['status'] } = {},
): Promise<InteropRecordsPage> {
  const params = new URLSearchParams();
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);
  const query = params.toString();
  return interopImportRecordsPageSchema.parse(
    await apiRequest(
      query
        ? `${RESEARCH_API_V1.interopImportRecords(id)}?${query}`
        : RESEARCH_API_V1.interopImportRecords(id),
    ),
  );
}

export async function putInteropRecordDecision(
  jobId: string,
  recordId: string,
  input: UpdateInteropRecordDecisionInput,
): Promise<InteropRecord> {
  return interopRecordViewSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.interopImportRecordDecision(jobId, recordId),
      jsonBody('PUT', input),
    ),
  );
}

export async function postCommitInteropImport(
  id: string,
  expectedRevision: number,
): Promise<InteropCommitResult> {
  return commitInteropImportResultSchema.parse(
    await apiRequest(
      RESEARCH_API_V1.interopImportCommit(id),
      jsonBody('POST', { expectedRevision }),
    ),
  );
}

export async function postCancelInteropImport(id: string): Promise<InteropImportJob> {
  return interopImportJobViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopImportCancel(id), { method: 'POST' }),
  );
}

export async function postPreviewInteropExport(
  input: PreviewInteropExportInput,
): Promise<InteropExportPreview> {
  return interopExportPreviewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopExportPreview, jsonBody('POST', input)),
  );
}

export async function postPickInteropExportTarget(format: InteropFormat) {
  return pickInteropExportTargetResponseSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopExportPickTarget, jsonBody('POST', { format })),
  );
}

export async function postStartInteropExport(
  id: string,
  input: StartInteropExportInput,
): Promise<InteropExportJob> {
  return interopExportJobViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopExport(id), jsonBody('POST', input)),
  );
}

export async function fetchInteropExport(id: string): Promise<InteropExportJob> {
  return interopExportJobViewSchema.parse(await apiRequest(RESEARCH_API_V1.interopExport(id)));
}

export async function postCancelInteropExport(id: string): Promise<InteropExportJob> {
  return interopExportJobViewSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopExportCancel(id), { method: 'POST' }),
  );
}

export async function putInteropCitationKey(
  workId: string,
  input: { editionId: string | null; preferredKey: string; expectedRevision: number },
) {
  return citationKeyPreferenceSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopCitationKey(workId), jsonBody('PUT', input)),
  );
}

export async function postRenderCitation(
  input: RenderCitationInput,
): Promise<CitationRenderResult> {
  return citationRenderResultSchema.parse(
    await apiRequest(RESEARCH_API_V1.interopCitationRender, jsonBody('POST', input)),
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
