import { z } from 'zod';
import {
  ANNOTATION_KINDS,
  ANNOTATION_STATUSES,
  ASSET_STATES,
  ATTACHMENT_ROLES,
  ATTACHMENT_STATUSES,
  CLAIM_EVIDENCE_RELATIONS,
  CLAIM_STATUSES,
  EDITION_KINDS,
  IDENTIFIER_SCHEMES,
  KNOWLEDGE_BASIC_STATUSES,
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_REVISION_REASONS,
  LOCATION_STATES,
  MATRIX_ROW_KINDS,
  MATRIX_STATUSES,
  METADATA_SOURCE_KINDS,
  READER_LAYOUTS,
  READING_CONTEXT_STATUSES,
  STORAGE_MODES,
  WRITING_BLOCK_KINDS,
  WRITING_DOCUMENT_STATUSES,
  WORK_RELATION_KINDS,
  WORK_STATUSES,
  WORK_TYPES,
  annotationAnchorSchema,
  annotationSchema,
  evidenceSourceSnapshotSchema,
  matrixReviewBaselineSchema,
  researchSearchAstSchema,
  writingCitationIntentSchema,
} from '../contract.js';

export const RESEARCH_CANONICAL_SCHEMA_VERSION = 3 as const;

const id = z.string().min(1);
const nullableText = z.string().nullable();
const timestamp = z.string().min(1);

