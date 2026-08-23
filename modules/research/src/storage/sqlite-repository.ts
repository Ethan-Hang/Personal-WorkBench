import type Database from 'better-sqlite3';
import type {
  AssetLocationDraft,
  AssetLocationRecord,
  AssetRecord,
  AttachmentRecord,
  CollectionDraft,
  CollectionRecord,
  CommitImportDraft,
  CommitImportResult,
  ContributorRecord,
  DeletionImpact,
  EditionRecord,
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
  WorkListRecord,
  WorkPage,
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
} from '../contract.js';

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

/** SQLite 只存在于 storage 适配器内，连接在组合根按当前账号动态注入。 */
export class SqliteResearchRepository implements ResearchRepository {
  constructor(
    private readonly getSqlite: () => Database.Database,
    private readonly clock: () => string = defaultClock,
  ) {}

  private get sqlite(): Database.Database {
    return this.getSqlite();
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
    };
  }

  async listWorks(query: ListWorksQuery): Promise<WorkPage> {
    const conditions = ['w.status = ?'];
    const params: unknown[] = [query.status];
    if (query.collectionId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM research_collection_entries ce
                 WHERE ce.work_id = w.id AND ce.collection_id = ?)`,
      );
      params.push(query.collectionId);
    }
    if (query.query) {
      conditions.push('(lower(w.title) LIKE ? OR CAST(w.year AS TEXT) = ?)');
      params.push(`%${query.query.toLowerCase()}%`, query.query);
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      conditions.push('(w.updated_at < ? OR (w.updated_at = ? AND w.id < ?))');
      params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
    }

    // fileStatus 是聚合结果；多取几批再过滤，避免把过滤逻辑复制进复杂 SQL。
    const fetchLimit = query.fileStatus ? Math.min((query.limit + 1) * 8, 1000) : query.limit + 1;
    params.push(fetchLimit);
    const rows = this.sqlite
      .prepare(
        `SELECT w.* FROM research_works w
         WHERE ${conditions.join(' AND ')}
         ORDER BY w.updated_at DESC, w.id DESC
         LIMIT ?`,
      )
      .all(...params) as Row[];
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
      };
    });
    const filtered = query.fileStatus
      ? decorated.filter((record) => record.fileStatus === query.fileStatus)
      : decorated;
    const page = filtered.slice(0, query.limit);
    const nextCursor =
      filtered.length > query.limit && page.length > 0 ? encodeCursor(page.at(-1)!) : null;
    return { works: page, nextCursor };
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
         (id, parent_id, name, normalized_name, kind, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'manual', ?, ?, ?) RETURNING *`,
      )
      .get(
        draft.id,
        draft.parentId,
        draft.name,
        draft.normalizedName,
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
}
