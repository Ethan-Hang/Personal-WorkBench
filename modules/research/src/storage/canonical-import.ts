import type Database from 'better-sqlite3';
import {
  canonicalResearchLibrarySchema,
  normalizeCanonicalResearchLibrary,
  type CanonicalResearchLibrary,
  type CanonicalResearchLibraryV3,
} from '../interop/canonical.js';

type RecordValue = string | number | null;

interface TableSpec<T> {
  table: string;
  columns: string[];
  rows: readonly T[];
  values: (row: T) => RecordValue[];
}

interface ErasedTableSpec {
  table: string;
  columns: string[];
  rows: readonly unknown[];
  values: (row: unknown) => RecordValue[];
}

function tableSpecs<const Rows extends readonly unknown[]>(
  ...specs: { [Index in keyof Rows]: TableSpec<Rows[Index]> }
): ErasedTableSpec[] {
  return specs.map((spec) => ({
    table: spec.table,
    columns: spec.columns,
    rows: spec.rows,
    values: (row) => spec.values(row as never),
  }));
}

const json = (value: unknown): string => JSON.stringify(value);
const boolean = (value: boolean): number => (value ? 1 : 0);

export function canonicalRecordCount(canonical: CanonicalResearchLibrary): number {
  const base =
    canonical.works.length +
    canonical.editions.length +
    canonical.contributors.length +
    canonical.identifiers.length +
    canonical.collections.length +
    canonical.collectionEntries.length +
    canonical.tags.length +
    canonical.tagAliases.length +
    canonical.workTags.length +
    canonical.workRelations.length +
    canonical.sourceRecords.length +
    canonical.metadataAssertions.length +
    canonical.externalSourceMaps.length +
    canonical.assets.length +
    canonical.locations.length +
    canonical.attachments.length;
  if (canonical.schemaVersion === 1) return base;
  const current =
    base +
    Object.values(canonical.reader).reduce((total, rows) => total + rows.length, 0) +
    Object.values(canonical.knowledge).reduce((total, rows) => total + rows.length, 0);
  if (canonical.schemaVersion === 2) return current;
  return current + Object.values(canonical.interop).reduce((total, rows) => total + rows.length, 0);
}

export const canonicalDestinationTables = [
  'research_works',
  'research_editions',
  'research_contributors',
  'research_identifiers',
  'research_collections',
  'research_collection_entries',
  'research_tags',
  'research_tag_aliases',
  'research_work_tags',
  'research_work_relations',
  'research_source_records',
  'research_metadata_assertions',
  'research_external_source_maps',
  'research_assets',
  'research_asset_locations',
  'research_attachments',
  'research_reading_contexts',
  'research_collection_contexts',
  'research_asset_reader_state',
  'research_annotations',
  'research_annotation_revisions',
  'research_notes',
  'research_evidence',
  'research_note_links',
  'research_claims',
  'research_claim_evidence',
  'research_matrices',
  'research_matrix_columns',
  'research_matrix_rows',
  'research_matrix_cells',
  'research_matrix_cell_evidence',
  'research_writing_documents',
  'research_writing_sections',
  'research_writing_blocks',
  'research_knowledge_revisions',
  'research_interop_sources',
  'research_interop_records',
  'research_interop_record_entities',
  'research_citation_key_preferences',
] as const;

export function canonicalTargetIsEmpty(sqlite: Database.Database): boolean {
  return canonicalDestinationTables.every((table) => {
    const row = sqlite.prepare(`SELECT 1 AS found FROM ${table} LIMIT 1`).get() as
      { found: number } | undefined;
    return row === undefined;
  });
}

