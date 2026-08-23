import { z } from 'zod';

export const RESEARCH_MODULE_ID = 'research';
const API_ROOT = '/api/research/v1';

export const RESEARCH_API_V1 = {
  works: `${API_ROOT}/works`,
  workSearch: `${API_ROOT}/works/search`,
  work: (id: string) => `${API_ROOT}/works/${id}`,
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
