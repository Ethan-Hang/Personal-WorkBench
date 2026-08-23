import { z } from 'zod';

export const RESEARCH_MODULE_ID = 'research';
const API_ROOT = '/api/research/v1';

export const RESEARCH_API_V1 = {
  works: `${API_ROOT}/works`,
  work: (id: string) => `${API_ROOT}/works/${id}`,
  workCollections: (id: string) => `${API_ROOT}/works/${id}/collections`,
  workTrash: (id: string) => `${API_ROOT}/works/${id}/trash`,
  workRestore: (id: string) => `${API_ROOT}/works/${id}/restore`,
  workDeletionPreview: (id: string) => `${API_ROOT}/works/${id}/deletion-preview`,
  collections: `${API_ROOT}/collections`,
  collection: (id: string) => `${API_ROOT}/collections/${id}`,
  importSessions: `${API_ROOT}/import-sessions`,
  importSession: (id: string) => `${API_ROOT}/import-sessions/${id}`,
  importPickFiles: `${API_ROOT}/import-sessions/pick-files`,
  importUpload: `${API_ROOT}/import-sessions/upload`,
  importInspect: (id: string) => `${API_ROOT}/import-sessions/${id}/inspect`,
  importConfirm: (id: string) => `${API_ROOT}/import-sessions/${id}/confirm`,
  locationCheck: (id: string) => `${API_ROOT}/locations/${id}/check`,
  locationRelink: (id: string) => `${API_ROOT}/locations/${id}/relink`,
  attachment: (id: string) => `${API_ROOT}/attachments/${id}`,
  reconcile: `${API_ROOT}/reconcile`,
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
] as const;
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];

export const instantSchema = z.string().datetime({ precision: 3 });
export const researchIdSchema = z.string().min(1).max(128);
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

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
  publishedDate: z.string().nullable(),
  identifiers: z.array(identifierViewSchema),
  attachments: z.array(attachmentViewSchema),
});
export type EditionView = z.infer<typeof editionViewSchema>;

export const workViewSchema = z.object({
  id: researchIdSchema,
  type: z.enum(WORK_TYPES),
  title: z.string(),
  year: z.number().int().min(0).max(9999).nullable(),
  status: z.enum(WORK_STATUSES),
  preferredEditionId: researchIdSchema.nullable(),
  attachmentCount: z.number().int().nonnegative(),
  collectionIds: z.array(researchIdSchema),
  fileStatus: z.enum(['none', 'available', 'missing', 'changed', 'recycled', 'mixed']),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  trashedAt: instantSchema.nullable(),
});
export type WorkView = z.infer<typeof workViewSchema>;

export const workDetailViewSchema = z.object({
  work: workViewSchema,
  editions: z.array(editionViewSchema),
  assertions: z.array(metadataAssertionViewSchema),
});
export type WorkDetailView = z.infer<typeof workDetailViewSchema>;

export const importItemViewSchema = z.object({
  id: researchIdSchema,
  sessionId: researchIdSchema,
  fileName: z.string().min(1),
  storageMode: z.enum(STORAGE_MODES),
  stage: z.enum(IMPORT_ITEM_STAGES),
  assetId: researchIdSchema.nullable(),
  workId: researchIdSchema.nullable(),
  editionId: researchIdSchema.nullable(),
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
  collectionIds: z.array(researchIdSchema).max(100).default([]),
  fields: z.record(z.string(), z.unknown()),
  requestId: z.string().min(1).max(128),
});
export type ConfirmImportInput = z.infer<typeof confirmImportInputSchema>;

export const listWorksQuerySchema = z.object({
  status: z.enum(WORK_STATUSES).default('active'),
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

export const createCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: researchIdSchema.nullish(),
});

export const setWorkCollectionsInputSchema = z.object({
  collectionIds: z.array(researchIdSchema).max(100),
});

export const relinkLocationInputSchema = z.object({ path: z.string().min(1) });

export const deletionPreviewSchema = z.object({
  workId: researchIdSchema,
  attachmentCount: z.number().int().nonnegative(),
  managedObjectCount: z.number().int().nonnegative(),
  linkedLocationCount: z.number().int().nonnegative(),
  confirmationToken: z.string().min(1),
});
