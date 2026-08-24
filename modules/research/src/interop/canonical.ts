import { z } from 'zod';
import {
  ASSET_STATES,
  ATTACHMENT_ROLES,
  ATTACHMENT_STATUSES,
  EDITION_KINDS,
  IDENTIFIER_SCHEMES,
  LOCATION_STATES,
  METADATA_SOURCE_KINDS,
  STORAGE_MODES,
  WORK_RELATION_KINDS,
  WORK_STATUSES,
  WORK_TYPES,
  researchSearchAstSchema,
} from '../contract.js';

export const RESEARCH_CANONICAL_SCHEMA_VERSION = 1 as const;

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

export const canonicalResearchLibrarySchema = z
  .object({
    schemaVersion: z.literal(RESEARCH_CANONICAL_SCHEMA_VERSION),
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
  })
  .strict();

export type CanonicalResearchLibrary = z.infer<typeof canonicalResearchLibrarySchema>;
