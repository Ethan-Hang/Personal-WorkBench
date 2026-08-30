import type Database from 'better-sqlite3';
import {
  evidenceSourceSnapshotSchema,
  matrixReviewBaselineSchema,
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
