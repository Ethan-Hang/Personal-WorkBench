import type Database from 'better-sqlite3';
import { join, resolve } from 'node:path';
import type {
  AssetLocationDraft,
  AssetLocationRecord,
  AttachmentDraft,
  AttachmentDeletionImpact,
  AssetRecord,
  AttachmentRecord,
  CollectionDraft,
  CollectionDeletionImpact,
  CollectionMoveDraft,
  CollectionRecord,
  CommitImportDraft,
  CommitImportResult,
  ContributorRecord,
  DeletionImpact,
  EditionRecord,
  ExternalSourceMapRecord,
  ExportJobChanges,
  ExportJobDraft,
  ExportJobRecord,
  IdentifierMatch,
  IdentifierRecord,
  ImportItemChanges,
  ImportItemRecord,
  ImportSessionDraft,
  ImportSessionRecord,
  ListWorksQuery,
  MetadataAssertionDraft,
  MetadataAssertionRecord,
  MetadataCacheDraft,
  MetadataCacheRecord,
  ResearchRepository,
  SourceRecord,
  SourceRecordDraft,
  StoredAsset,
  AssetUsage,
  LocationAuditRecord,
  ManualWorkDraft,
  ManualWorkResult,
  ManagedRootController,
  ManagedRootMigrationJobChanges,
  ManagedRootMigrationJobDraft,
  ManagedRootMigrationJobRecord,
  MergeRecord,
  TagDraft,
  TagMergeDraft,
  TagRecord,
  TagSummaryRecord,
  TagUpdateDraft,
  WorkListRecord,
  WorkMetadataUpdateDraft,
  WorkMergeDraft,
  WorkPage,
  WorkRelationDraft,
  WorkRelationRecord,
  WorkRecord,
} from '../server/repository.js';
import type {
  AssetState,
  AttachmentRole,
  AttachmentStatus,
  EditionKind,
  ImportItemStage,
  ImportSessionStatus,
  IdentifierScheme,
  LocationState,
  MetadataSourceKind,
  StorageMode,
  WorkStatus,
  WorkType,
  WorkRelationKind,
} from '../contract.js';
import {
  canonicalResearchLibrarySchema,
  type CanonicalResearchLibrary,
} from '../interop/canonical.js';

type Row = Record<string, unknown>;

function defaultClock(): string {
  return new Date().toISOString();
}

function text(row: Row, key: string): string {
  return row[key] as string;
}

function nullableText(row: Row, key: string): string | null {
  return (row[key] as string | null | undefined) ?? null;
}

function integer(row: Row, key: string): number {
  return row[key] as number;
}

function nullableInteger(row: Row, key: string): number | null {
  return (row[key] as number | null | undefined) ?? null;
}

