import { z } from 'zod';

export const RESEARCH_MODULE_ID = 'research';
const API_ROOT = '/api/research/v1';

export const RESEARCH_API_V1 = {
  works: `${API_ROOT}/works`,
  workSearch: `${API_ROOT}/works/search`,
  work: (id: string) => `${API_ROOT}/works/${id}`,
  workMetadata: (id: string) => `${API_ROOT}/works/${id}/metadata`,
  workCollections: (id: string) => `${API_ROOT}/works/${id}/collections`,
  workTrash: (id: string) => `${API_ROOT}/works/${id}/trash`,
  workRestore: (id: string) => `${API_ROOT}/works/${id}/restore`,
  workDeletionPreview: (id: string) => `${API_ROOT}/works/${id}/deletion-preview`,
  workPermanentDelete: (id: string) => `${API_ROOT}/works/${id}/permanent-delete`,
  workManual: `${API_ROOT}/works/manual`,
  workBulkPreview: `${API_ROOT}/works/bulk/preview`,
  workBulk: `${API_ROOT}/works/bulk`,
  workRelations: (id: string) => `${API_ROOT}/works/${id}/relations`,
  workTags: (id: string) => `${API_ROOT}/works/${id}/tags`,
  workMergePreview: (id: string) => `${API_ROOT}/works/${id}/merge-preview`,
  workMerge: (id: string) => `${API_ROOT}/works/${id}/merge`,
  workRelation: (id: string) => `${API_ROOT}/work-relations/${id}`,
  tags: `${API_ROOT}/tags`,
  tag: (id: string) => `${API_ROOT}/tags/${id}`,
  tagCandidates: `${API_ROOT}/tags/candidates`,
  tagDeletionPreview: (id: string) => `${API_ROOT}/tags/${id}/deletion-preview`,
  tagRestore: (id: string) => `${API_ROOT}/tags/${id}/restore`,
  tagPermanentDelete: (id: string) => `${API_ROOT}/tags/${id}/permanent-delete`,
  tagMerge: `${API_ROOT}/tags/merge`,
  mergeUndo: (id: string) => `${API_ROOT}/merge-records/${id}/undo`,
  searchIndexRebuild: `${API_ROOT}/search-index/rebuild`,
  savedQueries: `${API_ROOT}/saved-queries`,
  savedQueryRun: (id: string) => `${API_ROOT}/saved-queries/${id}/run`,
  editionAttachments: (id: string) => `${API_ROOT}/editions/${id}/attachments`,
  collections: `${API_ROOT}/collections`,
  collection: (id: string) => `${API_ROOT}/collections/${id}`,
  collectionDeletionPreview: (id: string) => `${API_ROOT}/collections/${id}/deletion-preview`,
  importSessions: `${API_ROOT}/import-sessions`,
  importSession: (id: string) => `${API_ROOT}/import-sessions/${id}`,
  importPickFiles: `${API_ROOT}/import-sessions/pick-files`,
  importUpload: `${API_ROOT}/import-sessions/upload`,
  importInspect: (id: string) => `${API_ROOT}/import-sessions/${id}/inspect`,
  importInspectAsync: (id: string) => `${API_ROOT}/import-sessions/${id}/inspect-async`,
  importInspection: (id: string) => `${API_ROOT}/import-sessions/${id}/inspection`,
  importConfirm: (id: string) => `${API_ROOT}/import-sessions/${id}/confirm`,
  importCommit: (id: string) => `${API_ROOT}/import-sessions/${id}/commit`,
  importCancel: (id: string) => `${API_ROOT}/import-sessions/${id}/cancel`,
  importItemDecision: (sessionId: string, itemId: string) =>
    `${API_ROOT}/import-sessions/${sessionId}/items/${itemId}/decision`,
  importItemRetry: (sessionId: string, itemId: string) =>
    `${API_ROOT}/import-sessions/${sessionId}/items/${itemId}/retry`,
  locationCheck: (id: string) => `${API_ROOT}/locations/${id}/check`,
  locationRelink: (id: string) => `${API_ROOT}/locations/${id}/relink`,
  attachment: (id: string) => `${API_ROOT}/attachments/${id}`,
  attachmentRestore: (id: string) => `${API_ROOT}/attachments/${id}/restore`,
  attachmentDeletionPreview: (id: string) => `${API_ROOT}/attachments/${id}/deletion-preview`,
  attachmentPermanentDelete: (id: string) => `${API_ROOT}/attachments/${id}/permanent-delete`,
  reconcile: `${API_ROOT}/reconcile`,
  exportPreview: `${API_ROOT}/exports/preview`,
  exports: `${API_ROOT}/exports`,
  exportJob: (id: string) => `${API_ROOT}/exports/${id}`,
  exportCancel: (id: string) => `${API_ROOT}/exports/${id}/cancel`,
  managedStorage: `${API_ROOT}/managed-storage`,
  managedRootMigrations: `${API_ROOT}/managed-storage/migrations`,
  managedRootMigration: (id: string) => `${API_ROOT}/managed-storage/migrations/${id}`,
  managedRootMigrationCancel: (id: string) => `${API_ROOT}/managed-storage/migrations/${id}/cancel`,
  managedRootMigrationRetry: (id: string) => `${API_ROOT}/managed-storage/migrations/${id}/retry`,
  readerManifest: (id: string) => `${API_ROOT}/assets/${id}/reader`,
  assetContent: (id: string) => `${API_ROOT}/assets/${id}/content`,
  readerState: (id: string) => `${API_ROOT}/assets/${id}/reader-state`,
  assetTextIndex: (id: string) => `${API_ROOT}/assets/${id}/text-index`,
  assetTextIndexStart: (id: string) => `${API_ROOT}/assets/${id}/text-index/start`,
  assetTextIndexPause: (id: string) => `${API_ROOT}/assets/${id}/text-index/pause`,
  assetTextIndexCancel: (id: string) => `${API_ROOT}/assets/${id}/text-index/cancel`,
  assetTextIndexResume: (id: string) => `${API_ROOT}/assets/${id}/text-index/resume`,
  assetTextIndexRebuild: (id: string) => `${API_ROOT}/assets/${id}/text-index/rebuild`,
  assetOcr: (id: string) => `${API_ROOT}/assets/${id}/ocr`,
  assetOcrStart: (id: string) => `${API_ROOT}/assets/${id}/ocr/start`,
  assetOcrPause: (id: string) => `${API_ROOT}/assets/${id}/ocr/pause`,
  assetOcrCancel: (id: string) => `${API_ROOT}/assets/${id}/ocr/cancel`,
  assetOcrResume: (id: string) => `${API_ROOT}/assets/${id}/ocr/resume`,
  assetOcrRebuild: (id: string) => `${API_ROOT}/assets/${id}/ocr/rebuild`,
  assetAnnotatedExportPreview: (id: string) => `${API_ROOT}/assets/${id}/annotated-export/preview`,
  assetAnnotatedExportPickTarget: (id: string) =>
    `${API_ROOT}/assets/${id}/annotated-export/pick-target`,
  assetAnnotatedExports: (id: string) => `${API_ROOT}/assets/${id}/annotated-exports`,
  annotatedExportJob: (id: string) => `${API_ROOT}/annotated-exports/${id}`,
  annotatedExportCancel: (id: string) => `${API_ROOT}/annotated-exports/${id}/cancel`,
  annotatedExportRetry: (id: string) => `${API_ROOT}/annotated-exports/${id}/retry`,
  annotatedExportOpenLocation: (id: string) => `${API_ROOT}/annotated-exports/${id}/open-location`,
  pageTextSearch: `${API_ROOT}/page-text/search`,
  readingContexts: `${API_ROOT}/reading-contexts`,
  readingContext: (id: string) => `${API_ROOT}/reading-contexts/${id}`,
  readingContextDeletionPreview: (id: string) =>
    `${API_ROOT}/reading-contexts/${id}/deletion-preview`,
  readingContextArchive: (id: string) => `${API_ROOT}/reading-contexts/${id}/archive`,
  readingContextRestore: (id: string) => `${API_ROOT}/reading-contexts/${id}/restore`,
  collectionReadingContext: (id: string) => `${API_ROOT}/collections/${id}/reading-context`,
  assetAnnotations: (id: string) => `${API_ROOT}/assets/${id}/annotations`,
  annotation: (id: string) => `${API_ROOT}/annotations/${id}`,
  annotationRestore: (id: string) => `${API_ROOT}/annotations/${id}/restore`,
  annotationRevisions: (id: string) => `${API_ROOT}/annotations/${id}/revisions`,
  knowledgeSummary: `${API_ROOT}/knowledge/summary`,
  knowledgeSearch: `${API_ROOT}/knowledge/search`,
  knowledgeSearchRebuild: `${API_ROOT}/knowledge/search/rebuild`,
  knowledgeExportPreview: `${API_ROOT}/knowledge/exports/preview`,
  knowledgeExportPickTarget: `${API_ROOT}/knowledge/exports/pick-target`,
  knowledgeExports: `${API_ROOT}/knowledge/exports`,
  canonicalImportPickSource: `${API_ROOT}/canonical-imports/pick-source`,
  canonicalImportPreview: `${API_ROOT}/canonical-imports/preview`,
  canonicalImports: `${API_ROOT}/canonical-imports`,
  interopImportPickSource: `${API_ROOT}/interop/imports/pick-source`,
  interopImports: `${API_ROOT}/interop/imports`,
  interopImport: (id: string) => `${API_ROOT}/interop/imports/${id}`,
  interopImportParse: (id: string) => `${API_ROOT}/interop/imports/${id}/parse`,
  interopImportCancel: (id: string) => `${API_ROOT}/interop/imports/${id}/cancel`,
  interopImportRecords: (id: string) => `${API_ROOT}/interop/imports/${id}/records`,
  interopImportRecordDecision: (id: string, recordId: string) =>
    `${API_ROOT}/interop/imports/${id}/records/${recordId}/decision`,
  interopImportCommit: (id: string) => `${API_ROOT}/interop/imports/${id}/commit`,
  notes: `${API_ROOT}/notes`,
  note: (id: string) => `${API_ROOT}/notes/${id}`,
  noteRestore: (id: string) => `${API_ROOT}/notes/${id}/restore`,
  noteRevisions: (id: string) => `${API_ROOT}/notes/${id}/revisions`,
  noteLinks: (id: string) => `${API_ROOT}/notes/${id}/links`,
  noteLink: (id: string) => `${API_ROOT}/note-links/${id}`,
  noteLinkRestore: (id: string) => `${API_ROOT}/note-links/${id}/restore`,
  evidence: `${API_ROOT}/evidence`,
  evidenceItem: (id: string) => `${API_ROOT}/evidence/${id}`,
  evidenceRebind: (id: string) => `${API_ROOT}/evidence/${id}/rebind`,
  evidenceRestore: (id: string) => `${API_ROOT}/evidence/${id}/restore`,
  evidenceRevisions: (id: string) => `${API_ROOT}/evidence/${id}/revisions`,
  claims: `${API_ROOT}/claims`,
  claim: (id: string) => `${API_ROOT}/claims/${id}`,
  claimRestore: (id: string) => `${API_ROOT}/claims/${id}/restore`,
  claimRevisions: (id: string) => `${API_ROOT}/claims/${id}/revisions`,
  claimEvidence: (id: string) => `${API_ROOT}/claims/${id}/evidence`,
  claimEvidenceItem: (id: string) => `${API_ROOT}/claim-evidence/${id}`,
  claimEvidenceRestore: (id: string) => `${API_ROOT}/claim-evidence/${id}/restore`,
  matrices: `${API_ROOT}/matrices`,
  matrix: (id: string) => `${API_ROOT}/matrices/${id}`,
  matrixRestore: (id: string) => `${API_ROOT}/matrices/${id}/restore`,
  matrixRevisions: (id: string) => `${API_ROOT}/matrices/${id}/revisions`,
  matrixStructure: (id: string) => `${API_ROOT}/matrices/${id}/structure`,
  matrixCandidates: (id: string) => `${API_ROOT}/matrices/${id}/candidates`,
  matrixCells: (id: string) => `${API_ROOT}/matrices/${id}/cells`,
  matrixCell: (id: string) => `${API_ROOT}/matrix-cells/${id}`,
  matrixCellRestore: (id: string) => `${API_ROOT}/matrix-cells/${id}/restore`,
  matrixCellEvidence: (id: string) => `${API_ROOT}/matrix-cells/${id}/evidence`,
  matrixCellReview: (id: string) => `${API_ROOT}/matrix-cells/${id}/review`,
  matrixCellEvidenceItem: (id: string) => `${API_ROOT}/matrix-cell-evidence/${id}`,
  matrixCellEvidenceRestore: (id: string) => `${API_ROOT}/matrix-cell-evidence/${id}/restore`,
  writingDocuments: `${API_ROOT}/writing-documents`,
  writingDocument: (id: string) => `${API_ROOT}/writing-documents/${id}`,
  writingDocumentRestore: (id: string) => `${API_ROOT}/writing-documents/${id}/restore`,
  writingDocumentStructure: (id: string) => `${API_ROOT}/writing-documents/${id}/structure`,
  writingBlock: (id: string) => `${API_ROOT}/writing-blocks/${id}`,
} as const;

