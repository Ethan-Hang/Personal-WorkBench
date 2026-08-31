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
  'ANNOTATION_ASSET_NOT_FOUND',
  'ANNOTATION_CONTEXT_NOT_FOUND',
  'ANNOTATION_NOT_FOUND',
  'ANNOTATION_CONFLICT',
  'ANNOTATION_INVALID',
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
});

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

export const deletionPreviewSchema = z.object({
  workId: researchIdSchema,
  attachmentCount: z.number().int().nonnegative(),
  managedObjectCount: z.number().int().nonnegative(),
  linkedLocationCount: z.number().int().nonnegative(),
  confirmationToken: z.string().min(1),
});