export const canonicalWorkSchema = z
  .object({
    id,
    type: z.enum(WORK_TYPES),
    title: z.string(),
    titleSort: z.string(),
    abstract: nullableText,
    year: z.number().int().min(0).max(9999).nullable(),
    preferredEditionId: id.nullable(),
    status: z.enum(WORK_STATUSES),
    redirectToWorkId: id.nullable(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalEditionSchema = z
  .object({
    id,
    workId: id,
    kind: z.enum(EDITION_KINDS),
    title: z.string(),
    publicationTitle: nullableText,
    publisher: nullableText,
    publishedDate: nullableText,
    volume: nullableText,
    issue: nullableText,
    pages: nullableText,
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalContributorSchema = z
  .object({
    id,
    editionId: id,
    role: z.string(),
    displayName: z.string(),
    givenName: nullableText,
    familyName: nullableText,
    orcid: nullableText,
    sequence: z.number().int().nonnegative(),
  })
  .strict();

export const canonicalIdentifierSchema = z
  .object({
    id,
    entityType: z.enum(['work', 'edition']),
    entityId: id,
    scheme: z.enum(IDENTIFIER_SCHEMES),
    value: z.string(),
    normalizedValue: z.string(),
    sourceRecordId: id.nullable(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalCollectionSchema = z
  .object({
    id,
    parentId: id.nullable(),
    name: z.string(),
    normalizedName: z.string(),
    kind: z.enum(['manual', 'smart', 'system']),
    queryAst: researchSearchAstSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalCollectionEntrySchema = z
  .object({
    id,
    collectionId: id,
    workId: id,
    sortOrder: z.number().int().nonnegative(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalTagSchema = z
  .object({
    id,
    name: z.string(),
    normalizedName: z.string(),
    color: nullableText,
    description: nullableText,
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalTagAliasSchema = z
  .object({
    id,
    tagId: id,
    name: z.string(),
    normalizedName: z.string(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalWorkTagSchema = z
  .object({ id, workId: id, tagId: id, createdAt: timestamp })
  .strict();

export const canonicalWorkRelationSchema = z
  .object({
    id,
    sourceWorkId: id,
    targetWorkId: id,
    kind: z.enum(WORK_RELATION_KINDS),
    note: nullableText,
    createdAt: timestamp,
  })
  .strict();

export const canonicalSourceRecordSchema = z
  .object({
    id,
    provider: z.string(),
    sourceLocator: nullableText,
    rawFormat: z.string(),
    rawPayload: z.string(),
    parserVersion: z.string(),
    observedAt: timestamp,
    createdAt: timestamp,
  })
  .strict();

export const canonicalMetadataAssertionSchema = z
  .object({
    id,
    entityType: z.enum(['work', 'edition']),
    entityId: id,
    fieldName: z.string(),
    value: z.unknown(),
    normalizedValue: nullableText,
    sourceKind: z.enum(METADATA_SOURCE_KINDS),
    sourceRecordId: id.nullable(),
    observedAt: timestamp,
    isUserConfirmed: z.boolean(),
    isSelected: z.boolean(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalExternalSourceMapSchema = z
  .object({
    id,
    provider: z.string(),
    externalId: z.string(),
    entityType: z.enum(['work', 'edition']),
    entityId: id,
    lastFetchedAt: timestamp.nullable(),
    cacheStatus: z.enum(['fresh', 'not-found', 'transient-failure']),
    cacheExpiresAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalAssetSchema = z
  .object({
    id,
    hashAlgorithm: z.literal('sha256'),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative(),
    mimeType: z.string(),
    state: z.enum(ASSET_STATES),
    createdAt: timestamp,
    updatedAt: timestamp,
    recycledAt: timestamp.nullable(),
  })
  .strict();

export const canonicalLocationSchema = z
  .object({
    id,
    assetId: id,
    mode: z.enum(STORAGE_MODES),
    originalPath: z.string(),
    resolvedPath: z.string(),
    objectKey: nullableText,
    state: z.enum(LOCATION_STATES),
    deviceId: nullableText,
    fileId: nullableText,
    observedSize: z.number().int().nonnegative().nullable(),
    observedMtimeMs: z.number().int().nonnegative().nullable(),
    errorCode: nullableText,
    lastCheckedAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    recycledAt: timestamp.nullable(),
  })
  .strict();

export const canonicalAttachmentSchema = z
  .object({
    id,
    editionId: id,
    assetId: id,
    role: z.enum(ATTACHMENT_ROLES),
    displayName: z.string(),
    status: z.enum(ATTACHMENT_STATUSES),
    createdAt: timestamp,
    recycledAt: timestamp.nullable(),
  })
  .strict();

const canonicalBaseFields = {
  exportedAt: timestamp,
  generator: z.literal('personal-workbench/research'),
  works: z.array(canonicalWorkSchema),
  editions: z.array(canonicalEditionSchema),
  contributors: z.array(canonicalContributorSchema),
  identifiers: z.array(canonicalIdentifierSchema),
  collections: z.array(canonicalCollectionSchema),
  collectionEntries: z.array(canonicalCollectionEntrySchema),
  tags: z.array(canonicalTagSchema),
  tagAliases: z.array(canonicalTagAliasSchema),
  workTags: z.array(canonicalWorkTagSchema),
  workRelations: z.array(canonicalWorkRelationSchema),
  sourceRecords: z.array(canonicalSourceRecordSchema),
  metadataAssertions: z.array(canonicalMetadataAssertionSchema),
  externalSourceMaps: z.array(canonicalExternalSourceMapSchema),
  assets: z.array(canonicalAssetSchema),
  locations: z.array(canonicalLocationSchema),
  attachments: z.array(canonicalAttachmentSchema),
} as const;

export const canonicalReadingContextSchema = z
  .object({
    id,
    name: z.string(),
    normalizedName: z.string(),
    description: nullableText,
    color: nullableText,
    status: z.enum(READING_CONTEXT_STATUSES),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalCollectionContextSchema = z
  .object({
    collectionId: id,
    contextId: id,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalReaderStateSchema = z
  .object({
    assetId: id,
    pageNumber: z.number().int().positive(),
    pageOffsetRatio: z.number().min(0).max(1),
    zoom: z.number().min(0.1).max(8),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    layout: z.enum(READER_LAYOUTS),
    lastContextId: id.nullable(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalAnnotationSchema = z
  .object({
    id,
    assetId: id,
    editionId: id.nullable(),
    contextId: id.nullable(),
    kind: z.enum(ANNOTATION_KINDS),
    pageNumber: z.number().int().positive(),
    anchor: annotationAnchorSchema,
    body: nullableText,
    color: nullableText,
    status: z.enum(ANNOTATION_STATUSES),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalAnnotationRevisionSchema = z
  .object({
    id,
    annotationId: id,
    revision: z.number().int().positive(),
    snapshot: annotationSchema,
    reason: z.enum(['update', 'delete', 'restore', 'move-context']),
    createdAt: timestamp,
  })
  .strict();

export const canonicalNoteSchema = z
  .object({
    id,
    contextId: id.nullable(),
    title: z.string(),
    body: z.string(),
    status: z.enum(KNOWLEDGE_BASIC_STATUSES),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalEvidenceSchema = z
  .object({
    id,
    contextId: id.nullable(),
    workId: id,
    editionId: id.nullable(),
    assetId: id,
    annotationId: id,
    sourceSnapshot: evidenceSourceSnapshotSchema,
    sourceKind: z.enum(['pdf', 'ocr']),
    title: nullableText,
    summary: z.string(),
    notes: nullableText,
    status: z.enum(KNOWLEDGE_BASIC_STATUSES),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalNoteLinkSchema = z
  .object({
    id,
    noteId: id,
    workId: id.nullable(),
    annotationId: id.nullable(),
    evidenceId: id.nullable(),
    claimId: id.nullable(),
    status: z.enum(KNOWLEDGE_BASIC_STATUSES),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      [value.workId, value.annotationId, value.evidenceId, value.claimId].filter(Boolean).length ===
      1,
    '笔记链接必须有且仅有一个目标',
  );

export const canonicalClaimSchema = z
  .object({
    id,
    contextId: id.nullable(),
    statement: z.string(),
    rationale: nullableText,
    status: z.enum(CLAIM_STATUSES),
    statusBeforeDelete: z.enum(['draft', 'active', 'archived']).nullable(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: timestamp.nullable(),
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalClaimEvidenceSchema = z
  .object({
    id,
    claimId: id,
    evidenceId: id,
    relation: z.enum(CLAIM_EVIDENCE_RELATIONS),
    note: nullableText,
    status: z.enum(KNOWLEDGE_BASIC_STATUSES),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: timestamp.nullable(),
  })
  .strict();

const canonicalStructuredStatus = {
  status: z.enum(KNOWLEDGE_BASIC_STATUSES),
  revision: z.number().int().positive(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable(),
} as const;

export const canonicalMatrixSchema = z
  .object({
    id,
    contextId: id.nullable(),
    title: z.string(),
    description: nullableText,
    status: z.enum(MATRIX_STATUSES),
    statusBeforeDelete: z.enum(['active', 'archived']).nullable(),
    structureRevision: z.number().int().positive(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: timestamp.nullable(),
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalMatrixColumnSchema = z
  .object({
    id,
    matrixId: id,
    workId: id,
    position: z.number().int().nonnegative(),
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalMatrixRowSchema = z
  .object({
    id,
    matrixId: id,
    kind: z.enum(MATRIX_ROW_KINDS),
    claimId: id.nullable(),
    title: nullableText,
    question: nullableText,
    position: z.number().int().nonnegative(),
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalMatrixCellSchema = z
  .object({
    id,
    matrixId: id,
    rowId: id,
    columnId: id,
    synthesis: z.string(),
    reviewBaseline: matrixReviewBaselineSchema.nullable(),
    reviewedAt: timestamp.nullable(),
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalMatrixCellEvidenceSchema = z
  .object({
    id,
    cellId: id,
    evidenceId: id,
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalWritingDocumentSchema = z
  .object({
    id,
    contextId: id.nullable(),
    title: z.string(),
    status: z.enum(WRITING_DOCUMENT_STATUSES),
    statusBeforeDelete: z.enum(['active', 'archived']).nullable(),
    structureRevision: z.number().int().positive(),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: timestamp.nullable(),
    deletedAt: timestamp.nullable(),
  })
  .strict();

export const canonicalWritingSectionSchema = z
  .object({
    id,
    documentId: id,
    title: z.string(),
    position: z.number().int().nonnegative(),
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalWritingBlockV2Schema = z
  .object({
    id,
    documentId: id,
    sectionId: id,
    kind: z.enum(['text', 'note', 'evidence', 'claim', 'matrix']),
    text: nullableText,
    noteId: id.nullable(),
    evidenceId: id.nullable(),
    claimId: id.nullable(),
    matrixId: id.nullable(),
    targetLabel: nullableText,
    position: z.number().int().nonnegative(),
    ...canonicalStructuredStatus,
  })
  .strict();

export const canonicalWritingBlockSchema = z
  .object({
    id,
    documentId: id,
    sectionId: id,
    kind: z.enum(WRITING_BLOCK_KINDS),
    text: nullableText,
    noteId: id.nullable(),
    evidenceId: id.nullable(),
    claimId: id.nullable(),
    matrixId: id.nullable(),
    workId: id.nullable(),
    editionId: id.nullable(),
    citation: writingCitationIntentSchema.nullable(),
    targetLabel: nullableText,
    position: z.number().int().nonnegative(),
    ...canonicalStructuredStatus,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'citation') {
      if (value.workId === null || value.citation === null) {
        context.addIssue({ code: 'custom', message: '引用块必须包含 Work 与 citation intent' });
      }
      if (value.editionId !== value.citation?.editionId) {
        context.addIssue({ code: 'custom', message: '引用块 Edition 与 intent 不一致' });
      }
    } else if (value.workId !== null || value.editionId !== null || value.citation !== null) {
      context.addIssue({ code: 'custom', message: '非引用块不能包含 citation intent' });
    }
  });

export const canonicalKnowledgeRevisionSchema = z
  .object({
    id,
    entityType: z.enum(KNOWLEDGE_ENTITY_TYPES),
    entityId: id,
    revision: z.number().int().positive(),
    snapshot: z.unknown(),
    reason: z.enum(KNOWLEDGE_REVISION_REASONS),
    createdAt: timestamp,
  })
  .strict();

export const canonicalReaderDataSchema = z
  .object({
    contexts: z.array(canonicalReadingContextSchema),
    collectionContexts: z.array(canonicalCollectionContextSchema),
    states: z.array(canonicalReaderStateSchema),
    annotations: z.array(canonicalAnnotationSchema),
    annotationRevisions: z.array(canonicalAnnotationRevisionSchema),
  })
  .strict();

export const canonicalKnowledgeDataV2Schema = z
  .object({
    notes: z.array(canonicalNoteSchema),
    evidence: z.array(canonicalEvidenceSchema),
    noteLinks: z.array(canonicalNoteLinkSchema),
    claims: z.array(canonicalClaimSchema),
    claimEvidence: z.array(canonicalClaimEvidenceSchema),
    matrices: z.array(canonicalMatrixSchema),
    matrixColumns: z.array(canonicalMatrixColumnSchema),
    matrixRows: z.array(canonicalMatrixRowSchema),
    matrixCells: z.array(canonicalMatrixCellSchema),
    matrixCellEvidence: z.array(canonicalMatrixCellEvidenceSchema),
    writingDocuments: z.array(canonicalWritingDocumentSchema),
    writingSections: z.array(canonicalWritingSectionSchema),
    writingBlocks: z.array(canonicalWritingBlockV2Schema),
    revisions: z.array(canonicalKnowledgeRevisionSchema),
  })
  .strict();

export const canonicalKnowledgeDataSchema = canonicalKnowledgeDataV2Schema.extend({
  writingBlocks: z.array(canonicalWritingBlockSchema),
});

export const canonicalInteropSourceSchema = z
  .object({
    id,
    format: z.enum(['bibtex', 'ris', 'csl-json']),
    displayName: z.string(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative().max(52_428_800),
    encoding: z.literal('utf-8'),
    parserName: z.string(),
    parserVersion: z.string(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalInteropRecordSchema = z
  .object({
    id,
    sourceId: id,
    ordinal: z.number().int().nonnegative(),
    sourceKey: nullableText,
    rawHash: z.string().regex(/^[a-f0-9]{64}$/),
    rawRecord: z.string(),
    summary: z.string(),
    formatShadow: z.unknown(),
    mapped: z.unknown().nullable(),
    diagnostics: z.unknown(),
    decision: z.unknown().nullable(),
    status: z.enum([
      'valid',
      'invalid',
      'needs-review',
      'accepted',
      'skipped',
      'committed',
      'failed',
    ]),
    revision: z.number().int().positive(),
    committedSourceRecordId: id.nullable(),
    committedWorkId: id.nullable(),
    committedEditionId: id.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalInteropRecordEntitySchema = z
  .object({
    id,
    recordId: id,
    workId: id.nullable(),
    editionId: id.nullable(),
    action: z.enum(['created', 'new-edition', 'matched', 'suggestions-only']),
    isCurrent: z.boolean(),
    createdAt: timestamp,
  })
  .strict();

export const canonicalCitationKeyPreferenceSchema = z
  .object({
    id,
    workId: id,
    editionId: id.nullable(),
    preferredKey: z.string().min(1).max(200),
    source: z.enum(['generated', 'imported', 'user']),
    revision: z.number().int().positive(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const canonicalInteropDataSchema = z
  .object({
    sources: z.array(canonicalInteropSourceSchema),
    records: z.array(canonicalInteropRecordSchema),
    recordEntities: z.array(canonicalInteropRecordEntitySchema),
    citationKeyPreferences: z.array(canonicalCitationKeyPreferenceSchema),
  })
  .strict();

export const canonicalResearchLibraryV1Schema = z
  .object({ schemaVersion: z.literal(1), ...canonicalBaseFields })
  .strict();

export const canonicalResearchLibraryV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    ...canonicalBaseFields,
    reader: canonicalReaderDataSchema,
    knowledge: canonicalKnowledgeDataV2Schema,
  })
  .strict();

export const canonicalResearchLibraryV3Schema = z
  .object({
    schemaVersion: z.literal(RESEARCH_CANONICAL_SCHEMA_VERSION),
    ...canonicalBaseFields,
    reader: canonicalReaderDataSchema,
    knowledge: canonicalKnowledgeDataSchema,
    interop: canonicalInteropDataSchema,
  })
  .strict();

export const canonicalResearchLibrarySchema = z.discriminatedUnion('schemaVersion', [
  canonicalResearchLibraryV1Schema,
  canonicalResearchLibraryV2Schema,
  canonicalResearchLibraryV3Schema,
]);

export type CanonicalResearchLibrary = z.infer<typeof canonicalResearchLibrarySchema>;
export type CanonicalResearchLibraryV1 = z.infer<typeof canonicalResearchLibraryV1Schema>;
export type CanonicalResearchLibraryV2 = z.infer<typeof canonicalResearchLibraryV2Schema>;
export type CanonicalResearchLibraryV3 = z.infer<typeof canonicalResearchLibraryV3Schema>;

export function normalizeCanonicalResearchLibrary(input: unknown): CanonicalResearchLibraryV3 {
  const canonical = canonicalResearchLibrarySchema.parse(input);
  if (canonical.schemaVersion === 3) return canonical;
  const reader =
    canonical.schemaVersion === 2
      ? canonical.reader
      : {
          contexts: [],
          collectionContexts: [],
          states: [],
          annotations: [],
          annotationRevisions: [],
        };
  const knowledge =
    canonical.schemaVersion === 2
      ? {
          ...canonical.knowledge,
          writingBlocks: canonical.knowledge.writingBlocks.map((block) => ({
            ...block,
            workId: null,
            editionId: null,
            citation: null,
          })),
        }
      : {
          notes: [],
          evidence: [],
          noteLinks: [],
          claims: [],
          claimEvidence: [],
          matrices: [],
          matrixColumns: [],
          matrixRows: [],
          matrixCells: [],
          matrixCellEvidence: [],
          writingDocuments: [],
          writingSections: [],
          writingBlocks: [],
          revisions: [],
        };
  return canonicalResearchLibraryV3Schema.parse({
    ...canonical,
    schemaVersion: 3,
    reader,
    knowledge,
    interop: {
      sources: [],
      records: [],
      recordEntities: [],
      citationKeyPreferences: [],
    },
  });
}