export const WORK_TYPES = [
  'article',
  'conference-paper',
  'preprint',
  'thesis',
  'book-chapter',
  'report',
  'standard',
  'dataset',
  'web',
  'unknown',
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_STATUSES = ['active', 'trashed', 'merged'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const SYSTEM_VIEWS = [
  'all',
  'uncategorized',
  'trash',
  'missing-files',
  'metadata-review',
  'duplicate-candidates',
] as const;
export type SystemView = (typeof SYSTEM_VIEWS)[number];

export const WORK_RELATION_KINDS = ['related', 'extends', 'revises', 'cites'] as const;
export type WorkRelationKind = (typeof WORK_RELATION_KINDS)[number];

export const EDITION_KINDS = [
  'journal',
  'conference',
  'preprint',
  'thesis',
  'report',
  'other',
  'unknown',
] as const;
export type EditionKind = (typeof EDITION_KINDS)[number];

export const IDENTIFIER_SCHEMES = ['doi', 'arxiv', 'isbn', 'issn', 'pmid', 'url'] as const;
export type IdentifierScheme = (typeof IDENTIFIER_SCHEMES)[number];

export const STORAGE_MODES = ['managed', 'linked'] as const;
export type StorageMode = (typeof STORAGE_MODES)[number];

export const ASSET_STATES = ['active', 'recycled'] as const;
export type AssetState = (typeof ASSET_STATES)[number];

export const LOCATION_STATES = [
  'pending',
  'available',
  'missing',
  'changed',
  'recycled',
  'error',
] as const;
export type LocationState = (typeof LOCATION_STATES)[number];

export const ATTACHMENT_ROLES = [
  'primary-pdf',
  'supplement',
  'dataset',
  'code',
  'web-snapshot',
  'other',
] as const;
export type AttachmentRole = (typeof ATTACHMENT_ROLES)[number];

export const ATTACHMENT_STATUSES = ['active', 'recycled'] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUSES)[number];

export const METADATA_SOURCE_KINDS = [
  'user',
  'exact-external',
  'external',
  'embedded-pdf',
  'first-page',
  'filename',
] as const;
export type MetadataSourceKind = (typeof METADATA_SOURCE_KINDS)[number];

export const IMPORT_SESSION_STATUSES = [
  'draft',
  'inspecting',
  'awaiting-confirmation',
  'committing',
  'completed',
  'cancelled',
  'failed',
  'reconciling',
] as const;
export type ImportSessionStatus = (typeof IMPORT_SESSION_STATUSES)[number];

export const IMPORT_ITEM_STAGES = [
  'selected',
  'hashing',
  'staged',
  'object-ready',
  'linked-verified',
  'metadata',
  'metadata-failed',
  'awaiting-confirmation',
  'database-committed',
  'available',
  'cancelled',
  'failed',
] as const;
export type ImportItemStage = (typeof IMPORT_ITEM_STAGES)[number];

export const DUPLICATE_DECISIONS = [
  'existing-edition',
  'new-edition',
  'new-work',
  'defer',
  'discard',
] as const;
export type DuplicateDecision = (typeof DUPLICATE_DECISIONS)[number];

export const RESEARCH_ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_FOUND',
  'CONFLICT',
  'IMPORT_CANCELLED',
  'FILE_MISSING',
  'FILE_CHANGED',
  'FILE_BUSY',
  'FILE_PERMISSION_DENIED',
  'FILE_NO_SPACE',
  'FILE_CROSS_DEVICE',
  'FILE_IO',
  'PDF_INVALID',
  'PDF_TIMEOUT',
  'METADATA_OFFLINE',
  'METADATA_RATE_LIMITED',
  'METADATA_FAILED',
  'READER_ASSET_NOT_FOUND',
  'READER_ASSET_RECYCLED',
  'READER_ASSET_UNAVAILABLE',
  'READER_NOT_PDF',
  'READER_RANGE_INVALID',
  'READER_STATE_CONFLICT',
  'READER_INDEX_NOT_FOUND',
  'READER_INDEX_FAILED',
  'READER_OCR_NOT_FOUND',
  'READER_OCR_BUSY',
  'READER_OCR_FAILED',
  'READER_EXPORT_NOT_FOUND',
  'READER_EXPORT_BUSY',
  'READER_EXPORT_FAILED',
  'READER_EXPORT_TARGET_EXISTS',
  'ANNOTATION_ASSET_NOT_FOUND',
  'ANNOTATION_CONTEXT_NOT_FOUND',
  'ANNOTATION_NOT_FOUND',
  'ANNOTATION_CONFLICT',
  'ANNOTATION_INVALID',
  'KNOWLEDGE_CONTEXT_NOT_FOUND',
  'KNOWLEDGE_CONTEXT_ARCHIVED',
  'KNOWLEDGE_NOTE_NOT_FOUND',
  'KNOWLEDGE_EVIDENCE_NOT_FOUND',
  'KNOWLEDGE_CLAIM_NOT_FOUND',
  'KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND',
  'KNOWLEDGE_MATRIX_NOT_FOUND',
  'KNOWLEDGE_MATRIX_CELL_NOT_FOUND',
  'KNOWLEDGE_MATRIX_CELL_EVIDENCE_NOT_FOUND',
  'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND',
  'KNOWLEDGE_WRITING_BLOCK_NOT_FOUND',
  'KNOWLEDGE_SOURCE_NOT_FOUND',
  'KNOWLEDGE_CONFLICT',
  'KNOWLEDGE_INVALID',
] as const;
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];

export const READER_LAYOUTS = ['continuous', 'single-page'] as const;
export type ReaderLayout = (typeof READER_LAYOUTS)[number];

export const READER_ROTATIONS = [0, 90, 180, 270] as const;
export type ReaderRotation = (typeof READER_ROTATIONS)[number];

export const READER_LOADING_STATES = [
  'idle',
  'opening',
  'ready',
  'password-required',
  'sleeping',
  'error',
] as const;
export type ReaderLoadingState = (typeof READER_LOADING_STATES)[number];

export const READING_CONTEXT_STATUSES = ['active', 'archived'] as const;
export type ReadingContextStatus = (typeof READING_CONTEXT_STATUSES)[number];

export const ANNOTATION_KINDS = [
  'highlight',
  'underline',
  'strikeout',
  'area',
  'note',
  'bookmark',
] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const ANNOTATION_STATUSES = ['active', 'deleted', 'needs-review'] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

export const KNOWLEDGE_BASIC_STATUSES = ['active', 'deleted'] as const;
export type KnowledgeBasicStatus = (typeof KNOWLEDGE_BASIC_STATUSES)[number];

export const CLAIM_STATUSES = ['draft', 'active', 'archived', 'deleted'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_EDITABLE_STATUSES = ['draft', 'active', 'archived'] as const;
export type ClaimEditableStatus = (typeof CLAIM_EDITABLE_STATUSES)[number];

export const CLAIM_EVIDENCE_RELATIONS = ['supports', 'refutes', 'qualifies'] as const;
export type ClaimEvidenceRelation = (typeof CLAIM_EVIDENCE_RELATIONS)[number];

export const MATRIX_STATUSES = ['active', 'archived', 'deleted'] as const;
export type MatrixStatus = (typeof MATRIX_STATUSES)[number];

export const MATRIX_ROW_KINDS = ['claim', 'dimension'] as const;
export type MatrixRowKind = (typeof MATRIX_ROW_KINDS)[number];

export const MATRIX_REVIEW_STATES = ['current', 'needs-review'] as const;
export type MatrixReviewState = (typeof MATRIX_REVIEW_STATES)[number];

export const WRITING_DOCUMENT_STATUSES = ['active', 'archived', 'deleted'] as const;
export type WritingDocumentStatus = (typeof WRITING_DOCUMENT_STATUSES)[number];

export const WRITING_BLOCK_KINDS = ['text', 'note', 'evidence', 'claim', 'matrix'] as const;
export type WritingBlockKind = (typeof WRITING_BLOCK_KINDS)[number];

export const WRITING_RESOURCE_STATES = ['current', 'archived', 'deleted', 'unavailable'] as const;
export type WritingResourceState = (typeof WRITING_RESOURCE_STATES)[number];

export const KNOWLEDGE_SEARCH_ENTITY_TYPES = [
  'note',
  'evidence',
  'claim',
  'writing-document',
] as const;
export type KnowledgeSearchEntityType = (typeof KNOWLEDGE_SEARCH_ENTITY_TYPES)[number];

export const KNOWLEDGE_SEARCH_STATUSES = ['active', 'draft', 'archived', 'deleted'] as const;
export type KnowledgeSearchStatus = (typeof KNOWLEDGE_SEARCH_STATUSES)[number];

export const EVIDENCE_SOURCE_KINDS = ['pdf', 'ocr'] as const;
export type EvidenceSourceKind = (typeof EVIDENCE_SOURCE_KINDS)[number];

export const EVIDENCE_SOURCE_STATES = [
  'current',
  'annotation-revised',
  'annotation-deleted',
  'asset-mismatch',
  'source-unavailable',
] as const;
export type EvidenceSourceState = (typeof EVIDENCE_SOURCE_STATES)[number];

export const KNOWLEDGE_ENTITY_TYPES = [
  'note',
  'evidence',
  'note-link',
  'claim',
  'claim-evidence',
  'matrix',
  'matrix-column',
  'matrix-row',
  'matrix-cell',
  'matrix-cell-evidence',
  'writing-document',
  'writing-section',
  'writing-block',
] as const;
export type KnowledgeEntityType = (typeof KNOWLEDGE_ENTITY_TYPES)[number];

export const KNOWLEDGE_REVISION_REASONS = [
  'update',
  'delete',
  'restore',
  'rebind',
  'move-context',
  'link',
  'unlink',
  'archive',
  'reorder',
  'review',
] as const;
export type KnowledgeRevisionReason = (typeof KNOWLEDGE_REVISION_REASONS)[number];

export const ANNOTATED_EXPORT_TREATMENTS = ['standard', 'flattened', 'skipped'] as const;
export type AnnotatedExportTreatment = (typeof ANNOTATED_EXPORT_TREATMENTS)[number];

export const GENERAL_READING_CONTEXT_ID = 'general' as const;

export const READING_CONTEXT_ARCHIVE_STRATEGIES = ['move-to-general', 'keep-archived'] as const;
export type ReadingContextArchiveStrategy = (typeof READING_CONTEXT_ARCHIVE_STRATEGIES)[number];

export const DERIVED_JOB_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
] as const;
export type DerivedJobStatus = (typeof DERIVED_JOB_STATUSES)[number];

export const TEXT_INDEX_STATUSES = [...DERIVED_JOB_STATUSES, 'ocr-recommended'] as const;
export type TextIndexStatus = (typeof TEXT_INDEX_STATUSES)[number];

export const OCR_LANGUAGES = ['eng', 'chi_sim'] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

export const instantSchema = z.string().datetime({ precision: 3 });
export const researchIdSchema = z.string().min(1).max(128);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const readerStatePositionSchema = z.object({
  pageNumber: z.number().int().positive(),
  pageOffsetRatio: z.number().min(0).max(1),
  zoom: z.number().min(0.1).max(8),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  layout: z.enum(READER_LAYOUTS),
  lastContextId: researchIdSchema.nullable(),
});
export type ReaderStatePosition = z.infer<typeof readerStatePositionSchema>;

export const readerStateSchema = readerStatePositionSchema
  .extend({
    assetId: researchIdSchema,
    revision: z.number().int().nonnegative(),
    createdAt: instantSchema.nullable(),
    updatedAt: instantSchema.nullable(),
  })
  .refine(
    (value) =>
      value.revision === 0
        ? value.createdAt === null && value.updatedAt === null
        : value.createdAt !== null && value.updatedAt !== null,
    '未保存状态必须使用 revision 0 且没有持久化时间',
  );
export type ReaderState = z.infer<typeof readerStateSchema>;

export const saveReaderStateInputSchema = readerStatePositionSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
});
export type SaveReaderStateInput = z.infer<typeof saveReaderStateInputSchema>;

export const readerManifestSchema = z.object({
  assetId: researchIdSchema,
  contentHash: sha256Schema,
  byteSize: z.number().int().nonnegative(),
  mimeType: z.literal('application/pdf'),
  displayName: z.string().min(1),
  editionId: researchIdSchema.nullable(),
  contentUrl: z.string().startsWith(`${API_ROOT}/assets/`),
  state: readerStateSchema,
});
export type ReaderManifest = z.infer<typeof readerManifestSchema>;

export const textIndexJobSchema = z.object({
  assetId: researchIdSchema,
  status: z.enum(TEXT_INDEX_STATUSES),
  nextPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  indexedPages: z.number().int().nonnegative(),
  textCharacters: z.number().int().nonnegative(),
  assetHash: sha256Schema,
  parserVersion: z.string().min(1),
  errorCode: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type TextIndexJob = z.infer<typeof textIndexJobSchema>;

export const startTextIndexInputSchema = z.object({
  priorityPage: z.number().int().positive().nullable().default(null),
});
export type StartTextIndexInput = z.infer<typeof startTextIndexInputSchema>;

export const ocrJobSchema = z.object({
  id: researchIdSchema,
  assetId: researchIdSchema,
  assetHash: sha256Schema,
  status: z.enum(DERIVED_JOB_STATUSES),
  languages: z.array(z.enum(OCR_LANGUAGES)).min(1).max(OCR_LANGUAGES.length),
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  languagePackVersion: z.string().min(1),
  nextPage: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  processedPages: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type OcrJob = z.infer<typeof ocrJobSchema>;

export const startOcrInputSchema = z.object({
  languages: z
    .array(z.enum(OCR_LANGUAGES))
    .min(1)
    .transform((languages) => [...new Set(languages)].sort() as OcrLanguage[])
    .refine((languages) => languages.length <= OCR_LANGUAGES.length),
  confirmed: z.literal(true),
});
export type StartOcrInput = z.infer<typeof startOcrInputSchema>;

export const pageTextPositionSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});
export type PageTextPosition = z.infer<typeof pageTextPositionSchema>;

export const pageTextSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  assetId: researchIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type PageTextSearchQuery = z.infer<typeof pageTextSearchQuerySchema>;

export const generalReadingLayerSchema = z.object({
  kind: z.literal('general'),
  id: z.literal(GENERAL_READING_CONTEXT_ID),
  name: z.literal('通用批注'),
});
export type GeneralReadingLayer = z.infer<typeof generalReadingLayerSchema>;

export const readingContextSchema = z.object({
  id: researchIdSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).nullable(),
  color: z.string().trim().min(1).max(64).nullable(),
  status: z.enum(READING_CONTEXT_STATUSES),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  archivedAt: instantSchema.nullable(),
});
export type ReadingContext = z.infer<typeof readingContextSchema>;

export const readingContextCatalogSchema = z.object({
  general: generalReadingLayerSchema,
  contexts: z.array(readingContextSchema),
});
export type ReadingContextCatalog = z.infer<typeof readingContextCatalogSchema>;

export const createReadingContextInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).nullable().default(null),
  color: z.string().trim().min(1).max(64).nullable().default(null),
});
export type CreateReadingContextInput = z.infer<typeof createReadingContextInputSchema>;

