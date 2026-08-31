import type Database from 'better-sqlite3';
import {
  evidenceSourceSnapshotSchema,
  matrixReviewBaselineSchema,
  writingCitationIntentSchema,
  type Annotation,
  type Claim,
  type ClaimEvidence,
  type ComparisonMatrix,
  type Evidence,
  type EvidenceSourceState,
  type KnowledgeBasicStatus,
  type KnowledgeEntityType,
  type KnowledgeRevision,
  type KnowledgeRevisionReason,
  type KnowledgeSearchEntityType,
  type KnowledgeSearchResult,
  type MatrixCandidates,
  type MatrixCell,
  type MatrixCellEvidence,
  type MatrixCellWindow,
  type MatrixColumn,
  type MatrixDetail,
  type MatrixReviewBaseline,
  type MatrixRow,
  type NoteLink,
  type ResearchNote,
  type WritingBlock,
  type WritingDocument,
  type WritingDocumentDetail,
  type WritingResourceState,
  type WritingSection,
} from '../contract.js';
import type {
  DirectEvidenceDraft,
  DirectEvidenceResult,
  EvidenceChanges,
  EvidenceDraft,
  EvidenceListQuery,
  EvidenceRebindChanges,
  ClaimChanges,
  ClaimDraft,
  ClaimEvidenceChanges,
  ClaimEvidenceDraft,
  ClaimListQuery,
  MatrixCellChanges,
  MatrixCellDraft,
  MatrixCellEvidenceDraft,
  MatrixChanges,
  MatrixDraft,
  MatrixListQuery,
  MatrixStructureDraft,
  KnowledgeChangeResult,
  KnowledgeCreateResult,
  KnowledgeListQuery,
  KnowledgePage,
  KnowledgeSearchPage,
  KnowledgeSearchQuery,
  KnowledgeSearchRebuildResult,
  KnowledgeRepository,
  KnowledgeRevisionDraft,
  KnowledgeAnnotationSource,
  KnowledgeAssetSource,
  OcrSourceIdentity,
  NoteChanges,
  NoteDraft,
  NoteLinkDraft,
  WritingBlockChanges,
  WritingDocumentChanges,
  WritingDocumentDraft,
  WritingDocumentListQuery,
  WritingStructureDraft,
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

function toClaim(row: Row): Claim {
  return {
    id: requiredText(row, 'id'),
    contextId: nullableText(row, 'context_id'),
    statement: requiredText(row, 'statement'),
    rationale: nullableText(row, 'rationale'),
    status: requiredText(row, 'status') as Claim['status'],
    evidenceCount: requiredNumber(row, 'evidence_count'),
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    archivedAt: nullableText(row, 'archived_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toClaimEvidence(row: Row): ClaimEvidence {
  return {
    id: requiredText(row, 'id'),
    claimId: requiredText(row, 'claim_id'),
    evidenceId: requiredText(row, 'evidence_id'),
    relation: requiredText(row, 'relation') as ClaimEvidence['relation'],
    note: nullableText(row, 'note'),
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toComparisonMatrix(row: Row): ComparisonMatrix {
  return {
    id: requiredText(row, 'id'),
    contextId: nullableText(row, 'context_id'),
    title: requiredText(row, 'title'),
    description: nullableText(row, 'description'),
    status: requiredText(row, 'status') as ComparisonMatrix['status'],
    structureRevision: requiredNumber(row, 'structure_revision'),
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    archivedAt: nullableText(row, 'archived_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toWritingDocument(row: Row): WritingDocument {
  return {
    id: requiredText(row, 'id'),
    contextId: nullableText(row, 'context_id'),
    title: requiredText(row, 'title'),
    status: requiredText(row, 'status') as WritingDocument['status'],
    structureRevision: requiredNumber(row, 'structure_revision'),
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    archivedAt: nullableText(row, 'archived_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toMatrixColumn(row: Row): MatrixColumn {
  return {
    id: requiredText(row, 'id'),
    matrixId: requiredText(row, 'matrix_id'),
    workId: requiredText(row, 'work_id'),
    workTitle: requiredText(row, 'work_title'),
    position: requiredNumber(row, 'position'),
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
}

function toMatrixRow(row: Row): MatrixRow {
  const base = {
    id: requiredText(row, 'id'),
    matrixId: requiredText(row, 'matrix_id'),
    position: requiredNumber(row, 'position'),
    status: requiredText(row, 'status') as KnowledgeBasicStatus,
    revision: requiredNumber(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    deletedAt: nullableText(row, 'deleted_at'),
  };
  return requiredText(row, 'kind') === 'claim'
    ? {
        ...base,
        kind: 'claim',
        claimId: requiredText(row, 'claim_id'),
        title: null,
        question: null,
      }
    : {
        ...base,
        kind: 'dimension',
        claimId: null,
        title: nullableText(row, 'title'),
        question: nullableText(row, 'question'),
      };
}

function toMatrixCellEvidence(row: Row): MatrixCellEvidence {
  return {
    id: requiredText(row, 'id'),
    cellId: requiredText(row, 'cell_id'),
    evidenceId: requiredText(row, 'evidence_id'),
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
  const claimId = nullableText(row, 'claim_id');
  const target = workId
    ? ({ kind: 'work', workId } as const)
    : annotationId
      ? ({ kind: 'annotation', annotationId } as const)
      : evidenceId
        ? ({ kind: 'evidence', evidenceId } as const)
        : ({ kind: 'claim', claimId: claimId ?? '' } as const);
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

function knowledgeFtsExpression(value: string): string {
  const tokens = value.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .slice(0, 24)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' AND ');
}

function stripFtsMarkers(value: string): string {
  return value.replaceAll('\u0001', '').replaceAll('\u0002', '');
}

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

  private contextChangeFailure<T>(state: ContextState): KnowledgeChangeResult<T> | null {
    if (state === 'missing') return { kind: 'context-not-found' };
    if (state === 'archived') return { kind: 'context-archived' };
    return null;
  }

  private getEvidenceSync(id: string): Evidence | null {
    const row = this.sqlite.prepare(`${evidenceSelect} WHERE e.id = ?`).get(id) as Row | undefined;
    return row ? toEvidence(row) : null;
  }

  private getClaimSync(id: string): Claim | null {
    const row = this.sqlite
      .prepare(
        `SELECT claim.*,
                (SELECT COUNT(*) FROM research_claim_evidence relation
                 WHERE relation.claim_id = claim.id AND relation.status = 'active') AS evidence_count
         FROM research_claims claim WHERE claim.id = ?`,
      )
      .get(id) as Row | undefined;
    return row ? toClaim(row) : null;
  }

  private getMatrixSync(id: string, includeDeletedStructure: boolean): MatrixDetail | null {
    const row = this.sqlite.prepare('SELECT * FROM research_matrices WHERE id = ?').get(id) as
      Row | undefined;
    if (!row) return null;
    const structureClause = includeDeletedStructure ? '' : "AND item.status = 'active'";
    const columns = (
      this.sqlite
        .prepare(
          `SELECT item.*, work.title AS work_title
           FROM research_matrix_columns item
           JOIN research_works work ON work.id = item.work_id
           WHERE item.matrix_id = ? ${structureClause}
           ORDER BY item.position, item.id`,
        )
        .all(id) as Row[]
    ).map(toMatrixColumn);
    const rows = (
      this.sqlite
        .prepare(
          `SELECT item.* FROM research_matrix_rows item
           WHERE item.matrix_id = ? ${structureClause}
           ORDER BY item.position, item.id`,
        )
        .all(id) as Row[]
    ).map(toMatrixRow);
    return { ...toComparisonMatrix(row), columns, rows };
  }

  private writingTarget(
    kind: Exclude<WritingBlock['kind'], 'text'>,
    id: string,
    editionId: string | null = null,
  ) {
    if (kind === 'citation') {
      const row = this.sqlite
        .prepare('SELECT id, title, status FROM research_works WHERE id = ?')
        .get(id) as Row | undefined;
      if (!row) return null;
      if (
        editionId &&
        !this.sqlite
          .prepare('SELECT 1 FROM research_editions WHERE id = ? AND work_id = ?')
          .get(editionId, id)
      ) {
        return null;
      }
      const status = requiredText(row, 'status');
      return {
        label: requiredText(row, 'title'),
        state: (status === 'active'
          ? 'current'
          : status === 'trashed'
            ? 'archived'
            : 'deleted') as WritingResourceState,
        url: `/research?work=${encodeURIComponent(id)}`,
        sourceState: null,
      };
    }
    if (kind === 'note') {
      const row = this.sqlite.prepare('SELECT * FROM research_notes WHERE id = ?').get(id) as
        Row | undefined;
      if (!row) return null;
      const note = toResearchNote(row);
      const params = new URLSearchParams({
        mode: 'sources',
        note: note.id,
        sourceStatus: note.status === 'deleted' ? 'deleted' : 'active',
      });
      return {
        label: note.title,
        state: (note.status === 'deleted' ? 'deleted' : 'current') as WritingResourceState,
        url: `/research/knowledge?${params.toString()}`,
        sourceState: null,
      };
    }
    if (kind === 'evidence') {
      const evidence = this.getEvidenceSync(id);
      if (!evidence) return null;
      const params = new URLSearchParams({
        page: String(evidence.sourceSnapshot.pageNumber),
        context: evidence.sourceSnapshot.contextId ?? 'general',
        annotation: evidence.annotationId,
      });
      return {
        label: evidence.title ?? evidence.sourceSnapshot.workTitle,
        state: (evidence.status === 'deleted'
          ? 'deleted'
          : evidence.sourceState === 'source-unavailable'
            ? 'unavailable'
            : 'current') as WritingResourceState,
        url: `/research/read/${encodeURIComponent(evidence.assetId)}?${params.toString()}`,
        sourceState: evidence.sourceState,
      };
    }
    if (kind === 'claim') {
      const claim = this.getClaimSync(id);
      if (!claim) return null;
      const params = new URLSearchParams({
        mode: 'claims',
        claim: claim.id,
        claimStatus: claim.status,
      });
      return {
        label: claim.statement,
        state: (claim.status === 'deleted'
          ? 'deleted'
          : claim.status === 'archived'
            ? 'archived'
            : 'current') as WritingResourceState,
        url: `/research/knowledge?${params.toString()}`,
        sourceState: null,
      };
    }
    const matrix = this.getMatrixSync(id, false);
    if (!matrix) return null;
    const params = new URLSearchParams({
      mode: 'matrices',
      matrix: matrix.id,
      matrixStatus: matrix.status,
    });
    return {
      label: matrix.title,
      state: (matrix.status === 'deleted'
        ? 'deleted'
        : matrix.status === 'archived'
          ? 'archived'
          : 'current') as WritingResourceState,
      url: `/research/knowledge?${params.toString()}`,
      sourceState: null,
    };
  }

  private getWritingBlockSync(id: string): WritingBlock | null {
    const row = this.sqlite
      .prepare('SELECT * FROM research_writing_blocks WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) return null;
    const base = {
      id: requiredText(row, 'id'),
      documentId: requiredText(row, 'document_id'),
      sectionId: requiredText(row, 'section_id'),
      position: requiredNumber(row, 'position'),
      status: requiredText(row, 'status') as KnowledgeBasicStatus,
      revision: requiredNumber(row, 'revision'),
      createdAt: requiredText(row, 'created_at'),
      updatedAt: requiredText(row, 'updated_at'),
      deletedAt: nullableText(row, 'deleted_at'),
    };
    const kind = requiredText(row, 'kind') as WritingBlock['kind'];
    if (kind === 'text') {
      return {
        ...base,
        kind,
        text: requiredText(row, 'text_content'),
        targetId: null,
        targetLabel: null,
        targetState: null,
        targetUrl: null,
        sourceState: null,
      };
    }
    const targetId = requiredText(
      row,
      kind === 'note'
        ? 'note_id'
        : kind === 'evidence'
          ? 'evidence_id'
          : kind === 'claim'
            ? 'claim_id'
            : kind === 'matrix'
              ? 'matrix_id'
              : 'work_id',
    );
    const editionId = kind === 'citation' ? nullableText(row, 'edition_id') : null;
    const target = this.writingTarget(kind, targetId, editionId);
    if (kind === 'citation') {
      return {
        ...base,
        kind,
        text: null,
        targetId,
        targetLabel: requiredText(row, 'target_label'),
        targetState: target?.state ?? 'deleted',
        targetUrl: target?.url ?? null,
        sourceState: null,
        citation: writingCitationIntentSchema.parse({
          ...JSON.parse(requiredText(row, 'citation_intent_json')),
          editionId,
        }),
      };
    }
    return {
      ...base,
      kind,
      text: null,
      targetId,
      targetLabel: requiredText(row, 'target_label'),
      targetState: target?.state ?? 'deleted',
      targetUrl: target?.url ?? null,
      sourceState: target?.sourceState ?? null,
    } as WritingBlock;
  }

  private getWritingDocumentSync(
    id: string,
    includeDeletedStructure: boolean,
  ): WritingDocumentDetail | null {
    const row = this.sqlite
      .prepare('SELECT * FROM research_writing_documents WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) return null;
    const clause = includeDeletedStructure ? '' : "AND status = 'active'";
    const sectionRows = this.sqlite
      .prepare(
        `SELECT * FROM research_writing_sections WHERE document_id = ? ${clause}
         ORDER BY position, id`,
      )
      .all(id) as Row[];
    const sections: WritingSection[] = sectionRows.map((sectionRow) => {
      const sectionId = requiredText(sectionRow, 'id');
      const blockRows = this.sqlite
        .prepare(
          `SELECT id FROM research_writing_blocks WHERE section_id = ? ${clause}
           ORDER BY position, id`,
        )
        .all(sectionId) as Array<{ id: string }>;
      return {
        id: sectionId,
        documentId: requiredText(sectionRow, 'document_id'),
        title: requiredText(sectionRow, 'title'),
        position: requiredNumber(sectionRow, 'position'),
        status: requiredText(sectionRow, 'status') as KnowledgeBasicStatus,
        revision: requiredNumber(sectionRow, 'revision'),
        createdAt: requiredText(sectionRow, 'created_at'),
        updatedAt: requiredText(sectionRow, 'updated_at'),
        deletedAt: nullableText(sectionRow, 'deleted_at'),
        blocks: blockRows.flatMap((blockRow) => {
          const block = this.getWritingBlockSync(blockRow.id);
          return block ? [block] : [];
        }),
      };
    });
    return { ...toWritingDocument(row), sections };
  }

  private matrixReviewBaseline(
    rowId: string,
    columnId: string,
    cellId: string,
  ): MatrixReviewBaseline {
    const row = this.sqlite
      .prepare('SELECT kind, claim_id FROM research_matrix_rows WHERE id = ?')
      .get(rowId) as { kind: string; claim_id: string | null } | undefined;
    const column = this.sqlite
      .prepare('SELECT work_id FROM research_matrix_columns WHERE id = ?')
      .get(columnId) as { work_id: string } | undefined;
    if (!row || !column) throw new Error('Matrix cell structure could not be read');
    const claim = row.claim_id ? this.getClaimSync(row.claim_id) : null;
    const relationRows = row.claim_id
      ? (this.sqlite
          .prepare(
            `SELECT relation.id, relation.revision, relation.relation, relation.evidence_id
             FROM research_claim_evidence relation
             JOIN research_evidence evidence ON evidence.id = relation.evidence_id
             WHERE relation.claim_id = ? AND relation.status = 'active'
               AND evidence.status = 'active' AND evidence.work_id = ?
             ORDER BY relation.id`,
          )
          .all(row.claim_id, column.work_id) as Array<{
          id: string;
          revision: number;
          relation: string;
          evidence_id: string;
        }>)
      : [];
    const candidateSignature = JSON.stringify(
      relationRows.map((relation) => {
        const evidence = this.getEvidenceSync(relation.evidence_id);
        return [
          relation.id,
          relation.revision,
          relation.relation,
          relation.evidence_id,
          evidence?.revision ?? null,
          evidence?.sourceState ?? 'source-unavailable',
        ];
      }),
    );
    const evidence = (
      this.sqlite
        .prepare(
          `SELECT evidence_id FROM research_matrix_cell_evidence
           WHERE cell_id = ? AND status = 'active' ORDER BY evidence_id`,
        )
        .all(cellId) as Array<{ evidence_id: string }>
    ).map((link) => {
      const item = this.getEvidenceSync(link.evidence_id);
      if (!item) throw new Error('Selected matrix evidence could not be read');
      return { id: item.id, revision: item.revision, sourceState: item.sourceState };
    });
    return matrixReviewBaselineSchema.parse({
      claimRevision: claim?.revision ?? null,
      candidateSignature,
      evidence,
    });
  }

  private getMatrixCellSync(id: string): MatrixCell | null {
    const row = this.sqlite
      .prepare(
        `SELECT cell.*,
                (SELECT COUNT(*) FROM research_matrix_cell_evidence link
                 WHERE link.cell_id = cell.id AND link.status = 'active') AS selected_evidence_count
         FROM research_matrix_cells cell WHERE cell.id = ?`,
      )
      .get(id) as Row | undefined;
    if (!row) return null;
    const baselineJson = nullableText(row, 'review_baseline_json');
    const reviewBaseline = baselineJson
      ? matrixReviewBaselineSchema.parse(JSON.parse(baselineJson))
      : null;
    const selectedEvidenceCount = requiredNumber(row, 'selected_evidence_count');
    const current = this.matrixReviewBaseline(
      requiredText(row, 'row_id'),
      requiredText(row, 'column_id'),
      requiredText(row, 'id'),
    );
    const reviewState =
      reviewBaseline === null
        ? requiredText(row, 'synthesis').length === 0 && selectedEvidenceCount === 0
          ? 'current'
          : 'needs-review'
        : JSON.stringify(reviewBaseline) === JSON.stringify(current)
          ? 'current'
          : 'needs-review';
    return {
      id: requiredText(row, 'id'),
      matrixId: requiredText(row, 'matrix_id'),
      rowId: requiredText(row, 'row_id'),
      columnId: requiredText(row, 'column_id'),
      synthesis: requiredText(row, 'synthesis'),
      reviewBaseline,
      reviewState,
      selectedEvidenceCount,
      status: requiredText(row, 'status') as KnowledgeBasicStatus,
      revision: requiredNumber(row, 'revision'),
      createdAt: requiredText(row, 'created_at'),
      updatedAt: requiredText(row, 'updated_at'),
      reviewedAt: nullableText(row, 'reviewed_at'),
      deletedAt: nullableText(row, 'deleted_at'),
    };
  }

  private insertRevision(
    entityType: KnowledgeEntityType,
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

  private syncClaimSearch(claim: Claim): void {
    this.sqlite
      .prepare(
        `INSERT INTO research_knowledge_search
         (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
         VALUES ('claim', ?, ?, NULL, ?, ?, ?, NULL, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           context_id = excluded.context_id, work_id = NULL, title = excluded.title,
           body = excluded.body, status = excluded.status, source_state = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        claim.id,
        claim.contextId,
        claim.statement,
        claim.rationale ?? '',
        claim.status,
        claim.updatedAt,
      );
  }

  private syncWritingSearch(document: WritingDocumentDetail): void {
    const body = document.sections
      .filter((section) => section.status === 'active')
      .sort((left, right) => left.position - right.position)
      .flatMap((section) =>
        section.blocks
          .filter((block) => block.status === 'active' && block.kind === 'text')
          .sort((left, right) => left.position - right.position)
          .map((block) => block.text),
      )
      .join('\n');
    this.sqlite
      .prepare(
        `INSERT INTO research_knowledge_search
         (entity_type, entity_id, context_id, work_id, title, body, status, source_state, updated_at)
         VALUES ('writing-document', ?, ?, NULL, ?, ?, ?, NULL, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           context_id = excluded.context_id, work_id = NULL, title = excluded.title,
           body = excluded.body, status = excluded.status, source_state = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        document.id,
        document.contextId,
        document.title,
        body,
        document.status,
        document.updatedAt,
      );
  }

  async searchKnowledge(query: KnowledgeSearchQuery): Promise<KnowledgeSearchPage> {
    const ftsQuery = knowledgeFtsExpression(query.query);
    const seen = query.before?.seen ?? 0;
    const remaining = Math.max(0, query.maxResults - seen);
    const pageLimit = Math.min(query.limit, remaining);
    if (!ftsQuery || pageLimit === 0) return { items: [], next: null };

    const innerClauses = [
      'research_knowledge_search_fts MATCH ?',
      `search.entity_type IN (${query.entityTypes.map(() => '?').join(', ')})`,
      `search.status IN (${query.statuses.map(() => '?').join(', ')})`,
    ];
    const params: unknown[] = [ftsQuery, ...query.entityTypes, ...query.statuses];
    if ('contextId' in query) {
      if (query.contextId === null) innerClauses.push('search.context_id IS NULL');
      else {
        innerClauses.push('search.context_id = ?');
        params.push(query.contextId);
      }
    }
    if (query.workId) {
      innerClauses.push('search.work_id = ?');
      params.push(query.workId);
    }

    const outerClauses: string[] = [];
    if (query.sourceStates) {
      outerClauses.push(
        `current_source_state IN (${query.sourceStates.map(() => '?').join(', ')})`,
      );
      params.push(...query.sourceStates);
    }
    if (query.before) {
      outerClauses.push(
        `(updated_at < ? OR (updated_at = ? AND
          (entity_type > ? OR (entity_type = ? AND entity_id > ?))))`,
      );
      params.push(
        query.before.updatedAt,
        query.before.updatedAt,
        query.before.entityType,
        query.before.entityType,
        query.before.entityId,
      );
    }
    params.push(pageLimit + 1);

    const rows = this.sqlite
      .prepare(
        `WITH matched AS (
           SELECT search.*,
                  CASE WHEN search.entity_type = 'evidence'
                    THEN ${evidenceStateSql} ELSE NULL END AS current_source_state,
                  e.asset_id AS source_asset_id,
                  e.annotation_id AS source_annotation_id,
                  json_extract(e.source_snapshot_json, '$.pageNumber') AS source_page_number,
                  json_extract(e.source_snapshot_json, '$.contextId') AS source_context_id,
                  highlight(research_knowledge_search_fts, 0, char(1), char(2)) AS marked_title,
                  snippet(research_knowledge_search_fts, 1, char(1), char(2), '…', 32)
                    AS marked_body
           FROM research_knowledge_search_fts
           JOIN research_knowledge_search search
             ON search.rowid = research_knowledge_search_fts.rowid
           LEFT JOIN research_evidence e
             ON search.entity_type = 'evidence' AND e.id = search.entity_id
           LEFT JOIN research_annotations annotation ON annotation.id = e.annotation_id
           LEFT JOIN research_assets asset ON asset.id = e.asset_id
           WHERE ${innerClauses.join(' AND ')}
         )
         SELECT * FROM matched
         ${outerClauses.length > 0 ? `WHERE ${outerClauses.join(' AND ')}` : ''}
         ORDER BY updated_at DESC, entity_type, entity_id
         LIMIT ?`,
      )
      .all(...params) as Row[];

    const pageRows = rows.slice(0, pageLimit);
    const items = pageRows.map((row): KnowledgeSearchResult => {
      const entityType = requiredText(row, 'entity_type') as KnowledgeSearchEntityType;
      const entityId = requiredText(row, 'entity_id');
      const status = requiredText(row, 'status') as KnowledgeSearchResult['status'];
      const markedTitle = requiredText(row, 'marked_title');
      const markedBody = requiredText(row, 'marked_body');
      const matchedFields: KnowledgeSearchResult['matchedFields'] = [];
      if (markedTitle.includes('\u0001')) matchedFields.push('title');
      if (markedBody.includes('\u0001')) matchedFields.push('body');
      const contextId = nullableText(row, 'context_id');
      let targetUrl: string;
      if (entityType === 'evidence') {
        const targetParams = new URLSearchParams({
          page: String(requiredNumber(row, 'source_page_number')),
          context: nullableText(row, 'source_context_id') ?? 'general',
          annotation: requiredText(row, 'source_annotation_id'),
        });
        targetUrl = `/research/read/${encodeURIComponent(requiredText(row, 'source_asset_id'))}?${targetParams.toString()}`;
      } else {
        const targetParams = new URLSearchParams({
          mode: entityType === 'note' ? 'sources' : entityType === 'claim' ? 'claims' : 'writing',
          [entityType === 'note' ? 'note' : entityType === 'claim' ? 'claim' : 'document']:
            entityId,
          [entityType === 'note'
            ? 'sourceStatus'
            : entityType === 'claim'
              ? 'claimStatus'
              : 'writingStatus']: status,
        });
        targetUrl = `/research/knowledge?${targetParams.toString()}`;
      }
      return {
        entityType,
        entityId,
        contextId,
        workId: nullableText(row, 'work_id'),
        title: stripFtsMarkers(markedTitle),
        excerpt: stripFtsMarkers(markedBody).trim() || stripFtsMarkers(markedTitle),
        matchedFields: matchedFields.length > 0 ? matchedFields : ['body'],
        status,
        sourceState:
          entityType === 'evidence'
            ? (requiredText(row, 'current_source_state') as EvidenceSourceState)
            : null,
        targetUrl,
        updatedAt: requiredText(row, 'updated_at'),
      };
    });
    const last = items.at(-1);
    return {
      items,
      next:
        rows.length > pageLimit && last && seen + items.length < query.maxResults
          ? {
              updatedAt: last.updatedAt,
              entityType: last.entityType,
              entityId: last.entityId,
              seen: seen + items.length,
            }
          : null,
    };
  }

  async rebuildKnowledgeSearch(): Promise<KnowledgeSearchRebuildResult> {
    return this.sqlite.transaction((): KnowledgeSearchRebuildResult => {
      this.sqlite.prepare('DELETE FROM research_knowledge_search').run();
      const notes = this.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search
           (entity_type, entity_id, context_id, work_id, title, body, status, source_state,
            updated_at)
           SELECT 'note', id, context_id, NULL, title, body, status, NULL, updated_at
           FROM research_notes`,
        )
        .run().changes;
      const evidence = this.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search
           (entity_type, entity_id, context_id, work_id, title, body, status, source_state,
            updated_at)
           SELECT 'evidence', e.id, e.context_id, e.work_id,
                  COALESCE(e.title, json_extract(e.source_snapshot_json, '$.workTitle')),
                  e.summary || char(10) || COALESCE(e.notes, '') || char(10) ||
                    COALESCE(json_extract(e.source_snapshot_json, '$.anchor.textQuote.exact'), ''),
                  e.status, ${evidenceStateSql}, e.updated_at
           FROM research_evidence e
           JOIN research_annotations annotation ON annotation.id = e.annotation_id
           JOIN research_assets asset ON asset.id = e.asset_id`,
        )
        .run().changes;
      const claims = this.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search
           (entity_type, entity_id, context_id, work_id, title, body, status, source_state,
            updated_at)
           SELECT 'claim', id, context_id, NULL, statement, COALESCE(rationale, ''), status,
                  NULL, updated_at
           FROM research_claims`,
        )
        .run().changes;
      const writingDocuments = this.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search
           (entity_type, entity_id, context_id, work_id, title, body, status, source_state,
            updated_at)
           SELECT 'writing-document', document.id, document.context_id, NULL, document.title,
                  COALESCE((
                    SELECT group_concat(ordered.text_content, char(10))
                    FROM (
                      SELECT block.text_content
                      FROM research_writing_sections section
                      JOIN research_writing_blocks block ON block.section_id = section.id
                      WHERE section.document_id = document.id AND section.status = 'active'
                        AND block.status = 'active' AND block.kind = 'text'
                      ORDER BY section.position, section.id, block.position, block.id
                    ) ordered
                  ), ''),
                  document.status, NULL, document.updated_at
           FROM research_writing_documents document`,
        )
        .run().changes;
      this.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search_fts(research_knowledge_search_fts)
           VALUES ('rebuild')`,
        )
        .run();
      return {
        notes,
        evidence,
        claims,
        writingDocuments,
        total: notes + evidence + claims + writingDocuments,
      };
    })();
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
    if (target.kind === 'claim') {
      return Boolean(
        this.sqlite
          .prepare("SELECT 1 FROM research_claims WHERE id = ? AND status <> 'deleted'")
          .get(target.claimId),
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

  async getClaim(id: string): Promise<Claim | null> {
    return this.getClaimSync(id);
  }

  async listClaims(query: ClaimListQuery): Promise<KnowledgePage<Claim>> {
    const clauses = ['claim.status = ?'];
    const params: unknown[] = [query.status];
    if ('contextId' in query) {
      if (query.contextId === null) clauses.push('claim.context_id IS NULL');
      else {
        clauses.push('claim.context_id = ?');
        params.push(query.contextId);
      }
    }
    if (query.before) {
      clauses.push('(claim.updated_at < ? OR (claim.updated_at = ? AND claim.id < ?))');
      params.push(query.before.updatedAt, query.before.updatedAt, query.before.id);
    }
    params.push(query.limit + 1);
    const rows = this.sqlite
      .prepare(
        `SELECT claim.*,
                (SELECT COUNT(*) FROM research_claim_evidence relation
                 WHERE relation.claim_id = claim.id AND relation.status = 'active') AS evidence_count
         FROM research_claims claim WHERE ${clauses.join(' AND ')}
         ORDER BY claim.updated_at DESC, claim.id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const items = rows.slice(0, query.limit).map(toClaim);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async createClaim(draft: ClaimDraft): Promise<KnowledgeCreateResult<Claim>> {
    const failure = this.contextFailure<Claim>(this.contextState(draft.contextId));
    if (failure) return failure;
    try {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_claims
           (id, context_id, statement, rationale, status, status_before_delete, revision,
            created_at, updated_at, archived_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, NULL)`,
        )
        .run(
          draft.id,
          draft.contextId,
          draft.statement,
          draft.rationale,
          draft.status,
          timestamp,
          timestamp,
          draft.status === 'archived' ? timestamp : null,
        );
      const claim = this.getClaimSync(draft.id);
      if (!claim) throw new Error('Inserted claim could not be read');
      this.syncClaimSearch(claim);
      return { kind: 'created', value: claim };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateClaim(id: string, changes: ClaimChanges): Promise<KnowledgeChangeResult<Claim>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<Claim> => {
      const current = this.getClaimSync(id);
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
        'claim',
        id,
        current.revision,
        current,
        changes.status === 'archived' && current.status !== 'archived' ? 'archive' : 'update',
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_claims SET context_id = ?, statement = ?, rationale = ?, status = ?,
             archived_at = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          changes.contextId,
          changes.statement,
          changes.rationale,
          changes.status,
          changes.status === 'archived' ? (current.archivedAt ?? timestamp) : null,
          timestamp,
          id,
          changes.expectedRevision,
        );
      const saved = this.getClaimSync(id);
      if (!saved) throw new Error('Updated claim could not be read');
      this.syncClaimSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteClaim(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Claim>> {
    return this.changeClaimDeletedState(id, draft, true);
  }

  async restoreClaim(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Claim>> {
    return this.changeClaimDeletedState(id, draft, false);
  }

  private changeClaimDeletedState(
    id: string,
    draft: KnowledgeRevisionDraft,
    deleting: boolean,
  ): KnowledgeChangeResult<Claim> {
    return this.sqlite.transaction((): KnowledgeChangeResult<Claim> => {
      const current = this.getClaimSync(id);
      if (!current) return { kind: 'not-found' };
      const wrongState = deleting ? current.status === 'deleted' : current.status !== 'deleted';
      if (current.revision !== draft.expectedRevision || wrongState) {
        return { kind: 'conflict', current };
      }
      const context = this.contextState(current.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      this.insertRevision(
        'claim',
        id,
        current.revision,
        current,
        deleting ? 'delete' : 'restore',
        draft.revisionId,
        timestamp,
      );
      if (deleting) {
        this.sqlite
          .prepare(
            `UPDATE research_claims SET status_before_delete = status, status = 'deleted',
               deleted_at = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, timestamp, id, draft.expectedRevision);
      } else {
        this.sqlite
          .prepare(
            `UPDATE research_claims SET status = status_before_delete, status_before_delete = NULL,
               deleted_at = NULL, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, id, draft.expectedRevision);
      }
      const saved = this.getClaimSync(id);
      if (!saved) throw new Error('Changed claim could not be read');
      this.syncClaimSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async listClaimEvidence(
    claimId: string,
    includeDeleted: boolean,
  ): Promise<ClaimEvidence[] | null> {
    if (!this.sqlite.prepare('SELECT 1 FROM research_claims WHERE id = ?').get(claimId))
      return null;
    return (
      this.sqlite
        .prepare(
          `SELECT * FROM research_claim_evidence WHERE claim_id = ?
           ${includeDeleted ? '' : "AND status = 'active'"}
           ORDER BY updated_at DESC, id DESC`,
        )
        .all(claimId) as Row[]
    ).map(toClaimEvidence);
  }

  async getClaimEvidence(id: string): Promise<ClaimEvidence | null> {
    const row = this.sqlite
      .prepare('SELECT * FROM research_claim_evidence WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toClaimEvidence(row) : null;
  }

  async createClaimEvidence(
    draft: ClaimEvidenceDraft,
  ): Promise<KnowledgeCreateResult<ClaimEvidence>> {
    const claim = this.getClaimSync(draft.claimId);
    if (!claim || claim.status === 'deleted') return { kind: 'source-not-found' };
    const contextFailure = this.contextFailure<ClaimEvidence>(this.contextState(claim.contextId));
    if (contextFailure) return contextFailure;
    const evidence = this.getEvidenceSync(draft.evidenceId);
    if (!evidence || evidence.status === 'deleted') return { kind: 'source-not-found' };
    try {
      const timestamp = this.clock();
      const row = this.sqlite
        .prepare(
          `INSERT INTO research_claim_evidence
           (id, claim_id, evidence_id, relation, note, status, revision, created_at, updated_at,
            deleted_at)
           VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, NULL) RETURNING *`,
        )
        .get(
          draft.id,
          draft.claimId,
          draft.evidenceId,
          draft.relation,
          draft.note,
          timestamp,
          timestamp,
        ) as Row;
      return { kind: 'created', value: toClaimEvidence(row) };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateClaimEvidence(
    id: string,
    changes: ClaimEvidenceChanges,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<ClaimEvidence> => {
      const row = this.sqlite
        .prepare('SELECT * FROM research_claim_evidence WHERE id = ?')
        .get(id) as Row | undefined;
      if (!row) return { kind: 'not-found' };
      const current = toClaimEvidence(row);
      if (current.revision !== changes.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const claim = this.getClaimSync(current.claimId);
      if (!claim || claim.status === 'deleted') return { kind: 'source-not-found' };
      const contextFailure = this.contextChangeFailure<ClaimEvidence>(
        this.contextState(claim.contextId),
      );
      if (contextFailure) return contextFailure;
      const evidence = this.getEvidenceSync(current.evidenceId);
      if (!evidence || evidence.status === 'deleted') return { kind: 'source-not-found' };
      const timestamp = this.clock();
      this.insertRevision(
        'claim-evidence',
        id,
        current.revision,
        current,
        'update',
        changes.revisionId,
        timestamp,
      );
      const saved = this.sqlite
        .prepare(
          `UPDATE research_claim_evidence SET relation = ?, note = ?, revision = revision + 1,
             updated_at = ? WHERE id = ? AND revision = ? RETURNING *`,
        )
        .get(changes.relation, changes.note, timestamp, id, changes.expectedRevision) as Row;
      return { kind: 'saved', value: toClaimEvidence(saved) };
    })();
  }

  async deleteClaimEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>> {
    return this.changeClaimEvidenceStatus(id, draft, 'deleted');
  }

  async restoreClaimEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>> {
    return this.changeClaimEvidenceStatus(id, draft, 'active');
  }

  private changeClaimEvidenceStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<ClaimEvidence> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<ClaimEvidence> => {
        const row = this.sqlite
          .prepare('SELECT * FROM research_claim_evidence WHERE id = ?')
          .get(id) as Row | undefined;
        if (!row) return { kind: 'not-found' };
        const current = toClaimEvidence(row);
        const wrongState =
          status === 'deleted' ? current.status === 'deleted' : current.status !== 'deleted';
        if (current.revision !== draft.expectedRevision || wrongState) {
          return { kind: 'conflict', current };
        }
        const claim = this.getClaimSync(current.claimId);
        if (!claim || claim.status === 'deleted') return { kind: 'source-not-found' };
        const contextFailure = this.contextChangeFailure<ClaimEvidence>(
          this.contextState(claim.contextId),
        );
        if (contextFailure) return contextFailure;
        if (status === 'active') {
          const evidence = this.getEvidenceSync(current.evidenceId);
          if (!evidence || evidence.status === 'deleted') return { kind: 'source-not-found' };
        }
        const timestamp = this.clock();
        this.insertRevision(
          'claim-evidence',
          id,
          current.revision,
          current,
          status === 'deleted' ? 'unlink' : 'link',
          draft.revisionId,
          timestamp,
        );
        const saved = this.sqlite
          .prepare(
            `UPDATE research_claim_evidence SET status = ?, deleted_at = ?,
               revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ? RETURNING *`,
          )
          .get(
            status,
            status === 'deleted' ? timestamp : null,
            timestamp,
            id,
            draft.expectedRevision,
          ) as Row;
        return { kind: 'saved', value: toClaimEvidence(saved) };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.sqlite
          .prepare('SELECT * FROM research_claim_evidence WHERE id = ?')
          .get(id) as Row | undefined;
        return current
          ? { kind: 'conflict', current: toClaimEvidence(current) }
          : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async getMatrix(id: string, includeDeletedStructure: boolean): Promise<MatrixDetail | null> {
    return this.getMatrixSync(id, includeDeletedStructure);
  }

  async listMatrices(query: MatrixListQuery): Promise<KnowledgePage<ComparisonMatrix>> {
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
        `SELECT * FROM research_matrices WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const items = rows.slice(0, query.limit).map(toComparisonMatrix);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async createMatrix(draft: MatrixDraft): Promise<KnowledgeCreateResult<MatrixDetail>> {
    const failure = this.contextFailure<MatrixDetail>(this.contextState(draft.contextId));
    if (failure) return failure;
    try {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_matrices
           (id, context_id, title, description, status, status_before_delete,
            structure_revision, revision, created_at, updated_at, archived_at, deleted_at)
           VALUES (?, ?, ?, ?, 'active', NULL, 1, 1, ?, ?, NULL, NULL)`,
        )
        .run(draft.id, draft.contextId, draft.title, draft.description, timestamp, timestamp);
      const matrix = this.getMatrixSync(draft.id, false);
      if (!matrix) throw new Error('Inserted matrix could not be read');
      return { kind: 'created', value: matrix };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateMatrix(
    id: string,
    changes: MatrixChanges,
  ): Promise<KnowledgeChangeResult<MatrixDetail>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<MatrixDetail> => {
      const current = this.getMatrixSync(id, false);
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
      const reason =
        changes.status === current.status
          ? 'update'
          : changes.status === 'archived'
            ? 'archive'
            : 'restore';
      this.insertRevision(
        'matrix',
        id,
        current.revision,
        current,
        reason,
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_matrices SET context_id = ?, title = ?, description = ?, status = ?,
             archived_at = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          changes.contextId,
          changes.title,
          changes.description,
          changes.status,
          changes.status === 'archived' ? (current.archivedAt ?? timestamp) : null,
          timestamp,
          id,
          changes.expectedRevision,
        );
      const saved = this.getMatrixSync(id, false);
      if (!saved) throw new Error('Updated matrix could not be read');
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteMatrix(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>> {
    return this.changeMatrixDeletedState(id, draft, true);
  }

  async restoreMatrix(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>> {
    return this.changeMatrixDeletedState(id, draft, false);
  }

  private changeMatrixDeletedState(
    id: string,
    draft: KnowledgeRevisionDraft,
    deleting: boolean,
  ): KnowledgeChangeResult<MatrixDetail> {
    return this.sqlite.transaction((): KnowledgeChangeResult<MatrixDetail> => {
      const current = this.getMatrixSync(id, false);
      if (!current) return { kind: 'not-found' };
      const wrongState = deleting ? current.status === 'deleted' : current.status !== 'deleted';
      if (current.revision !== draft.expectedRevision || wrongState) {
        return { kind: 'conflict', current };
      }
      const context = this.contextState(current.contextId);
      if (context === 'missing') return { kind: 'context-not-found' };
      if (context === 'archived') return { kind: 'context-archived' };
      const timestamp = this.clock();
      this.insertRevision(
        'matrix',
        id,
        current.revision,
        current,
        deleting ? 'delete' : 'restore',
        draft.revisionId,
        timestamp,
      );
      if (deleting) {
        this.sqlite
          .prepare(
            `UPDATE research_matrices SET status_before_delete = status, status = 'deleted',
               deleted_at = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, timestamp, id, draft.expectedRevision);
      } else {
        this.sqlite
          .prepare(
            `UPDATE research_matrices SET status = status_before_delete,
               status_before_delete = NULL, deleted_at = NULL, revision = revision + 1,
               updated_at = ? WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, id, draft.expectedRevision);
      }
      const saved = this.getMatrixSync(id, false);
      if (!saved) throw new Error('Changed matrix could not be read');
      return { kind: 'saved', value: saved };
    })();
  }

  async updateMatrixStructure(
    id: string,
    draft: MatrixStructureDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<MatrixDetail> => {
        const current = this.getMatrixSync(id, false);
        if (!current) return { kind: 'not-found' };
        if (
          current.structureRevision !== draft.expectedStructureRevision ||
          current.status !== 'active'
        ) {
          return { kind: 'conflict', current };
        }
        const contextFailure = this.contextChangeFailure<MatrixDetail>(
          this.contextState(current.contextId),
        );
        if (contextFailure) return contextFailure;
        const positionsAreContiguous = (positions: number[]) =>
          [...positions]
            .sort((left, right) => left - right)
            .every((value, index) => value === index);
        if (
          !positionsAreContiguous(draft.columns.map((column) => column.position)) ||
          !positionsAreContiguous(draft.rows.map((row) => row.position)) ||
          new Set(draft.columns.map((column) => column.id)).size !== draft.columns.length ||
          new Set(draft.columns.map((column) => column.workId)).size !== draft.columns.length ||
          new Set(draft.rows.map((row) => row.id)).size !== draft.rows.length
        ) {
          return { kind: 'source-not-found' };
        }
        const timestamp = this.clock();
        const full = this.getMatrixSync(id, true);
        if (!full) return { kind: 'not-found' };
        const currentColumns = new Map(full.columns.map((column) => [column.id, column]));
        const currentRows = new Map(full.rows.map((row) => [row.id, row]));
        for (const column of draft.columns) {
          const existing = currentColumns.get(column.id);
          if (existing && existing.workId !== column.workId) return { kind: 'source-not-found' };
          if (
            !existing &&
            this.sqlite.prepare('SELECT 1 FROM research_matrix_columns WHERE id = ?').get(column.id)
          ) {
            return { kind: 'source-not-found' };
          }
          const work = this.sqlite
            .prepare("SELECT 1 FROM research_works WHERE id = ? AND status = 'active'")
            .get(column.workId);
          if (!work) return { kind: 'source-not-found' };
        }
        for (const row of draft.rows) {
          const existing = currentRows.get(row.id);
          if (
            existing &&
            (existing.kind !== row.kind ||
              (existing.kind === 'claim' && existing.claimId !== row.claimId))
          ) {
            return { kind: 'source-not-found' };
          }
          if (
            !existing &&
            this.sqlite.prepare('SELECT 1 FROM research_matrix_rows WHERE id = ?').get(row.id)
          ) {
            return { kind: 'source-not-found' };
          }
          if (row.kind === 'claim') {
            const claim = row.claimId ? this.getClaimSync(row.claimId) : null;
            if (!claim || claim.status === 'deleted') return { kind: 'source-not-found' };
          } else if (!row.title?.trim() && !row.question?.trim()) {
            return { kind: 'source-not-found' };
          }
        }
        const activeColumnIds = new Set(draft.columns.map((column) => column.id));
        const activeRowIds = new Set(draft.rows.map((row) => row.id));
        const reviseStructureItem = (
          entityType: 'matrix-column' | 'matrix-row',
          item: MatrixColumn | MatrixRow,
          reason: KnowledgeRevisionReason,
        ) =>
          this.insertRevision(
            entityType,
            item.id,
            item.revision,
            item,
            reason,
            `${draft.revisionId}:${entityType}:${item.id}:${item.revision}`,
            timestamp,
          );
        for (const existing of full.columns) {
          if (existing.status === 'active' && !activeColumnIds.has(existing.id)) {
            reviseStructureItem('matrix-column', existing, 'delete');
            this.sqlite
              .prepare(
                `UPDATE research_matrix_columns SET status = 'deleted', deleted_at = ?,
                   revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(timestamp, timestamp, existing.id);
          }
        }
        for (const column of draft.columns) {
          const existing = currentColumns.get(column.id);
          if (!existing) {
            this.sqlite
              .prepare(
                `INSERT INTO research_matrix_columns
                 (id, matrix_id, work_id, position, status, revision, created_at, updated_at,
                  deleted_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?, NULL)`,
              )
              .run(column.id, id, column.workId, column.position, timestamp, timestamp);
          } else if (existing.status === 'deleted' || existing.position !== column.position) {
            reviseStructureItem(
              'matrix-column',
              existing,
              existing.status === 'deleted' ? 'restore' : 'reorder',
            );
            this.sqlite
              .prepare(
                `UPDATE research_matrix_columns SET position = ?, status = 'active',
                   deleted_at = NULL, revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(column.position, timestamp, column.id);
          }
        }
        for (const existing of full.rows) {
          if (existing.status === 'active' && !activeRowIds.has(existing.id)) {
            reviseStructureItem('matrix-row', existing, 'delete');
            this.sqlite
              .prepare(
                `UPDATE research_matrix_rows SET status = 'deleted', deleted_at = ?,
                   revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(timestamp, timestamp, existing.id);
          }
        }
        for (const row of draft.rows) {
          const existing = currentRows.get(row.id);
          if (!existing) {
            this.sqlite
              .prepare(
                `INSERT INTO research_matrix_rows
                 (id, matrix_id, kind, claim_id, title, question, position, status, revision,
                  created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, NULL)`,
              )
              .run(
                row.id,
                id,
                row.kind,
                row.claimId,
                row.title,
                row.question,
                row.position,
                timestamp,
                timestamp,
              );
          } else {
            const changed =
              existing.status === 'deleted' ||
              existing.position !== row.position ||
              existing.title !== row.title ||
              existing.question !== row.question;
            if (changed) {
              const contentChanged =
                existing.title !== row.title || existing.question !== row.question;
              reviseStructureItem(
                'matrix-row',
                existing,
                existing.status === 'deleted' ? 'restore' : contentChanged ? 'update' : 'reorder',
              );
              this.sqlite
                .prepare(
                  `UPDATE research_matrix_rows SET title = ?, question = ?, position = ?,
                     status = 'active', deleted_at = NULL, revision = revision + 1,
                     updated_at = ? WHERE id = ?`,
                )
                .run(row.title, row.question, row.position, timestamp, row.id);
            }
          }
        }
        this.sqlite
          .prepare(
            `UPDATE research_matrices SET structure_revision = structure_revision + 1,
               updated_at = ? WHERE id = ? AND structure_revision = ?`,
          )
          .run(timestamp, id, draft.expectedStructureRevision);
        const saved = this.getMatrixSync(id, false);
        if (!saved) throw new Error('Updated matrix structure could not be read');
        return { kind: 'saved', value: saved };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.getMatrixSync(id, false);
        return current ? { kind: 'conflict', current } : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async getMatrixCell(id: string): Promise<MatrixCell | null> {
    return this.getMatrixCellSync(id);
  }

  async getMatrixCellWindow(
    matrixId: string,
    columnOffset: number,
    columnLimit: number,
    rowOffset: number,
    rowLimit: number,
  ): Promise<MatrixCellWindow | null> {
    const matrix = this.getMatrixSync(matrixId, false);
    if (!matrix) return null;
    const columnIds = matrix.columns
      .slice(columnOffset, columnOffset + columnLimit)
      .map((column) => column.id);
    const rowIds = matrix.rows.slice(rowOffset, rowOffset + rowLimit).map((row) => row.id);
    if (columnIds.length === 0 || rowIds.length === 0) {
      return { matrixId, columnIds, rowIds, cells: [] };
    }
    const rows = this.sqlite
      .prepare(
        `SELECT cell.id FROM research_matrix_cells cell
         JOIN research_matrix_rows row ON row.id = cell.row_id AND row.status = 'active'
         WHERE cell.matrix_id = ? AND cell.status = 'active'
           AND cell.column_id IN (${columnIds.map(() => '?').join(', ')})
           AND cell.row_id IN (${rowIds.map(() => '?').join(', ')})
         ORDER BY row.position, cell.column_id, cell.id`,
      )
      .all(matrixId, ...columnIds, ...rowIds) as Array<{ id: string }>;
    return {
      matrixId,
      columnIds,
      rowIds,
      cells: rows.flatMap((row) => {
        const cell = this.getMatrixCellSync(row.id);
        return cell ? [cell] : [];
      }),
    };
  }

  private matrixCellStructure(
    matrixId: string,
    rowId: string,
    columnId: string,
  ): {
    matrix: MatrixDetail;
    row: MatrixRow;
    column: MatrixColumn;
  } | null {
    const matrix = this.getMatrixSync(matrixId, false);
    if (!matrix) return null;
    const row = matrix.rows.find((item) => item.id === rowId);
    const column = matrix.columns.find((item) => item.id === columnId);
    return row && column ? { matrix, row, column } : null;
  }

  private evidenceCanEnterCell(row: MatrixRow, column: MatrixColumn, evidenceId: string): boolean {
    const evidence = this.getEvidenceSync(evidenceId);
    if (!evidence || evidence.status !== 'active' || evidence.workId !== column.workId)
      return false;
    if (row.kind === 'dimension') return true;
    return Boolean(
      this.sqlite
        .prepare(
          `SELECT 1 FROM research_claim_evidence
           WHERE claim_id = ? AND evidence_id = ? AND status = 'active'`,
        )
        .get(row.claimId, evidenceId),
    );
  }

  async createMatrixCell(draft: MatrixCellDraft): Promise<KnowledgeCreateResult<MatrixCell>> {
    const structure = this.matrixCellStructure(draft.matrixId, draft.rowId, draft.columnId);
    if (!structure || structure.matrix.status !== 'active') return { kind: 'source-not-found' };
    const contextFailure = this.contextFailure<MatrixCell>(
      this.contextState(structure.matrix.contextId),
    );
    if (contextFailure) return contextFailure;
    try {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_matrix_cells
           (id, matrix_id, row_id, column_id, synthesis, review_baseline_json, reviewed_at,
            status, revision, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, 'active', 1, ?, ?, NULL)`,
        )
        .run(
          draft.id,
          draft.matrixId,
          draft.rowId,
          draft.columnId,
          draft.synthesis,
          timestamp,
          timestamp,
        );
      const cell = this.getMatrixCellSync(draft.id);
      if (!cell) throw new Error('Inserted matrix cell could not be read');
      return { kind: 'created', value: cell };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateMatrixCell(
    id: string,
    changes: MatrixCellChanges,
  ): Promise<KnowledgeChangeResult<MatrixCell>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<MatrixCell> => {
      const current = this.getMatrixCellSync(id);
      if (!current) return { kind: 'not-found' };
      if (current.revision !== changes.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const structure = this.matrixCellStructure(current.matrixId, current.rowId, current.columnId);
      if (!structure || structure.matrix.status !== 'active') {
        return { kind: 'source-not-found' };
      }
      const contextFailure = this.contextChangeFailure<MatrixCell>(
        this.contextState(structure.matrix.contextId),
      );
      if (contextFailure) return contextFailure;
      const timestamp = this.clock();
      this.insertRevision(
        'matrix-cell',
        id,
        current.revision,
        current,
        'update',
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_matrix_cells SET synthesis = ?, revision = revision + 1,
             updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(changes.synthesis, timestamp, id, changes.expectedRevision);
      const saved = this.getMatrixCellSync(id);
      if (!saved) throw new Error('Updated matrix cell could not be read');
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>> {
    return this.changeMatrixCellStatus(id, draft, 'deleted');
  }

  async restoreMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>> {
    return this.changeMatrixCellStatus(id, draft, 'active');
  }

  private changeMatrixCellStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<MatrixCell> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<MatrixCell> => {
        const current = this.getMatrixCellSync(id);
        if (!current) return { kind: 'not-found' };
        const wrongState =
          status === 'deleted' ? current.status === 'deleted' : current.status !== 'deleted';
        if (current.revision !== draft.expectedRevision || wrongState) {
          return { kind: 'conflict', current };
        }
        const structure = this.matrixCellStructure(
          current.matrixId,
          current.rowId,
          current.columnId,
        );
        if (!structure || structure.matrix.status !== 'active') {
          return { kind: 'source-not-found' };
        }
        const contextFailure = this.contextChangeFailure<MatrixCell>(
          this.contextState(structure.matrix.contextId),
        );
        if (contextFailure) return contextFailure;
        const timestamp = this.clock();
        this.insertRevision(
          'matrix-cell',
          id,
          current.revision,
          current,
          status === 'deleted' ? 'delete' : 'restore',
          draft.revisionId,
          timestamp,
        );
        this.sqlite
          .prepare(
            `UPDATE research_matrix_cells SET status = ?, deleted_at = ?,
               revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            status,
            status === 'deleted' ? timestamp : null,
            timestamp,
            id,
            draft.expectedRevision,
          );
        const saved = this.getMatrixCellSync(id);
        if (!saved) throw new Error('Changed matrix cell could not be read');
        return { kind: 'saved', value: saved };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.getMatrixCellSync(id);
        return current ? { kind: 'conflict', current } : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async reviewMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<MatrixCell> => {
      const current = this.getMatrixCellSync(id);
      if (!current) return { kind: 'not-found' };
      if (current.revision !== draft.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const structure = this.matrixCellStructure(current.matrixId, current.rowId, current.columnId);
      if (!structure || structure.matrix.status !== 'active') {
        return { kind: 'source-not-found' };
      }
      const contextFailure = this.contextChangeFailure<MatrixCell>(
        this.contextState(structure.matrix.contextId),
      );
      if (contextFailure) return contextFailure;
      const baseline = this.matrixReviewBaseline(current.rowId, current.columnId, id);
      const timestamp = this.clock();
      this.insertRevision(
        'matrix-cell',
        id,
        current.revision,
        current,
        'review',
        draft.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_matrix_cells SET review_baseline_json = ?, reviewed_at = ?,
             revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(JSON.stringify(baseline), timestamp, timestamp, id, draft.expectedRevision);
      const saved = this.getMatrixCellSync(id);
      if (!saved) throw new Error('Reviewed matrix cell could not be read');
      return { kind: 'saved', value: saved };
    })();
  }

  async getMatrixCandidates(
    matrixId: string,
    rowId: string,
    columnId: string,
  ): Promise<MatrixCandidates | null> {
    const structure = this.matrixCellStructure(matrixId, rowId, columnId);
    if (!structure) return null;
    const cellRow = this.sqlite
      .prepare(
        `SELECT id FROM research_matrix_cells
         WHERE row_id = ? AND column_id = ? AND status = 'active'`,
      )
      .get(rowId, columnId) as { id: string } | undefined;
    const selectedRows = cellRow
      ? (this.sqlite
          .prepare(
            `SELECT id, evidence_id, revision FROM research_matrix_cell_evidence
             WHERE cell_id = ? AND status = 'active' ORDER BY evidence_id`,
          )
          .all(cellRow.id) as Array<{ id: string; evidence_id: string; revision: number }>)
      : [];
    const selected = new Map(
      selectedRows.map((link) => [link.evidence_id, { id: link.id, revision: link.revision }]),
    );
    const candidateIds =
      structure.row.kind === 'claim'
        ? (
            this.sqlite
              .prepare(
                `SELECT relation.evidence_id
                 FROM research_claim_evidence relation
                 JOIN research_evidence evidence ON evidence.id = relation.evidence_id
                 WHERE relation.claim_id = ? AND relation.status = 'active'
                   AND evidence.status = 'active' AND evidence.work_id = ?
                 ORDER BY evidence.updated_at DESC, evidence.id DESC`,
              )
              .all(structure.row.claimId, structure.column.workId) as Array<{
              evidence_id: string;
            }>
          ).map((row) => row.evidence_id)
        : (
            this.sqlite
              .prepare(
                `SELECT id AS evidence_id FROM research_evidence
                 WHERE work_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC`,
              )
              .all(structure.column.workId) as Array<{ evidence_id: string }>
          ).map((row) => row.evidence_id);
    const ids = [...new Set([...selected.keys(), ...candidateIds])];
    return {
      matrixId,
      rowId,
      columnId,
      cellId: cellRow?.id ?? null,
      candidates: ids.flatMap((evidenceId) => {
        const evidence = this.getEvidenceSync(evidenceId);
        const selectedLink = selected.get(evidenceId) ?? null;
        return evidence
          ? [
              {
                evidence,
                selectedLinkId: selectedLink?.id ?? null,
                selectedLinkRevision: selectedLink?.revision ?? null,
              },
            ]
          : [];
      }),
    };
  }

  async getMatrixCellEvidence(id: string): Promise<MatrixCellEvidence | null> {
    const row = this.sqlite
      .prepare('SELECT * FROM research_matrix_cell_evidence WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toMatrixCellEvidence(row) : null;
  }

  async listMatrixCellEvidence(
    cellId: string,
    includeDeleted: boolean,
  ): Promise<MatrixCellEvidence[] | null> {
    if (!this.sqlite.prepare('SELECT 1 FROM research_matrix_cells WHERE id = ?').get(cellId)) {
      return null;
    }
    return (
      this.sqlite
        .prepare(
          `SELECT * FROM research_matrix_cell_evidence WHERE cell_id = ?
           ${includeDeleted ? '' : "AND status = 'active'"}
           ORDER BY updated_at DESC, id DESC`,
        )
        .all(cellId) as Row[]
    ).map(toMatrixCellEvidence);
  }

  async createMatrixCellEvidence(
    draft: MatrixCellEvidenceDraft,
  ): Promise<KnowledgeCreateResult<MatrixCellEvidence>> {
    const cell = this.getMatrixCellSync(draft.cellId);
    if (!cell || cell.status === 'deleted') return { kind: 'source-not-found' };
    const structure = this.matrixCellStructure(cell.matrixId, cell.rowId, cell.columnId);
    if (!structure || structure.matrix.status !== 'active') return { kind: 'source-not-found' };
    const contextFailure = this.contextFailure<MatrixCellEvidence>(
      this.contextState(structure.matrix.contextId),
    );
    if (contextFailure) return contextFailure;
    if (!this.evidenceCanEnterCell(structure.row, structure.column, draft.evidenceId)) {
      return { kind: 'source-not-found' };
    }
    try {
      const timestamp = this.clock();
      const row = this.sqlite
        .prepare(
          `INSERT INTO research_matrix_cell_evidence
           (id, cell_id, evidence_id, status, revision, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 'active', 1, ?, ?, NULL) RETURNING *`,
        )
        .get(draft.id, draft.cellId, draft.evidenceId, timestamp, timestamp) as Row;
      return { kind: 'created', value: toMatrixCellEvidence(row) };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async deleteMatrixCellEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCellEvidence>> {
    return this.changeMatrixCellEvidenceStatus(id, draft, 'deleted');
  }

  async restoreMatrixCellEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCellEvidence>> {
    return this.changeMatrixCellEvidenceStatus(id, draft, 'active');
  }

  private changeMatrixCellEvidenceStatus(
    id: string,
    draft: KnowledgeRevisionDraft,
    status: KnowledgeBasicStatus,
  ): KnowledgeChangeResult<MatrixCellEvidence> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<MatrixCellEvidence> => {
        const current = this.sqlite
          .prepare('SELECT * FROM research_matrix_cell_evidence WHERE id = ?')
          .get(id) as Row | undefined;
        if (!current) return { kind: 'not-found' };
        const link = toMatrixCellEvidence(current);
        const wrongState =
          status === 'deleted' ? link.status === 'deleted' : link.status !== 'deleted';
        if (link.revision !== draft.expectedRevision || wrongState) {
          return { kind: 'conflict', current: link };
        }
        const cell = this.getMatrixCellSync(link.cellId);
        if (!cell || cell.status === 'deleted') return { kind: 'source-not-found' };
        const structure = this.matrixCellStructure(cell.matrixId, cell.rowId, cell.columnId);
        if (!structure || structure.matrix.status !== 'active') {
          return { kind: 'source-not-found' };
        }
        const contextFailure = this.contextChangeFailure<MatrixCellEvidence>(
          this.contextState(structure.matrix.contextId),
        );
        if (contextFailure) return contextFailure;
        if (
          status === 'active' &&
          !this.evidenceCanEnterCell(structure.row, structure.column, link.evidenceId)
        ) {
          return { kind: 'source-not-found' };
        }
        const timestamp = this.clock();
        this.insertRevision(
          'matrix-cell-evidence',
          id,
          link.revision,
          link,
          status === 'deleted' ? 'unlink' : 'link',
          draft.revisionId,
          timestamp,
        );
        const saved = this.sqlite
          .prepare(
            `UPDATE research_matrix_cell_evidence SET status = ?, deleted_at = ?,
               revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ? RETURNING *`,
          )
          .get(
            status,
            status === 'deleted' ? timestamp : null,
            timestamp,
            id,
            draft.expectedRevision,
          ) as Row;
        return { kind: 'saved', value: toMatrixCellEvidence(saved) };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.sqlite
          .prepare('SELECT * FROM research_matrix_cell_evidence WHERE id = ?')
          .get(id) as Row | undefined;
        return current
          ? { kind: 'conflict', current: toMatrixCellEvidence(current) }
          : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async getWritingDocument(
    id: string,
    includeDeletedStructure: boolean,
  ): Promise<WritingDocumentDetail | null> {
    return this.getWritingDocumentSync(id, includeDeletedStructure);
  }

  async listWritingDocuments(
    query: WritingDocumentListQuery,
  ): Promise<KnowledgePage<WritingDocument>> {
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
        `SELECT * FROM research_writing_documents WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const items = rows.slice(0, query.limit).map(toWritingDocument);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > query.limit && last ? { updatedAt: last.updatedAt, id: last.id } : null,
    };
  }

  async createWritingDocument(
    draft: WritingDocumentDraft,
  ): Promise<KnowledgeCreateResult<WritingDocumentDetail>> {
    const failure = this.contextFailure<WritingDocumentDetail>(this.contextState(draft.contextId));
    if (failure) return failure;
    try {
      const timestamp = this.clock();
      this.sqlite
        .prepare(
          `INSERT INTO research_writing_documents
           (id, context_id, title, status, status_before_delete, structure_revision, revision,
            created_at, updated_at, archived_at, deleted_at)
           VALUES (?, ?, ?, 'active', NULL, 1, 1, ?, ?, NULL, NULL)`,
        )
        .run(draft.id, draft.contextId, draft.title, timestamp, timestamp);
      const document = this.getWritingDocumentSync(draft.id, false);
      if (!document) throw new Error('Inserted writing document could not be read');
      this.syncWritingSearch(document);
      return { kind: 'created', value: document };
    } catch (error) {
      if (isConstraintError(error)) return { kind: 'conflict' };
      throw error;
    }
  }

  async updateWritingDocument(
    id: string,
    changes: WritingDocumentChanges,
  ): Promise<KnowledgeChangeResult<WritingDocumentDetail>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<WritingDocumentDetail> => {
      const current = this.getWritingDocumentSync(id, false);
      if (!current) return { kind: 'not-found' };
      if (current.revision !== changes.expectedRevision || current.status === 'deleted') {
        return { kind: 'conflict', current };
      }
      const currentFailure = this.contextChangeFailure<WritingDocumentDetail>(
        this.contextState(current.contextId),
      );
      if (currentFailure) return currentFailure;
      const targetFailure = this.contextChangeFailure<WritingDocumentDetail>(
        this.contextState(changes.contextId),
      );
      if (targetFailure) return targetFailure;
      const timestamp = this.clock();
      const reason =
        changes.status === current.status
          ? 'update'
          : changes.status === 'archived'
            ? 'archive'
            : 'restore';
      this.insertRevision(
        'writing-document',
        id,
        current.revision,
        current,
        reason,
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_writing_documents SET context_id = ?, title = ?, status = ?,
             archived_at = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          changes.contextId,
          changes.title,
          changes.status,
          changes.status === 'archived' ? (current.archivedAt ?? timestamp) : null,
          timestamp,
          id,
          changes.expectedRevision,
        );
      const saved = this.getWritingDocumentSync(id, false);
      if (!saved) throw new Error('Updated writing document could not be read');
      this.syncWritingSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async deleteWritingDocument(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<WritingDocumentDetail>> {
    return this.changeWritingDocumentDeletedState(id, draft, true);
  }

  async restoreWritingDocument(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<WritingDocumentDetail>> {
    return this.changeWritingDocumentDeletedState(id, draft, false);
  }

  private changeWritingDocumentDeletedState(
    id: string,
    draft: KnowledgeRevisionDraft,
    deleting: boolean,
  ): KnowledgeChangeResult<WritingDocumentDetail> {
    return this.sqlite.transaction((): KnowledgeChangeResult<WritingDocumentDetail> => {
      const current = this.getWritingDocumentSync(id, false);
      if (!current) return { kind: 'not-found' };
      const wrongState = deleting ? current.status === 'deleted' : current.status !== 'deleted';
      if (current.revision !== draft.expectedRevision || wrongState) {
        return { kind: 'conflict', current };
      }
      const contextFailure = this.contextChangeFailure<WritingDocumentDetail>(
        this.contextState(current.contextId),
      );
      if (contextFailure) return contextFailure;
      const timestamp = this.clock();
      this.insertRevision(
        'writing-document',
        id,
        current.revision,
        current,
        deleting ? 'delete' : 'restore',
        draft.revisionId,
        timestamp,
      );
      if (deleting) {
        this.sqlite
          .prepare(
            `UPDATE research_writing_documents SET status_before_delete = status,
               status = 'deleted', deleted_at = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, timestamp, id, draft.expectedRevision);
      } else {
        this.sqlite
          .prepare(
            `UPDATE research_writing_documents SET status = status_before_delete,
               status_before_delete = NULL, deleted_at = NULL, revision = revision + 1,
               updated_at = ? WHERE id = ? AND revision = ?`,
          )
          .run(timestamp, id, draft.expectedRevision);
      }
      const saved = this.getWritingDocumentSync(id, false);
      if (!saved) throw new Error('Changed writing document could not be read');
      this.syncWritingSearch(saved);
      return { kind: 'saved', value: saved };
    })();
  }

  async updateWritingStructure(
    id: string,
    draft: WritingStructureDraft,
  ): Promise<KnowledgeChangeResult<WritingDocumentDetail>> {
    try {
      return this.sqlite.transaction((): KnowledgeChangeResult<WritingDocumentDetail> => {
        const current = this.getWritingDocumentSync(id, false);
        if (!current) return { kind: 'not-found' };
        if (
          current.structureRevision !== draft.expectedStructureRevision ||
          current.status !== 'active'
        ) {
          return { kind: 'conflict', current };
        }
        const contextFailure = this.contextChangeFailure<WritingDocumentDetail>(
          this.contextState(current.contextId),
        );
        if (contextFailure) return contextFailure;
        const contiguous = (positions: number[]) =>
          [...positions]
            .sort((left, right) => left - right)
            .every((position, index) => position === index);
        const blocks = draft.sections.flatMap((section) => section.blocks);
        if (
          !contiguous(draft.sections.map((section) => section.position)) ||
          draft.sections.some(
            (section) => !contiguous(section.blocks.map((block) => block.position)),
          ) ||
          new Set(draft.sections.map((section) => section.id)).size !== draft.sections.length ||
          new Set(blocks.map((block) => block.id)).size !== blocks.length
        ) {
          return { kind: 'source-not-found' };
        }
        const full = this.getWritingDocumentSync(id, true);
        if (!full) return { kind: 'not-found' };
        const currentSections = new Map(full.sections.map((section) => [section.id, section]));
        const currentBlocks = new Map(
          full.sections.flatMap((section) => section.blocks).map((block) => [block.id, block]),
        );
        for (const section of draft.sections) {
          const existing = currentSections.get(section.id);
          if (section.existing !== Boolean(existing)) return { kind: 'source-not-found' };
          if (
            !existing &&
            this.sqlite
              .prepare('SELECT 1 FROM research_writing_sections WHERE id = ?')
              .get(section.id)
          ) {
            return { kind: 'source-not-found' };
          }
          for (const block of section.blocks) {
            const existingBlock = currentBlocks.get(block.id);
            if (block.existing !== Boolean(existingBlock)) return { kind: 'source-not-found' };
            if (
              !existingBlock &&
              this.sqlite
                .prepare('SELECT 1 FROM research_writing_blocks WHERE id = ?')
                .get(block.id)
            ) {
              return { kind: 'source-not-found' };
            }
            if (existingBlock) {
              if (
                existingBlock.kind !== block.kind ||
                existingBlock.text !== block.text ||
                existingBlock.targetId !== block.targetId
              ) {
                return { kind: 'source-not-found' };
              }
            } else if (block.kind !== 'text') {
              const target = block.targetId ? this.writingTarget(block.kind, block.targetId) : null;
              if (!target || target.state === 'deleted') return { kind: 'source-not-found' };
            }
          }
        }
        const timestamp = this.clock();
        const desiredSectionIds = new Set(draft.sections.map((section) => section.id));
        const desiredBlockIds = new Set(blocks.map((block) => block.id));
        const revise = (
          entityType: 'writing-section' | 'writing-block',
          item: WritingSection | WritingBlock,
          reason: KnowledgeRevisionReason,
        ) =>
          this.insertRevision(
            entityType,
            item.id,
            item.revision,
            item,
            reason,
            `${draft.revisionId}:${entityType}:${item.id}:${item.revision}`,
            timestamp,
          );
        for (const existing of currentBlocks.values()) {
          if (existing.status === 'active' && !desiredBlockIds.has(existing.id)) {
            revise('writing-block', existing, 'unlink');
            this.sqlite
              .prepare(
                `UPDATE research_writing_blocks SET status = 'deleted', deleted_at = ?,
                   revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(timestamp, timestamp, existing.id);
          }
        }
        for (const existing of currentSections.values()) {
          if (existing.status === 'active' && !desiredSectionIds.has(existing.id)) {
            revise('writing-section', existing, 'delete');
            this.sqlite
              .prepare(
                `UPDATE research_writing_sections SET status = 'deleted', deleted_at = ?,
                   revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(timestamp, timestamp, existing.id);
          }
        }
        for (const section of draft.sections) {
          const existing = currentSections.get(section.id);
          if (!existing) {
            this.sqlite
              .prepare(
                `INSERT INTO research_writing_sections
                 (id, document_id, title, position, status, revision, created_at, updated_at,
                  deleted_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?, NULL)`,
              )
              .run(section.id, id, section.title, section.position, timestamp, timestamp);
          } else if (
            existing.status === 'deleted' ||
            existing.title !== section.title ||
            existing.position !== section.position
          ) {
            revise(
              'writing-section',
              existing,
              existing.status === 'deleted'
                ? 'restore'
                : existing.title !== section.title
                  ? 'update'
                  : 'reorder',
            );
            this.sqlite
              .prepare(
                `UPDATE research_writing_sections SET title = ?, position = ?, status = 'active',
                   deleted_at = NULL, revision = revision + 1, updated_at = ? WHERE id = ?`,
              )
              .run(section.title, section.position, timestamp, section.id);
          }
        }
        for (const section of draft.sections) {
          for (const block of section.blocks) {
            const existing = currentBlocks.get(block.id);
            if (!existing) {
              const targetColumns = {
                noteId: block.kind === 'note' ? block.targetId : null,
                evidenceId: block.kind === 'evidence' ? block.targetId : null,
                claimId: block.kind === 'claim' ? block.targetId : null,
                matrixId: block.kind === 'matrix' ? block.targetId : null,
                workId: block.kind === 'citation' ? block.targetId : null,
                editionId: block.kind === 'citation' ? (block.citation?.editionId ?? null) : null,
                citationIntentJson:
                  block.kind === 'citation' && block.citation
                    ? JSON.stringify({
                        locator: block.citation.locator,
                        label: block.citation.label,
                        prefix: block.citation.prefix,
                        suffix: block.citation.suffix,
                        suppressAuthor: block.citation.suppressAuthor,
                      })
                    : null,
              };
              this.sqlite
                .prepare(
                  `INSERT INTO research_writing_blocks
                   (id, document_id, section_id, kind, text_content, note_id, evidence_id,
                    claim_id, matrix_id, work_id, edition_id, citation_intent_json, target_label,
                    position, status, revision, created_at, updated_at, deleted_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, NULL)`,
                )
                .run(
                  block.id,
                  id,
                  section.id,
                  block.kind,
                  block.text,
                  targetColumns.noteId,
                  targetColumns.evidenceId,
                  targetColumns.claimId,
                  targetColumns.matrixId,
                  targetColumns.workId,
                  targetColumns.editionId,
                  targetColumns.citationIntentJson,
                  block.targetLabel,
                  block.position,
                  timestamp,
                  timestamp,
                );
            } else if (
              existing.status === 'deleted' ||
              existing.sectionId !== section.id ||
              existing.position !== block.position
            ) {
              revise('writing-block', existing, existing.status === 'deleted' ? 'link' : 'reorder');
              this.sqlite
                .prepare(
                  `UPDATE research_writing_blocks SET section_id = ?, position = ?,
                     status = 'active', deleted_at = NULL, revision = revision + 1,
                     updated_at = ? WHERE id = ?`,
                )
                .run(section.id, block.position, timestamp, block.id);
            }
          }
        }
        this.sqlite
          .prepare(
            `UPDATE research_writing_documents SET structure_revision = structure_revision + 1,
               updated_at = ? WHERE id = ? AND structure_revision = ?`,
          )
          .run(timestamp, id, draft.expectedStructureRevision);
        const saved = this.getWritingDocumentSync(id, false);
        if (!saved) throw new Error('Updated writing structure could not be read');
        this.syncWritingSearch(saved);
        return { kind: 'saved', value: saved };
      })();
    } catch (error) {
      if (isConstraintError(error)) {
        const current = this.getWritingDocumentSync(id, false);
        return current ? { kind: 'conflict', current } : { kind: 'not-found' };
      }
      throw error;
    }
  }

  async getWritingCitationTarget(workId: string, editionId: string | null) {
    const row = this.sqlite
      .prepare('SELECT id, title, status, preferred_edition_id FROM research_works WHERE id = ?')
      .get(workId) as Row | undefined;
    if (!row) return null;
    const resolvedEditionId = editionId ?? nullableText(row, 'preferred_edition_id');
    if (
      resolvedEditionId &&
      !this.sqlite
        .prepare('SELECT 1 FROM research_editions WHERE id = ? AND work_id = ?')
        .get(resolvedEditionId, workId)
    ) {
      return null;
    }
    return {
      workId: requiredText(row, 'id'),
      editionId: resolvedEditionId,
      title: requiredText(row, 'title'),
      status: requiredText(row, 'status') as 'active' | 'trashed' | 'merged',
    };
  }

  async getWritingBlock(id: string): Promise<WritingBlock | null> {
    return this.getWritingBlockSync(id);
  }

  async updateWritingBlock(
    id: string,
    changes: WritingBlockChanges,
  ): Promise<KnowledgeChangeResult<WritingBlock>> {
    return this.sqlite.transaction((): KnowledgeChangeResult<WritingBlock> => {
      const current = this.getWritingBlockSync(id);
      if (!current) return { kind: 'not-found' };
      if (
        current.kind !== 'text' ||
        current.status === 'deleted' ||
        current.revision !== changes.expectedRevision
      ) {
        return { kind: 'conflict', current };
      }
      const document = this.getWritingDocumentSync(current.documentId, false);
      if (!document || document.status !== 'active') return { kind: 'source-not-found' };
      const section = document.sections.find((item) => item.id === current.sectionId);
      if (!section) return { kind: 'source-not-found' };
      const contextFailure = this.contextChangeFailure<WritingBlock>(
        this.contextState(document.contextId),
      );
      if (contextFailure) return contextFailure;
      const timestamp = this.clock();
      this.insertRevision(
        'writing-block',
        id,
        current.revision,
        current,
        'update',
        changes.revisionId,
        timestamp,
      );
      this.sqlite
        .prepare(
          `UPDATE research_writing_blocks SET text_content = ?, revision = revision + 1,
             updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(changes.text, timestamp, id, changes.expectedRevision);
      const saved = this.getWritingBlockSync(id);
      if (!saved) throw new Error('Updated writing block could not be read');
      const savedDocument = this.getWritingDocumentSync(current.documentId, false);
      if (!savedDocument) throw new Error('Updated writing document could not be read');
      this.syncWritingSearch(savedDocument);
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
        claimId: draft.target.kind === 'claim' ? draft.target.claimId : null,
      };
      const row = this.sqlite
        .prepare(
          `INSERT INTO research_note_links
           (id, note_id, work_id, annotation_id, evidence_id, claim_id, status, revision,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?) RETURNING *`,
        )
        .get(
          draft.id,
          draft.noteId,
          columns.workId,
          columns.annotationId,
          columns.evidenceId,
          columns.claimId,
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
    entityType: KnowledgeEntityType,
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
