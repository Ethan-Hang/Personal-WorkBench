import type Database from 'better-sqlite3';
import {
  evidenceSourceSnapshotSchema,
  type Annotation,
  type Evidence,
  type EvidenceSourceState,
  type KnowledgeBasicStatus,
  type KnowledgeRevision,
  type KnowledgeRevisionReason,
  type NoteLink,
  type ResearchNote,
} from '../contract.js';
import type {
  DirectEvidenceDraft,
  DirectEvidenceResult,
  EvidenceChanges,
  EvidenceDraft,
  EvidenceListQuery,
  EvidenceRebindChanges,
  KnowledgeChangeResult,
  KnowledgeCreateResult,
  KnowledgeListQuery,
  KnowledgePage,
  KnowledgeRepository,
  KnowledgeRevisionDraft,
  KnowledgeAnnotationSource,
  KnowledgeAssetSource,
  OcrSourceIdentity,
  NoteChanges,
  NoteDraft,
  NoteLinkDraft,
} from '../knowledge/repository.js';
import { evidenceSourceState } from '../knowledge/source-state.js';

type Row = Record<string, unknown>;
type ContextState = 'active' | 'missing' | 'archived';

function requiredText(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new TypeError(`Expected ${key} to be text`);
  return value;
}

function nullableText(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new TypeError(`Expected ${key} to be nullable text`);
  return value;
}

function requiredNumber(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') throw new TypeError(`Expected ${key} to be numeric`);
  return value;
}

function isConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? String(error.code) : '';
  return code.startsWith('SQLITE_CONSTRAINT') || /constraint|unique/i.test(error.message);
}