export const updateReadingContextInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2_000).nullable().optional(),
    color: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个上下文字段');
export type UpdateReadingContextInput = z.infer<typeof updateReadingContextInputSchema>;

export const archiveReadingContextInputSchema = z.object({
  strategy: z.enum(READING_CONTEXT_ARCHIVE_STRATEGIES),
});
export type ArchiveReadingContextInput = z.infer<typeof archiveReadingContextInputSchema>;

export const readingContextDeletionPreviewSchema = z.object({
  context: readingContextSchema,
  annotationCount: z.number().int().nonnegative(),
  activeAnnotationCount: z.number().int().nonnegative(),
  deletedAnnotationCount: z.number().int().nonnegative(),
  collectionCount: z.number().int().nonnegative(),
  noteCount: z.number().int().nonnegative().default(0),
  evidenceCount: z.number().int().nonnegative().default(0),
});
export type ReadingContextDeletionPreview = z.infer<typeof readingContextDeletionPreviewSchema>;

export const collectionReadingContextSchema = z.object({
  collectionId: researchIdSchema,
  context: readingContextSchema.nullable(),
  updatedAt: instantSchema.nullable(),
});
export type CollectionReadingContext = z.infer<typeof collectionReadingContextSchema>;

export const setCollectionReadingContextInputSchema = z.object({
  contextId: researchIdSchema.nullable(),
});
export type SetCollectionReadingContextInput = z.infer<
  typeof setCollectionReadingContextInputSchema
>;

export const pdfPageSizeSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});
export type PdfPageSize = z.infer<typeof pdfPageSizeSchema>;

export const pdfRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});
export type PdfRect = z.infer<typeof pdfRectSchema>;

export const pageTextSearchResultSchema = z.object({
  assetId: researchIdSchema,
  displayName: z.string().min(1),
  pageNumber: z.number().int().positive(),
  source: z.enum(['pdf', 'ocr']),
  snippet: z.string(),
  matchStart: z.number().int().nonnegative(),
  matchEnd: z.number().int().nonnegative(),
  pageSize: pdfPageSizeSchema.nullable(),
  position: pdfRectSchema.nullable(),
});
export type PageTextSearchResult = z.infer<typeof pageTextSearchResultSchema>;

export const pageTextSearchResponseSchema = z.object({
  results: z.array(pageTextSearchResultSchema),
});
export type PageTextSearchResponse = z.infer<typeof pageTextSearchResponseSchema>;

export const pdfQuadSchema = z.object({
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  x3: z.number().finite(),
  y3: z.number().finite(),
  x4: z.number().finite(),
  y4: z.number().finite(),
});
export type PdfQuad = z.infer<typeof pdfQuadSchema>;

export const annotationTextQuoteSchema = z.object({
  exact: z.string().min(1).max(20_000),
  prefix: z.string().max(2_000),
  suffix: z.string().max(2_000),
  fingerprint: sha256Schema,
});
export type AnnotationTextQuote = z.infer<typeof annotationTextQuoteSchema>;

export const annotationAnchorSchema = z.object({
  pageNumber: z.number().int().positive(),
  pageSize: pdfPageSizeSchema,
  rect: pdfRectSchema.nullable().default(null),
  quads: z.array(pdfQuadSchema).max(512).default([]),
  textQuote: annotationTextQuoteSchema.nullable().default(null),
  assetHash: sha256Schema,
  editionId: researchIdSchema.nullable().default(null),
});
export type AnnotationAnchor = z.infer<typeof annotationAnchorSchema>;

export const annotationSchema = z.object({
  id: researchIdSchema,
  assetId: researchIdSchema,
  editionId: researchIdSchema.nullable(),
  contextId: researchIdSchema.nullable(),
  kind: z.enum(ANNOTATION_KINDS),
  pageNumber: z.number().int().positive(),
  anchor: annotationAnchorSchema,
  body: z.string().max(100_000).nullable(),
  color: z.string().trim().min(1).max(64).nullable(),
  status: z.enum(ANNOTATION_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type Annotation = z.infer<typeof annotationSchema>;

export const createAnnotationInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  kind: z.enum(ANNOTATION_KINDS),
  anchor: annotationAnchorSchema,
  body: z.string().max(100_000).nullable().default(null),
  color: z.string().trim().min(1).max(64).nullable().default(null),
});
export type CreateAnnotationInput = z.infer<typeof createAnnotationInputSchema>;

export const updateAnnotationInputSchema = z
  .object({
    kind: z.enum(ANNOTATION_KINDS).optional(),
    anchor: annotationAnchorSchema.optional(),
    body: z.string().max(100_000).nullable().optional(),
    color: z.string().trim().min(1).max(64).nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), '没有批注变更');
export type UpdateAnnotationInput = z.infer<typeof updateAnnotationInputSchema>;

export const annotationRevisionInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export type AnnotationRevisionInput = z.infer<typeof annotationRevisionInputSchema>;

export const annotationRevisionSchema = z.object({
  id: researchIdSchema,
  annotationId: researchIdSchema,
  revision: z.number().int().positive(),
  snapshot: annotationSchema,
  reason: z.enum(['update', 'delete', 'restore', 'move-context']),
  createdAt: instantSchema,
});
export type AnnotationRevision = z.infer<typeof annotationRevisionSchema>;

export const knowledgeContextRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('general'),
    contextId: z.null(),
    name: z.string().trim().min(1).max(200),
  }),
  z.object({
    kind: z.literal('named'),
    contextId: researchIdSchema,
    name: z.string().trim().min(1).max(200),
  }),
]);
export type KnowledgeContextRef = z.infer<typeof knowledgeContextRefSchema>;

export const evidenceSourceSnapshotSchema = z.object({
  workId: researchIdSchema,
  editionId: researchIdSchema.nullable(),
  assetId: researchIdSchema,
  annotationId: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  pageNumber: z.number().int().positive(),
  anchor: annotationAnchorSchema,
  sourceKind: z.enum(EVIDENCE_SOURCE_KINDS),
  annotationRevision: z.number().int().positive(),
  assetHash: sha256Schema,
  workTitle: z.string().trim().min(1).max(1_000),
  editionTitle: z.string().trim().min(1).max(1_000).nullable(),
  ocr: z
    .object({
      engine: z.string().trim().min(1).max(200),
      engineVersion: z.string().trim().min(1).max(200),
      languagePackVersion: z.string().trim().min(1).max(200),
      languagesKey: z.string().trim().min(1).max(200),
    })
    .nullable(),
  extractedAt: instantSchema,
});
export type EvidenceSourceSnapshot = z.infer<typeof evidenceSourceSnapshotSchema>;

