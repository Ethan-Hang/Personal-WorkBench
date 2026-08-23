import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  ASSET_STATES,
  ATTACHMENT_ROLES,
  ATTACHMENT_STATUSES,
  EDITION_KINDS,
  IMPORT_ITEM_STAGES,
  IMPORT_SESSION_STATUSES,
  LOCATION_STATES,
  METADATA_SOURCE_KINDS,
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