export function canonicalConflictIds(
  sqlite: Database.Database,
  input: unknown,
  limit = 100,
): string[] {
  const canonical = normalizeCanonicalResearchLibrary(input);
  const groups: Array<{ table: string; column: string; ids: string[] }> = [
    { table: 'research_works', column: 'id', ids: canonical.works.map((row) => row.id) },
    { table: 'research_editions', column: 'id', ids: canonical.editions.map((row) => row.id) },
    { table: 'research_assets', column: 'id', ids: canonical.assets.map((row) => row.id) },
    {
      table: 'research_annotations',
      column: 'id',
      ids: canonical.reader.annotations.map((row) => row.id),
    },
    {
      table: 'research_notes',
      column: 'id',
      ids: canonical.knowledge.notes.map((row) => row.id),
    },
    {
      table: 'research_evidence',
      column: 'id',
      ids: canonical.knowledge.evidence.map((row) => row.id),
    },
    {
      table: 'research_claims',
      column: 'id',
      ids: canonical.knowledge.claims.map((row) => row.id),
    },
    {
      table: 'research_matrices',
      column: 'id',
      ids: canonical.knowledge.matrices.map((row) => row.id),
    },
    {
      table: 'research_writing_documents',
      column: 'id',
      ids: canonical.knowledge.writingDocuments.map((row) => row.id),
    },
    {
      table: 'research_interop_sources',
      column: 'id',
      ids: canonical.interop.sources.map((row) => row.id),
    },
    {
      table: 'research_interop_records',
      column: 'id',
      ids: canonical.interop.records.map((row) => row.id),
    },
    {
      table: 'research_interop_record_entities',
      column: 'id',
      ids: canonical.interop.recordEntities.map((row) => row.id),
    },
    {
      table: 'research_citation_key_preferences',
      column: 'id',
      ids: canonical.interop.citationKeyPreferences.map((row) => row.id),
    },
  ];
  const conflicts: string[] = [];
  for (const group of groups) {
    const statement = sqlite.prepare(
      `SELECT 1 AS found FROM ${group.table} WHERE ${group.column} = ? LIMIT 1`,
    );
    for (const id of group.ids) {
      if (statement.get(id)) conflicts.push(id);
      if (conflicts.length >= limit) return conflicts;
    }
  }
  return conflicts;
}