export const researchNoteSchema = z.object({
  id: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  title: z.string().trim().min(1).max(500),
  body: z.string().max(500_000),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type ResearchNote = z.infer<typeof researchNoteSchema>;

export const evidenceSchema = z.object({
  id: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  workId: researchIdSchema,
  editionId: researchIdSchema.nullable(),
  assetId: researchIdSchema,
  annotationId: researchIdSchema,
  sourceSnapshot: evidenceSourceSnapshotSchema,
  sourceState: z.enum(EVIDENCE_SOURCE_STATES),
  title: z.string().trim().min(1).max(500).nullable(),
  summary: z.string().max(100_000),
  notes: z.string().max(100_000).nullable(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const claimSchema = z.object({
  id: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  statement: z.string().trim().min(1).max(10_000),
  rationale: z.string().max(100_000).nullable(),
  status: z.enum(CLAIM_STATUSES),
  evidenceCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  archivedAt: instantSchema.nullable(),
  deletedAt: instantSchema.nullable(),
});
export type Claim = z.infer<typeof claimSchema>;

export const claimEvidenceSchema = z.object({
  id: researchIdSchema,
  claimId: researchIdSchema,
  evidenceId: researchIdSchema,
  relation: z.enum(CLAIM_EVIDENCE_RELATIONS),
  note: z.string().max(10_000).nullable(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type ClaimEvidence = z.infer<typeof claimEvidenceSchema>;

export const comparisonMatrixSchema = z.object({
  id: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).nullable(),
  status: z.enum(MATRIX_STATUSES),
  structureRevision: z.number().int().positive(),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  archivedAt: instantSchema.nullable(),
  deletedAt: instantSchema.nullable(),
});
export type ComparisonMatrix = z.infer<typeof comparisonMatrixSchema>;

export const matrixColumnSchema = z.object({
  id: researchIdSchema,
  matrixId: researchIdSchema,
  workId: researchIdSchema,
  workTitle: z.string().max(1_000),
  position: z.number().int().nonnegative(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type MatrixColumn = z.infer<typeof matrixColumnSchema>;

const matrixRowBaseSchema = z.object({
  id: researchIdSchema,
  matrixId: researchIdSchema,
  position: z.number().int().nonnegative(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});

export const matrixRowSchema = z
  .discriminatedUnion('kind', [
    matrixRowBaseSchema.extend({
      kind: z.literal('claim'),
      claimId: researchIdSchema,
      title: z.null(),
      question: z.null(),
    }),
    matrixRowBaseSchema.extend({
      kind: z.literal('dimension'),
      claimId: z.null(),
      title: z.string().trim().min(1).max(500).nullable(),
      question: z.string().trim().min(1).max(2_000).nullable(),
    }),
  ])
  .refine(
    (value) => value.kind === 'claim' || value.title !== null || value.question !== null,
    '比较维度需要标题或问题',
  );
export type MatrixRow = z.infer<typeof matrixRowSchema>;

export const matrixDetailSchema = comparisonMatrixSchema.extend({
  columns: z.array(matrixColumnSchema),
  rows: z.array(matrixRowSchema),
});
export type MatrixDetail = z.infer<typeof matrixDetailSchema>;

export const matrixReviewBaselineSchema = z.object({
  claimRevision: z.number().int().positive().nullable(),
  candidateSignature: z.string(),
  evidence: z.array(
    z.object({
      id: researchIdSchema,
      revision: z.number().int().positive(),
      sourceState: z.enum(EVIDENCE_SOURCE_STATES),
    }),
  ),
});
export type MatrixReviewBaseline = z.infer<typeof matrixReviewBaselineSchema>;

export const matrixCellSchema = z.object({
  id: researchIdSchema,
  matrixId: researchIdSchema,
  rowId: researchIdSchema,
  columnId: researchIdSchema,
  synthesis: z.string().max(100_000),
  reviewBaseline: matrixReviewBaselineSchema.nullable(),
  reviewState: z.enum(MATRIX_REVIEW_STATES),
  selectedEvidenceCount: z.number().int().nonnegative(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  reviewedAt: instantSchema.nullable(),
  deletedAt: instantSchema.nullable(),
});
export type MatrixCell = z.infer<typeof matrixCellSchema>;

export const matrixCellEvidenceSchema = z.object({
  id: researchIdSchema,
  cellId: researchIdSchema,
  evidenceId: researchIdSchema,
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type MatrixCellEvidence = z.infer<typeof matrixCellEvidenceSchema>;

export const matrixCandidateSchema = z.object({
  evidence: evidenceSchema,
  selectedLinkId: researchIdSchema.nullable(),
  selectedLinkRevision: z.number().int().positive().nullable(),
});
export type MatrixCandidate = z.infer<typeof matrixCandidateSchema>;

export const matrixCandidatesSchema = z.object({
  matrixId: researchIdSchema,
  rowId: researchIdSchema,
  columnId: researchIdSchema,
  cellId: researchIdSchema.nullable(),
  candidates: z.array(matrixCandidateSchema),
});
export type MatrixCandidates = z.infer<typeof matrixCandidatesSchema>;

export const writingDocumentSchema = z.object({
  id: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  title: z.string().trim().min(1).max(500),
  status: z.enum(WRITING_DOCUMENT_STATUSES),
  structureRevision: z.number().int().positive(),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  archivedAt: instantSchema.nullable(),
  deletedAt: instantSchema.nullable(),
});
export type WritingDocument = z.infer<typeof writingDocumentSchema>;

const writingBlockBaseSchema = z.object({
  id: researchIdSchema,
  documentId: researchIdSchema,
  sectionId: researchIdSchema,
  position: z.number().int().nonnegative(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});

export const writingBlockSchema = z.discriminatedUnion('kind', [
  writingBlockBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string().max(500_000),
    targetId: z.null(),
    targetLabel: z.null(),
    targetState: z.null(),
    targetUrl: z.null(),
    sourceState: z.null(),
  }),
  ...(['note', 'evidence', 'claim', 'matrix'] as const).map((kind) =>
    writingBlockBaseSchema.extend({
      kind: z.literal(kind),
      text: z.null(),
      targetId: researchIdSchema,
      targetLabel: z.string().trim().min(1).max(1_000),
      targetState: z.enum(WRITING_RESOURCE_STATES),
      targetUrl: z.string().min(1).max(4_096).nullable(),
      sourceState: z.enum(EVIDENCE_SOURCE_STATES).nullable(),
    }),
  ),
]);
export type WritingBlock = z.infer<typeof writingBlockSchema>;

export const writingSectionSchema = z.object({
  id: researchIdSchema,
  documentId: researchIdSchema,
  title: z.string().trim().min(1).max(500),
  position: z.number().int().nonnegative(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
  blocks: z.array(writingBlockSchema),
});
export type WritingSection = z.infer<typeof writingSectionSchema>;

export const writingDocumentDetailSchema = writingDocumentSchema.extend({
  sections: z.array(writingSectionSchema),
});
export type WritingDocumentDetail = z.infer<typeof writingDocumentDetailSchema>;

export const noteLinkTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work'), workId: researchIdSchema }),
  z.object({ kind: z.literal('annotation'), annotationId: researchIdSchema }),
  z.object({ kind: z.literal('evidence'), evidenceId: researchIdSchema }),
  z.object({ kind: z.literal('claim'), claimId: researchIdSchema }),
]);
export type NoteLinkTarget = z.infer<typeof noteLinkTargetSchema>;

export const noteLinkSchema = z.object({
  id: researchIdSchema,
  noteId: researchIdSchema,
  target: noteLinkTargetSchema,
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  deletedAt: instantSchema.nullable(),
});
export type NoteLink = z.infer<typeof noteLinkSchema>;

export const createNoteLinkInputSchema = z.object({
  target: noteLinkTargetSchema,
});
export type CreateNoteLinkInput = z.infer<typeof createNoteLinkInputSchema>;

export const knowledgeRevisionSchema = z.object({
  id: researchIdSchema,
  entityType: z.enum(KNOWLEDGE_ENTITY_TYPES),
  entityId: researchIdSchema,
  revision: z.number().int().positive(),
  snapshot: z.unknown(),
  reason: z.enum(KNOWLEDGE_REVISION_REASONS),
  createdAt: instantSchema,
});
export type KnowledgeRevision = z.infer<typeof knowledgeRevisionSchema>;

export const knowledgePageInputSchema = z.object({
  cursor: z.string().min(1).max(512).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const listNotesQuerySchema = knowledgePageInputSchema.extend({
  contextId: researchIdSchema.nullable().optional(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES).default('active'),
});
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

export const notesPageSchema = z.object({
  notes: z.array(researchNoteSchema),
  nextCursor: z.string().nullable(),
});
export type NotesPage = z.infer<typeof notesPageSchema>;

export const listEvidenceQuerySchema = knowledgePageInputSchema.extend({
  contextId: researchIdSchema.nullable().optional(),
  workId: researchIdSchema.optional(),
  sourceState: z.enum(EVIDENCE_SOURCE_STATES).optional(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES).default('active'),
});
export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;

export const evidencePageSchema = z.object({
  evidence: z.array(evidenceSchema),
  nextCursor: z.string().nullable(),
});
export type EvidencePage = z.infer<typeof evidencePageSchema>;

export const listClaimsQuerySchema = knowledgePageInputSchema.extend({
  contextId: researchIdSchema.nullable().optional(),
  status: z.enum(CLAIM_STATUSES).default('active'),
});
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;

export const claimsPageSchema = z.object({
  claims: z.array(claimSchema),
  nextCursor: z.string().nullable(),
});
export type ClaimsPage = z.infer<typeof claimsPageSchema>;

export const listMatricesQuerySchema = knowledgePageInputSchema.extend({
  contextId: researchIdSchema.nullable().optional(),
  status: z.enum(MATRIX_STATUSES).default('active'),
});
export type ListMatricesQuery = z.infer<typeof listMatricesQuerySchema>;

export const matricesPageSchema = z.object({
  matrices: z.array(comparisonMatrixSchema),
  nextCursor: z.string().nullable(),
});
export type MatricesPage = z.infer<typeof matricesPageSchema>;

export const listWritingDocumentsQuerySchema = knowledgePageInputSchema.extend({
  contextId: researchIdSchema.nullable().optional(),
  status: z.enum(WRITING_DOCUMENT_STATUSES).default('active'),
});
export type ListWritingDocumentsQuery = z.infer<typeof listWritingDocumentsQuerySchema>;

export const writingDocumentsPageSchema = z.object({
  documents: z.array(writingDocumentSchema),
  nextCursor: z.string().nullable(),
});
export type WritingDocumentsPage = z.infer<typeof writingDocumentsPageSchema>;

export const knowledgeSearchResultSchema = z.object({
  entityType: z.enum(KNOWLEDGE_SEARCH_ENTITY_TYPES),
  entityId: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  workId: researchIdSchema.nullable(),
  title: z.string().max(10_000),
  excerpt: z.string().max(20_000),
  matchedFields: z
    .array(z.enum(['title', 'body']))
    .min(1)
    .max(2),
  status: z.enum(KNOWLEDGE_SEARCH_STATUSES),
  sourceState: z.enum(EVIDENCE_SOURCE_STATES).nullable(),
  targetUrl: z.string().min(1).max(4_096),
  updatedAt: instantSchema,
});
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

export const knowledgeSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  contextId: researchIdSchema.nullable().optional(),
  workId: researchIdSchema.optional(),
  entityTypes: z
    .array(z.enum(KNOWLEDGE_SEARCH_ENTITY_TYPES))
    .min(1)
    .max(KNOWLEDGE_SEARCH_ENTITY_TYPES.length)
    .default([...KNOWLEDGE_SEARCH_ENTITY_TYPES]),
  statuses: z
    .array(z.enum(KNOWLEDGE_SEARCH_STATUSES))
    .min(1)
    .max(KNOWLEDGE_SEARCH_STATUSES.length)
    .default(['active', 'draft', 'archived']),
  sourceStates: z.array(z.enum(EVIDENCE_SOURCE_STATES)).min(1).max(5).optional(),
  cursor: z.string().min(1).max(1_024).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchInputSchema>;

export const knowledgeSearchResponseSchema = z.object({
  results: z.array(knowledgeSearchResultSchema).max(100),
  nextCursor: z.string().nullable(),
  maxResults: z.number().int().positive(),
});
export type KnowledgeSearchResponse = z.infer<typeof knowledgeSearchResponseSchema>;

export const knowledgeSearchRebuildResponseSchema = z.object({
  notes: z.number().int().nonnegative(),
  evidence: z.number().int().nonnegative(),
  claims: z.number().int().nonnegative(),
  writingDocuments: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type KnowledgeSearchRebuildResponse = z.infer<typeof knowledgeSearchRebuildResponseSchema>;

export const KNOWLEDGE_EXPORT_FORMATS = ['markdown', 'csv'] as const;
export type KnowledgeExportFormat = (typeof KNOWLEDGE_EXPORT_FORMATS)[number];

export const KNOWLEDGE_EXPORT_OBJECT_TYPES = ['writing-document', 'matrix'] as const;
export type KnowledgeExportObjectType = (typeof KNOWLEDGE_EXPORT_OBJECT_TYPES)[number];

export const knowledgeExportSelectionSchema = z.object({
  objectType: z.enum(KNOWLEDGE_EXPORT_OBJECT_TYPES),
  objectId: researchIdSchema,
  format: z.enum(KNOWLEDGE_EXPORT_FORMATS),
});
export type KnowledgeExportSelection = z.infer<typeof knowledgeExportSelectionSchema>;

export const knowledgeExportPreviewInputSchema = knowledgeExportSelectionSchema.extend({
  targetPath: z.string().trim().min(1).max(4_096).optional(),
});
export type KnowledgeExportPreviewInput = z.infer<typeof knowledgeExportPreviewInputSchema>;

export const knowledgeExportPreviewSchema = z.object({
  objectType: z.enum(KNOWLEDGE_EXPORT_OBJECT_TYPES),
  objectId: researchIdSchema,
  format: z.enum(KNOWLEDGE_EXPORT_FORMATS),
  title: z.string().min(1).max(1_000),
  fileExtension: z.enum(['.md', '.csv']),
  objectCount: z.number().int().positive(),
  referenceCount: z.number().int().nonnegative(),
  sourceIssueCount: z.number().int().nonnegative(),
  estimatedBytes: z.number().int().nonnegative(),
  targetPath: z.string().nullable(),
  targetExists: z.boolean(),
  warnings: z.array(z.string()),
});
export type KnowledgeExportPreview = z.infer<typeof knowledgeExportPreviewSchema>;

export const pickKnowledgeExportTargetInputSchema = z.object({
  format: z.enum(KNOWLEDGE_EXPORT_FORMATS),
  suggestedName: z.string().trim().min(1).max(240),
  initialDir: z.string().trim().min(1).max(4_096).optional(),
});
export type PickKnowledgeExportTargetInput = z.infer<typeof pickKnowledgeExportTargetInputSchema>;

export const pickDocumentPathResponseSchema = z.object({
  path: z.string().min(1).nullable(),
  cancelled: z.boolean(),
});
export type PickDocumentPathResponse = z.infer<typeof pickDocumentPathResponseSchema>;

export const startKnowledgeExportInputSchema = knowledgeExportSelectionSchema.extend({
  targetPath: z.string().trim().min(1).max(4_096),
  overwriteConfirmed: z.boolean().default(false),
});
export type StartKnowledgeExportInput = z.infer<typeof startKnowledgeExportInputSchema>;

export const knowledgeExportReportSchema = z.object({
  objectType: z.enum(KNOWLEDGE_EXPORT_OBJECT_TYPES),
  objectId: researchIdSchema,
  format: z.enum(KNOWLEDGE_EXPORT_FORMATS),
  targetPath: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  sha256: sha256Schema,
  objectCount: z.number().int().positive(),
  referenceCount: z.number().int().nonnegative(),
  sourceIssueCount: z.number().int().nonnegative(),
  outputValidated: z.literal(true),
  overwritten: z.boolean(),
  completedAt: instantSchema,
  warnings: z.array(z.string()),
});
export type KnowledgeExportReport = z.infer<typeof knowledgeExportReportSchema>;

export const pickCanonicalImportSourceInputSchema = z.object({
  initialDir: z.string().trim().min(1).max(4_096).optional(),
});
export type PickCanonicalImportSourceInput = z.infer<typeof pickCanonicalImportSourceInputSchema>;

export const canonicalImportPreviewInputSchema = z.object({
  sourcePath: z.string().trim().min(1).max(4_096),
});
export type CanonicalImportPreviewInput = z.infer<typeof canonicalImportPreviewInputSchema>;

export const canonicalImportPreviewSchema = z.object({
  sourcePath: z.string().min(1),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  targetEmpty: z.boolean(),
  recordCount: z.number().int().nonnegative(),
  workCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  availableAssetCount: z.number().int().nonnegative(),
  missingAssetCount: z.number().int().nonnegative(),
  estimatedCopyBytes: z.number().int().nonnegative(),
  conflictIds: z.array(researchIdSchema),
  warnings: z.array(z.string()),
});
export type CanonicalImportPreview = z.infer<typeof canonicalImportPreviewSchema>;

export const startCanonicalImportInputSchema = canonicalImportPreviewInputSchema.extend({
  confirmed: z.literal(true),
});
export type StartCanonicalImportInput = z.infer<typeof startCanonicalImportInputSchema>;

export const canonicalImportReportSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  importedRecords: z.number().int().nonnegative(),
  importedWorks: z.number().int().nonnegative(),
  importedAttachments: z.number().int().nonnegative(),
  copiedAssets: z.number().int().nonnegative(),
  copiedBytes: z.number().int().nonnegative(),
  missingAssets: z.number().int().nonnegative(),
  foreignKeysValid: z.literal(true),
  roundTripValid: z.literal(true),
  searchIndexed: z.number().int().nonnegative(),
  completedAt: instantSchema,
  warnings: z.array(z.string()),
});
export type CanonicalImportReport = z.infer<typeof canonicalImportReportSchema>;

export const createNoteInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
  body: z.string().max(500_000).default(''),
});
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z
  .object({
    contextId: researchIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    body: z.string().max(500_000).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), '没有笔记变更');
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;

export const createEvidenceInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  annotationId: researchIdSchema,
  sourceKind: z.enum(EVIDENCE_SOURCE_KINDS),
  title: z.string().trim().min(1).max(500).nullable().default(null),
  summary: z.string().max(100_000).default(''),
  notes: z.string().max(100_000).nullable().default(null),
});
export type CreateEvidenceInput = z.infer<typeof createEvidenceInputSchema>;

export const createDirectEvidenceInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  assetId: researchIdSchema,
  editionId: researchIdSchema.nullable().default(null),
  kind: z.enum(ANNOTATION_KINDS),
  anchor: annotationAnchorSchema,
  body: z.string().max(100_000).nullable().default(null),
  color: z.string().trim().min(1).max(64).nullable().default(null),
  sourceKind: z.enum(EVIDENCE_SOURCE_KINDS),
  title: z.string().trim().min(1).max(500).nullable().default(null),
  summary: z.string().max(100_000).default(''),
  notes: z.string().max(100_000).nullable().default(null),
});
export type CreateDirectEvidenceInput = z.infer<typeof createDirectEvidenceInputSchema>;

export const createEvidenceRequestSchema = z.discriminatedUnion('mode', [
  createEvidenceInputSchema.extend({ mode: z.literal('annotation') }),
  createDirectEvidenceInputSchema.extend({ mode: z.literal('direct') }),
]);
export type CreateEvidenceRequest = z.infer<typeof createEvidenceRequestSchema>;

export const updateEvidenceInputSchema = z
  .object({
    contextId: researchIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(500).nullable().optional(),
    summary: z.string().max(100_000).optional(),
    notes: z.string().max(100_000).nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), '没有证据变更');
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceInputSchema>;

export const createClaimInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  statement: z.string().trim().min(1).max(10_000),
  rationale: z.string().max(100_000).nullable().default(null),
  status: z.enum(CLAIM_EDITABLE_STATUSES).default('draft'),
});
export type CreateClaimInput = z.infer<typeof createClaimInputSchema>;

export const updateClaimInputSchema = z
  .object({
    contextId: researchIdSchema.nullable().optional(),
    statement: z.string().trim().min(1).max(10_000).optional(),
    rationale: z.string().max(100_000).nullable().optional(),
    status: z.enum(CLAIM_EDITABLE_STATUSES).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), '没有观点变更');
export type UpdateClaimInput = z.infer<typeof updateClaimInputSchema>;

export const createClaimEvidenceInputSchema = z.object({
  evidenceId: researchIdSchema,
  relation: z.enum(CLAIM_EVIDENCE_RELATIONS),
  note: z.string().max(10_000).nullable().default(null),
});
export type CreateClaimEvidenceInput = z.infer<typeof createClaimEvidenceInputSchema>;

export const updateClaimEvidenceInputSchema = z
  .object({
    relation: z.enum(CLAIM_EVIDENCE_RELATIONS).optional(),
    note: z.string().max(10_000).nullable().optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedRevision'),
    '没有观点证据关系变更',
  );
export type UpdateClaimEvidenceInput = z.infer<typeof updateClaimEvidenceInputSchema>;

export const createMatrixInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(100_000).nullable().default(null),
});
export type CreateMatrixInput = z.infer<typeof createMatrixInputSchema>;

export const updateMatrixInputSchema = z
  .object({
    contextId: researchIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(100_000).nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), '没有矩阵变更');
export type UpdateMatrixInput = z.infer<typeof updateMatrixInputSchema>;

export const matrixStructureColumnInputSchema = z.object({
  id: researchIdSchema.optional(),
  workId: researchIdSchema,
  position: z.number().int().min(0).max(199),
});

export const matrixStructureRowInputSchema = z.discriminatedUnion('kind', [
  z.object({
    id: researchIdSchema.optional(),
    kind: z.literal('claim'),
    claimId: researchIdSchema,
    position: z.number().int().min(0).max(49),
  }),
  z
    .object({
      id: researchIdSchema.optional(),
      kind: z.literal('dimension'),
      title: z.string().trim().min(1).max(500).nullable().default(null),
      question: z.string().trim().min(1).max(2_000).nullable().default(null),
      position: z.number().int().min(0).max(49),
    })
    .refine((value) => value.title !== null || value.question !== null, '比较维度需要标题或问题'),
]);

export const updateMatrixStructureInputSchema = z.object({
  expectedStructureRevision: z.number().int().positive(),
  columns: z.array(matrixStructureColumnInputSchema).max(200),
  rows: z.array(matrixStructureRowInputSchema).max(50),
});
export type UpdateMatrixStructureInput = z.infer<typeof updateMatrixStructureInputSchema>;

export const matrixCandidatesQuerySchema = z.object({
  rowId: researchIdSchema,
  columnId: researchIdSchema,
});
export type MatrixCandidatesQuery = z.infer<typeof matrixCandidatesQuerySchema>;

export const createMatrixCellInputSchema = z.object({
  rowId: researchIdSchema,
  columnId: researchIdSchema,
  synthesis: z.string().max(100_000).default(''),
});
export type CreateMatrixCellInput = z.infer<typeof createMatrixCellInputSchema>;

export const matrixCellWindowQuerySchema = z.object({
  columnOffset: z.coerce.number().int().min(0).max(199).default(0),
  columnLimit: z.coerce.number().int().min(1).max(20).default(12),
  rowOffset: z.coerce.number().int().min(0).max(49).default(0),
  rowLimit: z.coerce.number().int().min(1).max(25).default(20),
});
export type MatrixCellWindowQuery = z.infer<typeof matrixCellWindowQuerySchema>;

export const matrixCellWindowSchema = z.object({
  matrixId: researchIdSchema,
  columnIds: z.array(researchIdSchema),
  rowIds: z.array(researchIdSchema),
  cells: z.array(matrixCellSchema),
});
export type MatrixCellWindow = z.infer<typeof matrixCellWindowSchema>;

export const updateMatrixCellInputSchema = z.object({
  synthesis: z.string().max(100_000),
  expectedRevision: z.number().int().positive(),
});
export type UpdateMatrixCellInput = z.infer<typeof updateMatrixCellInputSchema>;

export const createMatrixCellEvidenceInputSchema = z.object({
  evidenceId: researchIdSchema,
});
export type CreateMatrixCellEvidenceInput = z.infer<typeof createMatrixCellEvidenceInputSchema>;

export const reviewMatrixCellInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export type ReviewMatrixCellInput = z.infer<typeof reviewMatrixCellInputSchema>;

export const createWritingDocumentInputSchema = z.object({
  contextId: researchIdSchema.nullable().default(null),
  title: z.string().trim().min(1).max(500),
});
export type CreateWritingDocumentInput = z.infer<typeof createWritingDocumentInputSchema>;

export const updateWritingDocumentInputSchema = z
  .object({
    contextId: researchIdSchema.nullable().optional(),
    title: z.string().trim().min(1).max(500).optional(),
    status: z.enum(['active', 'archived']).optional(),
    expectedRevision: z.number().int().positive(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedRevision'),
    '没有写作板变更',
  );
export type UpdateWritingDocumentInput = z.infer<typeof updateWritingDocumentInputSchema>;

const writingBlockPositionSchema = z.number().int().min(0).max(1_999);
export const writingExistingBlockPlacementInputSchema = z.object({
  id: researchIdSchema,
  position: writingBlockPositionSchema,
});
export const writingNewBlockInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    text: z.string().max(500_000),
    position: writingBlockPositionSchema,
  }),
  ...(['note', 'evidence', 'claim', 'matrix'] as const).map((kind) =>
    z.object({
      kind: z.literal(kind),
      targetId: researchIdSchema,
      position: writingBlockPositionSchema,
    }),
  ),
]);
export const writingStructureBlockInputSchema = z.union([
  writingExistingBlockPlacementInputSchema,
  writingNewBlockInputSchema,
]);
export type WritingStructureBlockInput = z.infer<typeof writingStructureBlockInputSchema>;

export const writingStructureSectionInputSchema = z.object({
  id: researchIdSchema.optional(),
  title: z.string().trim().min(1).max(500),
  position: z.number().int().min(0).max(99),
  blocks: z.array(writingStructureBlockInputSchema).max(2_000),
});
export type WritingStructureSectionInput = z.infer<typeof writingStructureSectionInputSchema>;

export const updateWritingStructureInputSchema = z
  .object({
    expectedStructureRevision: z.number().int().positive(),
    sections: z.array(writingStructureSectionInputSchema).max(100),
  })
  .refine(
    (value) => value.sections.reduce((count, section) => count + section.blocks.length, 0) <= 2_000,
    '写作板最多包含 2000 个块',
  );
export type UpdateWritingStructureInput = z.infer<typeof updateWritingStructureInputSchema>;

export const updateWritingBlockInputSchema = z.object({
  text: z.string().max(500_000),
  expectedRevision: z.number().int().positive(),
});
export type UpdateWritingBlockInput = z.infer<typeof updateWritingBlockInputSchema>;

export const previewEvidenceRebindInputSchema = z.object({
  annotationId: researchIdSchema,
  sourceKind: z.enum(EVIDENCE_SOURCE_KINDS),
});
export type PreviewEvidenceRebindInput = z.infer<typeof previewEvidenceRebindInputSchema>;

export const confirmEvidenceRebindInputSchema = previewEvidenceRebindInputSchema.extend({
  expectedRevision: z.number().int().positive(),
  targetAnnotationRevision: z.number().int().positive(),
});
export type ConfirmEvidenceRebindInput = z.infer<typeof confirmEvidenceRebindInputSchema>;

export const evidenceRebindPreviewSchema = z.object({
  evidenceId: researchIdSchema,
  expectedRevision: z.number().int().positive(),
  targetAnnotationRevision: z.number().int().positive(),
  oldSource: evidenceSourceSnapshotSchema,
  newSource: evidenceSourceSnapshotSchema,
  differences: z.array(
    z.object({
      field: z.enum(['work', 'edition', 'asset', 'annotation', 'context', 'page', 'text', 'kind']),
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  ),
});
export type EvidenceRebindPreview = z.infer<typeof evidenceRebindPreviewSchema>;

export const evidenceRebindRequestSchema = z.discriminatedUnion('mode', [
  previewEvidenceRebindInputSchema.extend({ mode: z.literal('preview') }),
  confirmEvidenceRebindInputSchema.extend({ mode: z.literal('confirm') }),
]);

export const knowledgeRevisionInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export type KnowledgeRevisionInput = z.infer<typeof knowledgeRevisionInputSchema>;

export const evidenceSourceLinkSchema = z.object({
  assetId: researchIdSchema,
  annotationId: researchIdSchema,
  contextId: researchIdSchema.nullable(),
  pageNumber: z.number().int().positive(),
  anchor: annotationAnchorSchema,
  sourceState: z.enum(EVIDENCE_SOURCE_STATES),
  readerUrl: z.string().startsWith('/research/read/'),
});
export type EvidenceSourceLink = z.infer<typeof evidenceSourceLinkSchema>;

export const evidenceDetailSchema = evidenceSchema.extend({
  sourceLink: evidenceSourceLinkSchema,
});
export type EvidenceDetail = z.infer<typeof evidenceDetailSchema>;

const annotatedExportContextIdsSchema = z
  .array(researchIdSchema)
  .max(64)
  .transform((contextIds) => [...new Set(contextIds)].sort());

export const annotatedExportScopeSchema = z.object({
  includeGeneral: z.boolean().default(true),
  contextIds: annotatedExportContextIdsSchema.default([]),
});
export type AnnotatedExportScope = z.infer<typeof annotatedExportScopeSchema>;

export const annotatedExportPreviewInputSchema = annotatedExportScopeSchema.extend({
  targetPath: z.string().trim().min(1).max(4_096).optional(),
});
export type AnnotatedExportPreviewInput = z.infer<typeof annotatedExportPreviewInputSchema>;

export const startAnnotatedExportInputSchema = annotatedExportScopeSchema.extend({
  targetPath: z.string().trim().min(1).max(4_096),
  overwriteConfirmed: z.boolean().default(false),
});
export type StartAnnotatedExportInput = z.infer<typeof startAnnotatedExportInputSchema>;

export const pickAnnotatedExportTargetInputSchema = z.object({
  initialDir: z.string().trim().min(1).max(4_096).optional(),
  suggestedName: z.string().trim().min(1).max(240),
});
export type PickAnnotatedExportTargetInput = z.infer<typeof pickAnnotatedExportTargetInputSchema>;

export const pickAnnotatedExportTargetResponseSchema = z.object({
  path: z.string().min(1).nullable(),
  cancelled: z.boolean(),
});
export type PickAnnotatedExportTargetResponse = z.infer<
  typeof pickAnnotatedExportTargetResponseSchema
>;

export const annotatedExportDecisionSchema = z.object({
  annotationId: researchIdSchema,
  revision: z.number().int().positive(),
  contextId: researchIdSchema.nullable(),
  kind: z.enum(ANNOTATION_KINDS),
  treatment: z.enum(ANNOTATED_EXPORT_TREATMENTS),
  warning: z.string().nullable(),
});
export type AnnotatedExportDecision = z.infer<typeof annotatedExportDecisionSchema>;

export const annotatedExportPreviewSchema = z.object({
  assetId: researchIdSchema,
  sourceHash: sha256Schema,
  sourceBytes: z.number().int().nonnegative(),
  estimatedOutputBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  annotationCount: z.number().int().nonnegative(),
  standardCount: z.number().int().nonnegative(),
  flattenedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  targetPath: z.string().nullable(),
  targetExists: z.boolean(),
  decisions: z.array(annotatedExportDecisionSchema),
  warnings: z.array(z.string()),
});
export type AnnotatedExportPreview = z.infer<typeof annotatedExportPreviewSchema>;

export const annotatedExportReportSchema = z.object({
  schemaVersion: z.literal(1),
  assetId: researchIdSchema,
  sourceHash: sha256Schema,
  outputHash: sha256Schema,
  sourceBytes: z.number().int().nonnegative(),
  outputBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  targetPath: z.string().min(1),
  standardCount: z.number().int().nonnegative(),
  flattenedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  sourceHashUnchanged: z.literal(true),
  outputReadable: z.literal(true),
  fullRewrite: z.literal(true),
  decisions: z.array(annotatedExportDecisionSchema),
  warnings: z.array(z.string()),
  completedAt: instantSchema,
});
export type AnnotatedExportReport = z.infer<typeof annotatedExportReportSchema>;

export const annotatedExportJobSchema = z.object({
  id: researchIdSchema,
  assetId: researchIdSchema,
  status: z.enum(DERIVED_JOB_STATUSES),
  options: startAnnotatedExportInputSchema,
  targetPath: z.string().min(1),
  completedAnnotations: z.number().int().nonnegative(),
  totalAnnotations: z.number().int().nonnegative(),
  report: annotatedExportReportSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type AnnotatedExportJob = z.infer<typeof annotatedExportJobSchema>;

export const retryAnnotatedExportInputSchema = z.object({
  overwriteConfirmed: z.boolean().default(false),
});
export type RetryAnnotatedExportInput = z.infer<typeof retryAnnotatedExportInputSchema>;

export const annotatedExportOpenLocationResponseSchema = z.object({
  opened: z.literal(true),
});
export type AnnotatedExportOpenLocationResponse = z.infer<
  typeof annotatedExportOpenLocationResponseSchema
>;

export const portableExportOptionsSchema = z.object({
  includeManagedFiles: z.boolean().default(false),
  includeLinkedFiles: z.boolean().default(false),
});
export type PortableExportOptions = z.infer<typeof portableExportOptionsSchema>;

export const portableExportPreviewInputSchema = portableExportOptionsSchema.extend({
  targetPath: z.string().trim().min(1).optional(),
});
export type PortableExportPreviewInput = z.infer<typeof portableExportPreviewInputSchema>;

export const startPortableExportInputSchema = portableExportOptionsSchema.extend({
  targetPath: z.string().trim().min(1),
});
export type StartPortableExportInput = z.infer<typeof startPortableExportInputSchema>;

export const portableExportFileIssueSchema = z.object({
  attachmentId: researchIdSchema,
  assetId: researchIdSchema,
  displayName: z.string(),
  reason: z.string(),
  attemptedPath: z.string().nullable(),
});
export type PortableExportFileIssue = z.infer<typeof portableExportFileIssueSchema>;

export const portableExportPreviewSchema = z.object({
  workCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  selectedAssetCount: z.number().int().nonnegative(),
  estimatedBytes: z.number().int().nonnegative(),
  missing: z.array(portableExportFileIssueSchema),
  targetPath: z.string().nullable(),
  targetExists: z.boolean(),
});
export type PortableExportPreview = z.infer<typeof portableExportPreviewSchema>;

export const portableExportProgressSchema = z.object({
  phase: z.enum(['snapshot', 'copying', 'validating', 'publishing', 'done']),
  completedAssets: z.number().int().nonnegative(),
  totalAssets: z.number().int().nonnegative(),
  copiedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});
export type PortableExportProgress = z.infer<typeof portableExportProgressSchema>;

export const portableExportReportSchema = z.object({
  schemaVersion: z.literal(1),
  targetPath: z.string(),
  canonicalFile: z.literal('library.json'),
  manifestFile: z.literal('manifest.json'),
  reportFile: z.literal('report.json'),
  canonicalFingerprint: sha256Schema,
  roundTripValid: z.literal(true),
  workCount: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
  copiedAssetCount: z.number().int().nonnegative(),
  copiedBytes: z.number().int().nonnegative(),
  missing: z.array(portableExportFileIssueSchema),
  copyFailures: z.array(portableExportFileIssueSchema),
  completedAt: instantSchema,
});
export type PortableExportReport = z.infer<typeof portableExportReportSchema>;

export const portableExportJobSchema = z.object({
  id: researchIdSchema,
  status: z.enum(['draft', 'running', 'completed', 'cancelled', 'failed']),
  options: startPortableExportInputSchema,
  targetPath: z.string().nullable(),
  progress: portableExportProgressSchema,
  report: portableExportReportSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type PortableExportJob = z.infer<typeof portableExportJobSchema>;

export const MANAGED_ROOT_MIGRATION_STATUSES = [
  'draft',
  'running',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
] as const;
export type ManagedRootMigrationStatus = (typeof MANAGED_ROOT_MIGRATION_STATUSES)[number];

export const managedRootMigrationJobSchema = z.object({
  id: researchIdSchema,
  status: z.enum(MANAGED_ROOT_MIGRATION_STATUSES),
  sourceRoot: z.string().min(1),
  targetRoot: z.string().min(1),
  totalObjects: z.number().int().nonnegative(),
  copiedObjects: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  copiedBytes: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type ManagedRootMigrationJob = z.infer<typeof managedRootMigrationJobSchema>;

export const managedStorageStatusSchema = z.object({
  activeRoot: z.string().min(1),
  latestMigration: managedRootMigrationJobSchema.nullable(),
});
export type ManagedStorageStatus = z.infer<typeof managedStorageStatusSchema>;

export const startManagedRootMigrationInputSchema = z.object({
  targetRoot: z.string().trim().min(1).max(4_096),
});
export type StartManagedRootMigrationInput = z.infer<typeof startManagedRootMigrationInputSchema>;

export const researchErrorSchema = z.object({
  code: z.enum(RESEARCH_ERROR_CODES),
  stage: z.string().min(1),
  retryable: z.boolean(),
  message: z.string().min(1),
});
export type ResearchError = z.infer<typeof researchErrorSchema>;

export const identifierViewSchema = z.object({
  scheme: z.enum(IDENTIFIER_SCHEMES),
  value: z.string().min(1),
});
export type IdentifierView = z.infer<typeof identifierViewSchema>;

export const metadataAssertionViewSchema = z.object({
  id: researchIdSchema,
  entityType: z.enum(['work', 'edition']),
  entityId: researchIdSchema,
  fieldName: z.string().min(1).max(80),
  value: z.unknown(),
  sourceKind: z.enum(METADATA_SOURCE_KINDS),
  sourceRecordId: researchIdSchema.nullable(),
  observedAt: instantSchema,
  isUserConfirmed: z.boolean(),
  isSelected: z.boolean(),
});
export type MetadataAssertionView = z.infer<typeof metadataAssertionViewSchema>;

export const sourceRecordViewSchema = z.object({
  id: researchIdSchema,
  provider: z.string(),
  sourceLocator: z.string().nullable(),
  rawFormat: z.string(),
  rawPayload: z.string(),
  parserVersion: z.string(),
  observedAt: instantSchema,
  createdAt: instantSchema,
});

export const externalSourceMapViewSchema = z.object({
  id: researchIdSchema,
  provider: z.string(),
  externalId: z.string(),
  entityType: z.enum(['work', 'edition']),
  entityId: researchIdSchema,
  lastFetchedAt: instantSchema.nullable(),
  cacheStatus: z.enum(['fresh', 'not-found', 'transient-failure']),
  cacheExpiresAt: instantSchema.nullable(),
});

export const assetLocationViewSchema = z
  .object({
    id: researchIdSchema,
    assetId: researchIdSchema,
    mode: z.enum(STORAGE_MODES),
    originalPath: z.string().min(1),
    resolvedPath: z.string().min(1),
    objectKey: z.string().min(1).nullable(),
    state: z.enum(LOCATION_STATES),
    errorCode: z.string().nullable(),
    lastCheckedAt: instantSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'managed' && value.objectKey === null) {
      ctx.addIssue({ code: 'custom', path: ['objectKey'], message: '托管位置必须有 objectKey' });
    }
    if (value.mode === 'linked' && value.objectKey !== null) {
      ctx.addIssue({ code: 'custom', path: ['objectKey'], message: '链接位置不能有 objectKey' });
    }
  });
export type AssetLocationView = z.infer<typeof assetLocationViewSchema>;

export const assetViewSchema = z.object({
  id: researchIdSchema,
  algorithm: z.literal('sha256'),
  contentHash: sha256Schema,
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  state: z.enum(ASSET_STATES),
  locations: z.array(assetLocationViewSchema),
});
export type AssetView = z.infer<typeof assetViewSchema>;

export const attachmentViewSchema = z.object({
  id: researchIdSchema,
  editionId: researchIdSchema,
  assetId: researchIdSchema,
  role: z.enum(ATTACHMENT_ROLES),
  displayName: z.string(),
  status: z.enum(ATTACHMENT_STATUSES),
  asset: assetViewSchema,
});
export type AttachmentView = z.infer<typeof attachmentViewSchema>;

export const editionViewSchema = z.object({
  id: researchIdSchema,
  workId: researchIdSchema,
  kind: z.enum(EDITION_KINDS),
  title: z.string(),
  publicationTitle: z.string().nullable(),
  publisher: z.string().nullable().default(null),
  publishedDate: z.string().nullable(),
  revision: z.number().int().positive().default(1),
  contributors: z.array(
    z.object({
      id: researchIdSchema,
      role: z.string(),
      displayName: z.string(),
      givenName: z.string().nullable(),
      familyName: z.string().nullable(),
      orcid: z.string().nullable(),
      sequence: z.number().int().nonnegative(),
    }),
  ),
  identifiers: z.array(identifierViewSchema),
  attachments: z.array(attachmentViewSchema),
});
export type EditionView = z.infer<typeof editionViewSchema>;

export const workViewSchema = z.object({
  id: researchIdSchema,
  type: z.enum(WORK_TYPES),
  title: z.string(),
  abstract: z.string().nullable().default(null),
  year: z.number().int().min(0).max(9999).nullable(),
  status: z.enum(WORK_STATUSES),
  preferredEditionId: researchIdSchema.nullable(),
  authors: z.array(z.string()),
  attachmentCount: z.number().int().nonnegative(),
  collectionIds: z.array(researchIdSchema),
  storageModes: z.array(z.enum(STORAGE_MODES)),
  fileStatus: z.enum(['none', 'available', 'missing', 'changed', 'recycled', 'mixed']),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  trashedAt: instantSchema.nullable(),
  revision: z.number().int().positive().default(1),
  searchScore: z.number().min(0).max(1).nullable().default(null),
  matchedFields: z
    .array(z.enum(['title', 'abstract', 'authors', 'publication', 'identifiers']))
    .default([]),
});
export type WorkView = z.infer<typeof workViewSchema>;

export const workDetailViewSchema = z.object({
  work: workViewSchema,
  editions: z.array(editionViewSchema),
  assertions: z.array(metadataAssertionViewSchema),
  sources: z.array(sourceRecordViewSchema).default([]),
  externalMappings: z.array(externalSourceMapViewSchema).default([]),
  relations: z
    .array(
      z.object({
        id: researchIdSchema,
        kind: z.enum(WORK_RELATION_KINDS),
        direction: z.enum(['outgoing', 'incoming']),
        sourceWorkId: researchIdSchema,
        targetWorkId: researchIdSchema,
        counterpart: z.object({
          id: researchIdSchema,
          title: z.string(),
          status: z.enum(WORK_STATUSES),
        }),
        note: z.string().nullable(),
        createdAt: instantSchema,
      }),
    )
    .default([]),
  tags: z
    .array(
      z.object({
        id: researchIdSchema,
        name: z.string(),
        color: z.string().nullable(),
      }),
    )
    .default([]),
});
export type WorkDetailView = z.infer<typeof workDetailViewSchema>;

const workMetadataChangesSchema = z
  .object({
    title: z.string().trim().min(1).max(1_000).optional(),
    type: z.enum(WORK_TYPES).optional(),
    abstract: z.string().trim().max(100_000).nullable().optional(),
    year: z.number().int().min(0).max(9999).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '没有作品字段修改');

const editionMetadataChangesSchema = z
  .object({
    id: researchIdSchema,
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(1_000).optional(),
    publicationTitle: z.string().trim().max(1_000).nullable().optional(),
    publisher: z.string().trim().max(1_000).nullable().optional(),
    publishedDate: z.string().trim().max(100).nullable().optional(),
    authors: z.array(z.string().trim().min(1).max(300)).max(100).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'id' && key !== 'expectedRevision'),
    '没有版本字段修改',
  );

export const updateWorkMetadataInputSchema = z
  .object({
    expectedWorkRevision: z.number().int().positive(),
    work: workMetadataChangesSchema.optional(),
    edition: editionMetadataChangesSchema.optional(),
  })
  .refine((value) => value.work !== undefined || value.edition !== undefined, '没有元数据修改');
export type UpdateWorkMetadataInput = z.infer<typeof updateWorkMetadataInputSchema>;

export const attachmentDeletionPreviewSchema = z.object({
  attachmentId: researchIdSchema,
  assetId: researchIdSchema,
  displayName: z.string(),
  otherAttachmentCount: z.number().int().nonnegative(),
  managedObjectCount: z.number().int().nonnegative(),
  linkedLocationCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative().default(0),
  confirmationToken: researchIdSchema,
});

export const importItemViewSchema = z.object({
  id: researchIdSchema,
  sessionId: researchIdSchema,
  fileName: z.string().min(1),
  storageMode: z.enum(STORAGE_MODES),
  stage: z.enum(IMPORT_ITEM_STAGES),
  assetId: researchIdSchema.nullable(),
  workId: researchIdSchema.nullable(),
  editionId: researchIdSchema.nullable(),
  hasDecision: z.boolean().default(false),
  error: researchErrorSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type ImportItemView = z.infer<typeof importItemViewSchema>;

export const importSessionViewSchema = z.object({
  id: researchIdSchema,
  status: z.enum(IMPORT_SESSION_STATUSES),
  items: z.array(importItemViewSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type ImportSessionView = z.infer<typeof importSessionViewSchema>;

export const prepareImportInputSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        storageMode: z.enum(STORAGE_MODES),
        fileName: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(200),
  requestId: z.string().min(1).max(128),
});
export type PrepareImportInput = z.infer<typeof prepareImportInputSchema>;

export const confirmImportInputSchema = z.object({
  itemId: researchIdSchema,
  duplicateDecision: z.enum(DUPLICATE_DECISIONS),
  targetWorkId: researchIdSchema.nullish(),
  targetEditionId: researchIdSchema.nullish(),
  collectionIds: z.array(researchIdSchema).max(100).default([]),
  attachmentRole: z.enum(ATTACHMENT_ROLES).optional(),
  fields: z.record(
    z.string(),
    z.object({
      value: z.unknown(),
      sourceKind: z.enum(METADATA_SOURCE_KINDS),
      sourceRecordId: researchIdSchema.nullish(),
    }),
  ),
  requestId: z.string().min(1).max(128),
});
export type ConfirmImportInput = z.infer<typeof confirmImportInputSchema>;

export const inspectImportInputSchema = z.object({
  allowExternal: z.boolean().default(false),
  forceRefresh: z.boolean().default(false),
});
export type InspectImportInput = z.infer<typeof inspectImportInputSchema>;

export const listImportSessionsQuerySchema = z.object({
  status: z.enum(IMPORT_SESSION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const importSessionsResponseSchema = z.object({
  sessions: z.array(importSessionViewSchema),
});

export const importCommitResultSchema = z.object({
  session: importSessionViewSchema,
  results: z.array(
    z.object({
      itemId: researchIdSchema,
      status: z.enum(['committed', 'discarded', 'failed']),
      workId: researchIdSchema.nullable(),
      message: z.string().nullable(),
    }),
  ),
});

export const metadataCandidateSchema = z.object({
  provider: z.enum(['crossref', 'datacite', 'arxiv', 'openalex']),
  matchKind: z.enum(['exact', 'candidate']),
  sourceLocator: z.string(),
  title: z.string().nullable(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  type: z.enum(WORK_TYPES),
  publicationTitle: z.string().nullable(),
  publisher: z.string().nullable(),
  abstract: z.string().nullable(),
  identifiers: z.array(identifierViewSchema),
  sourceRecordId: researchIdSchema.nullable(),
});

export const importInspectionItemSchema = z.object({
  item: importItemViewSchema,
  asset: z
    .object({
      id: researchIdSchema,
      contentHash: sha256Schema,
      byteSize: z.number().int().nonnegative(),
      mimeType: z.string(),
    })
    .nullable(),
  localSuggestions: z.array(
    z.object({
      fieldName: z.string(),
      value: z.unknown(),
      sourceKind: z.enum(['embedded-pdf', 'first-page', 'filename']),
      sourceRecordId: researchIdSchema.nullable(),
    }),
  ),
  identifiers: z.array(
    z.object({
      scheme: z.enum(['doi', 'arxiv']),
      value: z.string(),
      normalizedValue: z.string(),
      sourceKind: z.enum(['embedded-pdf', 'first-page']),
      sourceRecordId: researchIdSchema.nullable(),
    }),
  ),
  externalCandidates: z.array(metadataCandidateSchema),
  exactAssetUsages: z.array(
    z.object({
      workId: researchIdSchema,
      editionId: researchIdSchema,
      attachmentId: researchIdSchema,
      role: z.enum(ATTACHMENT_ROLES),
    }),
  ),
  batchDuplicateItemIds: z.array(researchIdSchema).default([]),
  identifierMatches: z.array(
    z.object({
      workId: researchIdSchema,
      editionId: researchIdSchema,
      scheme: z.enum(IDENTIFIER_SCHEMES),
      value: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
});

export const importInspectionResponseSchema = z.object({
  sessionId: researchIdSchema,
  status: z.enum(IMPORT_SESSION_STATUSES),
  items: z.array(importInspectionItemSchema),
  disclosure: z.object({
    externalEnabled: z.boolean(),
    services: z.array(z.enum(['crossref', 'datacite', 'arxiv', 'openalex'])),
    sentFields: z.array(z.enum(['doi', 'arxivId', 'title', 'author', 'year'])),
    sendsPdf: z.literal(false),
  }),
});

export const pickPdfInputSchema = z.object({
  initialDir: z.string().optional(),
  multiple: z.boolean().default(false),
});

export const pickPdfResponseSchema = z.object({
  paths: z.array(z.string()),
  cancelled: z.boolean(),
});

export const uploadPdfQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  requestId: z.string().min(1).max(128),
});
export type UploadPdfQuery = z.infer<typeof uploadPdfQuerySchema>;

export const SEARCH_SORTS = ['relevance', 'updated-desc', 'title-asc', 'year-desc'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const MAINTENANCE_FILTERS = [
  'missing-fields',
  'missing-files',
  'duplicate-candidates',
  'metadata-failed',
  'unfinished-imports',
] as const;
export type MaintenanceFilter = (typeof MAINTENANCE_FILTERS)[number];

export const researchSearchFiltersSchema = z
  .object({
    collectionIds: z.array(researchIdSchema).max(100).default([]),
    tagIds: z.array(researchIdSchema).max(100).default([]),
    types: z.array(z.enum(WORK_TYPES)).max(WORK_TYPES.length).default([]),
    yearFrom: z.number().int().min(0).max(9999).nullable().default(null),
    yearTo: z.number().int().min(0).max(9999).nullable().default(null),
    attachmentRoles: z.array(z.enum(ATTACHMENT_ROLES)).max(ATTACHMENT_ROLES.length).default([]),
    storageModes: z.array(z.enum(STORAGE_MODES)).max(STORAGE_MODES.length).default([]),
    fileStatuses: z
      .array(z.enum(['none', 'available', 'missing', 'changed', 'recycled', 'mixed']))
      .max(6)
      .default([]),
    maintenance: z.array(z.enum(MAINTENANCE_FILTERS)).max(MAINTENANCE_FILTERS.length).default([]),
    relatedWorkId: researchIdSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (value) => value.yearFrom === null || value.yearTo === null || value.yearFrom <= value.yearTo,
    '起始年份不能晚于结束年份',
  );

export const researchSearchAstSchema = z
  .object({
    version: z.literal(1),
    text: z.string().trim().max(300).default(''),
    filters: researchSearchFiltersSchema.default({
      collectionIds: [],
      tagIds: [],
      types: [],
      yearFrom: null,
      yearTo: null,
      attachmentRoles: [],
      storageModes: [],
      fileStatuses: [],
      maintenance: [],
      relatedWorkId: null,
    }),
    sort: z.enum(SEARCH_SORTS).default('relevance'),
  })
  .strict();
export type ResearchSearchAst = z.infer<typeof researchSearchAstSchema>;

export const structuredSearchInputSchema = z.object({
  ast: researchSearchAstSchema,
  cursor: z.string().min(1).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(30),
});
export type StructuredSearchInput = z.infer<typeof structuredSearchInputSchema>;

export const createSavedQueryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: researchIdSchema.nullable().default(null),
  ast: researchSearchAstSchema,
});
export type CreateSavedQueryInput = z.infer<typeof createSavedQueryInputSchema>;

export const savedQueryRunQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const searchIndexRebuildResponseSchema = z.object({
  indexedWorks: z.number().int().nonnegative(),
});

export const listWorksQuerySchema = z.object({
  status: z.enum(WORK_STATUSES).default('active'),
  systemView: z.enum(SYSTEM_VIEWS).default('all'),
  collectionId: researchIdSchema.optional(),
  fileStatus: z.enum(['none', 'available', 'missing', 'changed', 'recycled', 'mixed']).optional(),
  query: z.string().trim().min(1).max(300).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const worksPageResponseSchema = z.object({
  works: z.array(workViewSchema),
  nextCursor: z.string().nullable(),
});

export const createManualWorkInputSchema = z.object({
  title: z.string().trim().min(1).max(1_000),
  type: z.enum(WORK_TYPES).default('unknown'),
  year: z.number().int().min(0).max(9999).nullable().default(null),
  authors: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  editionKind: z.enum(EDITION_KINDS).default('unknown'),
  publicationTitle: z.string().trim().max(1_000).nullable().default(null),
  publisher: z.string().trim().max(1_000).nullable().default(null),
  identifiers: z
    .array(
      z.object({
        scheme: z.enum(IDENTIFIER_SCHEMES),
        value: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(100)
    .default([]),
  collectionIds: z.array(researchIdSchema).max(100).default([]),
});
export type CreateManualWorkInput = z.infer<typeof createManualWorkInputSchema>;

export const addLocalAttachmentInputSchema = z.object({
  path: z.string().min(1),
  storageMode: z.enum(STORAGE_MODES),
  role: z.enum(ATTACHMENT_ROLES).default('other'),
  displayName: z.string().trim().min(1).max(500).optional(),
  mimeType: z.string().trim().min(1).max(200).default('application/octet-stream'),
});
export type AddLocalAttachmentInput = z.infer<typeof addLocalAttachmentInputSchema>;

export const createCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: researchIdSchema.nullish(),
});

export const updateCollectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    parentId: researchIdSchema.nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一项修改');
export type UpdateCollectionInput = z.infer<typeof updateCollectionInputSchema>;

export const collectionDeletionPreviewSchema = z.object({
  id: researchIdSchema,
  name: z.string(),
  parentId: researchIdSchema.nullable(),
  childCount: z.number().int().nonnegative(),
  directWorkCount: z.number().int().nonnegative(),
  parentStrategyTargetId: researchIdSchema.nullable(),
  parentStrategyNameConflicts: z.array(z.string()),
  unclassifiedStrategyNameConflicts: z.array(z.string()),
});

export const deleteCollectionQuerySchema = z.object({
  strategy: z.enum(['parent', 'unclassified']),
});

export const collectionViewSchema = z.object({
  id: researchIdSchema,
  parentId: researchIdSchema.nullable(),
  name: z.string(),
  sortOrder: z.number().int().nonnegative(),
  kind: z.enum(['manual', 'smart', 'system']),
  queryAst: researchSearchAstSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export const collectionsResponseSchema = z.object({ collections: z.array(collectionViewSchema) });

export const createWorkRelationInputSchema = z.object({
  targetWorkId: researchIdSchema,
  kind: z.enum(WORK_RELATION_KINDS),
  note: z.string().trim().max(2_000).nullable().default(null),
});
export type CreateWorkRelationInput = z.infer<typeof createWorkRelationInputSchema>;

const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();

export const tagViewSchema = z.object({
  id: researchIdSchema,
  name: z.string().min(1).max(100),
  aliases: z.array(z.string()),
  color: tagColorSchema,
  description: z.string().nullable(),
  usageCount: z.number().int().nonnegative(),
  lastUsedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  trashedAt: instantSchema.nullable(),
});
export type TagView = z.infer<typeof tagViewSchema>;

export const listTagsQuerySchema = z.object({
  status: z.enum(['active', 'trashed', 'all']).default('active'),
  query: z.string().trim().max(100).optional(),
  sort: z.enum(['usage', 'name', 'recent']).default('usage'),
});

export const tagsResponseSchema = z.object({ tags: z.array(tagViewSchema) });

export const createTagInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  color: tagColorSchema.default(null),
  description: z.string().trim().max(2_000).nullable().default(null),
});
export type CreateTagInput = z.infer<typeof createTagInputSchema>;

export const updateTagInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    aliases: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    color: tagColorSchema.optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    expectedUpdatedAt: instantSchema,
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
    '没有可更新字段',
  );
export type UpdateTagInput = z.infer<typeof updateTagInputSchema>;

export const setWorkTagsInputSchema = z.object({
  tagIds: z.array(researchIdSchema).max(1_000),
});

export const tagCandidatesQuerySchema = z.object({
  name: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const tagCandidatesResponseSchema = z.object({
  candidates: z.array(
    z.object({
      tag: tagViewSchema,
      score: z.number().min(0).max(1),
      matchedName: z.string(),
      reason: z.enum(['exact-normalized', 'prefix', 'edit-distance', 'token-overlap']),
    }),
  ),
});

export const tagDeletionPreviewSchema = z.object({
  tagId: researchIdSchema,
  name: z.string(),
  usageCount: z.number().int().nonnegative(),
  aliasCount: z.number().int().nonnegative(),
});

export const tagVersionInputSchema = z.object({ expectedUpdatedAt: instantSchema });

export const mergeTagsInputSchema = z
  .object({
    survivorId: researchIdSchema,
    mergedId: researchIdSchema,
    expectedSurvivorUpdatedAt: instantSchema,
    expectedMergedUpdatedAt: instantSchema,
  })
  .refine((value) => value.survivorId !== value.mergedId, '标签不能与自己合并');
export type MergeTagsInput = z.infer<typeof mergeTagsInputSchema>;

export const mergeRecordViewSchema = z.object({
  id: researchIdSchema,
  entityType: z.enum(['work', 'tag']),
  survivorId: researchIdSchema,
  mergedId: researchIdSchema,
  status: z.enum(['merged', 'reverted']),
  createdAt: instantSchema,
  revertedAt: instantSchema.nullable(),
});

export const workMergePreviewInputSchema = z.object({ mergedWorkId: researchIdSchema });

const mergeWorkFieldsSchema = z.object({
  title: z.string(),
  type: z.enum(WORK_TYPES),
  abstract: z.string().nullable(),
  year: z.number().int().min(0).max(9999).nullable(),
});

export const workMergePreviewSchema = z.object({
  survivor: z.object({
    id: researchIdSchema,
    revision: z.number().int().positive(),
    fields: mergeWorkFieldsSchema,
    editionIds: z.array(researchIdSchema),
  }),
  merged: z.object({
    id: researchIdSchema,
    revision: z.number().int().positive(),
    fields: mergeWorkFieldsSchema,
    editionIds: z.array(researchIdSchema),
  }),
  matrixImpact: z.object({
    affectedMatrixCount: z.number().int().nonnegative(),
    duplicateColumnCount: z.number().int().nonnegative(),
    conflicts: z.array(
      z.object({
        matrixId: researchIdSchema,
        rowId: researchIdSchema,
        survivorCellId: researchIdSchema,
        mergedCellId: researchIdSchema,
      }),
    ),
  }),
});
export type WorkMergeMatrixImpact = z.infer<typeof workMergePreviewSchema>['matrixImpact'];

export const mergeWorksInputSchema = z.object({
  mergedWorkId: researchIdSchema,
  expectedSurvivorRevision: z.number().int().positive(),
  expectedMergedRevision: z.number().int().positive(),
  fieldChoices: z.object({
    title: z.enum(['survivor', 'merged']),
    type: z.enum(['survivor', 'merged']),
    abstract: z.enum(['survivor', 'merged']),
    year: z.enum(['survivor', 'merged']),
  }),
  editionIdsToMove: z.array(researchIdSchema),
  preferredEditionId: researchIdSchema.nullable(),
});
export type MergeWorksInput = z.infer<typeof mergeWorksInputSchema>;

export const bulkWorkActionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add-to-collections'),
    workIds: z.array(researchIdSchema).min(1).max(100),
    collectionIds: z.array(researchIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal('remove-from-collections'),
    workIds: z.array(researchIdSchema).min(1).max(100),
    collectionIds: z.array(researchIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal('add-tags'),
    workIds: z.array(researchIdSchema).min(1).max(100),
    tagIds: z.array(researchIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal('remove-tags'),
    workIds: z.array(researchIdSchema).min(1).max(100),
    tagIds: z.array(researchIdSchema).min(1).max(100),
  }),
  z.object({ action: z.literal('trash'), workIds: z.array(researchIdSchema).min(1).max(100) }),
  z.object({ action: z.literal('restore'), workIds: z.array(researchIdSchema).min(1).max(100) }),
]);
export type BulkWorkActionInput = z.infer<typeof bulkWorkActionInputSchema>;

const bulkWorkActionKindSchema = z.enum([
  'add-to-collections',
  'remove-from-collections',
  'add-tags',
  'remove-tags',
  'trash',
  'restore',
]);

export const bulkWorkPreviewSchema = z.object({
  action: bulkWorkActionKindSchema,
  items: z.array(
    z.object({
      workId: researchIdSchema,
      title: z.string(),
      currentStatus: z.enum(WORK_STATUSES),
      attachmentCount: z.number().int().nonnegative(),
      missingLocationCount: z.number().int().nonnegative(),
    }),
  ),
});

export const bulkWorkResultSchema = z.object({
  action: bulkWorkActionKindSchema,
  results: z.array(
    z.object({
      workId: researchIdSchema,
      status: z.enum(['succeeded', 'skipped', 'failed']),
      message: z.string().nullable(),
    }),
  ),
});

export const setWorkCollectionsInputSchema = z.object({
  collectionIds: z.array(researchIdSchema).max(100),
});

export const relinkLocationInputSchema = z.object({ path: z.string().min(1) });

export const relinkLocationResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('restored'), location: assetLocationViewSchema }),
  z.object({
    kind: z.literal('replacement-candidate'),
    expectedAssetId: researchIdSchema,
    candidateAssetId: researchIdSchema,
  }),
]);
export type RelinkLocationResponse = z.infer<typeof relinkLocationResponseSchema>;

export const permanentDeleteInputSchema = z.object({ confirmationToken: z.string().min(1) });

export const INTEROP_FORMATS = ['bibtex', 'ris', 'csl-json'] as const;
export type InteropFormat = (typeof INTEROP_FORMATS)[number];

export const INTEROP_IMPORT_JOB_STATUSES = [
  'draft',
  'parsing',
  'awaiting-review',
  'committing',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
] as const;
export type InteropImportJobStatus = (typeof INTEROP_IMPORT_JOB_STATUSES)[number];

export const INTEROP_RECORD_STATUSES = [
  'valid',
  'invalid',
  'needs-review',
  'accepted',
  'skipped',
  'committed',
  'failed',
] as const;
export type InteropRecordStatus = (typeof INTEROP_RECORD_STATUSES)[number];

export const INTEROP_DIAGNOSTIC_CODES = [
  'unsupported-format',
  'unsupported-encoding',
  'malformed-boundary',
  'invalid-record',
  'duplicate-source-key',
  'source-content-match',
  'source-key-conflict',
  'unknown-field',
  'unknown-type',
  'field-conflict',
  'duplicate-candidate',
  'attachment-unconfirmed',
  'truncated-field',
] as const;
export type InteropDiagnosticCode = (typeof INTEROP_DIAGNOSTIC_CODES)[number];

export const INTEROP_ERROR_CODES = [
  'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
  'RESEARCH_INTEROP_UNSUPPORTED_ENCODING',
  'RESEARCH_INTEROP_MALFORMED_BOUNDARY',
  'RESEARCH_INTEROP_INVALID_RECORD',
  'RESEARCH_INTEROP_JOB_STATE_CONFLICT',
  'RESEARCH_INTEROP_REVISION_CONFLICT',
  'RESEARCH_INTEROP_ATTACHMENT_UNCONFIRMED',
  'RESEARCH_INTEROP_CAPABILITY_UNSUPPORTED',
] as const;
export type InteropErrorCode = (typeof INTEROP_ERROR_CODES)[number];

export const interopFormatSchema = z.enum(INTEROP_FORMATS);
export const interopImportJobStatusSchema = z.enum(INTEROP_IMPORT_JOB_STATUSES);
export const interopRecordStatusSchema = z.enum(INTEROP_RECORD_STATUSES);

const interopJsonValueSchema: z.ZodType<unknown> = z.json();
const interopFieldNameSchema = z.string().trim().min(1).max(160);

export const interopDiagnosticSchema = z.object({
  code: z.enum(INTEROP_DIAGNOSTIC_CODES),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1).max(2_000),
  field: interopFieldNameSchema.nullable().default(null),
  path: z.string().max(1_000).nullable().default(null),
  line: z.number().int().positive().nullable().default(null),
  recoverable: z.boolean().default(true),
});
export type InteropDiagnostic = z.infer<typeof interopDiagnosticSchema>;

export const interopPersonSchema = z.object({
  kind: z.enum(['structured', 'literal', 'organization']),
  family: z.string().max(1_000).nullable().default(null),
  given: z.string().max(1_000).nullable().default(null),
  literal: z.string().max(2_000).nullable().default(null),
  suffix: z.string().max(500).nullable().default(null),
  nonDroppingParticle: z.string().max(500).nullable().default(null),
});
export type InteropPerson = z.infer<typeof interopPersonSchema>;

export const interopDateSchema = z.object({
  year: z.number().int().min(0).max(9999).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  day: z.number().int().min(1).max(31).nullable(),
  literal: z.string().max(2_000).nullable(),
});
export type InteropDate = z.infer<typeof interopDateSchema>;

export const interopMappedRecordSchema = z.object({
  type: z.enum(WORK_TYPES),
  sourceType: z.string().max(200).nullable(),
  title: z.string().max(20_000),
  abstract: z.string().max(200_000).nullable(),
  issued: interopDateSchema.nullable(),
  publicationTitle: z.string().max(20_000).nullable(),
  publisher: z.string().max(20_000).nullable(),
  volume: z.string().max(1_000).nullable(),
  issue: z.string().max(1_000).nullable(),
  pages: z.string().max(2_000).nullable(),
  contributors: z.array(interopPersonSchema).max(10_000),
  identifiers: z
    .array(
      z.object({
        scheme: z.enum(IDENTIFIER_SCHEMES),
        value: z.string().min(1).max(10_000),
      }),
    )
    .max(10_000),
  tagSuggestions: z.array(z.string().min(1).max(500)).max(10_000),
});
export type InteropMappedRecord = z.infer<typeof interopMappedRecordSchema>;

export const interopAttachmentCandidateSchema = z.object({
  id: researchIdSchema,
  sourceValue: z.string().min(1).max(20_000),
  resolvedPath: z.string().max(20_000).nullable(),
  displayName: z.string().min(1).max(1_000),
  mimeType: z.string().max(500).nullable(),
  exists: z.boolean().nullable(),
  action: z.enum(['unconfirmed', 'ignore', 'managed', 'linked']),
});
export type InteropAttachmentCandidate = z.infer<typeof interopAttachmentCandidateSchema>;

export const interopFieldSuggestionSchema = z.object({
  field: interopFieldNameSchema,
  currentValue: interopJsonValueSchema.nullable(),
  sourceValue: interopJsonValueSchema.nullable(),
  selectedValue: interopJsonValueSchema.nullable(),
  selection: z.enum(['current', 'source', 'custom']),
  userConfirmed: z.boolean(),
  conflict: z.boolean(),
});
export type InteropFieldSuggestion = z.infer<typeof interopFieldSuggestionSchema>;

export const interopRecordDecisionSchema = z.object({
  action: z.enum(['accept', 'skip', 'match-existing', 'create-new-edition', 'suggestions-only']),
  workId: researchIdSchema.nullable().default(null),
  editionId: researchIdSchema.nullable().default(null),
  fieldSuggestions: z.array(interopFieldSuggestionSchema).max(500).default([]),
  attachmentCandidates: z.array(interopAttachmentCandidateSchema).max(1_000).default([]),
});
export type InteropRecordDecision = z.infer<typeof interopRecordDecisionSchema>;

export const interopSourceViewSchema = z.object({
  id: researchIdSchema,
  format: interopFormatSchema,
  displayName: z.string().min(1).max(1_000),
  sourcePath: z.string().min(1).max(20_000),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative().max(52_428_800),
  encoding: z.literal('utf-8'),
  parserName: z.string().min(1).max(200),
  parserVersion: z.string().min(1).max(100),
  createdAt: instantSchema,
});
export type InteropSourceView = z.infer<typeof interopSourceViewSchema>;

export const interopRecordViewSchema = z.object({
  id: researchIdSchema,
  sourceId: researchIdSchema,
  ordinal: z.number().int().nonnegative(),
  sourceKey: z.string().max(2_000).nullable(),
  rawHash: z.string().regex(/^[0-9a-f]{64}$/),
  rawRecord: z.string().max(2_000_000),
  summary: z.string().max(4_000),
  formatShadow: interopJsonValueSchema,
  mapped: interopMappedRecordSchema.nullable(),
  diagnostics: z.array(interopDiagnosticSchema).max(10_000),
  decision: interopRecordDecisionSchema.nullable(),
  status: interopRecordStatusSchema,
  revision: z.number().int().positive(),
  committedWorkId: researchIdSchema.nullable(),
  committedEditionId: researchIdSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type InteropRecordView = z.infer<typeof interopRecordViewSchema>;

export const interopImportSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  committed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  attachments: z.number().int().nonnegative(),
});

export const interopImportJobViewSchema = z.object({
  id: researchIdSchema,
  requestId: z.string().min(1).max(200),
  source: interopSourceViewSchema,
  status: interopImportJobStatusSchema,
  summary: interopImportSummarySchema,
  checkpointOrdinal: z.number().int().nonnegative(),
  errorCode: z.enum(INTEROP_ERROR_CODES).nullable(),
  errorDetail: z.string().max(4_000).nullable(),
  revision: z.number().int().positive(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  completedAt: instantSchema.nullable(),
});
export type InteropImportJobView = z.infer<typeof interopImportJobViewSchema>;

export const pickInteropSourceInputSchema = z.object({
  format: interopFormatSchema.optional(),
});

export const pickedInteropSourceSchema = z.object({
  path: z.string().min(1).max(20_000),
  displayName: z.string().min(1).max(1_000),
  byteSize: z.number().int().nonnegative().max(52_428_800),
  inferredFormat: interopFormatSchema,
});

export const pickInteropSourceResponseSchema = z.object({
  source: pickedInteropSourceSchema.nullable(),
  cancelled: z.boolean(),
});

export const createInteropImportInputSchema = z.object({
  requestId: z.string().min(1).max(200),
  sourcePath: z.string().min(1).max(20_000),
  displayName: z.string().min(1).max(1_000),
  format: interopFormatSchema,
});
export type CreateInteropImportInput = z.infer<typeof createInteropImportInputSchema>;

export const interopImportRecordsQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: interopRecordStatusSchema.optional(),
});

export const interopImportRecordsPageSchema = z.object({
  items: z.array(interopRecordViewSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(200),
  nextOffset: z.number().int().nonnegative().nullable(),
});

export const updateInteropRecordDecisionInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  decision: interopRecordDecisionSchema,
});
export type UpdateInteropRecordDecisionInput = z.infer<
  typeof updateInteropRecordDecisionInputSchema
>;

export const commitInteropImportInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const commitInteropImportResultSchema = z.object({
  created: z.number().int().nonnegative(),
  newEdition: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  suggestionsOnly: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  attachments: z.array(
    z.object({
      recordId: researchIdSchema,
      candidateId: researchIdSchema,
      status: z.enum(['ignored', 'attached', 'failed']),
      error: z.string().nullable(),
    }),
  ),
});

export const deletionPreviewSchema = z.object({
  workId: researchIdSchema,
  attachmentCount: z.number().int().nonnegative(),
  managedObjectCount: z.number().int().nonnegative(),
  linkedLocationCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative().default(0),
  confirmationToken: z.string().min(1),
});