function toResearchNote(row: Row): ResearchNote {
  return {
    id: requiredText(row, 'id'),
    contextId: nullableText(row, 'context_id'),
    title: requiredText(row, 'title'),
    body: requiredText(row, 'body'),
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toAnnotation(row: Row): Annotation {
  return {
    id: requiredText(row, 'id'),
    assetId: requiredText(row, 'asset_id'),
    editionId: nullableText(row, 'edition_id'),
    contextId: nullableText(row, 'context_id'),
    kind: requiredText(row, 'kind') as Annotation['kind'],
    pageNumber: requiredNumber(row, 'page_number'),
    anchor: JSON.parse(requiredText(row, 'anchor_json')) as Annotation['anchor'],
    body: nullableText(row, 'body'),
    color: nullableText(row, 'color'),
    status: requiredText(row, 'status') as Annotation['status'],
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function evidenceState(row: Row, snapshot: Evidence['sourceSnapshot']): EvidenceSourceState {
  const engine = nullableText(row, 'current_ocr_engine');
  const currentOcr = engine
    ? {
        engine,
        engineVersion: requiredText(row, 'current_ocr_engine_version'),
        languagePackVersion: requiredText(row, 'current_ocr_language_pack_version'),
        languagesKey: requiredText(row, 'current_ocr_languages_key'),
      }
    : null;
  return evidenceSourceState({
    snapshot,
    sourceAvailable: requiredNumber(row, 'source_available') === 1,
    currentAssetHash: requiredText(row, 'current_asset_hash'),
    annotationStatus: requiredText(row, 'annotation_status') as
      KnowledgeBasicStatus | 'needs-review',
    annotationRevision: requiredNumber(row, 'annotation_revision'),
    currentOcr,
  });
}

function toEvidence(row: Row): Evidence {
  const snapshot = evidenceSourceSnapshotSchema.parse(
    JSON.parse(requiredText(row, 'source_snapshot_json')),
  );
  return {
    id: requiredText(row, 'id'),
    contextId: nullableText(row, 'context_id'),
    workId: requiredText(row, 'work_id'),
    editionId: nullableText(row, 'edition_id'),
    assetId: requiredText(row, 'asset_id'),
    annotationId: requiredText(row, 'annotation_id'),
    sourceSnapshot: snapshot,
    sourceState: evidenceState(row, snapshot),
    title: nullableText(row, 'title'),
    summary: requiredText(row, 'summary'),
    notes: nullableText(row, 'notes'),
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toNoteLink(row: Row): NoteLink {
  const workId = nullableText(row, 'work_id');
  const annotationId = nullableText(row, 'annotation_id');
  const evidenceId = nullableText(row, 'evidence_id');
  const target = workId
    ? ({ kind: 'work', workId } as const)
    : annotationId
      ? ({ kind: 'annotation', annotationId } as const)
      : ({ kind: 'evidence', evidenceId: evidenceId ?? '' } as const);
  return {
    id: requiredText(row, 'id'),
    noteId: requiredText(row, 'note_id'),
    target,
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toKnowledgeRevision(row: Row): KnowledgeRevision {
  return {
    id: requiredText(row, 'id'),
    entityType: requiredText(row, 'entity_type') as KnowledgeRevision['entityType'],
    entityId: requiredText(row, 'entity_id'),
    revision: requiredNumber(row, 'revision'),
    snapshot: JSON.parse(requiredText(row, 'snapshot_json')) as unknown,
    reason: requiredText(row, 'reason') as KnowledgeRevisionReason,
    createdAt: requiredText(row, 'created_at'),
  };
}

const evidenceStateSql = `CASE
  WHEN asset.state <> 'active'
    OR NOT EXISTS (
      SELECT 1 FROM research_asset_locations location
      WHERE location.asset_id = e.asset_id AND location.state = 'available'
    )
    OR NOT EXISTS (
      SELECT 1 FROM research_attachments source_attachment
      WHERE source_attachment.asset_id = e.asset_id
        AND source_attachment.edition_id = e.edition_id
        AND source_attachment.status = 'active'
    ) THEN 'source-unavailable'
  WHEN asset.content_hash <> json_extract(e.source_snapshot_json, '$.assetHash')
    THEN 'asset-mismatch'
  WHEN annotation.status = 'deleted' THEN 'annotation-deleted'
  WHEN annotation.revision <> json_extract(e.source_snapshot_json, '$.annotationRevision')
    THEN 'annotation-revised'
  WHEN json_extract(e.source_snapshot_json, '$.sourceKind') = 'ocr' AND (
    COALESCE((SELECT cache.engine FROM research_ocr_page_cache cache
      WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
        AND cache.page_number = annotation.page_number
      ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1), '')
      <> COALESCE(json_extract(e.source_snapshot_json, '$.ocr.engine'), '')
    OR COALESCE((SELECT cache.engine_version FROM research_ocr_page_cache cache
      WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
        AND cache.page_number = annotation.page_number
      ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1), '')
      <> COALESCE(json_extract(e.source_snapshot_json, '$.ocr.engineVersion'), '')
    OR COALESCE((SELECT cache.language_pack_version FROM research_ocr_page_cache cache
      WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
        AND cache.page_number = annotation.page_number
      ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1), '')
      <> COALESCE(json_extract(e.source_snapshot_json, '$.ocr.languagePackVersion'), '')
    OR COALESCE((SELECT cache.languages_key FROM research_ocr_page_cache cache
      WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
        AND cache.page_number = annotation.page_number
      ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1), '')
      <> COALESCE(json_extract(e.source_snapshot_json, '$.ocr.languagesKey'), '')
  ) THEN 'annotation-revised'
  ELSE 'current'
END`;

const evidenceSelect = `
  SELECT e.*,
         annotation.status AS annotation_status,
         annotation.revision AS annotation_revision,
         asset.content_hash AS current_asset_hash,
         CASE WHEN asset.state = 'active' AND EXISTS (
           SELECT 1 FROM research_asset_locations location
           WHERE location.asset_id = e.asset_id AND location.state = 'available'
         ) AND EXISTS (
           SELECT 1 FROM research_attachments source_attachment
           WHERE source_attachment.asset_id = e.asset_id
             AND source_attachment.edition_id = e.edition_id
             AND source_attachment.status = 'active'
         ) THEN 1 ELSE 0 END AS source_available,
         (SELECT cache.engine FROM research_ocr_page_cache cache
          WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
            AND cache.page_number = annotation.page_number
          ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1) AS current_ocr_engine,
         (SELECT cache.engine_version FROM research_ocr_page_cache cache
          WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
            AND cache.page_number = annotation.page_number
          ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1) AS current_ocr_engine_version,
         (SELECT cache.language_pack_version FROM research_ocr_page_cache cache
          WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
            AND cache.page_number = annotation.page_number
          ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1) AS current_ocr_language_pack_version,
         (SELECT cache.languages_key FROM research_ocr_page_cache cache
          WHERE cache.asset_id = e.asset_id AND cache.asset_hash = asset.content_hash
            AND cache.page_number = annotation.page_number
          ORDER BY cache.updated_at DESC, cache.languages_key DESC LIMIT 1) AS current_ocr_languages_key,
         ${evidenceStateSql} AS source_state
  FROM research_evidence e
  JOIN research_annotations annotation ON annotation.id = e.annotation_id
  JOIN research_assets asset ON asset.id = e.asset_id`;

export class SqliteKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly getSqlite: () => Database.Database,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  private get sqlite(): Database.Database {
    return this.getSqlite();
  }

  private contextState(contextId: string | null): ContextState {
    if (contextId === null) return 'active';
    const row = this.sqlite
      .prepare('SELECT status FROM research_reading_contexts WHERE id = ?')
      .get(contextId) as { status: string } | undefined;
    if (!row) return 'missing';
    return row.status === 'active' ? 'active' : 'archived';
  }

  private ocrSource(
    assetId: string,
    assetHash: string,
    pageNumber: number,
  ): OcrSourceIdentity | null {
    const row = this.sqlite
      .prepare(
        `SELECT engine, engine_version, language_pack_version, languages_key
         FROM research_ocr_page_cache
         WHERE asset_id = ? AND asset_hash = ? AND page_number = ?
         ORDER BY updated_at DESC, languages_key DESC LIMIT 1`,
      )
      .get(assetId, assetHash, pageNumber) as Row | undefined;
    return row
      ? {
          engine: requiredText(row, 'engine'),
          engineVersion: requiredText(row, 'engine_version'),
          languagePackVersion: requiredText(row, 'language_pack_version'),
          languagesKey: requiredText(row, 'languages_key'),
        }
      : null;
  }

  async getAnnotationSource(annotationId: string): Promise<KnowledgeAnnotationSource | null> {
    const row = this.sqlite
      .prepare(
        `SELECT annotation.*, work.id AS source_work_id, work.title AS source_work_title,
                edition.id AS source_edition_id, edition.title AS source_edition_title,
                asset.content_hash AS source_asset_hash
         FROM research_annotations annotation
         JOIN research_assets asset ON asset.id = annotation.asset_id
         JOIN research_editions edition ON edition.id = COALESCE(
           annotation.edition_id,
           (SELECT attachment.edition_id FROM research_attachments attachment
            WHERE attachment.asset_id = annotation.asset_id AND attachment.status = 'active'
            ORDER BY CASE attachment.role WHEN 'primary-pdf' THEN 0 ELSE 1 END,
                     attachment.edition_id LIMIT 1)
         )
         JOIN research_works work ON work.id = edition.work_id
         WHERE annotation.id = ? AND asset.state = 'active'`,
      )
      .get(annotationId) as Row | undefined;
    if (!row) return null;
    const annotation = toAnnotation(row);
    const assetHash = requiredText(row, 'source_asset_hash');
    return {
      annotation,
      workId: requiredText(row, 'source_work_id'),
      workTitle: requiredText(row, 'source_work_title'),
      editionId: requiredText(row, 'source_edition_id'),
      editionTitle: nullableText(row, 'source_edition_title'),
      assetId: annotation.assetId,
      assetHash,
      ocr: this.ocrSource(annotation.assetId, assetHash, annotation.pageNumber),
    };
  }

  async getAssetSource(
    assetId: string,
    editionId: string | null,
    pageNumber: number,
  ): Promise<KnowledgeAssetSource | null> {
    const row = this.sqlite
      .prepare(
        `SELECT work.id AS source_work_id, work.title AS source_work_title,
                edition.id AS source_edition_id, edition.title AS source_edition_title,
                asset.id AS source_asset_id, asset.content_hash AS source_asset_hash
         FROM research_assets asset
         JOIN research_editions edition ON edition.id = COALESCE(
           ?,
           (SELECT attachment.edition_id FROM research_attachments attachment
            WHERE attachment.asset_id = asset.id AND attachment.status = 'active'
            ORDER BY CASE attachment.role WHEN 'primary-pdf' THEN 0 ELSE 1 END,
                     attachment.edition_id LIMIT 1)
         )
         JOIN research_attachments attachment
           ON attachment.asset_id = asset.id AND attachment.edition_id = edition.id
          AND attachment.status = 'active'
         JOIN research_works work ON work.id = edition.work_id
         WHERE asset.id = ? AND asset.state = 'active'
         ORDER BY attachment.id LIMIT 1`,
      )
      .get(editionId, assetId) as Row | undefined;
    if (!row) return null;
    const assetHash = requiredText(row, 'source_asset_hash');
    return {
      workId: requiredText(row, 'source_work_id'),
      workTitle: requiredText(row, 'source_work_title'),
      editionId: requiredText(row, 'source_edition_id'),
      editionTitle: nullableText(row, 'source_edition_title'),
      assetId: requiredText(row, 'source_asset_id'),
      assetHash,
      ocr: this.ocrSource(assetId, assetHash, pageNumber),
    };
  }

  private contextFailure<T>(state: ContextState): KnowledgeCreateResult<T> | null {
    if (state === 'missing') return { kind: 'context-not-found' };
    if (state === 'archived') return { kind: 'context-archived' };
    return null;
  }

  private getEvidenceSync(id: string): Evidence | null {
    const row = this.sqlite.prepare(`${evidenceSelect} WHERE e.id = ?`).get(id) as Row | undefined;
    return row ? toEvidence(row) : null;
  }

  private insertRevision(
    entityType: 'note' | 'evidence' | 'note-link',
    entityId: string,
    revision: number,
    snapshot: unknown,
    reason: KnowledgeRevisionReason,
    revisionId: string,
    timestamp: string,
  ): void {
    this.sqlite
      .prepare(
        `INSERT INTO research_knowledge_revisions
         (id, entity_type, entity_id, revision, snapshot_json, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(revisionId, entityType, entityId, revision, JSON.stringify(snapshot), reason, timestamp);
  }

  private syncNoteSearch(note: ResearchNote): void {
    this.sqlite
      .prepare(
        `INSERT INTO research_knowledge_search
         (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
         VALUES ('note', ?, ?, NULL, ?, ?, ?, NULL, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           context_id = excluded.context_id, title = excluded.title, body = excluded.body,
           status = excluded.status, source_state = NULL, updated_at = excluded.updated_at`,
      )
      .run(note.id, note.contextId, note.title, note.body, note.status, note.updatedAt);
  }

  private syncEvidenceSearch(evidence: Evidence): void {
    this.sqlite
      .prepare(
        `INSERT INTO research_knowledge_search
         (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
         VALUES ('evidence', ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           context_id = excluded.context_id, work_id = excluded.work_id, title = excluded.title,
           body = excluded.body, status = excluded.status, source_state = excluded.source_state,
           updated_at = excluded.updated_at`,
      )
      .run(
        evidence.id,
        evidence.contextId,
        evidence.workId,
        evidence.title ?? evidence.sourceSnapshot.workTitle,
        [
          evidence.summary,
          evidence.notes ?? '',
          evidence.sourceSnapshot.anchor.textQuote?.exact ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
        evidence.status,
        evidence.sourceState,
        evidence.updatedAt,
      );
  }

  private sourceMatches(draft: EvidenceDraft): boolean {
    const row = this.sqlite
      .prepare(
        `SELECT annotation.asset_id, annotation.edition_id, annotation.context_id,
                annotation.page_number, annotation.revision, asset.content_hash,
                edition.id AS source_edition_id, edition.work_id AS edition_work_id
         FROM research_annotations annotation
         JOIN research_assets asset ON asset.id = annotation.asset_id
         LEFT JOIN research_editions edition ON edition.id = COALESCE(
           annotation.edition_id,
           (SELECT attachment.edition_id FROM research_attachments attachment
            WHERE attachment.asset_id = annotation.asset_id AND attachment.status = 'active'
            ORDER BY CASE attachment.role WHEN 'primary-pdf' THEN 0 ELSE 1 END,
                     attachment.edition_id LIMIT 1)
         )
         WHERE annotation.id = ?`,
      )
      .get(draft.annotationId) as Row | undefined;
    if (!row) return false;
    const snapshot = draft.sourceSnapshot;
    return (
      requiredText(row, 'asset_id') === draft.assetId &&
      nullableText(row, 'source_edition_id') === draft.editionId &&
      nullableText(row, 'edition_work_id') === draft.workId &&
      nullableText(row, 'context_id') === snapshot.contextId &&
      requiredNumber(row, 'page_number') === snapshot.pageNumber &&
      requiredNumber(row, 'revision') === snapshot.annotationRevision &&
      requiredText(row, 'content_hash') === snapshot.assetHash &&
      snapshot.annotationId === draft.annotationId &&
      snapshot.assetId === draft.assetId &&
      snapshot.editionId === draft.editionId &&
      snapshot.workId === draft.workId
    );
  }

  private noteLinkTargetExists(target: NoteLinkDraft['target']): boolean {
    if (target.kind === 'work') {
      return Boolean(
        this.sqlite
          .prepare("SELECT 1 FROM research_works WHERE id = ? AND status <> 'merged'")
          .get(target.workId),
      );
    }
    if (target.kind === 'annotation') {
      return Boolean(
        this.sqlite
          .prepare("SELECT 1 FROM research_annotations WHERE id = ? AND status <> 'deleted'")
          .get(target.annotationId),
      );
    }
    return Boolean(
      this.sqlite
        .prepare("SELECT 1 FROM research_evidence WHERE id = ? AND status <> 'deleted'")
        .get(target.evidenceId),
    );
  }

  async getNote(id: string): Promise<ResearchNote | null> {
    const row = this.sqlite.prepare('SELECT * FROM research_notes WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toResearchNote(row) : null;
  }

  async listNotes(query: KnowledgeListQuery): Promise<KnowledgePage<ResearchNote>> {
    const clauses = ['status = ?'];
    const params: unknown[] = [query.status];
    if ('contextId' in query) {
      if (query.contextId === null) clauses.push('context_id IS NULL');
      else {
        clauses.push('context_id = ?');
        params.push(query.contextId);
      }
    }
    if (query.before) {
      clauses.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
      params.push(query.before.updatedAt, query.before.updatedAt, query.before.id);
    }
    params.push(query.limit + 1);
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_notes WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const items = rows.slice(0, query.limit).map(toResearchNote);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async createNote(draft: NoteDraft): Promise<KnowledgeCreateResult<ResearchNote>> {
    const failure = this.contextFailure<ResearchNote>(this.contextState(draft.contextId));
    if (failure) return failure;
    try {
      return this.sqlite.transaction((): KnowledgeCreateResult<ResearchNote> => {
        const timestamp = this.clock();
        const row = this.sqlite
          .prepare(
            `INSERT INTO research_notes
             (id, context_id, title, body, status, revision, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, 'active', 1, ?, ?, NULL) RETURNING *`,
          )
          .get(draft.id, draft.contextId, draft.title, draft.body, timestamp, timestamp) as Row;
        const note = toResearchNote(row);
        this.syncNoteSearch(note);
        return { kind: 'created', value: note };
      })();
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateNote(id: string, changes: NoteChanges): Promise<KnowledgeChangeResult<ResearchNote>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<ResearchNote> => {
      const current = this.sqlite.prepare('SELECT * FROM research_notes WHERE id = ?').get(id) as
        Row | undefined;
      if (!current) return { kind: 'not-found' };
      const note = toResearchNote(current);
      if (note.revision !== changes.expectedRevision || note.status === 'deleted') {
        return { kind: 'conflict', current: note };
      }
      const currentContext = this.contextState(note.contextId);
      if (currentContext === 'missing') return { kind: 'context-not-found' };
      if (currentContext === 'archived') return { kind: 'context-archived' };
      const context = this.contextState(changes.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      this.insertRevision('note', id, note.revision, note, 'update', changes.revisionId, timestamp);
      const row = this.sqlite
        .prepare(
          `UPDATE research_notes SET context_id = ?, title = ?, body = ?, revision = revision + 1,
             updated_at = ? WHERE id = ? AND revision = ? RETURNING *`,
        )
        .get(
          changes.contextId,
          changes.title,
          changes.body,
          timestamp,
          id,
          changes.expectedRevision,
        ) as Row;
      const saved = toResearchNote(row);
      this.syncNoteSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteNote(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ResearchNote>> {
    return this.changeNoteStatus(id, draft, 'deleted');
  }

  async restoreNote(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ResearchNote>> {
    return this.changeNoteStatus(id, draft, 'active');
  }

  private changeNoteStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<ResearchNote> {
    return this.sqlite.transaction((): KnowledgeChangeResult<ResearchNote> => {
      const row = this.sqlite.prepare('SELECT * FROM research_notes WHERE id = ?').get(id) as
        Row | undefined;
      if (!row) return { kind: 'not-found' };
      const current = toResearchNote(row);
      const wrongState =
        status === 'deleted' ? current.status === 'deleted' : current.status !== 'deleted';
      if (current.revision !== draft.expectedRevision || wrongState) {
        return { kind: 'conflict', current };
      }
      const context = this.contextState(current.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      const reason = status === 'deleted' ? 'delete' : 'restore';
      this.insertRevision(
        'note',
        id,
        current.revision,
        current,
        reason,
        draft.revisionId,
        timestamp,
      );
      const savedRow = this.sqlite
        .prepare(
          `UPDATE research_notes SET status = ?, revision = revision + 1, updated_at = ?,
             deleted_at = ? WHERE id = ? AND revision = ? RETURNING *`,
        )
        .get(
          status,
          timestamp,
          status === 'deleted' ? timestamp : null,
          id,
          draft.expectedRevision,
        ) as Row;
      const saved = toResearchNote(savedRow);
      this.syncNoteSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async getEvidence(id: string): Promise<Evidence | null> {
    return this.getEvidenceSync(id);
  }

  async listEvidence(query: EvidenceListQuery): Promise<KnowledgePage<Evidence>> {
    const clauses = ['e.status = ?'];
    const params: unknown[] = [query.status];
    if ('contextId' in query) {
      if (query.contextId === null) clauses.push('e.context_id IS NULL');
      else {
        clauses.push('e.context_id = ?');
        params.push(query.contextId);
      }
    }
    if (query.workId) {
      clauses.push('e.work_id = ?');
      params.push(query.workId);
    }
    if (query.sourceState) {
      clauses.push(`${evidenceStateSql} = ?`);
      params.push(query.sourceState);
    }
    if (query.before) {
      clauses.push('(e.updated_at < ? OR (e.updated_at = ? AND e.id < ?))');
      params.push(query.before.updatedAt, query.before.updatedAt, query.before.id);
    }
    params.push(query.limit + 1);
    const rows = this.sqlite
      .prepare(
        `${evidenceSelect} WHERE ${clauses.join(' AND ')}
         ORDER BY e.updated_at DESC, e.id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const items = rows.slice(0, query.limit).map(toEvidence);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async createEvidence(draft: EvidenceDraft): Promise<KnowledgeCreateResult<Evidence>> {
    const failure = this.contextFailure<Evidence>(this.contextState(draft.contextId));
    if (failure) return failure;
    if (!this.sourceMatches(draft)) return { kind: 'source-not-found' };
    try {
      return this.sqlite.transaction(() => this.insertEvidence(draft))();
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  private insertEvidence(draft: EvidenceDraft): KnowledgeCreateResult<Evidence> {
    const timestamp = this.clock();
    this.sqlite
      .prepare(
        `INSERT INTO research_evidence
         (id, context_id, work_id, edition_id, asset_id, annotation_id, source_snapshot_json,
          source_kind, title, summary, notes, status, revision, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, NULL)`,
      )
      .run(
        draft.id,
        draft.contextId,
        draft.workId,
        draft.editionId,
        draft.assetId,
        draft.annotationId,
        JSON.stringify(draft.sourceSnapshot),
        draft.sourceSnapshot.sourceKind,
        draft.title,
        draft.summary,
        draft.notes,
        timestamp,
        timestamp,
      );
    const evidence = this.getEvidenceSync(draft.id);
    if (!evidence) throw new Error('Inserted evidence could not be read');
    this.syncEvidenceSearch(evidence);
    return { kind: 'created', value: evidence };
  }

  async createAnnotationWithEvidence(
    draft: DirectEvidenceDraft,
  ): Promise<KnowledgeCreateResult<DirectEvidenceResult>> {
    const evidenceContext = this.contextFailure<DirectEvidenceResult>(
      this.contextState(draft.evidence.contextId),
    );
    if (evidenceContext) return evidenceContext;
    const annotationContext = this.contextFailure<DirectEvidenceResult>(
      this.contextState(draft.annotation.contextId),
    );
    if (annotationContext) return annotationContext;
    if (
      draft.evidence.annotationId !== draft.annotation.id ||
      draft.evidence.assetId !== draft.annotation.assetId ||
      draft.evidence.editionId !== draft.annotation.editionId ||
      draft.evidence.sourceSnapshot.contextId !== draft.annotation.contextId ||
      draft.evidence.sourceSnapshot.annotationRevision !== 1
    ) {
      return { kind: 'source-not-found' };
    }
    try {
      return this.sqlite.transaction((): KnowledgeCreateResult<DirectEvidenceResult> => {
        const timestamp = this.clock();
        const annotationRow = this.sqlite
          .prepare(
            `INSERT INTO research_annotations
             (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
              status, revision, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL) RETURNING *`,
          )
          .get(
            draft.annotation.id,
            draft.annotation.assetId,
            draft.annotation.editionId,
            draft.annotation.contextId,
            draft.annotation.kind,
            draft.annotation.pageNumber,
            JSON.stringify(draft.annotation.anchor),
            draft.annotation.body,
            draft.annotation.color,
            draft.annotation.status,
            timestamp,
            timestamp,
          ) as Row;
        if (!this.sourceMatches(draft.evidence)) throw new Error('Direct evidence source mismatch');
        const result = this.insertEvidence(draft.evidence);
        if (result.kind !== 'created') throw new Error('Direct evidence insert failed');
        return {
          kind: 'created',
          value: { annotation: toAnnotation(annotationRow), evidence: result.value },
        };
      })();
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      if (error instanceof Error && error.message === 'Direct evidence source mismatch') {
        return { kind: 'source-not-found' };
      }
      throw error;
    }
  }

  async updateEvidence(
    id: string,
    changes: EvidenceChanges,
  ): Promise<KnowledgeChangeResult<Evidence>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<Evidence> => {
      const current = this.getEvidenceSync(id);
      if (!current) return { kind: 'not-found' };
      if (current.revision !== changes.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const currentContext = this.contextState(current.contextId);
      if (currentContext === 'missing') return { kind: 'context-not-found' };
      if (currentContext === 'archived') return { kind: 'context-archived' };
      const context = this.contextState(changes.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      this.insertRevision(
        'evidence',
        id,
        current.revision,
        current,
        'update',
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_evidence SET context_id = ?, title = ?, summary = ?, notes = ?,
             revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(
          changes.contextId,
          changes.title,
          changes.summary,
          changes.notes,
          timestamp,
          id,
          changes.expectedRevision,
        );
      const saved = this.getEvidenceSync(id);
      if (!saved) throw new Error('Updated evidence could not be read');
      this.syncEvidenceSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async rebindEvidence(
    id: string,
    changes: EvidenceRebindChanges,
  ): Promise<KnowledgeChangeResult<Evidence>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<Evidence> => {
      const current = this.getEvidenceSync(id);
      if (!current) return { kind: 'not-found' };
      if (current.revision !== changes.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const context = this.contextState(current.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const draft: EvidenceDraft = {
        id,
        contextId: current.contextId,
        workId: changes.workId,
        editionId: changes.editionId,
        assetId: changes.assetId,
        annotationId: changes.annotationId,
        sourceSnapshot: changes.sourceSnapshot,
        title: current.title,
        summary: current.summary,
        notes: current.notes,
      };
      if (!this.sourceMatches(draft)) return { kind: 'source-not-found' };
      const timestamp = this.clock();
      this.insertRevision(
        'evidence',
        id,
        current.revision,
        current,
        'rebind',
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_evidence SET work_id = ?, edition_id = ?, asset_id = ?, annotation_id = ?,
             source_snapshot_json = ?, source_kind = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          changes.workId,
          changes.editionId,
          changes.assetId,
          changes.annotationId,
          JSON.stringify(changes.sourceSnapshot),
          changes.sourceSnapshot.sourceKind,
          timestamp,
          id,
          changes.expectedRevision,
        );
      const saved = this.getEvidenceSync(id);
      if (!saved) throw new Error('Rebound evidence could not be read');
      this.syncEvidenceSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Evidence>> {
    return this.changeEvidenceStatus(id, draft, 'deleted');
  }

  async restoreEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Evidence>> {
    return this.changeEvidenceStatus(id, draft, 'active');
  }

  private changeEvidenceStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<Evidence> {
    return this.sqlite.transaction((): KnowledgeChangeResult<Evidence> => {
      const current = this.getEvidenceSync(id);
      if (!current) return { kind: 'not-found' };
      const wrongState =
        status === 'deleted' ? current.status === 'deleted' : current.status !== 'deleted';
      if (current.revision !== draft.expectedRevision || wrongState) {
        return { kind: 'conflict', current };
      }
      const context = this.contextState(current.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      const reason = status === 'deleted' ? 'delete' : 'restore';
      this.insertRevision(
        'evidence',
        id,
        current.revision,
        current,
        reason,
        draft.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_evidence SET status = ?, revision = revision + 1, updated_at = ?,
             deleted_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(
          status,
          timestamp,
          status === 'deleted' ? timestamp : null,
          id,
          draft.expectedRevision,
        );
      const saved = this.getEvidenceSync(id);
      if (!saved) throw new Error('Changed evidence could not be read');
      this.syncEvidenceSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async listNoteLinks(noteId: string, includeDeleted: boolean): Promise<NoteLink[] | null> {
    const note = this.sqlite.prepare('SELECT id FROM research_notes WHERE id = ?').get(noteId);
    if (!note) return null;
    const rows = this.sqlite
      .prepare(
        `SELECT * FROM research_note_links WHERE note_id = ? ${includeDeleted ? '' : "AND status = 'active'"}
         ORDER BY updated_at DESC, id DESC`,
      )
      .all(noteId) as Row[];
    return rows.map(toNoteLink);
  }

  async createNoteLink(draft: NoteLinkDraft): Promise<KnowledgeCreateResult<NoteLink>> {
    try {
      const note = (await this.getNote(draft.noteId)) ?? null;
      if (!note || note.status === 'deleted') return { kind: 'source-not-found' };
      const context = this.contextState(note.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      if (!this.noteLinkTargetExists(draft.target)) return { kind: 'source-not-found' };
      const timestamp = this.clock();
      const columns = {
        workId: draft.target.kind === 'work' ? draft.target.workId : null,
        annotationId: draft.target.kind === 'annotation' ? draft.target.annotationId : null,
        evidenceId: draft.target.kind === 'evidence' ? draft.target.evidenceId : null,
      };
      const row = this.sqlite
        .prepare(
          `INSERT INTO research_note_links
           (id, note_id, work_id, annotation_id, evidence_id, status, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?) RETURNING *`,
        )
        .get(
          draft.id,
          draft.noteId,
          columns.workId,
          columns.annotationId,
          columns.evidenceId,
          timestamp,
          timestamp,
        ) as Row;
      return { kind: 'created', value: toNoteLink(row) };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async deleteNoteLink(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<NoteLink>> {
    return this.changeNoteLinkStatus(id, draft, 'deleted');
  }

  async restoreNoteLink(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<NoteLink>> {
    return this.changeNoteLinkStatus(id, draft, 'active');
  }

  private changeNoteLinkStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<NoteLink> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<NoteLink> => {
        const row = this.sqlite
          .prepare('SELECT * FROM research_note_links WHERE id = ?')
          .get(id) as Row | undefined;
        if (!row) return { kind: 'not-found' };
        const current = toNoteLink(row);
        const wrongState =
          status === 'deleted' ? current.status === 'deleted' : current.status !== 'deleted';
        if (current.revision !== draft.expectedRevision || wrongState) {
          return { kind: 'conflict', current };
        }
        const noteRow = this.sqlite
          .prepare('SELECT context_id FROM research_notes WHERE id = ?')
          .get(current.noteId) as { context_id: string | null } | undefined;
        if (!noteRow) return { kind: 'not-found' };
        const context = this.contextState(noteRow.context_id);
        if (context === 'missing') return { kind: 'context-not-found' };
        if (context === 'archived') return { kind: 'context-archived' };
        if (status === 'active' && !this.noteLinkTargetExists(current.target)) {
          return { kind: 'source-not-found' };
        }
        const timestamp = this.clock();
        const reason = status === 'deleted' ? 'unlink' : 'link';
        this.insertRevision(
          'note-link',
          id,
          current.revision,
          current,
          reason,
          draft.revisionId,
          timestamp,
        );
        const saved = this.sqlite
          .prepare(
            `UPDATE research_note_links SET status = ?, revision = revision + 1, updated_at = ?,
               deleted_at = ? WHERE id = ? AND revision = ? RETURNING *`,
          )
          .get(
            status,
            timestamp,
            status === 'deleted' ? timestamp : null,
            id,
            draft.expectedRevision,
          ) as Row;
        return { kind: 'saved', value: toNoteLink(saved) };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.sqlite
          .prepare('SELECT * FROM research_note_links WHERE id = ?')
          .get(id) as Row | undefined;
        return current ? { kind: 'conflict', current: toNoteLink(current) } : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async listRevisions(
    entityType: 'note' | 'evidence' | 'note-link',
    entityId: string,
  ): Promise<KnowledgeRevision[]> {
    return (
      this.sqlite
        .prepare(
          `SELECT * FROM research_knowledge_revisions
           WHERE entity_type = ? AND entity_id = ?
           ORDER BY revision DESC, created_at DESC, id DESC`,
        )
        .all(entityType, entityId) as Row[]
    ).map(toKnowledgeRevision);
  }
}