function baseSpecs(canonical: CanonicalResearchLibraryV3): ErasedTableSpec[] {
  return tableSpecs(
    {
      table: 'research_works',
      columns: [
        'id',
        'type',
        'title',
        'title_sort',
        'abstract',
        'year',
        'preferred_edition_id',
        'status',
        'redirect_to_work_id',
        'revision',
        'created_at',
        'updated_at',
        'trashed_at',
      ],
      rows: canonical.works,
      values: (row) => [
        row.id,
        row.type,
        row.title,
        row.titleSort,
        row.abstract,
        row.year,
        null,
        row.status,
        null,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.trashedAt,
      ],
    },
    {
      table: 'research_editions',
      columns: [
        'id',
        'work_id',
        'kind',
        'title',
        'publication_title',
        'publisher',
        'published_date',
        'volume',
        'issue',
        'pages',
        'revision',
        'created_at',
        'updated_at',
      ],
      rows: canonical.editions,
      values: (row) => [
        row.id,
        row.workId,
        row.kind,
        row.title,
        row.publicationTitle,
        row.publisher,
        row.publishedDate,
        row.volume,
        row.issue,
        row.pages,
        row.revision,
        row.createdAt,
        row.updatedAt,
      ],
    },
    {
      table: 'research_contributors',
      columns: [
        'id',
        'edition_id',
        'role',
        'display_name',
        'given_name',
        'family_name',
        'orcid',
        'sequence',
      ],
      rows: canonical.contributors,
      values: (row) => [
        row.id,
        row.editionId,
        row.role,
        row.displayName,
        row.givenName,
        row.familyName,
        row.orcid,
        row.sequence,
      ],
    },
    {
      table: 'research_source_records',
      columns: [
        'id',
        'provider',
        'source_locator',
        'raw_format',
        'raw_payload',
        'parser_version',
        'observed_at',
        'created_at',
      ],
      rows: canonical.sourceRecords,
      values: (row) => [
        row.id,
        row.provider,
        row.sourceLocator,
        row.rawFormat,
        row.rawPayload,
        row.parserVersion,
        row.observedAt,
        row.createdAt,
      ],
    },
    {
      table: 'research_identifiers',
      columns: [
        'id',
        'entity_type',
        'entity_id',
        'scheme',
        'value',
        'normalized_value',
        'source_record_id',
        'created_at',
      ],
      rows: canonical.identifiers,
      values: (row) => [
        row.id,
        row.entityType,
        row.entityId,
        row.scheme,
        row.value,
        row.normalizedValue,
        row.sourceRecordId,
        row.createdAt,
      ],
    },
    {
      table: 'research_collections',
      columns: [
        'id',
        'parent_id',
        'name',
        'normalized_name',
        'kind',
        'query_json',
        'sort_order',
        'created_at',
        'updated_at',
        'trashed_at',
      ],
      rows: canonical.collections,
      values: (row) => [
        row.id,
        null,
        row.name,
        row.normalizedName,
        row.kind,
        row.queryAst === null ? null : json(row.queryAst),
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
        row.trashedAt,
      ],
    },
    {
      table: 'research_collection_entries',
      columns: ['id', 'collection_id', 'work_id', 'sort_order', 'created_at'],
      rows: canonical.collectionEntries,
      values: (row) => [row.id, row.collectionId, row.workId, row.sortOrder, row.createdAt],
    },
    {
      table: 'research_tags',
      columns: [
        'id',
        'name',
        'normalized_name',
        'color',
        'description',
        'created_at',
        'updated_at',
        'trashed_at',
      ],
      rows: canonical.tags,
      values: (row) => [
        row.id,
        row.name,
        row.normalizedName,
        row.color,
        row.description,
        row.createdAt,
        row.updatedAt,
        row.trashedAt,
      ],
    },
    {
      table: 'research_tag_aliases',
      columns: ['id', 'tag_id', 'name', 'normalized_name', 'created_at'],
      rows: canonical.tagAliases,
      values: (row) => [row.id, row.tagId, row.name, row.normalizedName, row.createdAt],
    },
    {
      table: 'research_work_tags',
      columns: ['id', 'work_id', 'tag_id', 'created_at'],
      rows: canonical.workTags,
      values: (row) => [row.id, row.workId, row.tagId, row.createdAt],
    },
    {
      table: 'research_work_relations',
      columns: ['id', 'source_work_id', 'target_work_id', 'kind', 'note', 'created_at'],
      rows: canonical.workRelations,
      values: (row) => [
        row.id,
        row.sourceWorkId,
        row.targetWorkId,
        row.kind,
        row.note,
        row.createdAt,
      ],
    },
    {
      table: 'research_metadata_assertions',
      columns: [
        'id',
        'entity_type',
        'entity_id',
        'field_name',
        'value_json',
        'normalized_value',
        'source_kind',
        'source_record_id',
        'observed_at',
        'is_user_confirmed',
        'is_selected',
        'created_at',
      ],
      rows: canonical.metadataAssertions,
      values: (row) => [
        row.id,
        row.entityType,
        row.entityId,
        row.fieldName,
        json(row.value),
        row.normalizedValue,
        row.sourceKind,
        row.sourceRecordId,
        row.observedAt,
        boolean(row.isUserConfirmed),
        boolean(row.isSelected),
        row.createdAt,
      ],
    },
    {
      table: 'research_external_source_maps',
      columns: [
        'id',
        'provider',
        'external_id',
        'entity_type',
        'entity_id',
        'last_fetched_at',
        'cache_status',
        'cache_expires_at',
        'created_at',
        'updated_at',
      ],
      rows: canonical.externalSourceMaps,
      values: (row) => [
        row.id,
        row.provider,
        row.externalId,
        row.entityType,
        row.entityId,
        row.lastFetchedAt,
        row.cacheStatus,
        row.cacheExpiresAt,
        row.createdAt,
        row.updatedAt,
      ],
    },
    {
      table: 'research_assets',
      columns: [
        'id',
        'hash_algorithm',
        'content_hash',
        'byte_size',
        'mime_type',
        'state',
        'created_at',
        'updated_at',
        'recycled_at',
      ],
      rows: canonical.assets,
      values: (row) => [
        row.id,
        row.hashAlgorithm,
        row.contentHash,
        row.byteSize,
        row.mimeType,
        row.state,
        row.createdAt,
        row.updatedAt,
        row.recycledAt,
      ],
    },
    {
      table: 'research_asset_locations',
      columns: [
        'id',
        'asset_id',
        'mode',
        'original_path',
        'resolved_path',
        'object_key',
        'state',
        'device_id',
        'file_id',
        'observed_size',
        'observed_mtime_ms',
        'error_code',
        'last_checked_at',
        'created_at',
        'updated_at',
        'recycled_at',
      ],
      rows: canonical.locations,
      values: (row) => [
        row.id,
        row.assetId,
        row.mode,
        row.originalPath,
        row.resolvedPath,
        row.objectKey,
        row.state,
        row.deviceId,
        row.fileId,
        row.observedSize,
        row.observedMtimeMs,
        row.errorCode,
        row.lastCheckedAt,
        row.createdAt,
        row.updatedAt,
        row.recycledAt,
      ],
    },
    {
      table: 'research_attachments',
      columns: [
        'id',
        'edition_id',
        'asset_id',
        'role',
        'display_name',
        'status',
        'created_at',
        'recycled_at',
      ],
      rows: canonical.attachments,
      values: (row) => [
        row.id,
        row.editionId,
        row.assetId,
        row.role,
        row.displayName,
        row.status,
        row.createdAt,
        row.recycledAt,
      ],
    },
  );
}

