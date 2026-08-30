import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  ANNOTATION_KINDS,
  ANNOTATION_STATUSES,
  ASSET_STATES,
  ATTACHMENT_ROLES,
  ATTACHMENT_STATUSES,
  CLAIM_EVIDENCE_RELATIONS,
  CLAIM_STATUSES,
  DERIVED_JOB_STATUSES,
  EDITION_KINDS,
  IMPORT_ITEM_STAGES,
  IMPORT_SESSION_STATUSES,
  KNOWLEDGE_BASIC_STATUSES,
  KNOWLEDGE_ENTITY_TYPES,
  KNOWLEDGE_REVISION_REASONS,
  MATRIX_ROW_KINDS,
  MATRIX_STATUSES,
  WRITING_BLOCK_KINDS,
  WRITING_DOCUMENT_STATUSES,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_SOURCE_STATES,
  LOCATION_STATES,
  MANAGED_ROOT_MIGRATION_STATUSES,
  METADATA_SOURCE_KINDS,
  READER_LAYOUTS,
  READER_ROTATIONS,
  READING_CONTEXT_STATUSES,
  STORAGE_MODES,
  WORK_STATUSES,
  WORK_TYPES,
} from '../contract.js';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

function enumSql(column: string, values: readonly string[]) {
  return sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(', ')})`);
}

export const researchWorks = sqliteTable(
  'research_works',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull().default('unknown'),
    title: text('title').notNull().default(''),
    titleSort: text('title_sort').notNull().default(''),
    abstract: text('abstract'),
    year: integer('year'),
    preferredEditionId: text('preferred_edition_id'),
    status: text('status').notNull().default('active'),
    redirectToWorkId: text('redirect_to_work_id'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    trashedAt: text('trashed_at'),
  },
  (table) => [
    check('ck_research_works_type', enumSql('type', WORK_TYPES)),
    check('ck_research_works_status', enumSql('status', WORK_STATUSES)),
    check('ck_research_works_revision', sql`${table.revision} >= 1`),
    check('ck_research_works_year', sql`${table.year} IS NULL OR ${table.year} BETWEEN 0 AND 9999`),
    index('idx_research_works_status_updated').on(table.status, table.updatedAt),
    index('idx_research_works_title_sort').on(table.titleSort),
    index('idx_research_works_redirect').on(table.redirectToWorkId),
  ],
);

export const researchEditions = sqliteTable(
  'research_editions',
  {
    id: text('id').primaryKey(),
    workId: text('work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('unknown'),
    title: text('title').notNull().default(''),
    publicationTitle: text('publication_title'),
    publisher: text('publisher'),
    publishedDate: text('published_date'),
    volume: text('volume'),
    issue: text('issue'),
    pages: text('pages'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_editions_kind', enumSql('kind', EDITION_KINDS)),
    check('ck_research_editions_revision', sql`${table.revision} >= 1`),
    index('idx_research_editions_work').on(table.workId),
    index('idx_research_editions_published').on(table.publishedDate),
  ],
);

export const researchContributors = sqliteTable(
  'research_contributors',
  {
    id: text('id').primaryKey(),
    editionId: text('edition_id')
      .notNull()
      .references(() => researchEditions.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('author'),
    displayName: text('display_name').notNull(),
    givenName: text('given_name'),
    familyName: text('family_name'),
    orcid: text('orcid'),
    sequence: integer('sequence').notNull().default(0),
  },
  (table) => [
    check('ck_research_contributors_sequence', sql`${table.sequence} >= 0`),
    unique('uq_research_contributors_edition_sequence').on(table.editionId, table.sequence),
    index('idx_research_contributors_name').on(table.familyName, table.displayName),
  ],
);

export const researchIdentifiers = sqliteTable(
  'research_identifiers',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    scheme: text('scheme').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    sourceRecordId: text('source_record_id'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_identifiers_entity', enumSql('entity_type', ['work', 'edition'])),
    check(
      'ck_research_identifiers_scheme',
      enumSql('scheme', ['doi', 'arxiv', 'isbn', 'issn', 'pmid', 'url']),
    ),
    index('idx_research_identifiers_entity').on(table.entityType, table.entityId),
    index('idx_research_identifiers_lookup').on(table.scheme, table.normalizedValue),
  ],
);

export const researchAssets = sqliteTable(
  'research_assets',
  {
    id: text('id').primaryKey(),
    hashAlgorithm: text('hash_algorithm').notNull().default('sha256'),
    contentHash: text('content_hash').notNull(),
    byteSize: integer('byte_size').notNull(),
    mimeType: text('mime_type').notNull().default('application/pdf'),
    state: text('state').notNull().default('active'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    recycledAt: text('recycled_at'),
  },
  (table) => [
    check('ck_research_assets_algorithm', sql.raw("hash_algorithm = 'sha256'")),
    check(
      'ck_research_assets_hash',
      sql.raw("length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'"),
    ),
    check('ck_research_assets_size', sql`${table.byteSize} >= 0`),
    check('ck_research_assets_state', enumSql('state', ASSET_STATES)),
    unique('uq_research_assets_hash').on(table.hashAlgorithm, table.contentHash),
    index('idx_research_assets_state').on(table.state),
  ],
);

export const researchAssetLocations = sqliteTable(
  'research_asset_locations',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    originalPath: text('original_path').notNull(),
    resolvedPath: text('resolved_path').notNull(),
    objectKey: text('object_key'),
    state: text('state').notNull().default('pending'),
    deviceId: text('device_id'),
    fileId: text('file_id'),
    observedSize: integer('observed_size'),
    observedMtimeMs: integer('observed_mtime_ms'),
    errorCode: text('error_code'),
    lastCheckedAt: text('last_checked_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    recycledAt: text('recycled_at'),
  },
  (table) => [
    check('ck_research_asset_locations_mode', enumSql('mode', STORAGE_MODES)),
    check('ck_research_asset_locations_state', enumSql('state', LOCATION_STATES)),
    check(
      'ck_research_asset_locations_object_key',
      sql.raw(
        "(mode = 'managed' AND object_key IS NOT NULL) OR (mode = 'linked' AND object_key IS NULL)",
      ),
    ),
    unique('uq_research_asset_locations_identity').on(
      table.assetId,
      table.mode,
      table.originalPath,
    ),
    uniqueIndex('uq_research_asset_locations_managed')
      .on(table.assetId)
      .where(sql`${table.mode} = 'managed'`),
    index('idx_research_asset_locations_asset').on(table.assetId),
    index('idx_research_asset_locations_state').on(table.state),
    index('idx_research_asset_locations_resolved').on(table.resolvedPath),
  ],
);

export const researchAttachments = sqliteTable(
  'research_attachments',
  {
    id: text('id').primaryKey(),
    editionId: text('edition_id')
      .notNull()
      .references(() => researchEditions.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('primary-pdf'),
    displayName: text('display_name').notNull().default(''),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull().default(now),
    recycledAt: text('recycled_at'),
  },
  (table) => [
    check('ck_research_attachments_role', enumSql('role', ATTACHMENT_ROLES)),
    check('ck_research_attachments_status', enumSql('status', ATTACHMENT_STATUSES)),
    unique('uq_research_attachments_relation').on(table.editionId, table.assetId, table.role),
    index('idx_research_attachments_asset').on(table.assetId),
    index('idx_research_attachments_status').on(table.status),
  ],
);

export const researchCollections = sqliteTable(
  'research_collections',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    kind: text('kind').notNull().default('manual'),
    queryJson: text('query_json'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    trashedAt: text('trashed_at'),
  },
  (table) => [
    check('ck_research_collections_kind', enumSql('kind', ['manual', 'smart', 'system'])),
    check('ck_research_collections_sort', sql`${table.sortOrder} >= 0`),
    unique('uq_research_collections_parent_name').on(table.parentId, table.normalizedName),
    uniqueIndex('uq_research_collections_root_name')
      .on(table.normalizedName)
      .where(sql`${table.parentId} IS NULL`),
    index('idx_research_collections_parent').on(table.parentId, table.sortOrder),
  ],
);

export const researchCollectionEntries = sqliteTable(
  'research_collection_entries',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => researchCollections.id, { onDelete: 'cascade' }),
    workId: text('work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    unique('uq_research_collection_entries').on(table.collectionId, table.workId),
    index('idx_research_collection_entries_work').on(table.workId),
  ],
);

export const researchTags = sqliteTable(
  'research_tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    color: text('color'),
    description: text('description'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    trashedAt: text('trashed_at'),
  },
  (table) => [unique('uq_research_tags_name').on(table.normalizedName)],
);

export const researchTagAliases = sqliteTable(
  'research_tag_aliases',
  {
    id: text('id').primaryKey(),
    tagId: text('tag_id')
      .notNull()
      .references(() => researchTags.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    unique('uq_research_tag_aliases_name').on(table.normalizedName),
    index('idx_research_tag_aliases_tag').on(table.tagId),
  ],
);

export const researchWorkTags = sqliteTable(
  'research_work_tags',
  {
    id: text('id').primaryKey(),
    workId: text('work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => researchTags.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    unique('uq_research_work_tags').on(table.workId, table.tagId),
    index('idx_research_work_tags_tag').on(table.tagId),
  ],
);

export const researchWorkRelations = sqliteTable(
  'research_work_relations',
  {
    id: text('id').primaryKey(),
    sourceWorkId: text('source_work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'cascade' }),
    targetWorkId: text('target_work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    check(
      'ck_research_work_relations_kind',
      enumSql('kind', ['related', 'extends', 'revises', 'cites']),
    ),
    check(
      'ck_research_work_relations_distinct',
      sql`${table.sourceWorkId} <> ${table.targetWorkId}`,
    ),
    unique('uq_research_work_relations').on(table.sourceWorkId, table.targetWorkId, table.kind),
    index('idx_research_work_relations_target').on(table.targetWorkId),
  ],
);

export const researchSourceRecords = sqliteTable(
  'research_source_records',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    sourceLocator: text('source_locator'),
    rawFormat: text('raw_format').notNull(),
    rawPayload: text('raw_payload').notNull(),
    parserVersion: text('parser_version').notNull(),
    observedAt: text('observed_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    index('idx_research_source_records_provider').on(table.provider, table.sourceLocator),
  ],
);

export const researchMetadataAssertions = sqliteTable(
  'research_metadata_assertions',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    fieldName: text('field_name').notNull(),
    valueJson: text('value_json').notNull(),
    normalizedValue: text('normalized_value'),
    sourceKind: text('source_kind').notNull(),
    sourceRecordId: text('source_record_id').references(() => researchSourceRecords.id, {
      onDelete: 'set null',
    }),
    observedAt: text('observed_at').notNull(),
    isUserConfirmed: integer('is_user_confirmed', { mode: 'boolean' }).notNull().default(false),
    isSelected: integer('is_selected', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_metadata_assertions_entity', enumSql('entity_type', ['work', 'edition'])),
    check('ck_research_metadata_assertions_source', enumSql('source_kind', METADATA_SOURCE_KINDS)),
    index('idx_research_metadata_assertions_entity').on(
      table.entityType,
      table.entityId,
      table.fieldName,
    ),
    uniqueIndex('uq_research_metadata_assertions_selected')
      .on(table.entityType, table.entityId, table.fieldName)
      .where(sql`${table.isSelected} = 1`),
    index('idx_research_metadata_assertions_source_record').on(table.sourceRecordId),
  ],
);

export const researchExternalSourceMaps = sqliteTable(
  'research_external_source_maps',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    lastFetchedAt: text('last_fetched_at'),
    cacheStatus: text('cache_status').notNull().default('fresh'),
    cacheExpiresAt: text('cache_expires_at'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_external_maps_entity', enumSql('entity_type', ['work', 'edition'])),
    check(
      'ck_research_external_maps_cache',
      enumSql('cache_status', ['fresh', 'not-found', 'transient-failure']),
    ),
    unique('uq_research_external_maps_provider_id').on(table.provider, table.externalId),
    index('idx_research_external_maps_entity').on(table.entityType, table.entityId),
  ],
);

export const researchMetadataCache = sqliteTable(
  'research_metadata_cache',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    lookupKey: text('lookup_key').notNull(),
    status: text('status').notNull(),
    valueJson: text('value_json'),
    sourceRecordId: text('source_record_id').references(() => researchSourceRecords.id, {
      onDelete: 'set null',
    }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check(
      'ck_research_metadata_cache_status',
      enumSql('status', ['success', 'not-found', 'transient-failure']),
    ),
    unique('uq_research_metadata_cache_lookup').on(table.provider, table.lookupKey),
    index('idx_research_metadata_cache_expiry').on(table.expiresAt),
  ],
);

export const researchImportSessions = sqliteTable(
  'research_import_sessions',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    status: text('status').notNull().default('draft'),
    itemCount: integer('item_count').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check('ck_research_import_sessions_status', enumSql('status', IMPORT_SESSION_STATUSES)),
    check('ck_research_import_sessions_count', sql`${table.itemCount} BETWEEN 0 AND 200`),
    unique('uq_research_import_sessions_request').on(table.requestId),
    index('idx_research_import_sessions_status').on(table.status, table.updatedAt),
  ],
);

export const researchImportItems = sqliteTable(
  'research_import_items',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => researchImportSessions.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    sourcePath: text('source_path').notNull(),
    storageMode: text('storage_mode').notNull(),
    stage: text('stage').notNull().default('selected'),
    assetId: text('asset_id').references(() => researchAssets.id, { onDelete: 'set null' }),
    workId: text('work_id').references(() => researchWorks.id, { onDelete: 'set null' }),
    editionId: text('edition_id').references(() => researchEditions.id, { onDelete: 'set null' }),
    tempPath: text('temp_path'),
    candidateJson: text('candidate_json'),
    decisionJson: text('decision_json'),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    retryable: integer('retryable', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_import_items_mode', enumSql('storage_mode', STORAGE_MODES)),
    check('ck_research_import_items_stage', enumSql('stage', IMPORT_ITEM_STAGES)),
    index('idx_research_import_items_session').on(table.sessionId),
    index('idx_research_import_items_stage').on(table.stage, table.updatedAt),
    index('idx_research_import_items_asset').on(table.assetId),
  ],
);

export const researchMergeRecords = sqliteTable(
  'research_merge_records',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    survivorId: text('survivor_id').notNull(),
    mergedId: text('merged_id').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    status: text('status').notNull().default('merged'),
    createdAt: text('created_at').notNull().default(now),
    revertedAt: text('reverted_at'),
  },
  (table) => [
    check('ck_research_merge_records_entity', enumSql('entity_type', ['work', 'tag'])),
    check('ck_research_merge_records_status', enumSql('status', ['merged', 'reverted'])),
    index('idx_research_merge_records_survivor').on(table.entityType, table.survivorId),
  ],
);

export const researchExportJobs = sqliteTable(
  'research_export_jobs',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default('draft'),
    optionsJson: text('options_json').notNull(),
    targetPath: text('target_path'),
    manifestJson: text('manifest_json'),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'ck_research_export_jobs_status',
      enumSql('status', ['draft', 'running', 'completed', 'cancelled', 'failed']),
    ),
    index('idx_research_export_jobs_status').on(table.status, table.updatedAt),
  ],
);

export const researchStorageConfig = sqliteTable('research_storage_config', {
  id: text('id').primaryKey(),
  activeRoot: text('active_root').notNull(),
  updatedAt: text('updated_at').notNull().default(now),
});

export const researchManagedRootMigrations = sqliteTable(
  'research_managed_root_migrations',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default('draft'),
    sourceRoot: text('source_root').notNull(),
    targetRoot: text('target_root').notNull(),
    totalObjects: integer('total_objects').notNull().default(0),
    copiedObjects: integer('copied_objects').notNull().default(0),
    totalBytes: integer('total_bytes').notNull().default(0),
    copiedBytes: integer('copied_bytes').notNull().default(0),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check(
      'ck_research_managed_root_migrations_status',
      enumSql('status', MANAGED_ROOT_MIGRATION_STATUSES),
    ),
    check(
      'ck_research_managed_root_migrations_progress',
      sql`${table.totalObjects} >= 0 AND ${table.copiedObjects} >= 0 AND ${table.totalBytes} >= 0 AND ${table.copiedBytes} >= 0`,
    ),
    index('idx_research_managed_root_migrations_status').on(table.status, table.updatedAt),
  ],
);

export const researchReadingContexts = sqliteTable(
  'research_reading_contexts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    description: text('description'),
    color: text('color'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    archivedAt: text('archived_at'),
  },
  (table) => [
    check('ck_research_reading_contexts_status', enumSql('status', READING_CONTEXT_STATUSES)),
    uniqueIndex('uq_research_reading_contexts_active_name')
      .on(table.normalizedName)
      .where(sql`${table.status} = 'active'`),
    index('idx_research_reading_contexts_status').on(table.status, table.updatedAt),
  ],
);

export const researchCollectionContexts = sqliteTable(
  'research_collection_contexts',
  {
    collectionId: text('collection_id')
      .primaryKey()
      .references(() => researchCollections.id, { onDelete: 'cascade' }),
    contextId: text('context_id')
      .notNull()
      .references(() => researchReadingContexts.id, { onDelete: 'restrict' }),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [index('idx_research_collection_contexts_context').on(table.contextId)],
);

export const researchAssetReaderState = sqliteTable(
  'research_asset_reader_state',
  {
    assetId: text('asset_id')
      .primaryKey()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull().default(1),
    pageOffsetRatio: real('page_offset_ratio').notNull().default(0),
    zoom: real('zoom').notNull().default(1),
    rotation: integer('rotation').notNull().default(0),
    layout: text('layout').notNull().default('continuous'),
    lastContextId: text('last_context_id').references(() => researchReadingContexts.id, {
      onDelete: 'set null',
    }),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_reader_state_page', sql`${table.pageNumber} >= 1`),
    check('ck_research_reader_state_offset', sql`${table.pageOffsetRatio} BETWEEN 0.0 AND 1.0`),
    check('ck_research_reader_state_zoom', sql`${table.zoom} BETWEEN 0.1 AND 8.0`),
    check('ck_research_reader_state_rotation', enumSql('rotation', READER_ROTATIONS.map(String))),
    check('ck_research_reader_state_layout', enumSql('layout', READER_LAYOUTS)),
    check('ck_research_reader_state_revision', sql`${table.revision} >= 1`),
    index('idx_research_reader_state_context').on(table.lastContextId),
  ],
);

export const researchAnnotations = sqliteTable(
  'research_annotations',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    editionId: text('edition_id').references(() => researchEditions.id, { onDelete: 'set null' }),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    kind: text('kind').notNull(),
    pageNumber: integer('page_number').notNull(),
    anchorJson: text('anchor_json').notNull(),
    body: text('body'),
    color: text('color'),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_annotations_kind', enumSql('kind', ANNOTATION_KINDS)),
    check('ck_research_annotations_status', enumSql('status', ANNOTATION_STATUSES)),
    check('ck_research_annotations_page', sql`${table.pageNumber} >= 1`),
    check('ck_research_annotations_revision', sql`${table.revision} >= 1`),
    index('idx_research_annotations_asset_page').on(table.assetId, table.pageNumber),
    index('idx_research_annotations_context').on(table.contextId, table.status, table.updatedAt),
  ],
);

export const researchAnnotationRevisions = sqliteTable(
  'research_annotation_revisions',
  {
    id: text('id').primaryKey(),
    annotationId: text('annotation_id')
      .notNull()
      .references(() => researchAnnotations.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    check('ck_research_annotation_revisions_revision', sql`${table.revision} >= 1`),
    unique('uq_research_annotation_revisions_number').on(table.annotationId, table.revision),
  ],
);

export const researchPageText = sqliteTable(
  'research_page_text',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    source: text('source').notNull(),
    contentHash: text('content_hash').notNull(),
    textContent: text('text_content').notNull(),
    positionJson: text('position_json'),
    generator: text('generator').notNull(),
    generatorVersion: text('generator_version').notNull(),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.pageNumber] }),
    check('ck_research_page_text_page', sql`${table.pageNumber} >= 1`),
    check('ck_research_page_text_source', enumSql('source', ['pdf', 'ocr'])),
    index('idx_research_page_text_generator').on(
      table.assetId,
      table.generator,
      table.generatorVersion,
    ),
  ],
);

export const researchTextIndexJobs = sqliteTable(
  'research_text_index_jobs',
  {
    assetId: text('asset_id')
      .primaryKey()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'),
    nextPage: integer('next_page').notNull().default(1),
    totalPages: integer('total_pages').notNull().default(0),
    assetHash: text('asset_hash').notNull(),
    parserVersion: text('parser_version').notNull(),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check('ck_research_text_index_jobs_status', enumSql('status', DERIVED_JOB_STATUSES)),
    check(
      'ck_research_text_index_jobs_progress',
      sql`${table.nextPage} >= 1 AND ${table.totalPages} >= 0`,
    ),
    index('idx_research_text_index_jobs_status').on(table.status, table.updatedAt),
  ],
);

export const researchOcrJobs = sqliteTable(
  'research_ocr_jobs',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    assetHash: text('asset_hash').notNull(),
    status: text('status').notNull().default('queued'),
    languagesJson: text('languages_json').notNull(),
    engine: text('engine').notNull(),
    engineVersion: text('engine_version').notNull(),
    languagePackVersion: text('language_pack_version').notNull(),
    nextPage: integer('next_page').notNull().default(1),
    totalPages: integer('total_pages').notNull().default(0),
    tempRoot: text('temp_root'),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check('ck_research_ocr_jobs_status', enumSql('status', DERIVED_JOB_STATUSES)),
    check(
      'ck_research_ocr_jobs_progress',
      sql`${table.nextPage} >= 1 AND ${table.totalPages} >= 0`,
    ),
    index('idx_research_ocr_jobs_asset_status').on(table.assetId, table.status, table.updatedAt),
  ],
);

export const researchOcrPageCache = sqliteTable(
  'research_ocr_page_cache',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'cascade' }),
    assetHash: text('asset_hash').notNull(),
    pageNumber: integer('page_number').notNull(),
    languagesKey: text('languages_key').notNull(),
    engine: text('engine').notNull(),
    engineVersion: text('engine_version').notNull(),
    languagePackVersion: text('language_pack_version').notNull(),
    textContent: text('text_content').notNull(),
    positionJson: text('position_json'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    primaryKey({
      columns: [
        table.assetId,
        table.assetHash,
        table.pageNumber,
        table.languagesKey,
        table.engine,
        table.engineVersion,
        table.languagePackVersion,
      ],
    }),
    check('ck_research_ocr_page_cache_page', sql`${table.pageNumber} >= 1`),
    index('idx_research_ocr_page_cache_lookup').on(
      table.assetId,
      table.assetHash,
      table.languagesKey,
      table.engine,
      table.engineVersion,
      table.languagePackVersion,
      table.pageNumber,
    ),
  ],
);

export const researchAnnotatedExportJobs = sqliteTable(
  'research_annotated_export_jobs',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('queued'),
    optionsJson: text('options_json').notNull(),
    targetPath: text('target_path').notNull(),
    tempPath: text('temp_path'),
    completedAnnotations: integer('completed_annotations').notNull().default(0),
    totalAnnotations: integer('total_annotations').notNull().default(0),
    reportJson: text('report_json'),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    completedAt: text('completed_at'),
  },
  (table) => [
    check('ck_research_annotated_export_jobs_status', enumSql('status', DERIVED_JOB_STATUSES)),
    check(
      'ck_research_annotated_export_jobs_progress',
      sql`${table.completedAnnotations} >= 0 AND ${table.totalAnnotations} >= 0`,
    ),
    index('idx_research_annotated_export_jobs_asset').on(
      table.assetId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const researchNotes = sqliteTable(
  'research_notes',
  {
    id: text('id').primaryKey(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_notes_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_notes_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_notes_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_notes_context_status').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const researchEvidence = sqliteTable(
  'research_evidence',
  {
    id: text('id').primaryKey(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    workId: text('work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'restrict' }),
    editionId: text('edition_id').references(() => researchEditions.id, {
      onDelete: 'restrict',
    }),
    assetId: text('asset_id')
      .notNull()
      .references(() => researchAssets.id, { onDelete: 'restrict' }),
    annotationId: text('annotation_id')
      .notNull()
      .references(() => researchAnnotations.id, { onDelete: 'restrict' }),
    sourceSnapshotJson: text('source_snapshot_json').notNull(),
    sourceKind: text('source_kind').notNull(),
    title: text('title'),
    summary: text('summary').notNull().default(''),
    notes: text('notes'),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_evidence_source_kind', enumSql('source_kind', EVIDENCE_SOURCE_KINDS)),
    check('ck_research_evidence_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_evidence_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_evidence_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_evidence_context_status').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('idx_research_evidence_work_status').on(
      table.workId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('idx_research_evidence_status_updated').on(table.status, table.updatedAt, table.id),
    index('idx_research_evidence_annotation').on(table.annotationId, table.status),
    index('idx_research_evidence_asset').on(table.assetId, table.status),
  ],
);

export const researchClaims = sqliteTable(
  'research_claims',
  {
    id: text('id').primaryKey(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    statement: text('statement').notNull(),
    rationale: text('rationale'),
    status: text('status').notNull().default('draft'),
    statusBeforeDelete: text('status_before_delete'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_claims_statement', sql`length(trim(${table.statement})) > 0`),
    check('ck_research_claims_status', enumSql('status', CLAIM_STATUSES)),
    check(
      'ck_research_claims_previous_status',
      sql`${table.statusBeforeDelete} IS NULL OR ${enumSql('status_before_delete', ['draft', 'active', 'archived'])}`,
    ),
    check(
      'ck_research_claims_delete_state',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL) AND (${table.status} = 'deleted') = (${table.statusBeforeDelete} IS NOT NULL)`,
    ),
    check(
      'ck_research_claims_archive_state',
      sql`(${table.status} = 'archived' OR (${table.status} = 'deleted' AND ${table.statusBeforeDelete} = 'archived')) = (${table.archivedAt} IS NOT NULL)`,
    ),
    check('ck_research_claims_revision', sql`${table.revision} >= 1`),
    index('idx_research_claims_context_status').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const researchClaimEvidence = sqliteTable(
  'research_claim_evidence',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id')
      .notNull()
      .references(() => researchClaims.id, { onDelete: 'restrict' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => researchEvidence.id, { onDelete: 'restrict' }),
    relation: text('relation').notNull(),
    note: text('note'),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_claim_evidence_relation', enumSql('relation', CLAIM_EVIDENCE_RELATIONS)),
    check('ck_research_claim_evidence_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_claim_evidence_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_claim_evidence_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_claim_evidence_claim').on(
      table.claimId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('idx_research_claim_evidence_evidence').on(
      table.evidenceId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex('uq_research_claim_evidence_active')
      .on(table.claimId, table.evidenceId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const researchNoteLinks = sqliteTable(
  'research_note_links',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => researchNotes.id, { onDelete: 'restrict' }),
    workId: text('work_id').references(() => researchWorks.id, { onDelete: 'restrict' }),
    annotationId: text('annotation_id').references(() => researchAnnotations.id, {
      onDelete: 'restrict',
    }),
    evidenceId: text('evidence_id').references(() => researchEvidence.id, {
      onDelete: 'restrict',
    }),
    claimId: text('claim_id').references(() => researchClaims.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check(
      'ck_research_note_links_target',
      sql`(${table.workId} IS NOT NULL) + (${table.annotationId} IS NOT NULL) + (${table.evidenceId} IS NOT NULL) + (${table.claimId} IS NOT NULL) = 1`,
    ),
    check('ck_research_note_links_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_note_links_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_note_links_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_note_links_note').on(table.noteId, table.status, table.updatedAt, table.id),
    uniqueIndex('uq_research_note_links_active_work')
      .on(table.noteId, table.workId)
      .where(sql`${table.status} = 'active' AND ${table.workId} IS NOT NULL`),
    uniqueIndex('uq_research_note_links_active_annotation')
      .on(table.noteId, table.annotationId)
      .where(sql`${table.status} = 'active' AND ${table.annotationId} IS NOT NULL`),
    uniqueIndex('uq_research_note_links_active_evidence')
      .on(table.noteId, table.evidenceId)
      .where(sql`${table.status} = 'active' AND ${table.evidenceId} IS NOT NULL`),
    uniqueIndex('uq_research_note_links_active_claim')
      .on(table.noteId, table.claimId)
      .where(sql`${table.status} = 'active' AND ${table.claimId} IS NOT NULL`),
  ],
);

export const researchMatrices = sqliteTable(
  'research_matrices',
  {
    id: text('id').primaryKey(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    statusBeforeDelete: text('status_before_delete'),
    structureRevision: integer('structure_revision').notNull().default(1),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_matrices_title', sql`length(trim(${table.title})) > 0`),
    check('ck_research_matrices_status', enumSql('status', MATRIX_STATUSES)),
    check(
      'ck_research_matrices_previous_status',
      sql`${table.statusBeforeDelete} IS NULL OR ${enumSql('status_before_delete', ['active', 'archived'])}`,
    ),
    check(
      'ck_research_matrices_delete_state',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL) AND (${table.status} = 'deleted') = (${table.statusBeforeDelete} IS NOT NULL)`,
    ),
    check(
      'ck_research_matrices_archive_state',
      sql`(${table.status} = 'archived' OR (${table.status} = 'deleted' AND ${table.statusBeforeDelete} = 'archived')) = (${table.archivedAt} IS NOT NULL)`,
    ),
    check('ck_research_matrices_structure_revision', sql`${table.structureRevision} >= 1`),
    check('ck_research_matrices_revision', sql`${table.revision} >= 1`),
    index('idx_research_matrices_context_status').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const researchMatrixColumns = sqliteTable(
  'research_matrix_columns',
  {
    id: text('id').primaryKey(),
    matrixId: text('matrix_id')
      .notNull()
      .references(() => researchMatrices.id, { onDelete: 'restrict' }),
    workId: text('work_id')
      .notNull()
      .references(() => researchWorks.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_matrix_columns_position', sql`${table.position} >= 0`),
    check('ck_research_matrix_columns_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_matrix_columns_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_matrix_columns_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_matrix_columns_order').on(
      table.matrixId,
      table.status,
      table.position,
      table.id,
    ),
    uniqueIndex('uq_research_matrix_columns_active_work')
      .on(table.matrixId, table.workId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const researchMatrixRows = sqliteTable(
  'research_matrix_rows',
  {
    id: text('id').primaryKey(),
    matrixId: text('matrix_id')
      .notNull()
      .references(() => researchMatrices.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    claimId: text('claim_id').references(() => researchClaims.id, { onDelete: 'restrict' }),
    title: text('title'),
    question: text('question'),
    position: integer('position').notNull(),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_matrix_rows_kind', enumSql('kind', MATRIX_ROW_KINDS)),
    check(
      'ck_research_matrix_rows_target',
      sql`(${table.kind} = 'claim' AND ${table.claimId} IS NOT NULL AND ${table.title} IS NULL AND ${table.question} IS NULL) OR (${table.kind} = 'dimension' AND ${table.claimId} IS NULL AND ((${table.title} IS NOT NULL AND length(trim(${table.title})) > 0) OR (${table.question} IS NOT NULL AND length(trim(${table.question})) > 0)))`,
    ),
    check('ck_research_matrix_rows_position', sql`${table.position} >= 0`),
    check('ck_research_matrix_rows_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_matrix_rows_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_matrix_rows_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_matrix_rows_order').on(
      table.matrixId,
      table.status,
      table.position,
      table.id,
    ),
    uniqueIndex('uq_research_matrix_rows_active_claim')
      .on(table.matrixId, table.claimId)
      .where(sql`${table.status} = 'active' AND ${table.claimId} IS NOT NULL`),
  ],
);

export const researchMatrixCells = sqliteTable(
  'research_matrix_cells',
  {
    id: text('id').primaryKey(),
    matrixId: text('matrix_id')
      .notNull()
      .references(() => researchMatrices.id, { onDelete: 'restrict' }),
    rowId: text('row_id')
      .notNull()
      .references(() => researchMatrixRows.id, { onDelete: 'restrict' }),
    columnId: text('column_id')
      .notNull()
      .references(() => researchMatrixColumns.id, { onDelete: 'restrict' }),
    synthesis: text('synthesis').notNull().default(''),
    reviewBaselineJson: text('review_baseline_json'),
    reviewedAt: text('reviewed_at'),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_matrix_cells_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_matrix_cells_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_matrix_cells_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_matrix_cells_matrix').on(
      table.matrixId,
      table.status,
      table.rowId,
      table.columnId,
    ),
    uniqueIndex('uq_research_matrix_cells_active')
      .on(table.rowId, table.columnId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const researchMatrixCellEvidence = sqliteTable(
  'research_matrix_cell_evidence',
  {
    id: text('id').primaryKey(),
    cellId: text('cell_id')
      .notNull()
      .references(() => researchMatrixCells.id, { onDelete: 'restrict' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => researchEvidence.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_matrix_cell_evidence_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_matrix_cell_evidence_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_matrix_cell_evidence_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_matrix_cell_evidence_cell').on(
      table.cellId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex('uq_research_matrix_cell_evidence_active')
      .on(table.cellId, table.evidenceId)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const researchWritingDocuments = sqliteTable(
  'research_writing_documents',
  {
    id: text('id').primaryKey(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    title: text('title').notNull(),
    status: text('status').notNull().default('active'),
    statusBeforeDelete: text('status_before_delete'),
    structureRevision: integer('structure_revision').notNull().default(1),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_writing_documents_title', sql`length(trim(${table.title})) > 0`),
    check('ck_research_writing_documents_status', enumSql('status', WRITING_DOCUMENT_STATUSES)),
    check(
      'ck_research_writing_documents_previous_status',
      sql`${table.statusBeforeDelete} IS NULL OR ${enumSql('status_before_delete', ['active', 'archived'])}`,
    ),
    check(
      'ck_research_writing_documents_delete_state',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL) AND (${table.status} = 'deleted') = (${table.statusBeforeDelete} IS NOT NULL)`,
    ),
    check(
      'ck_research_writing_documents_archive_state',
      sql`(${table.status} = 'archived' OR (${table.status} = 'deleted' AND ${table.statusBeforeDelete} = 'archived')) = (${table.archivedAt} IS NOT NULL)`,
    ),
    check('ck_research_writing_documents_structure_revision', sql`${table.structureRevision} >= 1`),
    check('ck_research_writing_documents_revision', sql`${table.revision} >= 1`),
    index('idx_research_writing_documents_context_status').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const researchWritingSections = sqliteTable(
  'research_writing_sections',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => researchWritingDocuments.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_writing_sections_title', sql`length(trim(${table.title})) > 0`),
    check('ck_research_writing_sections_position', sql`${table.position} >= 0`),
    check('ck_research_writing_sections_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_writing_sections_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_writing_sections_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_writing_sections_order').on(
      table.documentId,
      table.status,
      table.position,
      table.id,
    ),
  ],
);

export const researchWritingBlocks = sqliteTable(
  'research_writing_blocks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => researchWritingDocuments.id, { onDelete: 'restrict' }),
    sectionId: text('section_id')
      .notNull()
      .references(() => researchWritingSections.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    textContent: text('text_content'),
    noteId: text('note_id').references(() => researchNotes.id, { onDelete: 'restrict' }),
    evidenceId: text('evidence_id').references(() => researchEvidence.id, {
      onDelete: 'restrict',
    }),
    claimId: text('claim_id').references(() => researchClaims.id, { onDelete: 'restrict' }),
    matrixId: text('matrix_id').references(() => researchMatrices.id, {
      onDelete: 'restrict',
    }),
    targetLabel: text('target_label'),
    position: integer('position').notNull(),
    status: text('status').notNull().default('active'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    check('ck_research_writing_blocks_kind', enumSql('kind', WRITING_BLOCK_KINDS)),
    check(
      'ck_research_writing_blocks_content',
      sql`(${table.kind} = 'text' AND ${table.textContent} IS NOT NULL AND ${table.noteId} IS NULL AND ${table.evidenceId} IS NULL AND ${table.claimId} IS NULL AND ${table.matrixId} IS NULL AND ${table.targetLabel} IS NULL) OR (${table.kind} = 'note' AND ${table.textContent} IS NULL AND ${table.noteId} IS NOT NULL AND ${table.evidenceId} IS NULL AND ${table.claimId} IS NULL AND ${table.matrixId} IS NULL AND ${table.targetLabel} IS NOT NULL AND length(trim(${table.targetLabel})) > 0) OR (${table.kind} = 'evidence' AND ${table.textContent} IS NULL AND ${table.noteId} IS NULL AND ${table.evidenceId} IS NOT NULL AND ${table.claimId} IS NULL AND ${table.matrixId} IS NULL AND ${table.targetLabel} IS NOT NULL AND length(trim(${table.targetLabel})) > 0) OR (${table.kind} = 'claim' AND ${table.textContent} IS NULL AND ${table.noteId} IS NULL AND ${table.evidenceId} IS NULL AND ${table.claimId} IS NOT NULL AND ${table.matrixId} IS NULL AND ${table.targetLabel} IS NOT NULL AND length(trim(${table.targetLabel})) > 0) OR (${table.kind} = 'matrix' AND ${table.textContent} IS NULL AND ${table.noteId} IS NULL AND ${table.evidenceId} IS NULL AND ${table.claimId} IS NULL AND ${table.matrixId} IS NOT NULL AND ${table.targetLabel} IS NOT NULL AND length(trim(${table.targetLabel})) > 0)`,
    ),
    check('ck_research_writing_blocks_position', sql`${table.position} >= 0`),
    check('ck_research_writing_blocks_status', enumSql('status', KNOWLEDGE_BASIC_STATUSES)),
    check('ck_research_writing_blocks_revision', sql`${table.revision} >= 1`),
    check(
      'ck_research_writing_blocks_deleted_at',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} IS NOT NULL)`,
    ),
    index('idx_research_writing_blocks_order').on(
      table.sectionId,
      table.status,
      table.position,
      table.id,
    ),
    index('idx_research_writing_blocks_document').on(
      table.documentId,
      table.status,
      table.sectionId,
      table.position,
      table.id,
    ),
    index('idx_research_writing_blocks_note').on(table.noteId, table.status),
    index('idx_research_writing_blocks_evidence').on(table.evidenceId, table.status),
    index('idx_research_writing_blocks_claim').on(table.claimId, table.status),
    index('idx_research_writing_blocks_matrix').on(table.matrixId, table.status),
  ],
);

export const researchKnowledgeRevisions = sqliteTable(
  'research_knowledge_revisions',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    revision: integer('revision').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    reason: text('reason').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [
    check(
      'ck_research_knowledge_revisions_entity_type',
      enumSql('entity_type', KNOWLEDGE_ENTITY_TYPES),
    ),
    check('ck_research_knowledge_revisions_reason', enumSql('reason', KNOWLEDGE_REVISION_REASONS)),
    check('ck_research_knowledge_revisions_revision', sql`${table.revision} >= 1`),
    uniqueIndex('uq_research_knowledge_revisions_number').on(
      table.entityType,
      table.entityId,
      table.revision,
    ),
    index('idx_research_knowledge_revisions_entity').on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export const researchKnowledgeSearch = sqliteTable(
  'research_knowledge_search',
  {
    rowid: integer('rowid').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    contextId: text('context_id').references(() => researchReadingContexts.id, {
      onDelete: 'restrict',
    }),
    workId: text('work_id').references(() => researchWorks.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(),
    sourceState: text('source_state'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check(
      'ck_research_knowledge_search_entity_type',
      enumSql('entity_type', ['note', 'evidence', 'claim', 'writing-document']),
    ),
    check(
      'ck_research_knowledge_search_status',
      enumSql('status', ['active', 'archived', 'deleted', 'draft']),
    ),
    check(
      'ck_research_knowledge_search_source_state',
      sql`${table.sourceState} IS NULL OR ${enumSql('source_state', EVIDENCE_SOURCE_STATES)}`,
    ),
    unique('uq_research_knowledge_search_entity').on(table.entityType, table.entityId),
    index('idx_research_knowledge_search_context').on(
      table.contextId,
      table.status,
      table.updatedAt,
      table.entityId,
    ),
    index('idx_research_knowledge_search_work').on(
      table.workId,
      table.status,
      table.updatedAt,
      table.entityId,
    ),
  ],
);