function toExportJob(row: Row): ExportJobRecord {
  return {
    id: text(row, 'id'),
    status: text(row, 'status') as ExportJobRecord['status'],
    optionsJson: text(row, 'options_json'),
    targetPath: nullableText(row, 'target_path'),
    manifestJson: nullableText(row, 'manifest_json'),
    errorCode: nullableText(row, 'error_code'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    completedAt: nullableText(row, 'completed_at'),
  };
}

function toManagedRootMigrationJob(row: Row): ManagedRootMigrationJobRecord {
  return {
    id: text(row, 'id'),
    status: text(row, 'status') as ManagedRootMigrationJobRecord['status'],
    sourceRoot: text(row, 'source_root'),
    targetRoot: text(row, 'target_root'),
    totalObjects: integer(row, 'total_objects'),
    copiedObjects: integer(row, 'copied_objects'),
    totalBytes: integer(row, 'total_bytes'),
    copiedBytes: integer(row, 'copied_bytes'),
    errorCode: nullableText(row, 'error_code'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    completedAt: nullableText(row, 'completed_at'),
  };
}

function toWork(row: Row): WorkRecord {
  return {
    id: text(row, 'id'),
    type: text(row, 'type') as WorkType,
    title: text(row, 'title'),
    titleSort: text(row, 'title_sort'),
    abstract: nullableText(row, 'abstract'),
    year: nullableInteger(row, 'year'),
    preferredEditionId: nullableText(row, 'preferred_edition_id'),
    status: text(row, 'status') as WorkStatus,
    redirectToWorkId: nullableText(row, 'redirect_to_work_id'),
    revision: integer(row, 'revision'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    trashedAt: nullableText(row, 'trashed_at'),
  };
}

function toEdition(row: Row): EditionRecord {
  return {
    id: text(row, 'id'),
    workId: text(row, 'work_id'),
    kind: text(row, 'kind') as EditionKind,
    title: text(row, 'title'),
    publicationTitle: nullableText(row, 'publication_title'),
    publisher: nullableText(row, 'publisher'),
    publishedDate: nullableText(row, 'published_date'),
    volume: nullableText(row, 'volume'),
    issue: nullableText(row, 'issue'),
    pages: nullableText(row, 'pages'),
    revision: integer(row, 'revision'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function toContributor(row: Row): ContributorRecord {
  return {
    id: text(row, 'id'),
    editionId: text(row, 'edition_id'),
    role: text(row, 'role'),
    displayName: text(row, 'display_name'),
    givenName: nullableText(row, 'given_name'),
    familyName: nullableText(row, 'family_name'),
    orcid: nullableText(row, 'orcid'),
    sequence: integer(row, 'sequence'),
  };
}

function toIdentifier(row: Row): IdentifierRecord {
  return {
    id: text(row, 'id'),
    entityType: text(row, 'entity_type') as IdentifierRecord['entityType'],
    entityId: text(row, 'entity_id'),
    scheme: text(row, 'scheme') as IdentifierScheme,
    value: text(row, 'value'),
    normalizedValue: text(row, 'normalized_value'),
    sourceRecordId: nullableText(row, 'source_record_id'),
    createdAt: text(row, 'created_at'),
  };
}

function toAsset(row: Row): AssetRecord {
  return {
    id: text(row, 'id'),
    hashAlgorithm: 'sha256',
    contentHash: text(row, 'content_hash'),
    byteSize: integer(row, 'byte_size'),
    mimeType: text(row, 'mime_type'),
    state: text(row, 'state') as AssetState,
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    recycledAt: nullableText(row, 'recycled_at'),
  };
}

function toLocation(row: Row): AssetLocationRecord {
  return {
    id: text(row, 'id'),
    assetId: text(row, 'asset_id'),
    mode: text(row, 'mode') as StorageMode,
    originalPath: text(row, 'original_path'),
    resolvedPath: text(row, 'resolved_path'),
    objectKey: nullableText(row, 'object_key'),
    state: text(row, 'state') as LocationState,
    deviceId: nullableText(row, 'device_id'),
    fileId: nullableText(row, 'file_id'),
    observedSize: nullableInteger(row, 'observed_size'),
    observedMtimeMs: nullableInteger(row, 'observed_mtime_ms'),
    errorCode: nullableText(row, 'error_code'),
    lastCheckedAt: nullableText(row, 'last_checked_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    recycledAt: nullableText(row, 'recycled_at'),
  };
}

function toAttachment(row: Row): AttachmentRecord {
  return {
    id: text(row, 'id'),
    editionId: text(row, 'edition_id'),
    assetId: text(row, 'asset_id'),
    role: text(row, 'role') as AttachmentRole,
    displayName: text(row, 'display_name'),
    status: text(row, 'status') as AttachmentStatus,
    createdAt: text(row, 'created_at'),
    recycledAt: nullableText(row, 'recycled_at'),
  };
}

function toCollection(row: Row): CollectionRecord {
  return {
    id: text(row, 'id'),
    parentId: nullableText(row, 'parent_id'),
    name: text(row, 'name'),
    normalizedName: text(row, 'normalized_name'),
    kind: text(row, 'kind') as CollectionRecord['kind'],
    queryJson: nullableText(row, 'query_json'),
    sortOrder: integer(row, 'sort_order'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    trashedAt: nullableText(row, 'trashed_at'),
  };
}

function toWorkRelation(row: Row): WorkRelationRecord {
  return {
    id: text(row, 'id'),
    sourceWorkId: text(row, 'source_work_id'),
    targetWorkId: text(row, 'target_work_id'),
    kind: text(row, 'kind') as WorkRelationKind,
    note: nullableText(row, 'note'),
    createdAt: text(row, 'created_at'),
  };
}

function toTag(row: Row): TagRecord {
  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    normalizedName: text(row, 'normalized_name'),
    color: nullableText(row, 'color'),
    description: nullableText(row, 'description'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
    trashedAt: nullableText(row, 'trashed_at'),
  };
}

function toMergeRecord(row: Row): MergeRecord {
  return {
    id: text(row, 'id'),
    entityType: text(row, 'entity_type') as MergeRecord['entityType'],
    survivorId: text(row, 'survivor_id'),
    mergedId: text(row, 'merged_id'),
    snapshotJson: text(row, 'snapshot_json'),
    status: text(row, 'status') as MergeRecord['status'],
    createdAt: text(row, 'created_at'),
    revertedAt: nullableText(row, 'reverted_at'),
  };
}

function toImportItem(row: Row): ImportItemRecord {
  return {
    id: text(row, 'id'),
    sessionId: text(row, 'session_id'),
    fileName: text(row, 'file_name'),
    sourcePath: text(row, 'source_path'),
    storageMode: text(row, 'storage_mode') as StorageMode,
    stage: text(row, 'stage') as ImportItemStage,
    assetId: nullableText(row, 'asset_id'),
    workId: nullableText(row, 'work_id'),
    editionId: nullableText(row, 'edition_id'),
    tempPath: nullableText(row, 'temp_path'),
    candidateJson: nullableText(row, 'candidate_json'),
    decisionJson: nullableText(row, 'decision_json'),
    errorCode: nullableText(row, 'error_code'),
    errorDetail: nullableText(row, 'error_detail'),
    retryable: integer(row, 'retryable') === 1,
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function toSource(row: Row): SourceRecord {
  return {
    id: text(row, 'id'),
    provider: text(row, 'provider'),
    sourceLocator: nullableText(row, 'source_locator'),
    rawFormat: text(row, 'raw_format'),
    rawPayload: text(row, 'raw_payload'),
    parserVersion: text(row, 'parser_version'),
    observedAt: text(row, 'observed_at'),
    createdAt: text(row, 'created_at'),
  };
}

function toExternalSourceMap(row: Row): ExternalSourceMapRecord {
  return {
    id: text(row, 'id'),
    provider: text(row, 'provider'),
    externalId: text(row, 'external_id'),
    entityType: text(row, 'entity_type') as ExternalSourceMapRecord['entityType'],
    entityId: text(row, 'entity_id'),
    lastFetchedAt: nullableText(row, 'last_fetched_at'),
    cacheStatus: text(row, 'cache_status') as ExternalSourceMapRecord['cacheStatus'],
    cacheExpiresAt: nullableText(row, 'cache_expires_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function toAssertion(row: Row): MetadataAssertionRecord {
  return {
    id: text(row, 'id'),
    entityType: text(row, 'entity_type') as MetadataAssertionRecord['entityType'],
    entityId: text(row, 'entity_id'),
    fieldName: text(row, 'field_name'),
    value: JSON.parse(text(row, 'value_json')) as unknown,
    normalizedValue: nullableText(row, 'normalized_value'),
    sourceKind: text(row, 'source_kind') as MetadataSourceKind,
    sourceRecordId: nullableText(row, 'source_record_id'),
    observedAt: text(row, 'observed_at'),
    isUserConfirmed: integer(row, 'is_user_confirmed') === 1,
    isSelected: integer(row, 'is_selected') === 1,
    createdAt: text(row, 'created_at'),
  };
}

function toMetadataCache(row: Row): MetadataCacheRecord {
  const rawValue = nullableText(row, 'value_json');
  return {
    id: text(row, 'id'),
    provider: text(row, 'provider'),
    lookupKey: text(row, 'lookup_key'),
    status: text(row, 'status') as MetadataCacheRecord['status'],
    value: rawValue === null ? null : (JSON.parse(rawValue) as unknown),
    sourceRecordId: nullableText(row, 'source_record_id'),
    expiresAt: text(row, 'expires_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

interface WorkCursor {
  updatedAt: string;
  id: string;
}

function encodeCursor(record: WorkRecord): string {
  return Buffer.from(`${record.updatedAt}\0${record.id}`).toString('base64url');
}

function decodeCursor(cursor: string): WorkCursor | null {
  try {
    const [updatedAt, id, extra] = Buffer.from(cursor, 'base64url').toString('utf8').split('\0');
    if (!updatedAt || !id || extra !== undefined) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function combineFileStatus(
  states: string | null,
  attachmentCount: number,
): WorkListRecord['fileStatus'] {
  if (attachmentCount === 0) return 'none';
  const distinct = new Set((states ?? '').split(',').filter(Boolean));
  if (distinct.size !== 1) return 'mixed';
  const [only] = distinct;
  if (only === 'available' || only === 'missing' || only === 'changed' || only === 'recycled') {
    return only;
  }
  return 'mixed';
}

function storageModes(value: string | null): StorageMode[] {
  return (value ?? '')
    .split(',')
    .filter((mode): mode is StorageMode => mode === 'managed' || mode === 'linked')
    .sort();
}

type SearchField = 'title' | 'abstract' | 'authors' | 'publication' | 'identifiers';

interface SearchDocument {
  title: string;
  abstract: string;
  authors: string;
  publication: string;
  identifiers: string;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function ftsPrefixQuery(value: string): string {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' AND ');
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const result = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

function textSimilarity(query: string, value: string): number {
  const normalized = normalizeSearchText(value);
  if (!normalized) return 0;
  if (normalized === query) return 1;
  if (normalized.includes(query)) return 0.96;
  const queryTokens = query.split(' ');
  const valueTokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (
    queryTokens.every((token) =>
      valueTokens.some((candidate) => candidate.startsWith(token) || token.startsWith(candidate)),
    )
  ) {
    return 0.88;
  }
  const left = trigrams(query);
  const right = trigrams(normalized);
  const overlap = [...left].filter((gram) => right.has(gram)).length;
  return (2 * overlap) / Math.max(1, left.size + right.size);
}

function scoreSearchDocument(
  query: string,
  document: SearchDocument,
): {
  score: number;
  matchedFields: SearchField[];
} {
  const weights: Record<SearchField, number> = {
    title: 1,
    abstract: 0.68,
    authors: 0.9,
    publication: 0.82,
    identifiers: 1,
  };
  const values = (Object.keys(weights) as SearchField[]).map((field) => ({
    field,
    raw: textSimilarity(query, document[field]),
  }));
  const matchedFields = values
    .filter((value) => value.raw >= 0.32)
    .sort((left, right) => right.raw - left.raw || left.field.localeCompare(right.field))
    .map((value) => value.field);
  const score = Math.max(...values.map((value) => value.raw * weights[value.field]), 0);
  return { score: Math.round(score * 1_000_000) / 1_000_000, matchedFields };
}

function encodeAdvancedCursor(sort: string, id: string): string {
  return Buffer.from(JSON.stringify({ version: 1, sort, id })).toString('base64url');
}

function decodeAdvancedCursor(cursor: string): { version: 1; sort: string; id: string } | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      version?: unknown;
      sort?: unknown;
      id?: unknown;
    };
    return value.version === 1 && typeof value.sort === 'string' && typeof value.id === 'string'
      ? { version: 1, sort: value.sort, id: value.id }
      : null;
  } catch {
    return null;
  }
}

/** SQLite 只存在于 storage 适配器内，连接在组合根按当前账号动态注入。 */
export class SqliteResearchRepository implements ResearchRepository {
  constructor(
    private readonly getSqlite: () => Database.Database,
    private readonly clock: () => string = defaultClock,
  ) {}

  private get sqlite(): Database.Database {
    return this.getSqlite();
  }

  private readTagSummary(id: string): TagSummaryRecord | null {
    const row = this.sqlite.prepare('SELECT * FROM research_tags WHERE id = ?').get(id) as
      Row | undefined;
    if (!row) return null;
    const aliases = this.sqlite
      .prepare('SELECT name FROM research_tag_aliases WHERE tag_id = ? ORDER BY name, id')
      .all(id) as Array<{ name: string }>;
    const usage = this.sqlite
      .prepare(
        `SELECT COUNT(*) AS usage_count, MAX(created_at) AS last_used_at
         FROM research_work_tags WHERE tag_id = ?`,
      )
      .get(id) as { usage_count: number; last_used_at: string | null };
    return {
      ...toTag(row),
      aliases: aliases.map((alias) => alias.name),
      usageCount: usage.usage_count,
      lastUsedAt: usage.last_used_at,
    };
  }

  private readImportSession(
    idColumn: 'id' | 'request_id',
    value: string,
  ): ImportSessionRecord | null {
    const row = this.sqlite
      .prepare(`SELECT * FROM research_import_sessions WHERE ${idColumn} = ?`)
      .get(value) as Row | undefined;
    if (!row) return null;
    const items = this.sqlite
      .prepare('SELECT * FROM research_import_items WHERE session_id = ? ORDER BY created_at, id')
      .all(text(row, 'id')) as Row[];
    return {
      id: text(row, 'id'),
      requestId: text(row, 'request_id'),
      status: text(row, 'status') as ImportSessionStatus,
      itemCount: integer(row, 'item_count'),
      createdAt: text(row, 'created_at'),
      updatedAt: text(row, 'updated_at'),
      completedAt: nullableText(row, 'completed_at'),
      items: items.map(toImportItem),
    };
  }

  async createImportSession(draft: ImportSessionDraft): Promise<ImportSessionRecord> {
    const existing = this.readImportSession('request_id', draft.requestId);
    if (existing) return existing;
    const timestamp = this.clock();
    const insert = this.sqlite.transaction(() => {
      this.sqlite
        .prepare(
          `INSERT INTO research_import_sessions
           (id, request_id, status, item_count, created_at, updated_at)
           VALUES (?, ?, 'draft', ?, ?, ?)`,
        )
        .run(draft.id, draft.requestId, draft.items.length, timestamp, timestamp);
      const statement = this.sqlite.prepare(
        `INSERT INTO research_import_items
         (id, session_id, file_name, source_path, storage_mode, stage, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'selected', ?, ?)`,
      );
      for (const item of draft.items) {
        statement.run(
          item.id,
          draft.id,
          item.fileName,
          item.sourcePath,
          item.storageMode,
          timestamp,
          timestamp,
        );
      }
    });
    try {
      insert();
    } catch (error) {
      const raced = this.readImportSession('request_id', draft.requestId);
      if (raced) return raced;
      throw error;
    }
    const created = this.readImportSession('id', draft.id);
    if (!created) throw new Error('导入会话写入后不可读');
    return created;
  }

  async getImportSession(id: string): Promise<ImportSessionRecord | null> {
    return this.readImportSession('id', id);
  }

  async getImportSessionByRequestId(requestId: string): Promise<ImportSessionRecord | null> {
    return this.readImportSession('request_id', requestId);
  }

  async listImportSessions(
    status: ImportSessionStatus | undefined,
    limit: number,
  ): Promise<ImportSessionRecord[]> {
    const rows = (
      status
        ? this.sqlite
            .prepare(
              `SELECT id FROM research_import_sessions
             WHERE status = ? ORDER BY updated_at DESC, id DESC LIMIT ?`,
            )
            .all(status, limit)
        : this.sqlite
            .prepare(
              `SELECT id FROM research_import_sessions
             ORDER BY updated_at DESC, id DESC LIMIT ?`,
            )
            .all(limit)
    ) as Array<{ id: string }>;
    return rows
      .map((row) => this.readImportSession('id', row.id))
      .filter((value): value is ImportSessionRecord => value !== null);
  }

  async updateImportItem(id: string, changes: ImportItemChanges): Promise<ImportItemRecord | null> {
    const columns: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      columns.push(`${column} = ?`);
      values.push(value);
    };
    if (changes.stage !== undefined) add('stage', changes.stage);
    if (changes.assetId !== undefined) add('asset_id', changes.assetId);
    if (changes.workId !== undefined) add('work_id', changes.workId);
    if (changes.editionId !== undefined) add('edition_id', changes.editionId);
    if (changes.tempPath !== undefined) add('temp_path', changes.tempPath);
    if (changes.candidateJson !== undefined) add('candidate_json', changes.candidateJson);
    if (changes.decisionJson !== undefined) add('decision_json', changes.decisionJson);
    if (changes.errorCode !== undefined) add('error_code', changes.errorCode);
    if (changes.errorDetail !== undefined) add('error_detail', changes.errorDetail);
    if (changes.retryable !== undefined) add('retryable', changes.retryable ? 1 : 0);
    add('updated_at', this.clock());
    const row = this.sqlite
      .prepare(`UPDATE research_import_items SET ${columns.join(', ')} WHERE id = ? RETURNING *`)
      .get(...values, id) as Row | undefined;
    return row ? toImportItem(row) : null;
  }

  async setImportSessionStatus(id: string, status: ImportSessionStatus): Promise<boolean> {
    const timestamp = this.clock();
    const result = this.sqlite
      .prepare(
        `UPDATE research_import_sessions
         SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
         WHERE id = ?`,
      )
      .run(status, timestamp, status, timestamp, id);
    return result.changes === 1;
  }

  async cancelImportSession(id: string): Promise<ImportSessionRecord | null> {
    this.sqlite.transaction(() => {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `UPDATE research_import_items
           SET stage = 'cancelled', retryable = 0, error_code = NULL, error_detail = NULL,
               updated_at = ?
           WHERE session_id = ? AND stage NOT IN ('available', 'cancelled')`,
        )
        .run(timestamp, id);
      this.sqlite
        .prepare(
          `UPDATE research_import_sessions
           SET status = 'cancelled', updated_at = ?, completed_at = COALESCE(completed_at, ?)
           WHERE id = ? AND status <> 'completed'`,
        )
        .run(timestamp, timestamp, id);
    })();
    return this.readImportSession('id', id);
  }

  async findAssetByHash(contentHash: string): Promise<AssetRecord | null> {
    const row = this.sqlite
      .prepare("SELECT * FROM research_assets WHERE hash_algorithm = 'sha256' AND content_hash = ?")
      .get(contentHash) as Row | undefined;
    return row ? toAsset(row) : null;
  }

  async getAsset(id: string): Promise<AssetRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_assets WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toAsset(row) : null;
  }

  async findAssetUsages(assetId: string): Promise<AssetUsage[]> {
    return this.sqlite
      .prepare(
        `SELECT e.work_id, a.edition_id, a.id AS attachment_id, a.role
         FROM research_attachments a
         JOIN research_editions e ON e.id = a.edition_id
         WHERE a.asset_id = ? AND a.status = 'active'
         ORDER BY e.work_id, a.edition_id, a.id`,
      )
      .all(assetId)
      .map((row) => {
        const value = row as Row;
        return {
          workId: text(value, 'work_id'),
          editionId: text(value, 'edition_id'),
          attachmentId: text(value, 'attachment_id'),
          role: text(value, 'role') as AttachmentRole,
        };
      });
  }

  async findIdentifierMatches(
    scheme: IdentifierScheme,
    normalizedValue: string,
  ): Promise<IdentifierMatch[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT i.*, e.id AS edition_id, e.work_id
         FROM research_identifiers i
         JOIN research_editions e ON i.entity_type = 'edition' AND e.id = i.entity_id
         WHERE i.scheme = ? AND i.normalized_value = ?
         UNION ALL
         SELECT i.*, e.id AS edition_id, e.work_id
         FROM research_identifiers i
         JOIN research_editions e ON i.entity_type = 'work' AND e.work_id = i.entity_id
         WHERE i.scheme = ? AND i.normalized_value = ?
         ORDER BY work_id, edition_id`,
      )
      .all(scheme, normalizedValue, scheme, normalizedValue) as Row[];
    return rows.map((row) => ({
      workId: text(row, 'work_id'),
      editionId: text(row, 'edition_id'),
      identifier: toIdentifier(row),
    }));
  }

  async storeAsset(
    draft: Parameters<ResearchRepository['storeAsset']>[0],
    location: AssetLocationDraft,
  ): Promise<StoredAsset> {
    return this.sqlite.transaction(() => {
      const timestamp = this.clock();
      let assetRow = this.sqlite
        .prepare(
          "SELECT * FROM research_assets WHERE hash_algorithm = 'sha256' AND content_hash = ?",
        )
        .get(draft.contentHash) as Row | undefined;
      const reusedAsset = assetRow !== undefined;
      if (!assetRow) {
        assetRow = this.sqlite
          .prepare(
            `INSERT INTO research_assets
             (id, hash_algorithm, content_hash, byte_size, mime_type, state, created_at, updated_at)
             VALUES (?, 'sha256', ?, ?, ?, 'active', ?, ?)
             RETURNING *`,
          )
          .get(
            draft.id,
            draft.contentHash,
            draft.byteSize,
            draft.mimeType,
            timestamp,
            timestamp,
          ) as Row;
      }
      const assetId = text(assetRow, 'id');
      const locationSelect =
        location.mode === 'managed'
          ? this.sqlite.prepare(
              "SELECT * FROM research_asset_locations WHERE asset_id = ? AND mode = 'managed'",
            )
          : this.sqlite.prepare(
              `SELECT * FROM research_asset_locations
               WHERE asset_id = ? AND mode = 'linked' AND original_path = ?`,
            );
      let locationRow =
        location.mode === 'managed'
          ? (locationSelect.get(assetId) as Row | undefined)
          : (locationSelect.get(assetId, location.originalPath) as Row | undefined);
      const reusedLocation = locationRow !== undefined;
      if (!locationRow) {
        locationRow = this.sqlite
          .prepare(
            `INSERT INTO research_asset_locations
             (id, asset_id, mode, original_path, resolved_path, object_key, state, device_id,
              file_id, observed_size, observed_mtime_ms, error_code, last_checked_at,
              created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING *`,
          )
          .get(
            location.id,
            assetId,
            location.mode,
            location.originalPath,
            location.resolvedPath,
            location.objectKey,
            location.state,
            location.deviceId ?? null,
            location.fileId ?? null,
            location.observedSize ?? null,
            location.observedMtimeMs ?? null,
            location.errorCode ?? null,
            location.lastCheckedAt ?? null,
            timestamp,
            timestamp,
          ) as Row;
      }
      return {
        asset: toAsset(assetRow),
        location: toLocation(locationRow),
        reusedAsset,
        reusedLocation,
      };
    })();
  }

  async getLocation(id: string): Promise<AssetLocationRecord | null> {
    const row = this.sqlite
      .prepare('SELECT * FROM research_asset_locations WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toLocation(row) : null;
  }

  async listLocationsForAsset(assetId: string): Promise<AssetLocationRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_asset_locations
         WHERE asset_id = ? ORDER BY mode, created_at, id`,
      )
      .all(assetId) as Row[];
    return rows.map(toLocation);
  }

  async listLocationsForAudit(): Promise<LocationAuditRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT l.*, a.hash_algorithm, a.content_hash, a.byte_size, a.mime_type,
                a.state AS asset_state, a.created_at AS asset_created_at,
                a.updated_at AS asset_updated_at, a.recycled_at AS asset_recycled_at
         FROM research_asset_locations l
         JOIN research_assets a ON a.id = l.asset_id
         WHERE l.state <> 'recycled' AND a.state = 'active'
         ORDER BY l.id`,
      )
      .all() as Row[];
    return rows.map((row) => ({
      asset: toAsset({
        id: row.asset_id,
        hash_algorithm: row.hash_algorithm,
        content_hash: row.content_hash,
        byte_size: row.byte_size,
        mime_type: row.mime_type,
        state: row.asset_state,
        created_at: row.asset_created_at,
        updated_at: row.asset_updated_at,
        recycled_at: row.asset_recycled_at,
      }),
      location: toLocation(row),
    }));
  }

  async updateLocationState(
    id: string,
    state: LocationState,
    checkedAt: string,
    errorCode: string | null,
  ): Promise<AssetLocationRecord | null> {
    const row = this.sqlite
      .prepare(
        `UPDATE research_asset_locations
         SET state = ?, error_code = ?, last_checked_at = ?, updated_at = ?
         WHERE id = ? RETURNING *`,
      )
      .get(state, errorCode, checkedAt, this.clock(), id) as Row | undefined;
    return row ? toLocation(row) : null;
  }

  async relinkLocation(
    id: string,
    originalPath: string,
    resolvedPath: string,
    identity: { deviceId: string; fileId: string; size: number; mtimeMs: number },
    checkedAt: string,
  ): Promise<AssetLocationRecord | null> {
    const row = this.sqlite
      .prepare(
        `UPDATE research_asset_locations
         SET original_path = ?, resolved_path = ?, state = 'available', device_id = ?, file_id = ?,
             observed_size = ?, observed_mtime_ms = ?, error_code = NULL, last_checked_at = ?,
             updated_at = ?
         WHERE id = ? AND mode = 'linked' RETURNING *`,
      )
      .get(
        originalPath,
        resolvedPath,
        identity.deviceId,
        identity.fileId,
        identity.size,
        identity.mtimeMs,
        checkedAt,
        this.clock(),
        id,
      ) as Row | undefined;
    return row ? toLocation(row) : null;
  }

  async recordSource(draft: SourceRecordDraft): Promise<SourceRecord> {
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_source_records
         (id, provider, source_locator, raw_format, raw_payload, parser_version, observed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        draft.id,
        draft.provider,
        draft.sourceLocator,
        draft.rawFormat,
        draft.rawPayload,
        draft.parserVersion,
        draft.observedAt,
        this.clock(),
      ) as Row;
    return toSource(row);
  }

  private writeAssertion(draft: MetadataAssertionDraft, select: boolean): MetadataAssertionRecord {
    if (select) {
      this.sqlite
        .prepare(
          `UPDATE research_metadata_assertions SET is_selected = 0
           WHERE entity_type = ? AND entity_id = ? AND field_name = ? AND is_selected = 1`,
        )
        .run(draft.entityType, draft.entityId, draft.fieldName);
    }
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_metadata_assertions
         (id, entity_type, entity_id, field_name, value_json, normalized_value, source_kind,
          source_record_id, observed_at, is_user_confirmed, is_selected, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           value_json = excluded.value_json,
           normalized_value = excluded.normalized_value,
           source_kind = excluded.source_kind,
           source_record_id = excluded.source_record_id,
           observed_at = excluded.observed_at,
           is_user_confirmed = excluded.is_user_confirmed,
           is_selected = excluded.is_selected
         RETURNING *`,
      )
      .get(
        draft.id,
        draft.entityType,
        draft.entityId,
        draft.fieldName,
        JSON.stringify(draft.value),
        draft.normalizedValue ?? null,
        draft.sourceKind,
        draft.sourceRecordId ?? null,
        draft.observedAt,
        draft.isUserConfirmed ? 1 : 0,
        select ? 1 : 0,
        this.clock(),
      ) as Row;
    return toAssertion(row);
  }

  async recordAssertion(
    draft: MetadataAssertionDraft,
    select: boolean,
  ): Promise<MetadataAssertionRecord> {
    return this.sqlite.transaction(() => this.writeAssertion(draft, select))();
  }

  async listAssertions(
    entityType: 'work' | 'edition',
    entityId: string,
  ): Promise<MetadataAssertionRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_metadata_assertions
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY field_name, is_selected DESC, observed_at DESC, id`,
      )
      .all(entityType, entityId) as Row[];
    return rows.map(toAssertion);
  }

  async listSourceRecords(ids: string[]): Promise<SourceRecord[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_source_records
         WHERE id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY observed_at DESC, id`,
      )
      .all(...uniqueIds) as Row[];
    return rows.map(toSource);
  }

  async listExternalSourceMaps(
    workId: string,
    editionIds: string[],
  ): Promise<ExternalSourceMapRecord[]> {
    const editionCondition =
      editionIds.length === 0
        ? '0'
        : `entity_type = 'edition' AND entity_id IN (${editionIds.map(() => '?').join(', ')})`;
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_external_source_maps
         WHERE (entity_type = 'work' AND entity_id = ?) OR (${editionCondition})
         ORDER BY provider, external_id, id`,
      )
      .all(workId, ...editionIds) as Row[];
    return rows.map(toExternalSourceMap);
  }

  async getMetadataCache(
    provider: string,
    lookupKey: string,
    at: string,
  ): Promise<MetadataCacheRecord | null> {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM research_metadata_cache
         WHERE provider = ? AND lookup_key = ? AND expires_at > ?`,
      )
      .get(provider, lookupKey, at) as Row | undefined;
    return row ? toMetadataCache(row) : null;
  }

  async putMetadataCache(draft: MetadataCacheDraft): Promise<MetadataCacheRecord> {
    const timestamp = this.clock();
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_metadata_cache
         (id, provider, lookup_key, status, value_json, source_record_id, expires_at,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, lookup_key) DO UPDATE SET
           status = excluded.status,
           value_json = excluded.value_json,
           source_record_id = excluded.source_record_id,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .get(
        draft.id,
        draft.provider,
        draft.lookupKey,
        draft.status,
        draft.value === null ? null : JSON.stringify(draft.value),
        draft.sourceRecordId ?? null,
        draft.expiresAt,
        timestamp,
        timestamp,
      ) as Row;
    return toMetadataCache(row);
  }

  async commitImport(draft: CommitImportDraft): Promise<CommitImportResult> {
    return this.sqlite.transaction(() => {
      const item = this.sqlite
        .prepare('SELECT * FROM research_import_items WHERE id = ?')
        .get(draft.importItemId) as Row | undefined;
      if (!item) throw new Error('IMPORT_ITEM_NOT_FOUND');

      if (
        text(item, 'stage') === 'available' &&
        nullableText(item, 'work_id') &&
        nullableText(item, 'edition_id') &&
        nullableText(item, 'asset_id')
      ) {
        const attachment = this.sqlite
          .prepare(
            `SELECT * FROM research_attachments
             WHERE edition_id = ? AND asset_id = ? AND role = ?`,
          )
          .get(
            nullableText(item, 'edition_id'),
            nullableText(item, 'asset_id'),
            draft.attachment.role,
          ) as Row | undefined;
        if (attachment) {
          return {
            workId: nullableText(item, 'work_id') as string,
            editionId: nullableText(item, 'edition_id') as string,
            attachmentId: text(attachment, 'id'),
            assetId: nullableText(item, 'asset_id') as string,
            reusedWork: true,
            reusedEdition: true,
            reusedAttachment: true,
          };
        }
      }

      const timestamp = this.clock();
      let workId: string;
      let reusedWork: boolean;
      if (draft.work.kind === 'existing') {
        const found = this.sqlite
          .prepare('SELECT id FROM research_works WHERE id = ?')
          .get(draft.work.id);
        if (!found) throw new Error('WORK_NOT_FOUND');
        workId = draft.work.id;
        reusedWork = true;
      } else {
        const value = draft.work.value;
        this.sqlite
          .prepare(
            `INSERT INTO research_works
             (id, type, title, title_sort, abstract, year, preferred_edition_id, status,
              revision, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
          )
          .run(
            value.id,
            value.type,
            value.title,
            value.titleSort,
            value.abstract ?? null,
            value.year ?? null,
            value.preferredEditionId ?? null,
            timestamp,
            timestamp,
          );
        workId = value.id;
        reusedWork = false;
      }

      let editionId: string;
      let reusedEdition: boolean;
      if (draft.edition.kind === 'existing') {
        const found = this.sqlite
          .prepare('SELECT work_id FROM research_editions WHERE id = ?')
          .get(draft.edition.id) as Row | undefined;
        if (!found) throw new Error('EDITION_NOT_FOUND');
        if (text(found, 'work_id') !== workId) throw new Error('EDITION_WORK_MISMATCH');
        editionId = draft.edition.id;
        reusedEdition = true;
      } else {
        const value = draft.edition.value;
        this.sqlite
          .prepare(
            `INSERT INTO research_editions
             (id, work_id, kind, title, publication_title, publisher, published_date,
              volume, issue, pages, revision, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .run(
            value.id,
            workId,
            value.kind,
            value.title,
            value.publicationTitle ?? null,
            value.publisher ?? null,
            value.publishedDate ?? null,
            value.volume ?? null,
            value.issue ?? null,
            value.pages ?? null,
            timestamp,
            timestamp,
          );
        editionId = value.id;
        reusedEdition = false;
        this.sqlite
          .prepare(
            `UPDATE research_works
             SET preferred_edition_id = COALESCE(preferred_edition_id, ?), updated_at = ?
             WHERE id = ?`,
          )
          .run(editionId, timestamp, workId);
      }

      const asset = this.sqlite
        .prepare('SELECT id FROM research_assets WHERE id = ?')
        .get(draft.attachment.assetId);
      if (!asset) throw new Error('ASSET_NOT_FOUND');

      let attachment = this.sqlite
        .prepare(
          `SELECT * FROM research_attachments
           WHERE edition_id = ? AND asset_id = ? AND role = ?`,
        )
        .get(editionId, draft.attachment.assetId, draft.attachment.role) as Row | undefined;
      const reusedAttachment = attachment !== undefined;
      if (!attachment) {
        attachment = this.sqlite
          .prepare(
            `INSERT INTO research_attachments
             (id, edition_id, asset_id, role, display_name, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?) RETURNING *`,
          )
          .get(
            draft.attachment.id,
            editionId,
            draft.attachment.assetId,
            draft.attachment.role,
            draft.attachment.displayName,
            timestamp,
          ) as Row;
      }

      const insertIdentifier = this.sqlite.prepare(
        `INSERT INTO research_identifiers
         (id, entity_type, entity_id, scheme, value, normalized_value, source_record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      );
      for (const identifier of draft.identifiers) {
        insertIdentifier.run(
          identifier.id,
          identifier.entityType,
          identifier.entityType === 'work' ? workId : editionId,
          identifier.scheme,
          identifier.value,
          identifier.normalizedValue,
          identifier.sourceRecordId ?? null,
          timestamp,
        );
      }

      const insertContributor = this.sqlite.prepare(
        `INSERT INTO research_contributors
         (id, edition_id, role, display_name, given_name, family_name, orcid, sequence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(edition_id, sequence) DO NOTHING`,
      );
      for (const contributor of draft.contributors) {
        insertContributor.run(
          contributor.id,
          editionId,
          contributor.role ?? 'author',
          contributor.displayName,
          contributor.givenName ?? null,
          contributor.familyName ?? null,
          contributor.orcid ?? null,
          contributor.sequence,
        );
      }

      for (const assertion of draft.assertions) {
        this.writeAssertion(
          {
            ...assertion,
            entityId: assertion.entityType === 'work' ? workId : editionId,
          },
          true,
        );
      }

      const insertEntry = this.sqlite.prepare(
        `INSERT INTO research_collection_entries
         (id, collection_id, work_id, sort_order, created_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(collection_id, work_id) DO NOTHING`,
      );
      for (const entry of draft.collections) {
        insertEntry.run(entry.entryId, entry.collectionId, workId, timestamp);
      }

      this.sqlite
        .prepare(
          `UPDATE research_import_items
           SET stage = 'available', asset_id = ?, work_id = ?, edition_id = ?, decision_json = ?,
               temp_path = NULL, error_code = NULL, error_detail = NULL, retryable = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          draft.attachment.assetId,
          workId,
          editionId,
          draft.decisionJson,
          timestamp,
          draft.importItemId,
        );

      const sessionId = text(item, 'session_id');
      const remaining = this.sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM research_import_items
           WHERE session_id = ? AND stage <> 'available'`,
        )
        .get(sessionId) as { count: number };
      this.sqlite
        .prepare(
          `UPDATE research_import_sessions
           SET status = ?, updated_at = ?, completed_at = ?
           WHERE id = ?`,
        )
        .run(
          remaining.count === 0 ? 'completed' : 'awaiting-confirmation',
          timestamp,
          remaining.count === 0 ? timestamp : null,
          sessionId,
        );

      return {
        workId,
        editionId,
        attachmentId: text(attachment, 'id'),
        assetId: draft.attachment.assetId,
        reusedWork,
        reusedEdition,
        reusedAttachment,
      };
    })();
  }

  async createManualWork(draft: ManualWorkDraft): Promise<ManualWorkResult> {
    return this.sqlite.transaction(() => {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, abstract, year, preferred_edition_id, status,
            revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
        )
        .run(
          draft.work.id,
          draft.work.type,
          draft.work.title,
          draft.work.titleSort,
          draft.work.abstract ?? null,
          draft.work.year ?? null,
          draft.edition.id,
          timestamp,
          timestamp,
        );
      this.sqlite
        .prepare(
          `INSERT INTO research_editions
           (id, work_id, kind, title, publication_title, publisher, published_date,
            volume, issue, pages, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          draft.edition.id,
          draft.work.id,
          draft.edition.kind,
          draft.edition.title,
          draft.edition.publicationTitle ?? null,
          draft.edition.publisher ?? null,
          draft.edition.publishedDate ?? null,
          draft.edition.volume ?? null,
          draft.edition.issue ?? null,
          draft.edition.pages ?? null,
          timestamp,
          timestamp,
        );

      const insertContributor = this.sqlite.prepare(
        `INSERT INTO research_contributors
         (id, edition_id, role, display_name, given_name, family_name, orcid, sequence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const contributor of draft.contributors) {
        insertContributor.run(
          contributor.id,
          draft.edition.id,
          contributor.role ?? 'author',
          contributor.displayName,
          contributor.givenName ?? null,
          contributor.familyName ?? null,
          contributor.orcid ?? null,
          contributor.sequence,
        );
      }

      const insertIdentifier = this.sqlite.prepare(
        `INSERT INTO research_identifiers
         (id, entity_type, entity_id, scheme, value, normalized_value, source_record_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const identifier of draft.identifiers) {
        insertIdentifier.run(
          identifier.id,
          identifier.entityType,
          identifier.entityType === 'work' ? draft.work.id : draft.edition.id,
          identifier.scheme,
          identifier.value,
          identifier.normalizedValue,
          identifier.sourceRecordId ?? null,
          timestamp,
        );
      }

      for (const assertion of draft.assertions) {
        this.writeAssertion(
          {
            ...assertion,
            entityId: assertion.entityType === 'work' ? draft.work.id : draft.edition.id,
          },
          true,
        );
      }

      const insertCollection = this.sqlite.prepare(
        `INSERT INTO research_collection_entries
         (id, collection_id, work_id, sort_order, created_at)
         VALUES (?, ?, ?, 0, ?)`,
      );
      for (const entry of draft.collections) {
        insertCollection.run(entry.entryId, entry.collectionId, draft.work.id, timestamp);
      }
      return { workId: draft.work.id, editionId: draft.edition.id };
    })();
  }

  async updateWorkMetadata(draft: WorkMetadataUpdateDraft): Promise<boolean> {
    return this.sqlite.transaction(() => {
      const work = this.sqlite
        .prepare('SELECT revision, status FROM research_works WHERE id = ?')
        .get(draft.workId) as { revision: number; status: string } | undefined;
      if (!work || work.status !== 'active' || work.revision !== draft.expectedWorkRevision) {
        return false;
      }
      if (draft.edition) {
        const edition = this.sqlite
          .prepare('SELECT revision, work_id FROM research_editions WHERE id = ?')
          .get(draft.edition.id) as { revision: number; work_id: string } | undefined;
        if (
          !edition ||
          edition.work_id !== draft.workId ||
          edition.revision !== draft.edition.expectedRevision
        ) {
          return false;
        }
      }

      const timestamp = this.clock();
      const workAssignments = ['updated_at = ?', 'revision = revision + 1'];
      const workValues: unknown[] = [timestamp];
      if (draft.work?.title !== undefined) {
        workAssignments.push('title = ?');
        workValues.push(draft.work.title);
      }
      if (draft.work?.titleSort !== undefined) {
        workAssignments.push('title_sort = ?');
        workValues.push(draft.work.titleSort);
      }
      if (draft.work?.type !== undefined) {
        workAssignments.push('type = ?');
        workValues.push(draft.work.type);
      }
      if (draft.work?.abstract !== undefined) {
        workAssignments.push('abstract = ?');
        workValues.push(draft.work.abstract);
      }
      if (draft.work?.year !== undefined) {
        workAssignments.push('year = ?');
        workValues.push(draft.work.year);
      }
      const updatedWork = this.sqlite
        .prepare(
          `UPDATE research_works SET ${workAssignments.join(', ')}
           WHERE id = ? AND revision = ?`,
        )
        .run(...workValues, draft.workId, draft.expectedWorkRevision);
      if (updatedWork.changes !== 1) return false;

      if (draft.edition) {
        const editionAssignments = ['updated_at = ?', 'revision = revision + 1'];
        const editionValues: unknown[] = [timestamp];
        if (draft.edition.title !== undefined) {
          editionAssignments.push('title = ?');
          editionValues.push(draft.edition.title);
        }
        if (draft.edition.publicationTitle !== undefined) {
          editionAssignments.push('publication_title = ?');
          editionValues.push(draft.edition.publicationTitle);
        }
        if (draft.edition.publisher !== undefined) {
          editionAssignments.push('publisher = ?');
          editionValues.push(draft.edition.publisher);
        }
        if (draft.edition.publishedDate !== undefined) {
          editionAssignments.push('published_date = ?');
          editionValues.push(draft.edition.publishedDate);
        }
        const updatedEdition = this.sqlite
          .prepare(
            `UPDATE research_editions SET ${editionAssignments.join(', ')}
             WHERE id = ? AND revision = ? AND work_id = ?`,
          )
          .run(...editionValues, draft.edition.id, draft.edition.expectedRevision, draft.workId);
        if (updatedEdition.changes !== 1) return false;

        if (draft.edition.authors !== undefined) {
          this.sqlite
            .prepare("DELETE FROM research_contributors WHERE edition_id = ? AND role = 'author'")
            .run(draft.edition.id);
          const insert = this.sqlite.prepare(
            `INSERT INTO research_contributors
             (id, edition_id, role, display_name, given_name, family_name, orcid, sequence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const author of draft.edition.authors) {
            insert.run(
              author.id,
              draft.edition.id,
              author.role ?? 'author',
              author.displayName,
              author.givenName ?? null,
              author.familyName ?? null,
              author.orcid ?? null,
              author.sequence,
            );
          }
        }
      }

      for (const assertion of draft.assertions) this.writeAssertion(assertion, true);
      return true;
    })();
  }

  async addAttachment(draft: AttachmentDraft): Promise<AttachmentRecord> {
    const timestamp = this.clock();
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)
         ON CONFLICT(edition_id, asset_id, role) DO UPDATE SET
           display_name = excluded.display_name,
           status = 'active',
           recycled_at = NULL
         RETURNING *`,
      )
      .get(
        draft.id,
        draft.editionId,
        draft.assetId,
        draft.role,
        draft.displayName,
        timestamp,
      ) as Row;
    return toAttachment(row);
  }

  async getWork(id: string): Promise<WorkRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_works WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toWork(row) : null;
  }

  async getWorkListRecord(id: string): Promise<WorkListRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_works WHERE id = ?').get(id) as
      Row | undefined;
    if (!row) return null;
    const aggregate = this.sqlite
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) AS attachment_count,
                GROUP_CONCAT(DISTINCT CASE WHEN a.status = 'active' THEN l.state END) AS states,
                GROUP_CONCAT(DISTINCT CASE WHEN a.status = 'active' THEN l.mode END) AS modes
         FROM research_editions e
         LEFT JOIN research_attachments a ON a.edition_id = e.id
         LEFT JOIN research_asset_locations l ON l.asset_id = a.asset_id
         WHERE e.work_id = ?`,
      )
      .get(id) as { attachment_count: number; states: string | null; modes: string | null };
    const authorRows = this.sqlite
      .prepare(
        `SELECT c.display_name FROM research_editions e
         JOIN research_contributors c ON c.edition_id = e.id AND c.role = 'author'
         WHERE e.work_id = ? ORDER BY e.created_at, e.id, c.sequence, c.id`,
      )
      .all(id) as Array<{ display_name: string }>;
    const collectionRows = this.sqlite
      .prepare(
        `SELECT collection_id FROM research_collection_entries
         WHERE work_id = ? ORDER BY collection_id`,
      )
      .all(id) as Array<{ collection_id: string }>;
    const work = toWork(row);
    return {
      ...work,
      authors: authorRows.map((value) => value.display_name),
      attachmentCount: aggregate.attachment_count,
      collectionIds: collectionRows.map((value) => value.collection_id),
      storageModes: storageModes(aggregate.modes),
      fileStatus: combineFileStatus(aggregate.states, aggregate.attachment_count),
      searchScore: null,
      matchedFields: [],
    };
  }

  async listWorks(query: ListWorksQuery): Promise<WorkPage> {
    const conditions = ['w.status = ?'];
    const params: unknown[] = [query.systemView === 'trash' ? 'trashed' : query.status];
    const missingFilesCondition = `w.id IN (
      SELECT e.work_id FROM research_asset_locations loc
      JOIN research_attachments att ON att.asset_id = loc.asset_id AND att.status = 'active'
      JOIN research_editions e ON e.id = att.edition_id
      WHERE loc.state IN ('missing', 'changed')
    )`;
    const duplicateCondition = `w.id IN (
      SELECT own_e.work_id FROM research_editions own_e
        JOIN research_attachments own_a ON own_a.edition_id = own_e.id AND own_a.status = 'active'
        JOIN research_attachments other_a ON other_a.asset_id = own_a.asset_id AND other_a.status = 'active'
        JOIN research_editions other_e ON other_e.id = other_a.edition_id
        WHERE other_e.work_id <> own_e.work_id
      UNION
      SELECT own_e.work_id FROM research_editions own_e
        JOIN research_identifiers own_i ON own_i.entity_type = 'edition' AND own_i.entity_id = own_e.id
        JOIN research_identifiers other_i
          ON other_i.scheme = own_i.scheme AND other_i.normalized_value = own_i.normalized_value
        JOIN research_editions other_e ON other_i.entity_type = 'edition' AND other_i.entity_id = other_e.id
        WHERE other_e.work_id <> own_e.work_id
    )`;
    if (query.systemView === 'uncategorized') {
      conditions.push(
        'NOT EXISTS (SELECT 1 FROM research_collection_entries ce WHERE ce.work_id = w.id)',
      );
    } else if (query.systemView === 'missing-files') {
      conditions.push(missingFilesCondition);
    } else if (query.systemView === 'metadata-review') {
      conditions.push(
        `NOT EXISTS (
           SELECT 1 FROM research_metadata_assertions ma
           WHERE ma.entity_type = 'work' AND ma.entity_id = w.id
             AND ma.field_name = 'title' AND ma.is_selected = 1 AND ma.is_user_confirmed = 1
         )`,
      );
    } else if (query.systemView === 'duplicate-candidates') {
      conditions.push(duplicateCondition);
    }
    if (query.collectionId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM research_collection_entries ce
                 WHERE ce.work_id = w.id AND ce.collection_id = ?)`,
      );
      params.push(query.collectionId);
    }
    for (const collectionId of query.collectionIds ?? []) {
      conditions.push(
        `EXISTS (SELECT 1 FROM research_collection_entries ce
                 WHERE ce.work_id = w.id AND ce.collection_id = ?)`,
      );
      params.push(collectionId);
    }
    for (const tagId of query.tagIds ?? []) {
      conditions.push(
        `EXISTS (SELECT 1 FROM research_work_tags wt WHERE wt.work_id = w.id AND wt.tag_id = ?)`,
      );
      params.push(tagId);
    }
    if (query.types && query.types.length > 0) {
      conditions.push(`w.type IN (${query.types.map(() => '?').join(', ')})`);
      params.push(...query.types);
    }
    if (query.yearFrom !== undefined && query.yearFrom !== null) {
      conditions.push('w.year >= ?');
      params.push(query.yearFrom);
    }
    if (query.yearTo !== undefined && query.yearTo !== null) {
      conditions.push('w.year <= ?');
      params.push(query.yearTo);
    }
    if (query.attachmentRoles && query.attachmentRoles.length > 0) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM research_editions e
           JOIN research_attachments att ON att.edition_id = e.id AND att.status = 'active'
           WHERE e.work_id = w.id AND att.role IN (${query.attachmentRoles.map(() => '?').join(', ')})
         )`,
      );
      params.push(...query.attachmentRoles);
    }
    if (query.storageModes && query.storageModes.length > 0) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM research_editions e
           JOIN research_attachments att ON att.edition_id = e.id AND att.status = 'active'
           JOIN research_asset_locations loc ON loc.asset_id = att.asset_id
           WHERE e.work_id = w.id AND loc.mode IN (${query.storageModes.map(() => '?').join(', ')})
         )`,
      );
      params.push(...query.storageModes);
    }
    const requestedFileStatuses = [
      ...(query.fileStatuses ?? []),
      ...(query.fileStatus ? [query.fileStatus] : []),
    ];
    if (requestedFileStatuses.length > 0) {
      const fileStatusExpression = `CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM research_editions e
          JOIN research_attachments att ON att.edition_id = e.id AND att.status = 'active'
          WHERE e.work_id = w.id
        ) THEN 'none'
        WHEN (
          SELECT COUNT(DISTINCT COALESCE(loc.state, '__none__'))
          FROM research_editions e
          JOIN research_attachments att ON att.edition_id = e.id AND att.status = 'active'
          LEFT JOIN research_asset_locations loc ON loc.asset_id = att.asset_id
          WHERE e.work_id = w.id
        ) <> 1 THEN 'mixed'
        ELSE COALESCE((
          SELECT MIN(loc.state)
          FROM research_editions e
          JOIN research_attachments att ON att.edition_id = e.id AND att.status = 'active'
          LEFT JOIN research_asset_locations loc ON loc.asset_id = att.asset_id
          WHERE e.work_id = w.id
        ), 'mixed')
      END`;
      conditions.push(
        `(${fileStatusExpression}) IN (${requestedFileStatuses.map(() => '?').join(', ')})`,
      );
      params.push(...requestedFileStatuses);
    }
    if (query.relatedWorkId) {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM research_work_relations wr
           WHERE (wr.source_work_id = w.id AND wr.target_work_id = ?)
              OR (wr.target_work_id = w.id AND wr.source_work_id = ?)
         )`,
      );
      params.push(query.relatedWorkId, query.relatedWorkId);
    }
    for (const maintenance of query.maintenance ?? []) {
      if (maintenance === 'missing-fields') {
        conditions.push(
          `(trim(w.title) = '' OR w.year IS NULL OR w.id NOT IN (
             SELECT e.work_id FROM research_editions e
             JOIN research_contributors c ON c.edition_id = e.id AND c.role = 'author'
           ))`,
        );
      } else if (maintenance === 'missing-files') {
        conditions.push(missingFilesCondition);
      } else if (maintenance === 'duplicate-candidates') {
        conditions.push(duplicateCondition);
      } else if (maintenance === 'metadata-failed') {
        conditions.push(
          `w.id IN (
             SELECT ii.work_id FROM research_import_items ii
             WHERE ii.work_id IS NOT NULL AND ii.stage IN ('metadata-failed', 'failed')
           )`,
        );
      } else if (maintenance === 'unfinished-imports') {
        conditions.push(
          `w.id IN (
             SELECT ii.work_id FROM research_import_items ii
             WHERE ii.work_id IS NOT NULL AND ii.stage NOT IN ('available', 'cancelled')
           )`,
        );
      }
    }
    const textQuery = normalizeSearchText(query.query ?? '');
    const sort = query.sort ?? (textQuery ? 'relevance' : 'updated-desc');
    const advanced = Boolean(textQuery) || sort !== 'updated-desc';
    let rows: Row[];
    let nextCursor: string | null;
    if (advanced) {
      const selectCandidates = (match: string | null) =>
        this.sqlite
          .prepare(
            `SELECT w.*,
                    research_work_search.title AS search_title,
                    research_work_search.abstract AS search_abstract,
                    research_work_search.authors AS search_authors,
                    research_work_search.publication AS search_publication,
                    research_work_search.identifiers AS search_identifiers
             FROM research_works w
             JOIN research_work_search ON research_work_search.work_id = w.id
             WHERE ${conditions.join(' AND ')}
             ${match ? 'AND research_work_search MATCH ?' : ''}`,
          )
          .all(...params, ...(match ? [match] : [])) as Row[];
      const prefixQuery = textQuery ? ftsPrefixQuery(textQuery) : '';
      let candidates = selectCandidates(prefixQuery || null);
      if (textQuery && candidates.length === 0) candidates = selectCandidates(null);
      const scored = candidates
        .map((row) => {
          const result = textQuery
            ? scoreSearchDocument(textQuery, {
                title: text(row, 'search_title'),
                abstract: text(row, 'search_abstract'),
                authors: text(row, 'search_authors'),
                publication: text(row, 'search_publication'),
                identifiers: text(row, 'search_identifiers'),
              })
            : { score: 0, matchedFields: [] as SearchField[] };
          return { ...row, search_score: result.score, matched_fields: result.matchedFields };
        })
        .filter((row) => !textQuery || (row.search_score as number) >= 0.28);
      scored.sort((left, right) => {
        if (sort === 'relevance') {
          return (
            (right.search_score as number) - (left.search_score as number) ||
            text(right, 'updated_at').localeCompare(text(left, 'updated_at')) ||
            text(right, 'id').localeCompare(text(left, 'id'))
          );
        }
        if (sort === 'title-asc') {
          return (
            text(left, 'title_sort').localeCompare(text(right, 'title_sort')) ||
            text(left, 'id').localeCompare(text(right, 'id'))
          );
        }
        if (sort === 'year-desc') {
          return (
            (nullableInteger(right, 'year') ?? -1) - (nullableInteger(left, 'year') ?? -1) ||
            text(right, 'id').localeCompare(text(left, 'id'))
          );
        }
        return (
          text(right, 'updated_at').localeCompare(text(left, 'updated_at')) ||
          text(right, 'id').localeCompare(text(left, 'id'))
        );
      });
      const cursor = query.cursor ? decodeAdvancedCursor(query.cursor) : null;
      const start =
        cursor?.sort === sort ? scored.findIndex((row) => text(row, 'id') === cursor.id) + 1 : 0;
      const safeStart = start < 0 ? 0 : start;
      const selected = scored.slice(safeStart, safeStart + query.limit + 1);
      rows = selected.slice(0, query.limit);
      nextCursor =
        selected.length > query.limit && rows.length > 0
          ? encodeAdvancedCursor(sort, text(rows.at(-1)!, 'id'))
          : null;
    } else {
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;
      if (cursor) {
        conditions.push('(w.updated_at < ? OR (w.updated_at = ? AND w.id < ?))');
        params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
      }
      params.push(query.limit + 1);
      const selected = this.sqlite
        .prepare(
          `SELECT w.* FROM research_works w
           WHERE ${conditions.join(' AND ')}
           ORDER BY w.updated_at DESC, w.id DESC
           LIMIT ?`,
        )
        .all(...params) as Row[];
      rows = selected.slice(0, query.limit);
      nextCursor =
        selected.length > query.limit && rows.length > 0
          ? encodeCursor(toWork(rows.at(-1)!))
          : null;
    }
    if (rows.length === 0) return { works: [], nextCursor: null };

    const ids = rows.map((row) => text(row, 'id'));
    const placeholders = ids.map(() => '?').join(', ');
    const attachmentRows = this.sqlite
      .prepare(
        `SELECT e.work_id,
                COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) AS attachment_count,
                GROUP_CONCAT(DISTINCT CASE WHEN a.status = 'active' THEN l.state END) AS states,
                GROUP_CONCAT(DISTINCT CASE WHEN a.status = 'active' THEN l.mode END) AS modes
         FROM research_editions e
         LEFT JOIN research_attachments a ON a.edition_id = e.id
         LEFT JOIN research_asset_locations l ON l.asset_id = a.asset_id
         WHERE e.work_id IN (${placeholders})
         GROUP BY e.work_id`,
      )
      .all(...ids) as Array<{
      work_id: string;
      attachment_count: number;
      states: string | null;
      modes: string | null;
    }>;
    const attachmentByWork = new Map(attachmentRows.map((row) => [row.work_id, row]));
    const authorRows = this.sqlite
      .prepare(
        `SELECT e.work_id, c.display_name FROM research_editions e
         JOIN research_contributors c ON c.edition_id = e.id AND c.role = 'author'
         WHERE e.work_id IN (${placeholders})
         ORDER BY e.work_id, e.created_at, e.id, c.sequence, c.id`,
      )
      .all(...ids) as Array<{ work_id: string; display_name: string }>;
    const authors = new Map<string, string[]>();
    for (const row of authorRows) {
      const values = authors.get(row.work_id) ?? [];
      values.push(row.display_name);
      authors.set(row.work_id, values);
    }
    const collectionRows = this.sqlite
      .prepare(
        `SELECT work_id, collection_id FROM research_collection_entries
         WHERE work_id IN (${placeholders}) ORDER BY collection_id`,
      )
      .all(...ids) as Array<{ work_id: string; collection_id: string }>;
    const collections = new Map<string, string[]>();
    for (const row of collectionRows) {
      const values = collections.get(row.work_id) ?? [];
      values.push(row.collection_id);
      collections.set(row.work_id, values);
    }

    const decorated = rows.map((row): WorkListRecord => {
      const work = toWork(row);
      const aggregate = attachmentByWork.get(work.id);
      const attachmentCount = aggregate?.attachment_count ?? 0;
      return {
        ...work,
        authors: authors.get(work.id) ?? [],
        attachmentCount,
        collectionIds: collections.get(work.id) ?? [],
        storageModes: storageModes(aggregate?.modes ?? null),
        fileStatus: combineFileStatus(aggregate?.states ?? null, attachmentCount),
        searchScore: (row.search_score as number | undefined) ?? null,
        matchedFields: (row.matched_fields as SearchField[] | undefined) ?? [],
      };
    });
    return { works: decorated, nextCursor };
  }

  async rebuildSearchIndex(): Promise<number> {
    return this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM research_work_search').run();
      this.sqlite
        .prepare(
          `INSERT INTO research_work_search
           SELECT work_id, title, abstract, authors, publication, identifiers
           FROM research_work_search_documents`,
        )
        .run();
      return (
        this.sqlite.prepare('SELECT COUNT(*) AS count FROM research_work_search').get() as {
          count: number;
        }
      ).count;
    })();
  }

  async listEditions(workId: string): Promise<EditionRecord[]> {
    const rows = this.sqlite
      .prepare('SELECT * FROM research_editions WHERE work_id = ? ORDER BY created_at, id')
      .all(workId) as Row[];
    return rows.map(toEdition);
  }

  async getEdition(id: string): Promise<EditionRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_editions WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toEdition(row) : null;
  }

  async listContributors(editionId: string): Promise<ContributorRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_contributors
         WHERE edition_id = ? ORDER BY sequence, id`,
      )
      .all(editionId) as Row[];
    return rows.map(toContributor);
  }

  async listIdentifiers(
    entityType: 'work' | 'edition',
    entityId: string,
  ): Promise<IdentifierRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_identifiers
         WHERE entity_type = ? AND entity_id = ? ORDER BY scheme, normalized_value, id`,
      )
      .all(entityType, entityId) as Row[];
    return rows.map(toIdentifier);
  }

  async listAttachments(editionId: string): Promise<AttachmentRecord[]> {
    const rows = this.sqlite
      .prepare('SELECT * FROM research_attachments WHERE edition_id = ? ORDER BY created_at, id')
      .all(editionId) as Row[];
    return rows.map(toAttachment);
  }

  async recycleAttachment(id: string, at: string): Promise<boolean> {
    const result = this.sqlite
      .prepare(
        `UPDATE research_attachments SET status = 'recycled', recycled_at = ?
         WHERE id = ? AND status = 'active'`,
      )
      .run(at, id);
    return result.changes === 1;
  }

  async restoreAttachment(id: string): Promise<boolean> {
    const result = this.sqlite
      .prepare(
        `UPDATE research_attachments SET status = 'active', recycled_at = NULL
         WHERE id = ? AND status = 'recycled'`,
      )
      .run(id);
    return result.changes === 1;
  }

  async getAttachmentDeletionImpact(id: string): Promise<AttachmentDeletionImpact | null> {
    const row = this.sqlite
      .prepare(
        `SELECT att.id AS attachment_id, att.asset_id, att.display_name, att.status,
                asset.content_hash, asset.byte_size,
                (SELECT COUNT(*) FROM research_attachments other
                 WHERE other.asset_id = att.asset_id AND other.id <> att.id) AS other_count,
                (SELECT COUNT(*) FROM research_asset_locations linked
                 WHERE linked.asset_id = att.asset_id AND linked.mode = 'linked') AS linked_count,
                (SELECT managed.object_key FROM research_asset_locations managed
                 WHERE managed.asset_id = att.asset_id AND managed.mode = 'managed' LIMIT 1) AS object_key
         FROM research_attachments att
         JOIN research_assets asset ON asset.id = att.asset_id
         WHERE att.id = ?`,
      )
      .get(id) as Row | undefined;
    if (!row) return null;
    const otherAttachmentCount = integer(row, 'other_count');
    const objectKey = nullableText(row, 'object_key');
    return {
      attachmentId: text(row, 'attachment_id'),
      assetId: text(row, 'asset_id'),
      displayName: text(row, 'display_name'),
      otherAttachmentCount,
      linkedLocationCount: integer(row, 'linked_count'),
      orphanedAssetId: otherAttachmentCount === 0 ? text(row, 'asset_id') : null,
      removableManagedAsset:
        otherAttachmentCount === 0 && objectKey
          ? {
              assetId: text(row, 'asset_id'),
              objectKey,
              contentHash: text(row, 'content_hash'),
              byteSize: integer(row, 'byte_size'),
            }
          : null,
    };
  }

  async permanentlyDeleteAttachment(id: string, removableAssetId: string | null): Promise<boolean> {
    return this.sqlite.transaction(() => {
      const row = this.sqlite
        .prepare('SELECT asset_id, status FROM research_attachments WHERE id = ?')
        .get(id) as { asset_id: string; status: string } | undefined;
      if (!row || row.status !== 'recycled') return false;
      const count = this.sqlite
        .prepare(
          'SELECT COUNT(*) AS count FROM research_attachments WHERE asset_id = ? AND id <> ?',
        )
        .get(row.asset_id, id) as { count: number };
      const expectedOrphan = count.count === 0 ? row.asset_id : null;
      if (expectedOrphan !== removableAssetId) return false;
      this.sqlite.prepare('DELETE FROM research_attachments WHERE id = ?').run(id);
      if (expectedOrphan)
        this.sqlite.prepare('DELETE FROM research_assets WHERE id = ?').run(expectedOrphan);
      return true;
    })();
  }

  async trashWork(id: string, at: string): Promise<boolean> {
    const result = this.sqlite
      .prepare(
        `UPDATE research_works
         SET status = 'trashed', trashed_at = ?, updated_at = ?, revision = revision + 1
         WHERE id = ? AND status = 'active'`,
      )
      .run(at, at, id);
    return result.changes === 1;
  }

  async restoreWork(id: string, at: string): Promise<boolean> {
    const result = this.sqlite
      .prepare(
        `UPDATE research_works
         SET status = 'active', trashed_at = NULL, updated_at = ?, revision = revision + 1
         WHERE id = ? AND status = 'trashed'`,
      )
      .run(at, id);
    return result.changes === 1;
  }

  async getDeletionImpact(workId: string): Promise<DeletionImpact | null> {
    const work = this.sqlite.prepare('SELECT id FROM research_works WHERE id = ?').get(workId);
    if (!work) return null;
    const counts = this.sqlite
      .prepare(
        `SELECT
           COUNT(DISTINCT a.id) AS attachment_count,
           COUNT(DISTINCT CASE WHEN l.mode = 'linked' THEN l.id END) AS linked_location_count
         FROM research_editions e
         LEFT JOIN research_attachments a ON a.edition_id = e.id
         LEFT JOIN research_asset_locations l ON l.asset_id = a.asset_id
         WHERE e.work_id = ?`,
      )
      .get(workId) as { attachment_count: number; linked_location_count: number };
    const removable = this.sqlite
      .prepare(
        `SELECT DISTINCT a2.id AS asset_id, l.object_key, a2.content_hash, a2.byte_size
         FROM research_editions e
         JOIN research_attachments att ON att.edition_id = e.id
         JOIN research_assets a2 ON a2.id = att.asset_id
         JOIN research_asset_locations l ON l.asset_id = a2.id AND l.mode = 'managed'
         WHERE e.work_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM research_attachments other_att
             JOIN research_editions other_e ON other_e.id = other_att.edition_id
             WHERE other_att.asset_id = a2.id AND other_e.work_id <> ?
           )
         ORDER BY a2.id`,
      )
      .all(workId, workId) as Array<{
      asset_id: string;
      object_key: string;
      content_hash: string;
      byte_size: number;
    }>;
    return {
      workId,
      attachmentCount: counts.attachment_count,
      managedObjectCount: removable.length,
      linkedLocationCount: counts.linked_location_count,
      removableManagedAssets: removable.map((row) => ({
        assetId: row.asset_id,
        objectKey: row.object_key,
        contentHash: row.content_hash,
        byteSize: row.byte_size,
      })),
    };
  }

  async permanentlyDeleteWork(workId: string, removableAssetIds: string[]): Promise<boolean> {
    return this.sqlite.transaction(() => {
      const work = this.sqlite
        .prepare('SELECT status FROM research_works WHERE id = ?')
        .get(workId) as { status: string } | undefined;
      if (!work || work.status !== 'trashed') return false;
      const current = this.sqlite
        .prepare(
          `SELECT DISTINCT a2.id AS asset_id
           FROM research_editions e
           JOIN research_attachments att ON att.edition_id = e.id
           JOIN research_assets a2 ON a2.id = att.asset_id
           JOIN research_asset_locations l ON l.asset_id = a2.id AND l.mode = 'managed'
           WHERE e.work_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM research_attachments other_att
               JOIN research_editions other_e ON other_e.id = other_att.edition_id
               WHERE other_att.asset_id = a2.id AND other_e.work_id <> ?
             )
           ORDER BY a2.id`,
        )
        .all(workId, workId) as Array<{ asset_id: string }>;
      const actual = current.map((row) => row.asset_id);
      const expected = [...removableAssetIds].sort();
      if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
        return false;
      }

      this.sqlite.prepare('DELETE FROM research_works WHERE id = ?').run(workId);
      const deleteAsset = this.sqlite.prepare(
        `DELETE FROM research_assets
         WHERE id = ? AND NOT EXISTS (
           SELECT 1 FROM research_attachments WHERE asset_id = research_assets.id
         )`,
      );
      for (const assetId of actual) deleteAsset.run(assetId);
      return true;
    })();
  }

  async createCollection(draft: CollectionDraft): Promise<CollectionRecord> {
    const timestamp = this.clock();
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_collections
         (id, parent_id, name, normalized_name, kind, query_json, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        draft.id,
        draft.parentId,
        draft.name,
        draft.normalizedName,
        draft.kind ?? 'manual',
        draft.queryJson ?? null,
        draft.sortOrder,
        timestamp,
        timestamp,
      ) as Row;
    return toCollection(row);
  }

  async listCollections(): Promise<CollectionRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_collections
         WHERE trashed_at IS NULL ORDER BY parent_id, sort_order, id`,
      )
      .all() as Row[];
    return rows.map(toCollection);
  }

  async getCollection(id: string): Promise<CollectionRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_collections WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toCollection(row) : null;
  }

  async moveCollection(draft: CollectionMoveDraft): Promise<CollectionRecord | null> {
    return this.sqlite.transaction(() => {
      const existing = this.sqlite
        .prepare('SELECT parent_id FROM research_collections WHERE id = ? AND trashed_at IS NULL')
        .get(draft.id) as { parent_id: string | null } | undefined;
      if (!existing) return null;
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `UPDATE research_collections
           SET parent_id = ?, name = ?, normalized_name = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(draft.parentId, draft.name, draft.normalizedName, timestamp, draft.id);

      const updateOrder = this.sqlite.prepare(
        'UPDATE research_collections SET sort_order = ?, updated_at = ? WHERE id = ?',
      );
      draft.orderedSiblingIds.forEach((id, index) => updateOrder.run(index, timestamp, id));
      if (existing.parent_id !== draft.parentId) {
        const oldSiblings = this.sqlite
          .prepare(
            `SELECT id FROM research_collections
             WHERE parent_id IS ? AND trashed_at IS NULL ORDER BY sort_order, id`,
          )
          .all(existing.parent_id) as Array<{ id: string }>;
        oldSiblings.forEach((row, index) => updateOrder.run(index, timestamp, row.id));
      }
      const updated = this.sqlite
        .prepare('SELECT * FROM research_collections WHERE id = ?')
        .get(draft.id) as Row;
      return toCollection(updated);
    })();
  }

  async getCollectionDeletionImpact(id: string): Promise<CollectionDeletionImpact | null> {
    const collection = await this.getCollection(id);
    if (!collection) return null;
    const counts = this.sqlite
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM research_collections WHERE parent_id = ? AND trashed_at IS NULL) AS child_count,
           (SELECT COUNT(*) FROM research_collection_entries WHERE collection_id = ?) AS work_count`,
      )
      .get(id, id) as { child_count: number; work_count: number };
    const conflictQuery = this.sqlite.prepare(
      `SELECT child.name
         FROM research_collections child
         WHERE child.parent_id = ? AND child.trashed_at IS NULL
           AND EXISTS (
             SELECT 1 FROM research_collections sibling
             WHERE sibling.parent_id IS ? AND sibling.trashed_at IS NULL
               AND sibling.id <> ?
               AND sibling.normalized_name = child.normalized_name
           )
         ORDER BY child.name`,
    );
    const parentConflicts = conflictQuery.all(id, collection.parentId, id) as Array<{
      name: string;
    }>;
    const unclassifiedConflicts = conflictQuery.all(id, null, id) as Array<{ name: string }>;
    return {
      collection,
      childCount: counts.child_count,
      directWorkCount: counts.work_count,
      parentStrategyNameConflicts: parentConflicts.map((row) => row.name),
      unclassifiedStrategyNameConflicts: unclassifiedConflicts.map((row) => row.name),
    };
  }

  async deleteCollection(id: string, strategy: 'parent' | 'unclassified'): Promise<boolean> {
    return this.sqlite.transaction(() => {
      const collection = this.sqlite
        .prepare('SELECT * FROM research_collections WHERE id = ? AND trashed_at IS NULL')
        .get(id) as Row | undefined;
      if (!collection) return false;
      const parentId = nullableText(collection, 'parent_id');
      const targetParentId = strategy === 'parent' ? parentId : null;
      const timestamp = this.clock();

      if (strategy === 'parent' && parentId !== null) {
        const entries = this.sqlite
          .prepare('SELECT id, work_id FROM research_collection_entries WHERE collection_id = ?')
          .all(id) as Array<{ id: string; work_id: string }>;
        const exists = this.sqlite.prepare(
          'SELECT 1 FROM research_collection_entries WHERE collection_id = ? AND work_id = ?',
        );
        const move = this.sqlite.prepare(
          'UPDATE research_collection_entries SET collection_id = ? WHERE id = ?',
        );
        for (const entry of entries) {
          if (!exists.get(parentId, entry.work_id)) move.run(parentId, entry.id);
        }
      }

      this.sqlite
        .prepare(
          `UPDATE research_collections SET parent_id = ?, updated_at = ?
           WHERE parent_id = ? AND trashed_at IS NULL`,
        )
        .run(targetParentId, timestamp, id);
      this.sqlite.prepare('DELETE FROM research_collections WHERE id = ?').run(id);

      const siblings = this.sqlite
        .prepare(
          `SELECT id FROM research_collections
           WHERE parent_id IS ? AND trashed_at IS NULL ORDER BY sort_order, id`,
        )
        .all(targetParentId) as Array<{ id: string }>;
      const reorder = this.sqlite.prepare(
        'UPDATE research_collections SET sort_order = ?, updated_at = ? WHERE id = ?',
      );
      siblings.forEach((row, index) => reorder.run(index, timestamp, row.id));
      return true;
    })();
  }

  async setWorkCollections(
    workId: string,
    entries: Array<{ entryId: string; collectionId: string }>,
  ): Promise<void> {
    this.sqlite.transaction(() => {
      this.sqlite.prepare('DELETE FROM research_collection_entries WHERE work_id = ?').run(workId);
      const insert = this.sqlite.prepare(
        `INSERT INTO research_collection_entries
         (id, collection_id, work_id, sort_order, created_at)
         VALUES (?, ?, ?, 0, ?)`,
      );
      const timestamp = this.clock();
      for (const entry of entries) insert.run(entry.entryId, entry.collectionId, workId, timestamp);
    })();
  }

  async upsertWorkRelation(draft: WorkRelationDraft): Promise<WorkRelationRecord> {
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_work_relations
         (id, source_work_id, target_work_id, kind, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_work_id, target_work_id, kind) DO UPDATE SET note = excluded.note
         RETURNING *`,
      )
      .get(
        draft.id,
        draft.sourceWorkId,
        draft.targetWorkId,
        draft.kind,
        draft.note,
        this.clock(),
      ) as Row;
    return toWorkRelation(row);
  }

  async listWorkRelations(workId: string): Promise<WorkRelationRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_work_relations
         WHERE source_work_id = ? OR target_work_id = ?
         ORDER BY created_at, id`,
      )
      .all(workId, workId) as Row[];
    return rows.map(toWorkRelation);
  }

  async deleteWorkRelation(id: string): Promise<boolean> {
    return (
      this.sqlite.prepare('DELETE FROM research_work_relations WHERE id = ?').run(id).changes === 1
    );
  }

  async listTags(status: 'active' | 'trashed' | 'all'): Promise<TagSummaryRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT id FROM research_tags
         WHERE (? = 'all')
            OR (? = 'active' AND trashed_at IS NULL)
            OR (? = 'trashed' AND trashed_at IS NOT NULL)
         ORDER BY name, id`,
      )
      .all(status, status, status) as Array<{ id: string }>;
    return rows
      .map((row) => this.readTagSummary(row.id))
      .filter((tag): tag is TagSummaryRecord => tag !== null);
  }

  async getTag(id: string): Promise<TagSummaryRecord | null> {
    return this.readTagSummary(id);
  }

  async createTag(draft: TagDraft): Promise<TagSummaryRecord> {
    this.sqlite.transaction(() => {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_tags
           (id, name, normalized_name, color, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          draft.id,
          draft.name,
          draft.normalizedName,
          draft.color,
          draft.description,
          timestamp,
          timestamp,
        );
      const insertAlias = this.sqlite.prepare(
        `INSERT INTO research_tag_aliases
         (id, tag_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const alias of draft.aliases) {
        insertAlias.run(alias.id, draft.id, alias.name, alias.normalizedName, timestamp);
      }
    })();
    const created = this.readTagSummary(draft.id);
    if (!created) throw new Error('标签写入后不可读');
    return created;
  }

  async updateTag(draft: TagUpdateDraft): Promise<TagSummaryRecord | null> {
    const changed = this.sqlite.transaction(() => {
      const timestamp = this.clock();
      const update = this.sqlite
        .prepare(
          `UPDATE research_tags
           SET name = ?, normalized_name = ?, color = ?, description = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(
          draft.name,
          draft.normalizedName,
          draft.color,
          draft.description,
          timestamp,
          draft.id,
          draft.expectedUpdatedAt,
        );
      if (update.changes !== 1) return false;
      this.sqlite.prepare('DELETE FROM research_tag_aliases WHERE tag_id = ?').run(draft.id);
      const insertAlias = this.sqlite.prepare(
        `INSERT INTO research_tag_aliases
         (id, tag_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const alias of draft.aliases) {
        insertAlias.run(alias.id, draft.id, alias.name, alias.normalizedName, timestamp);
      }
      return true;
    })();
    return changed ? this.readTagSummary(draft.id) : null;
  }

  async setWorkTags(workId: string, entries: Array<{ id: string; tagId: string }>): Promise<void> {
    this.sqlite.transaction(() => {
      const timestamp = this.clock();
      const previous = this.sqlite
        .prepare('SELECT tag_id FROM research_work_tags WHERE work_id = ?')
        .all(workId) as Array<{ tag_id: string }>;
      this.sqlite.prepare('DELETE FROM research_work_tags WHERE work_id = ?').run(workId);
      const insert = this.sqlite.prepare(
        `INSERT INTO research_work_tags (id, work_id, tag_id, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      for (const entry of entries) insert.run(entry.id, workId, entry.tagId, timestamp);
      const touchTag = this.sqlite.prepare('UPDATE research_tags SET updated_at = ? WHERE id = ?');
      for (const tagId of new Set([
        ...previous.map((row) => row.tag_id),
        ...entries.map((e) => e.tagId),
      ])) {
        touchTag.run(timestamp, tagId);
      }
      this.sqlite
        .prepare(`UPDATE research_works SET updated_at = ?, revision = revision + 1 WHERE id = ?`)
        .run(timestamp, workId);
    })();
  }

  async listTagsForWork(workId: string): Promise<TagSummaryRecord[]> {
    const rows = this.sqlite
      .prepare(
        `SELECT tag_id FROM research_work_tags wt
         JOIN research_tags t ON t.id = wt.tag_id
         WHERE wt.work_id = ? AND t.trashed_at IS NULL
         ORDER BY t.name, t.id`,
      )
      .all(workId) as Array<{ tag_id: string }>;
    return rows
      .map((row) => this.readTagSummary(row.tag_id))
      .filter((tag): tag is TagSummaryRecord => tag !== null);
  }

  async trashTag(id: string, expectedUpdatedAt: string): Promise<boolean> {
    const timestamp = this.clock();
    return (
      this.sqlite
        .prepare(
          `UPDATE research_tags SET trashed_at = ?, updated_at = ?
           WHERE id = ? AND trashed_at IS NULL AND updated_at = ?`,
        )
        .run(timestamp, timestamp, id, expectedUpdatedAt).changes === 1
    );
  }

  async restoreTag(id: string): Promise<boolean> {
    const timestamp = this.clock();
    return (
      this.sqlite
        .prepare(
          `UPDATE research_tags SET trashed_at = NULL, updated_at = ?
           WHERE id = ? AND trashed_at IS NOT NULL`,
        )
        .run(timestamp, id).changes === 1
    );
  }

  async deleteTagPermanently(id: string): Promise<boolean> {
    return (
      this.sqlite
        .prepare('DELETE FROM research_tags WHERE id = ? AND trashed_at IS NOT NULL')
        .run(id).changes === 1
    );
  }

  async mergeTags(draft: TagMergeDraft): Promise<MergeRecord | null> {
    return this.sqlite.transaction(() => {
      const tags = this.sqlite
        .prepare(`SELECT * FROM research_tags WHERE id IN (?, ?) ORDER BY id`)
        .all(draft.survivorId, draft.mergedId) as Row[];
      const survivor = tags.find((tag) => text(tag, 'id') === draft.survivorId);
      const merged = tags.find((tag) => text(tag, 'id') === draft.mergedId);
      if (
        !survivor ||
        !merged ||
        nullableText(survivor, 'trashed_at') ||
        nullableText(merged, 'trashed_at') ||
        text(survivor, 'updated_at') !== draft.expectedSurvivorUpdatedAt ||
        text(merged, 'updated_at') !== draft.expectedMergedUpdatedAt
      ) {
        return null;
      }
      const beforeAliases = this.sqlite
        .prepare('SELECT * FROM research_tag_aliases WHERE tag_id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const beforeWorkTags = this.sqlite
        .prepare('SELECT * FROM research_work_tags WHERE tag_id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const timestamp = this.clock();

      const mergedNameAlias = this.sqlite
        .prepare('SELECT id FROM research_tag_aliases WHERE normalized_name = ?')
        .get(text(merged, 'normalized_name')) as { id: string } | undefined;
      if (mergedNameAlias) {
        this.sqlite
          .prepare('UPDATE research_tag_aliases SET tag_id = ? WHERE id = ?')
          .run(draft.survivorId, mergedNameAlias.id);
      } else {
        this.sqlite
          .prepare(
            `INSERT INTO research_tag_aliases
             (id, tag_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            draft.mergedNameAliasId,
            draft.survivorId,
            text(merged, 'name'),
            text(merged, 'normalized_name'),
            timestamp,
          );
      }
      this.sqlite
        .prepare('UPDATE research_tag_aliases SET tag_id = ? WHERE tag_id = ?')
        .run(draft.survivorId, draft.mergedId);
      const mergedAssignments = this.sqlite
        .prepare('SELECT id, work_id FROM research_work_tags WHERE tag_id = ?')
        .all(draft.mergedId) as Array<{ id: string; work_id: string }>;
      const existingAssignment = this.sqlite.prepare(
        'SELECT 1 FROM research_work_tags WHERE work_id = ? AND tag_id = ?',
      );
      for (const assignment of mergedAssignments) {
        if (existingAssignment.get(assignment.work_id, draft.survivorId)) {
          this.sqlite.prepare('DELETE FROM research_work_tags WHERE id = ?').run(assignment.id);
        } else {
          this.sqlite
            .prepare('UPDATE research_work_tags SET tag_id = ? WHERE id = ?')
            .run(draft.survivorId, assignment.id);
        }
      }
      this.sqlite
        .prepare('UPDATE research_tags SET updated_at = ? WHERE id = ?')
        .run(timestamp, draft.survivorId);
      this.sqlite
        .prepare('UPDATE research_tags SET trashed_at = ?, updated_at = ? WHERE id = ?')
        .run(timestamp, timestamp, draft.mergedId);

      const appliedTags = this.sqlite
        .prepare('SELECT * FROM research_tags WHERE id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const appliedAliases = this.sqlite
        .prepare('SELECT * FROM research_tag_aliases WHERE tag_id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const appliedWorkTags = this.sqlite
        .prepare('SELECT * FROM research_work_tags WHERE tag_id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const snapshotJson = JSON.stringify({
        version: 1,
        entityType: 'tag',
        before: { tags, aliases: beforeAliases, workTags: beforeWorkTags },
        applied: { tags: appliedTags, aliases: appliedAliases, workTags: appliedWorkTags },
      });
      const record = this.sqlite
        .prepare(
          `INSERT INTO research_merge_records
           (id, entity_type, survivor_id, merged_id, snapshot_json, status, created_at)
           VALUES (?, 'tag', ?, ?, ?, 'merged', ?) RETURNING *`,
        )
        .get(draft.id, draft.survivorId, draft.mergedId, snapshotJson, timestamp) as Row;
      return toMergeRecord(record);
    })();
  }

  async mergeWorks(draft: WorkMergeDraft): Promise<MergeRecord | null> {
    return this.sqlite.transaction(() => {
      const works = this.sqlite
        .prepare('SELECT * FROM research_works WHERE id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const survivor = works.find((work) => text(work, 'id') === draft.survivorId);
      const merged = works.find((work) => text(work, 'id') === draft.mergedId);
      if (
        !survivor ||
        !merged ||
        text(survivor, 'status') !== 'active' ||
        text(merged, 'status') !== 'active' ||
        integer(survivor, 'revision') !== draft.expectedSurvivorRevision ||
        integer(merged, 'revision') !== draft.expectedMergedRevision
      ) {
        return null;
      }

      const editions = this.sqlite
        .prepare('SELECT * FROM research_editions WHERE work_id IN (?, ?) ORDER BY id')
        .all(draft.survivorId, draft.mergedId) as Row[];
      const mergedEditionIds = editions
        .filter((edition) => text(edition, 'work_id') === draft.mergedId)
        .map((edition) => text(edition, 'id'))
        .sort();
      const requestedEditionIds = [...draft.editionIdsToMove].sort();
      if (JSON.stringify(mergedEditionIds) !== JSON.stringify(requestedEditionIds)) return null;
      const resultingEditionIds = new Set(editions.map((edition) => text(edition, 'id')));
      if (draft.preferredEditionId && !resultingEditionIds.has(draft.preferredEditionId))
        return null;

      const queryScoped = (table: string, predicate: string) =>
        this.sqlite
          .prepare(`SELECT * FROM ${table} WHERE ${predicate} ORDER BY id`)
          .all(draft.survivorId, draft.mergedId) as Row[];
      const before = {
        works,
        editions,
        collectionEntries: queryScoped('research_collection_entries', 'work_id IN (?, ?)'),
        workTags: queryScoped('research_work_tags', 'work_id IN (?, ?)'),
        workRelations: this.sqlite
          .prepare(
            `SELECT * FROM research_work_relations
             WHERE source_work_id IN (?, ?) OR target_work_id IN (?, ?) ORDER BY id`,
          )
          .all(draft.survivorId, draft.mergedId, draft.survivorId, draft.mergedId) as Row[],
        assertions: this.sqlite
          .prepare(
            `SELECT * FROM research_metadata_assertions
             WHERE entity_type = 'work' AND entity_id IN (?, ?) ORDER BY id`,
          )
          .all(draft.survivorId, draft.mergedId) as Row[],
        sourceMaps: this.sqlite
          .prepare(
            `SELECT * FROM research_external_source_maps
             WHERE entity_type = 'work' AND entity_id IN (?, ?) ORDER BY id`,
          )
          .all(draft.survivorId, draft.mergedId) as Row[],
        identifiers: this.sqlite
          .prepare(
            `SELECT * FROM research_identifiers
             WHERE entity_type = 'work' AND entity_id IN (?, ?) ORDER BY id`,
          )
          .all(draft.survivorId, draft.mergedId) as Row[],
        importItems: queryScoped('research_import_items', 'work_id IN (?, ?)'),
      };
      const timestamp = this.clock();

      this.sqlite
        .prepare('UPDATE research_editions SET work_id = ? WHERE work_id = ?')
        .run(draft.survivorId, draft.mergedId);

      const moveUniqueRows = (table: string, keyColumn: string) => {
        const mergedRows = this.sqlite
          .prepare(
            `SELECT id, ${keyColumn} AS item_key FROM ${table} WHERE work_id = ? ORDER BY id`,
          )
          .all(draft.mergedId) as Array<{ id: string; item_key: string }>;
        const exists = this.sqlite.prepare(
          `SELECT 1 FROM ${table} WHERE work_id = ? AND ${keyColumn} = ?`,
        );
        for (const row of mergedRows) {
          if (exists.get(draft.survivorId, row.item_key)) {
            this.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
          } else {
            this.sqlite
              .prepare(`UPDATE ${table} SET work_id = ? WHERE id = ?`)
              .run(draft.survivorId, row.id);
          }
        }
      };
      moveUniqueRows('research_collection_entries', 'collection_id');
      moveUniqueRows('research_work_tags', 'tag_id');

      this.sqlite
        .prepare(
          `DELETE FROM research_work_relations
           WHERE source_work_id IN (?, ?) OR target_work_id IN (?, ?)`,
        )
        .run(draft.survivorId, draft.mergedId, draft.survivorId, draft.mergedId);
      const insertRelation = this.sqlite.prepare(
        `INSERT INTO research_work_relations
         (id, source_work_id, target_work_id, kind, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const relationKeys = new Set<string>();
      for (const row of before.workRelations) {
        const source =
          text(row, 'source_work_id') === draft.mergedId
            ? draft.survivorId
            : text(row, 'source_work_id');
        const target =
          text(row, 'target_work_id') === draft.mergedId
            ? draft.survivorId
            : text(row, 'target_work_id');
        if (source === target) continue;
        const key = `${source}\0${target}\0${text(row, 'kind')}`;
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);
        insertRelation.run(
          text(row, 'id'),
          source,
          target,
          text(row, 'kind'),
          nullableText(row, 'note'),
          text(row, 'created_at'),
        );
      }

      const selectedAssertionIds = (['title', 'type', 'abstract', 'year'] as const).flatMap(
        (fieldName) => {
          const sourceId =
            draft.fieldSources[fieldName] === 'survivor' ? draft.survivorId : draft.mergedId;
          const assertion = before.assertions.find(
            (row) =>
              text(row, 'entity_id') === sourceId &&
              text(row, 'field_name') === fieldName &&
              integer(row, 'is_selected') === 1,
          );
          return assertion ? [text(assertion, 'id')] : [];
        },
      );
      this.sqlite
        .prepare(
          `UPDATE research_metadata_assertions SET is_selected = 0
           WHERE entity_type = 'work' AND entity_id IN (?, ?)`,
        )
        .run(draft.survivorId, draft.mergedId);
      for (const table of [
        'research_metadata_assertions',
        'research_external_source_maps',
        'research_identifiers',
      ]) {
        this.sqlite
          .prepare(`UPDATE ${table} SET entity_id = ? WHERE entity_type = 'work' AND entity_id = ?`)
          .run(draft.survivorId, draft.mergedId);
      }
      const selectAssertion = this.sqlite.prepare(
        'UPDATE research_metadata_assertions SET is_selected = 1 WHERE id = ?',
      );
      for (const assertionId of selectedAssertionIds) selectAssertion.run(assertionId);
      this.sqlite
        .prepare('UPDATE research_import_items SET work_id = ? WHERE work_id = ?')
        .run(draft.survivorId, draft.mergedId);

      this.sqlite
        .prepare(
          `UPDATE research_works
           SET type = ?, title = ?, title_sort = ?, abstract = ?, year = ?,
               preferred_edition_id = ?, revision = revision + 1, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          draft.selectedFields.type,
          draft.selectedFields.title,
          draft.selectedFields.titleSort,
          draft.selectedFields.abstract,
          draft.selectedFields.year,
          draft.preferredEditionId,
          timestamp,
          draft.survivorId,
        );
      this.sqlite
        .prepare(
          `UPDATE research_works
           SET status = 'merged', redirect_to_work_id = ?, revision = revision + 1,
               updated_at = ?, trashed_at = NULL
           WHERE id = ?`,
        )
        .run(draft.survivorId, timestamp, draft.mergedId);

      const editionIds = editions.map((edition) => text(edition, 'id'));
      const editionPlaceholders = editionIds.map(() => '?').join(', ');
      const queryApplied = (table: string, predicate: string, ...params: string[]) =>
        this.sqlite
          .prepare(`SELECT * FROM ${table} WHERE ${predicate} ORDER BY id`)
          .all(...params) as Row[];
      const applied = {
        works: queryApplied('research_works', 'id IN (?, ?)', draft.survivorId, draft.mergedId),
        editions:
          editionIds.length === 0
            ? []
            : queryApplied('research_editions', `id IN (${editionPlaceholders})`, ...editionIds),
        collectionEntries: queryApplied(
          'research_collection_entries',
          'work_id IN (?, ?)',
          draft.survivorId,
          draft.mergedId,
        ),
        workTags: queryApplied(
          'research_work_tags',
          'work_id IN (?, ?)',
          draft.survivorId,
          draft.mergedId,
        ),
        workRelations: queryApplied(
          'research_work_relations',
          'source_work_id IN (?, ?) OR target_work_id IN (?, ?)',
          draft.survivorId,
          draft.mergedId,
          draft.survivorId,
          draft.mergedId,
        ),
        assertions: queryApplied(
          'research_metadata_assertions',
          "entity_type = 'work' AND entity_id IN (?, ?)",
          draft.survivorId,
          draft.mergedId,
        ),
        sourceMaps: queryApplied(
          'research_external_source_maps',
          "entity_type = 'work' AND entity_id IN (?, ?)",
          draft.survivorId,
          draft.mergedId,
        ),
        identifiers: queryApplied(
          'research_identifiers',
          "entity_type = 'work' AND entity_id IN (?, ?)",
          draft.survivorId,
          draft.mergedId,
        ),
        importItems: queryApplied(
          'research_import_items',
          'work_id IN (?, ?)',
          draft.survivorId,
          draft.mergedId,
        ),
      };
      const snapshotJson = JSON.stringify({ version: 1, entityType: 'work', before, applied });
      const record = this.sqlite
        .prepare(
          `INSERT INTO research_merge_records
           (id, entity_type, survivor_id, merged_id, snapshot_json, status, created_at)
           VALUES (?, 'work', ?, ?, ?, 'merged', ?) RETURNING *`,
        )
        .get(draft.id, draft.survivorId, draft.mergedId, snapshotJson, timestamp) as Row;
      return toMergeRecord(record);
    })();
  }

  async getMergeRecord(id: string): Promise<MergeRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_merge_records WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toMergeRecord(row) : null;
  }

  async revertMerge(id: string): Promise<MergeRecord | null> {
    return this.sqlite.transaction(() => {
      const recordRow = this.sqlite
        .prepare('SELECT * FROM research_merge_records WHERE id = ? AND status = ?')
        .get(id, 'merged') as Row | undefined;
      if (!recordRow) return null;
      const record = toMergeRecord(recordRow);
      const same = (left: Row[], right: Row[]) => JSON.stringify(left) === JSON.stringify(right);

      if (record.entityType === 'tag') {
        const snapshot = JSON.parse(record.snapshotJson) as {
          version: number;
          entityType: 'tag';
          before: { tags: Row[]; aliases: Row[]; workTags: Row[] };
          applied: { tags: Row[]; aliases: Row[]; workTags: Row[] };
        };
        const current = {
          tags: this.sqlite
            .prepare('SELECT * FROM research_tags WHERE id IN (?, ?) ORDER BY id')
            .all(record.survivorId, record.mergedId) as Row[],
          aliases: this.sqlite
            .prepare('SELECT * FROM research_tag_aliases WHERE tag_id IN (?, ?) ORDER BY id')
            .all(record.survivorId, record.mergedId) as Row[],
          workTags: this.sqlite
            .prepare('SELECT * FROM research_work_tags WHERE tag_id IN (?, ?) ORDER BY id')
            .all(record.survivorId, record.mergedId) as Row[],
        };
        if (
          !same(current.tags, snapshot.applied.tags) ||
          !same(current.aliases, snapshot.applied.aliases) ||
          !same(current.workTags, snapshot.applied.workTags)
        ) {
          return null;
        }
        this.sqlite
          .prepare('DELETE FROM research_work_tags WHERE tag_id IN (?, ?)')
          .run(record.survivorId, record.mergedId);
        this.sqlite
          .prepare('DELETE FROM research_tag_aliases WHERE tag_id IN (?, ?)')
          .run(record.survivorId, record.mergedId);
        const updateTag = this.sqlite.prepare(
          `UPDATE research_tags
           SET name = ?, normalized_name = ?, color = ?, description = ?, created_at = ?,
               updated_at = ?, trashed_at = ? WHERE id = ?`,
        );
        for (const row of snapshot.before.tags) {
          updateTag.run(
            text(row, 'name'),
            text(row, 'normalized_name'),
            nullableText(row, 'color'),
            nullableText(row, 'description'),
            text(row, 'created_at'),
            text(row, 'updated_at'),
            nullableText(row, 'trashed_at'),
            text(row, 'id'),
          );
        }
        const insertAlias = this.sqlite.prepare(
          `INSERT INTO research_tag_aliases
           (id, tag_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.aliases) {
          insertAlias.run(
            text(row, 'id'),
            text(row, 'tag_id'),
            text(row, 'name'),
            text(row, 'normalized_name'),
            text(row, 'created_at'),
          );
        }
        const insertWorkTag = this.sqlite.prepare(
          `INSERT INTO research_work_tags (id, work_id, tag_id, created_at) VALUES (?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.workTags) {
          insertWorkTag.run(
            text(row, 'id'),
            text(row, 'work_id'),
            text(row, 'tag_id'),
            text(row, 'created_at'),
          );
        }
      } else {
        const snapshot = JSON.parse(record.snapshotJson) as {
          version: number;
          entityType: 'work';
          before: {
            works: Row[];
            editions: Row[];
            collectionEntries: Row[];
            workTags: Row[];
            workRelations: Row[];
            assertions: Row[];
            sourceMaps: Row[];
            identifiers: Row[];
            importItems: Row[];
          };
          applied: {
            works: Row[];
            editions: Row[];
            collectionEntries: Row[];
            workTags: Row[];
            workRelations: Row[];
            assertions: Row[];
            sourceMaps: Row[];
            identifiers: Row[];
            importItems: Row[];
          };
        };
        const editionIds = snapshot.before.editions.map((edition) => text(edition, 'id'));
        const editionPlaceholders = editionIds.map(() => '?').join(', ');
        const query = (table: string, predicate: string, ...params: string[]) =>
          this.sqlite
            .prepare(`SELECT * FROM ${table} WHERE ${predicate} ORDER BY id`)
            .all(...params) as Row[];
        const current = {
          works: query('research_works', 'id IN (?, ?)', record.survivorId, record.mergedId),
          editions:
            editionIds.length === 0
              ? []
              : query('research_editions', `id IN (${editionPlaceholders})`, ...editionIds),
          collectionEntries: query(
            'research_collection_entries',
            'work_id IN (?, ?)',
            record.survivorId,
            record.mergedId,
          ),
          workTags: query(
            'research_work_tags',
            'work_id IN (?, ?)',
            record.survivorId,
            record.mergedId,
          ),
          workRelations: query(
            'research_work_relations',
            'source_work_id IN (?, ?) OR target_work_id IN (?, ?)',
            record.survivorId,
            record.mergedId,
            record.survivorId,
            record.mergedId,
          ),
          assertions: query(
            'research_metadata_assertions',
            "entity_type = 'work' AND entity_id IN (?, ?)",
            record.survivorId,
            record.mergedId,
          ),
          sourceMaps: query(
            'research_external_source_maps',
            "entity_type = 'work' AND entity_id IN (?, ?)",
            record.survivorId,
            record.mergedId,
          ),
          identifiers: query(
            'research_identifiers',
            "entity_type = 'work' AND entity_id IN (?, ?)",
            record.survivorId,
            record.mergedId,
          ),
          importItems: query(
            'research_import_items',
            'work_id IN (?, ?)',
            record.survivorId,
            record.mergedId,
          ),
        };
        if (
          (Object.keys(current) as Array<keyof typeof current>).some(
            (key) => !same(current[key], snapshot.applied[key]),
          )
        ) {
          return null;
        }

        for (const [table, predicate] of [
          ['research_collection_entries', 'work_id IN (?, ?)'],
          ['research_work_tags', 'work_id IN (?, ?)'],
          ['research_work_relations', 'source_work_id IN (?, ?) OR target_work_id IN (?, ?)'],
          ['research_metadata_assertions', "entity_type = 'work' AND entity_id IN (?, ?)"],
          ['research_external_source_maps', "entity_type = 'work' AND entity_id IN (?, ?)"],
          ['research_identifiers', "entity_type = 'work' AND entity_id IN (?, ?)"],
        ] as const) {
          const params = predicate.includes('OR')
            ? [record.survivorId, record.mergedId, record.survivorId, record.mergedId]
            : [record.survivorId, record.mergedId];
          this.sqlite.prepare(`DELETE FROM ${table} WHERE ${predicate}`).run(...params);
        }

        const updateWork = this.sqlite.prepare(
          `UPDATE research_works
           SET type = ?, title = ?, title_sort = ?, abstract = ?, year = ?,
               preferred_edition_id = ?, status = ?, redirect_to_work_id = ?, revision = ?,
               created_at = ?, updated_at = ?, trashed_at = ? WHERE id = ?`,
        );
        for (const row of snapshot.before.works) {
          updateWork.run(
            text(row, 'type'),
            text(row, 'title'),
            text(row, 'title_sort'),
            nullableText(row, 'abstract'),
            nullableInteger(row, 'year'),
            nullableText(row, 'preferred_edition_id'),
            text(row, 'status'),
            nullableText(row, 'redirect_to_work_id'),
            integer(row, 'revision'),
            text(row, 'created_at'),
            text(row, 'updated_at'),
            nullableText(row, 'trashed_at'),
            text(row, 'id'),
          );
        }
        const updateEdition = this.sqlite.prepare(
          'UPDATE research_editions SET work_id = ? WHERE id = ?',
        );
        for (const row of snapshot.before.editions) {
          updateEdition.run(text(row, 'work_id'), text(row, 'id'));
        }
        this.sqlite
          .prepare('UPDATE research_import_items SET work_id = NULL WHERE work_id IN (?, ?)')
          .run(record.survivorId, record.mergedId);
        const updateImportItem = this.sqlite.prepare(
          'UPDATE research_import_items SET work_id = ? WHERE id = ?',
        );
        for (const row of snapshot.before.importItems) {
          updateImportItem.run(nullableText(row, 'work_id'), text(row, 'id'));
        }

        const insertCollection = this.sqlite.prepare(
          `INSERT INTO research_collection_entries
           (id, collection_id, work_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.collectionEntries) {
          insertCollection.run(
            text(row, 'id'),
            text(row, 'collection_id'),
            text(row, 'work_id'),
            integer(row, 'sort_order'),
            text(row, 'created_at'),
          );
        }
        const insertWorkTag = this.sqlite.prepare(
          `INSERT INTO research_work_tags (id, work_id, tag_id, created_at) VALUES (?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.workTags) {
          insertWorkTag.run(
            text(row, 'id'),
            text(row, 'work_id'),
            text(row, 'tag_id'),
            text(row, 'created_at'),
          );
        }
        const insertRelation = this.sqlite.prepare(
          `INSERT INTO research_work_relations
           (id, source_work_id, target_work_id, kind, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.workRelations) {
          insertRelation.run(
            text(row, 'id'),
            text(row, 'source_work_id'),
            text(row, 'target_work_id'),
            text(row, 'kind'),
            nullableText(row, 'note'),
            text(row, 'created_at'),
          );
        }
        const insertAssertion = this.sqlite.prepare(
          `INSERT INTO research_metadata_assertions
           (id, entity_type, entity_id, field_name, value_json, normalized_value, source_kind,
            source_record_id, observed_at, is_user_confirmed, is_selected, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.assertions) {
          insertAssertion.run(
            text(row, 'id'),
            text(row, 'entity_type'),
            text(row, 'entity_id'),
            text(row, 'field_name'),
            text(row, 'value_json'),
            nullableText(row, 'normalized_value'),
            text(row, 'source_kind'),
            nullableText(row, 'source_record_id'),
            text(row, 'observed_at'),
            integer(row, 'is_user_confirmed'),
            integer(row, 'is_selected'),
            text(row, 'created_at'),
          );
        }
        const insertSourceMap = this.sqlite.prepare(
          `INSERT INTO research_external_source_maps
           (id, provider, external_id, entity_type, entity_id, last_fetched_at, cache_status,
            cache_expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.sourceMaps) {
          insertSourceMap.run(
            text(row, 'id'),
            text(row, 'provider'),
            text(row, 'external_id'),
            text(row, 'entity_type'),
            text(row, 'entity_id'),
            nullableText(row, 'last_fetched_at'),
            text(row, 'cache_status'),
            nullableText(row, 'cache_expires_at'),
            text(row, 'created_at'),
            text(row, 'updated_at'),
          );
        }
        const insertIdentifier = this.sqlite.prepare(
          `INSERT INTO research_identifiers
           (id, entity_type, entity_id, scheme, value, normalized_value, source_record_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of snapshot.before.identifiers) {
          insertIdentifier.run(
            text(row, 'id'),
            text(row, 'entity_type'),
            text(row, 'entity_id'),
            text(row, 'scheme'),
            text(row, 'value'),
            text(row, 'normalized_value'),
            nullableText(row, 'source_record_id'),
            text(row, 'created_at'),
          );
        }
      }

      const revertedAt = this.clock();
      const reverted = this.sqlite
        .prepare(
          `UPDATE research_merge_records SET status = 'reverted', reverted_at = ?
           WHERE id = ? AND status = 'merged' RETURNING *`,
        )
        .get(revertedAt, id) as Row | undefined;
      return reverted ? toMergeRecord(reverted) : null;
    })();
  }

  async exportCanonicalSnapshot(exportedAt: string): Promise<CanonicalResearchLibrary> {
    const rows = (table: string) =>
      this.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Row[];
    return canonicalResearchLibrarySchema.parse({
      schemaVersion: 1,
      exportedAt,
      generator: 'personal-workbench/research',
      works: rows('research_works').map((row) => ({
        id: text(row, 'id'),
        type: text(row, 'type'),
        title: text(row, 'title'),
        titleSort: text(row, 'title_sort'),
        abstract: nullableText(row, 'abstract'),
        year: nullableInteger(row, 'year'),
        preferredEditionId: nullableText(row, 'preferred_edition_id'),
        status: text(row, 'status'),
        redirectToWorkId: nullableText(row, 'redirect_to_work_id'),
        revision: integer(row, 'revision'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
        trashedAt: nullableText(row, 'trashed_at'),
      })),
      editions: rows('research_editions').map((row) => ({
        id: text(row, 'id'),
        workId: text(row, 'work_id'),
        kind: text(row, 'kind'),
        title: text(row, 'title'),
        publicationTitle: nullableText(row, 'publication_title'),
        publisher: nullableText(row, 'publisher'),
        publishedDate: nullableText(row, 'published_date'),
        volume: nullableText(row, 'volume'),
        issue: nullableText(row, 'issue'),
        pages: nullableText(row, 'pages'),
        revision: integer(row, 'revision'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
      })),
      contributors: rows('research_contributors').map((row) => ({
        id: text(row, 'id'),
        editionId: text(row, 'edition_id'),
        role: text(row, 'role'),
        displayName: text(row, 'display_name'),
        givenName: nullableText(row, 'given_name'),
        familyName: nullableText(row, 'family_name'),
        orcid: nullableText(row, 'orcid'),
        sequence: integer(row, 'sequence'),
      })),
      identifiers: rows('research_identifiers').map((row) => ({
        id: text(row, 'id'),
        entityType: text(row, 'entity_type'),
        entityId: text(row, 'entity_id'),
        scheme: text(row, 'scheme'),
        value: text(row, 'value'),
        normalizedValue: text(row, 'normalized_value'),
        sourceRecordId: nullableText(row, 'source_record_id'),
        createdAt: text(row, 'created_at'),
      })),
      collections: rows('research_collections').map((row) => ({
        id: text(row, 'id'),
        parentId: nullableText(row, 'parent_id'),
        name: text(row, 'name'),
        normalizedName: text(row, 'normalized_name'),
        kind: text(row, 'kind'),
        queryAst: nullableText(row, 'query_json') ? JSON.parse(text(row, 'query_json')) : null,
        sortOrder: integer(row, 'sort_order'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
        trashedAt: nullableText(row, 'trashed_at'),
      })),
      collectionEntries: rows('research_collection_entries').map((row) => ({
        id: text(row, 'id'),
        collectionId: text(row, 'collection_id'),
        workId: text(row, 'work_id'),
        sortOrder: integer(row, 'sort_order'),
        createdAt: text(row, 'created_at'),
      })),
      tags: rows('research_tags').map((row) => ({
        id: text(row, 'id'),
        name: text(row, 'name'),
        normalizedName: text(row, 'normalized_name'),
        color: nullableText(row, 'color'),
        description: nullableText(row, 'description'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
        trashedAt: nullableText(row, 'trashed_at'),
      })),
      tagAliases: rows('research_tag_aliases').map((row) => ({
        id: text(row, 'id'),
        tagId: text(row, 'tag_id'),
        name: text(row, 'name'),
        normalizedName: text(row, 'normalized_name'),
        createdAt: text(row, 'created_at'),
      })),
      workTags: rows('research_work_tags').map((row) => ({
        id: text(row, 'id'),
        workId: text(row, 'work_id'),
        tagId: text(row, 'tag_id'),
        createdAt: text(row, 'created_at'),
      })),
      workRelations: rows('research_work_relations').map((row) => ({
        id: text(row, 'id'),
        sourceWorkId: text(row, 'source_work_id'),
        targetWorkId: text(row, 'target_work_id'),
        kind: text(row, 'kind'),
        note: nullableText(row, 'note'),
        createdAt: text(row, 'created_at'),
      })),
      sourceRecords: rows('research_source_records').map((row) => ({
        id: text(row, 'id'),
        provider: text(row, 'provider'),
        sourceLocator: nullableText(row, 'source_locator'),
        rawFormat: text(row, 'raw_format'),
        rawPayload: text(row, 'raw_payload'),
        parserVersion: text(row, 'parser_version'),
        observedAt: text(row, 'observed_at'),
        createdAt: text(row, 'created_at'),
      })),
      metadataAssertions: rows('research_metadata_assertions').map((row) => ({
        id: text(row, 'id'),
        entityType: text(row, 'entity_type'),
        entityId: text(row, 'entity_id'),
        fieldName: text(row, 'field_name'),
        value: JSON.parse(text(row, 'value_json')),
        normalizedValue: nullableText(row, 'normalized_value'),
        sourceKind: text(row, 'source_kind'),
        sourceRecordId: nullableText(row, 'source_record_id'),
        observedAt: text(row, 'observed_at'),
        isUserConfirmed: integer(row, 'is_user_confirmed') === 1,
        isSelected: integer(row, 'is_selected') === 1,
        createdAt: text(row, 'created_at'),
      })),
      externalSourceMaps: rows('research_external_source_maps').map((row) => ({
        id: text(row, 'id'),
        provider: text(row, 'provider'),
        externalId: text(row, 'external_id'),
        entityType: text(row, 'entity_type'),
        entityId: text(row, 'entity_id'),
        lastFetchedAt: nullableText(row, 'last_fetched_at'),
        cacheStatus: text(row, 'cache_status'),
        cacheExpiresAt: nullableText(row, 'cache_expires_at'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
      })),
      assets: rows('research_assets').map((row) => ({
        id: text(row, 'id'),
        hashAlgorithm: text(row, 'hash_algorithm'),
        contentHash: text(row, 'content_hash'),
        byteSize: integer(row, 'byte_size'),
        mimeType: text(row, 'mime_type'),
        state: text(row, 'state'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
        recycledAt: nullableText(row, 'recycled_at'),
      })),
      locations: rows('research_asset_locations').map((row) => ({
        id: text(row, 'id'),
        assetId: text(row, 'asset_id'),
        mode: text(row, 'mode'),
        originalPath: text(row, 'original_path'),
        resolvedPath: text(row, 'resolved_path'),
        objectKey: nullableText(row, 'object_key'),
        state: text(row, 'state'),
        deviceId: nullableText(row, 'device_id'),
        fileId: nullableText(row, 'file_id'),
        observedSize: nullableInteger(row, 'observed_size'),
        observedMtimeMs: nullableInteger(row, 'observed_mtime_ms'),
        errorCode: nullableText(row, 'error_code'),
        lastCheckedAt: nullableText(row, 'last_checked_at'),
        createdAt: text(row, 'created_at'),
        updatedAt: text(row, 'updated_at'),
        recycledAt: nullableText(row, 'recycled_at'),
      })),
      attachments: rows('research_attachments').map((row) => ({
        id: text(row, 'id'),
        editionId: text(row, 'edition_id'),
        assetId: text(row, 'asset_id'),
        role: text(row, 'role'),
        displayName: text(row, 'display_name'),
        status: text(row, 'status'),
        createdAt: text(row, 'created_at'),
        recycledAt: nullableText(row, 'recycled_at'),
      })),
    });
  }

  async createExportJob(draft: ExportJobDraft): Promise<ExportJobRecord> {
    const timestamp = this.clock();
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_export_jobs
         (id, status, options_json, target_path, manifest_json, created_at, updated_at)
         VALUES (?, 'draft', ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        draft.id,
        draft.optionsJson,
        draft.targetPath,
        draft.manifestJson,
        timestamp,
        timestamp,
      ) as Row;
    return toExportJob(row);
  }

  async getExportJob(id: string): Promise<ExportJobRecord | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_export_jobs WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toExportJob(row) : null;
  }

  async updateExportJob(id: string, changes: ExportJobChanges): Promise<ExportJobRecord | null> {
    const current = await this.getExportJob(id);
    if (!current) return null;
    const row = this.sqlite
      .prepare(
        `UPDATE research_export_jobs
         SET status = ?, manifest_json = ?, error_code = ?, completed_at = ?, updated_at = ?
         WHERE id = ? RETURNING *`,
      )
      .get(
        changes.status ?? current.status,
        changes.manifestJson ?? current.manifestJson,
        changes.errorCode === undefined ? current.errorCode : changes.errorCode,
        changes.completedAt === undefined ? current.completedAt : changes.completedAt,
        this.clock(),
        id,
      ) as Row | undefined;
    return row ? toExportJob(row) : null;
  }

  async createManagedRootMigrationJob(
    draft: ManagedRootMigrationJobDraft,
  ): Promise<ManagedRootMigrationJobRecord> {
    const timestamp = this.clock();
    const row = this.sqlite
      .prepare(
        `INSERT INTO research_managed_root_migrations
         (id, status, source_root, target_root, total_objects, copied_objects,
          total_bytes, copied_bytes, created_at, updated_at)
         VALUES (?, 'draft', ?, ?, ?, 0, ?, 0, ?, ?) RETURNING *`,
      )
      .get(
        draft.id,
        draft.sourceRoot,
        draft.targetRoot,
        draft.totalObjects,
        draft.totalBytes,
        timestamp,
        timestamp,
      ) as Row;
    return toManagedRootMigrationJob(row);
  }

  async getManagedRootMigrationJob(id: string): Promise<ManagedRootMigrationJobRecord | null> {
    const row = this.sqlite
      .prepare('SELECT * FROM research_managed_root_migrations WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toManagedRootMigrationJob(row) : null;
  }

  async getLatestManagedRootMigrationJob(): Promise<ManagedRootMigrationJobRecord | null> {
    const row = this.sqlite
      .prepare(
        `SELECT * FROM research_managed_root_migrations
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get() as Row | undefined;
    return row ? toManagedRootMigrationJob(row) : null;
  }

  async updateManagedRootMigrationJob(
    id: string,
    changes: ManagedRootMigrationJobChanges,
  ): Promise<ManagedRootMigrationJobRecord | null> {
    const current = await this.getManagedRootMigrationJob(id);
    if (!current) return null;
    const row = this.sqlite
      .prepare(
        `UPDATE research_managed_root_migrations
         SET status = ?, total_objects = ?, copied_objects = ?, total_bytes = ?, copied_bytes = ?,
             error_code = ?, completed_at = ?, updated_at = ?
         WHERE id = ? RETURNING *`,
      )
      .get(
        changes.status ?? current.status,
        changes.totalObjects ?? current.totalObjects,
        changes.copiedObjects ?? current.copiedObjects,
        changes.totalBytes ?? current.totalBytes,
        changes.copiedBytes ?? current.copiedBytes,
        changes.errorCode === undefined ? current.errorCode : changes.errorCode,
        changes.completedAt === undefined ? current.completedAt : changes.completedAt,
        this.clock(),
        id,
      ) as Row | undefined;
    return row ? toManagedRootMigrationJob(row) : null;
  }
}

export class SqliteResearchManagedRootController implements ManagedRootController {
  constructor(
    private readonly getSqlite: () => Database.Database,
    private readonly defaultRoot: () => string,
    private readonly clock: () => string = defaultClock,
  ) {}

  current(): string {
    const row = this.getSqlite()
      .prepare("SELECT active_root FROM research_storage_config WHERE id = 'active'")
      .get() as { active_root: string } | undefined;
    return resolve(row?.active_root ?? this.defaultRoot());
  }

  async switchRoot(sourceRoot: string, targetRoot: string): Promise<boolean> {
    const source = resolve(sourceRoot);
    const target = resolve(targetRoot);
    return this.getSqlite().transaction(() => {
      if (this.current() !== source) return false;
      const locations = this.getSqlite()
        .prepare(
          `SELECT id, object_key FROM research_asset_locations
           WHERE mode = 'managed' AND object_key IS NOT NULL`,
        )
        .all() as Array<{ id: string; object_key: string }>;
      const updateLocation = this.getSqlite().prepare(
        `UPDATE research_asset_locations SET resolved_path = ?, updated_at = ? WHERE id = ?`,
      );
      const timestamp = this.clock();
      for (const location of locations) {
        updateLocation.run(join(target, ...location.object_key.split('/')), timestamp, location.id);
      }
      this.getSqlite()
        .prepare(
          `INSERT INTO research_storage_config (id, active_root, updated_at)
           VALUES ('active', ?, ?)
           ON CONFLICT(id) DO UPDATE SET active_root = excluded.active_root,
             updated_at = excluded.updated_at`,
        )
        .run(target, timestamp);
      return true;
    })();
  }
}