function readerSpecs(canonical: CanonicalResearchLibraryV3): ErasedTableSpec[] {
  return tableSpecs(
    {
      table: 'research_reading_contexts',
      columns: [
        'id',
        'name',
        'normalized_name',
        'description',
        'color',
        'status',
        'created_at',
        'updated_at',
        'archived_at',
      ],
      rows: canonical.reader.contexts,
      values: (row) => [
        row.id,
        row.name,
        row.normalizedName,
        row.description,
        row.color,
        row.status,
        row.createdAt,
        row.updatedAt,
        row.archivedAt,
      ],
    },
    {
      table: 'research_collection_contexts',
      columns: ['collection_id', 'context_id', 'created_at', 'updated_at'],
      rows: canonical.reader.collectionContexts,
      values: (row) => [row.collectionId, row.contextId, row.createdAt, row.updatedAt],
    },
    {
      table: 'research_asset_reader_state',
      columns: [
        'asset_id',
        'page_number',
        'page_offset_ratio',
        'zoom',
        'rotation',
        'layout',
        'last_context_id',
        'revision',
        'created_at',
        'updated_at',
      ],
      rows: canonical.reader.states,
      values: (row) => [
        row.assetId,
        row.pageNumber,
        row.pageOffsetRatio,
        row.zoom,
        row.rotation,
        row.layout,
        row.lastContextId,
        row.revision,
        row.createdAt,
        row.updatedAt,
      ],
    },
    {
      table: 'research_annotations',
      columns: [
        'id',
        'asset_id',
        'edition_id',
        'context_id',
        'kind',
        'page_number',
        'anchor_json',
        'body',
        'color',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.reader.annotations,
      values: (row) => [
        row.id,
        row.assetId,
        row.editionId,
        row.contextId,
        row.kind,
        row.pageNumber,
        json(row.anchor),
        row.body,
        row.color,
        row.status,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_annotation_revisions',
      columns: ['id', 'annotation_id', 'revision', 'snapshot_json', 'reason', 'created_at'],
      rows: canonical.reader.annotationRevisions,
      values: (row) => [
        row.id,
        row.annotationId,
        row.revision,
        json(row.snapshot),
        row.reason,
        row.createdAt,
      ],
    },
  );
}

function knowledgeSpecs(canonical: CanonicalResearchLibraryV3): ErasedTableSpec[] {
  const structured = (row: {
    status: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }): RecordValue[] => [row.status, row.revision, row.createdAt, row.updatedAt, row.deletedAt];
  return tableSpecs(
    {
      table: 'research_notes',
      columns: [
        'id',
        'context_id',
        'title',
        'body',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.notes,
      values: (row) => [
        row.id,
        row.contextId,
        row.title,
        row.body,
        row.status,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_evidence',
      columns: [
        'id',
        'context_id',
        'work_id',
        'edition_id',
        'asset_id',
        'annotation_id',
        'source_snapshot_json',
        'source_kind',
        'title',
        'summary',
        'notes',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.evidence,
      values: (row) => [
        row.id,
        row.contextId,
        row.workId,
        row.editionId,
        row.assetId,
        row.annotationId,
        json(row.sourceSnapshot),
        row.sourceKind,
        row.title,
        row.summary,
        row.notes,
        row.status,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_claims',
      columns: [
        'id',
        'context_id',
        'statement',
        'rationale',
        'status',
        'status_before_delete',
        'revision',
        'created_at',
        'updated_at',
        'archived_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.claims,
      values: (row) => [
        row.id,
        row.contextId,
        row.statement,
        row.rationale,
        row.status,
        row.statusBeforeDelete,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.archivedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_note_links',
      columns: [
        'id',
        'note_id',
        'work_id',
        'annotation_id',
        'evidence_id',
        'claim_id',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.noteLinks,
      values: (row) => [
        row.id,
        row.noteId,
        row.workId,
        row.annotationId,
        row.evidenceId,
        row.claimId,
        ...structured(row),
      ],
    },
    {
      table: 'research_claim_evidence',
      columns: [
        'id',
        'claim_id',
        'evidence_id',
        'relation',
        'note',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.claimEvidence,
      values: (row) => [
        row.id,
        row.claimId,
        row.evidenceId,
        row.relation,
        row.note,
        ...structured(row),
      ],
    },
    {
      table: 'research_matrices',
      columns: [
        'id',
        'context_id',
        'title',
        'description',
        'status',
        'status_before_delete',
        'structure_revision',
        'revision',
        'created_at',
        'updated_at',
        'archived_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.matrices,
      values: (row) => [
        row.id,
        row.contextId,
        row.title,
        row.description,
        row.status,
        row.statusBeforeDelete,
        row.structureRevision,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.archivedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_matrix_columns',
      columns: [
        'id',
        'matrix_id',
        'work_id',
        'position',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.matrixColumns,
      values: (row) => [row.id, row.matrixId, row.workId, row.position, ...structured(row)],
    },
    {
      table: 'research_matrix_rows',
      columns: [
        'id',
        'matrix_id',
        'kind',
        'claim_id',
        'title',
        'question',
        'position',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.matrixRows,
      values: (row) => [
        row.id,
        row.matrixId,
        row.kind,
        row.claimId,
        row.title,
        row.question,
        row.position,
        ...structured(row),
      ],
    },
    {
      table: 'research_matrix_cells',
      columns: [
        'id',
        'matrix_id',
        'row_id',
        'column_id',
        'synthesis',
        'review_baseline_json',
        'reviewed_at',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.matrixCells,
      values: (row) => [
        row.id,
        row.matrixId,
        row.rowId,
        row.columnId,
        row.synthesis,
        row.reviewBaseline === null ? null : json(row.reviewBaseline),
        row.reviewedAt,
        ...structured(row),
      ],
    },
    {
      table: 'research_matrix_cell_evidence',
      columns: [
        'id',
        'cell_id',
        'evidence_id',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.matrixCellEvidence,
      values: (row) => [row.id, row.cellId, row.evidenceId, ...structured(row)],
    },
    {
      table: 'research_writing_documents',
      columns: [
        'id',
        'context_id',
        'title',
        'status',
        'status_before_delete',
        'structure_revision',
        'revision',
        'created_at',
        'updated_at',
        'archived_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.writingDocuments,
      values: (row) => [
        row.id,
        row.contextId,
        row.title,
        row.status,
        row.statusBeforeDelete,
        row.structureRevision,
        row.revision,
        row.createdAt,
        row.updatedAt,
        row.archivedAt,
        row.deletedAt,
      ],
    },
    {
      table: 'research_writing_sections',
      columns: [
        'id',
        'document_id',
        'title',
        'position',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.writingSections,
      values: (row) => [row.id, row.documentId, row.title, row.position, ...structured(row)],
    },
    {
      table: 'research_writing_blocks',
      columns: [
        'id',
        'document_id',
        'section_id',
        'kind',
        'text_content',
        'note_id',
        'evidence_id',
        'claim_id',
        'matrix_id',
        'work_id',
        'edition_id',
        'citation_intent_json',
        'target_label',
        'position',
        'status',
        'revision',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
      rows: canonical.knowledge.writingBlocks,
      values: (row) => [
        row.id,
        row.documentId,
        row.sectionId,
        row.kind,
        row.text,
        row.noteId,
        row.evidenceId,
        row.claimId,
        row.matrixId,
        row.workId,
        row.editionId,
        row.citation === null ? null : json(row.citation),
        row.targetLabel,
        row.position,
        ...structured(row),
      ],
    },
    {
      table: 'research_knowledge_revisions',
      columns: [
        'id',
        'entity_type',
        'entity_id',
        'revision',
        'snapshot_json',
        'reason',
        'created_at',
      ],
      rows: canonical.knowledge.revisions,
      values: (row) => [
        row.id,
        row.entityType,
        row.entityId,
        row.revision,
        json(row.snapshot),
        row.reason,
        row.createdAt,
      ],
    },
  );
}

const canonicalInteropJobId = (sourceId: string): string => `canonical-v3-job:${sourceId}`;

function interopSpecs(canonical: CanonicalResearchLibraryV3): ErasedTableSpec[] {
  return tableSpecs(
    {
      table: 'research_interop_sources',
      columns: [
        'id',
        'format',
        'display_name',
        'source_path',
        'content_hash',
        'byte_size',
        'encoding',
        'parser_name',
        'parser_version',
        'created_at',
      ],
      rows: canonical.interop.sources,
      values: (row) => [
        row.id,
        row.format,
        row.displayName,
        `canonical://restored/${row.id}`,
        row.contentHash,
        row.byteSize,
        row.encoding,
        row.parserName,
        row.parserVersion,
        row.createdAt,
      ],
    },
    {
      table: 'research_interop_records',
      columns: [
        'id',
        'source_id',
        'job_id',
        'ordinal',
        'source_key',
        'raw_hash',
        'raw_record',
        'summary',
        'format_shadow_json',
        'mapped_json',
        'diagnostics_json',
        'decision_json',
        'status',
        'revision',
        'committed_source_record_id',
        'committed_work_id',
        'committed_edition_id',
        'created_at',
        'updated_at',
      ],
      rows: canonical.interop.records,
      values: (row) => [
        row.id,
        row.sourceId,
        canonicalInteropJobId(row.sourceId),
        row.ordinal,
        row.sourceKey,
        row.rawHash,
        row.rawRecord,
        row.summary,
        json(row.formatShadow),
        row.mapped === null ? null : json(row.mapped),
        json(row.diagnostics),
        row.decision === null ? null : json(row.decision),
        row.status,
        row.revision,
        row.committedSourceRecordId,
        row.committedWorkId,
        row.committedEditionId,
        row.createdAt,
        row.updatedAt,
      ],
    },
    {
      table: 'research_interop_record_entities',
      columns: ['id', 'record_id', 'work_id', 'edition_id', 'action', 'is_current', 'created_at'],
      rows: canonical.interop.recordEntities,
      values: (row) => [
        row.id,
        row.recordId,
        row.workId,
        row.editionId,
        row.action,
        boolean(row.isCurrent),
        row.createdAt,
      ],
    },
    {
      table: 'research_citation_key_preferences',
      columns: [
        'id',
        'work_id',
        'edition_id',
        'preferred_key',
        'source',
        'revision',
        'created_at',
        'updated_at',
      ],
      rows: canonical.interop.citationKeyPreferences,
      values: (row) => [
        row.id,
        row.workId,
        row.editionId,
        row.preferredKey,
        row.source,
        row.revision,
        row.createdAt,
        row.updatedAt,
      ],
    },
  );
}

function insertCanonicalInteropJobs(
  sqlite: Database.Database,
  canonical: CanonicalResearchLibraryV3,
): void {
  const insert = sqlite.prepare(
    `INSERT INTO research_interop_import_jobs
     (id, source_id, request_id, status, total_count, processed_count, checkpoint_ordinal,
      error_code, error_detail, cancel_requested, revision, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, NULL, NULL, 0, 1, ?, ?, ?)`,
  );
  for (const source of canonical.interop.sources) {
    const records = canonical.interop.records.filter((record) => record.sourceId === source.id);
    const checkpoint = records.reduce(
      (maximum, record) => Math.max(maximum, record.ordinal + 1),
      0,
    );
    insert.run(
      canonicalInteropJobId(source.id),
      source.id,
      `canonical-v3:${source.id}`,
      records.length,
      records.length,
      checkpoint,
      source.createdAt,
      source.createdAt,
      source.createdAt,
    );
  }
}

function insertSpec(sqlite: Database.Database, spec: ErasedTableSpec): number {
  if (spec.rows.length === 0) return 0;
  const placeholders = spec.columns.map(() => '?').join(', ');
  const insert = sqlite.prepare(
    `INSERT INTO ${spec.table} (${spec.columns.join(', ')}) VALUES (${placeholders})`,
  );
  for (const row of spec.rows) insert.run(...spec.values(row));
  return spec.rows.length;
}

function rebuildKnowledgeSearch(sqlite: Database.Database): number {
  sqlite.prepare('DELETE FROM research_knowledge_search').run();
  const notes = sqlite
    .prepare(
      `INSERT INTO research_knowledge_search
       (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
       SELECT 'note', id, context_id, NULL, title, body, status, NULL, updated_at
       FROM research_notes`,
    )
    .run().changes;
  const evidence = sqlite
    .prepare(
      `INSERT INTO research_knowledge_search
       (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
       SELECT 'evidence', id, context_id, work_id,
              COALESCE(title, json_extract(source_snapshot_json, '$.workTitle')),
              summary || char(10) || COALESCE(notes, '') || char(10) ||
                COALESCE(json_extract(source_snapshot_json, '$.anchor.textQuote.exact'), ''),
              status, 'current', updated_at FROM research_evidence`,
    )
    .run().changes;
  const claims = sqlite
    .prepare(
      `INSERT INTO research_knowledge_search
       (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
       SELECT 'claim', id, context_id, NULL, statement, COALESCE(rationale, ''), status, NULL,
              updated_at FROM research_claims`,
    )
    .run().changes;
  const writing = sqlite
    .prepare(
      `INSERT INTO research_knowledge_search
       (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
       SELECT 'writing-document', document.id, document.context_id, NULL, document.title,
              COALESCE((SELECT group_concat(text_content, char(10))
                FROM research_writing_blocks block
                JOIN research_writing_sections section ON section.id = block.section_id
                WHERE block.document_id = document.id AND block.kind = 'text'
                  AND block.status = 'active' AND section.status = 'active'), ''),
              document.status, NULL, document.updated_at
       FROM research_writing_documents document`,
    )
    .run().changes;
  sqlite
    .prepare(
      `INSERT INTO research_knowledge_search_fts(research_knowledge_search_fts) VALUES ('rebuild')`,
    )
    .run();
  return notes + evidence + claims + writing;
}

export interface CanonicalDatabaseImportResult {
  recordCount: number;
  searchIndexed: number;
}

export function importCanonicalIntoEmptyDatabase(
  sqlite: Database.Database,
  input: unknown,
): CanonicalDatabaseImportResult {
  const parsed = canonicalResearchLibrarySchema.parse(input);
  const canonical = normalizeCanonicalResearchLibrary(parsed);
  if (!canonicalTargetIsEmpty(sqlite)) throw new Error('CANONICAL_IMPORT_TARGET_NOT_EMPTY');
  return sqlite.transaction(() => {
    let recordCount = 0;
    for (const spec of [
      ...baseSpecs(canonical),
      ...readerSpecs(canonical),
      ...knowledgeSpecs(canonical),
    ]) {
      recordCount += insertSpec(sqlite, spec);
    }
    const interop = interopSpecs(canonical);
    recordCount += insertSpec(sqlite, interop[0]!);
    insertCanonicalInteropJobs(sqlite, canonical);
    for (const spec of interop.slice(1)) recordCount += insertSpec(sqlite, spec);
    const updateWork = sqlite.prepare(
      `UPDATE research_works SET preferred_edition_id = ?, redirect_to_work_id = ? WHERE id = ?`,
    );
    for (const work of canonical.works) {
      updateWork.run(work.preferredEditionId, work.redirectToWorkId, work.id);
    }
    const updateCollection = sqlite.prepare(
      'UPDATE research_collections SET parent_id = ? WHERE id = ?',
    );
    for (const collection of canonical.collections) {
      updateCollection.run(collection.parentId, collection.id);
    }
    const searchIndexed = rebuildKnowledgeSearch(sqlite);
    const foreignKeys = sqlite.pragma('foreign_key_check') as unknown[];
    if (foreignKeys.length > 0) throw new Error('CANONICAL_IMPORT_FOREIGN_KEY_FAILED');
    return { recordCount, searchIndexed };
  })();
}
