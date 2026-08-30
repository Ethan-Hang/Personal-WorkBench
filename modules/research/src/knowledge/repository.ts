import type {
  Annotation,
  Claim,
  ClaimEditableStatus,
  ClaimEvidence,
  ClaimEvidenceRelation,
  ClaimStatus,
  ComparisonMatrix,
  Evidence,
  EvidenceSourceState,
  EvidenceSourceSnapshot,
  KnowledgeBasicStatus,
  KnowledgeRevision,
  KnowledgeEntityType,
  KnowledgeRevisionReason,
  MatrixCandidates,
  MatrixCell,
  MatrixCellEvidence,
  MatrixCellWindow,
  MatrixDetail,
  MatrixRow,
  MatrixColumn,
  MatrixStatus,
  NoteLink,
  NoteLinkTarget,
  ResearchNote,
} from '../contract.js';
import type { AnnotationDraft } from '../annotation/repository.js';

export interface KnowledgeCursor {
  updatedAt: string;
  id: string;
}

export interface KnowledgeListQuery {
  contextId?: string | null;
  status: KnowledgeBasicStatus;
  before?: KnowledgeCursor;
  limit: number;
}

export interface EvidenceListQuery extends KnowledgeListQuery {
  workId?: string;
  sourceState?: EvidenceSourceState;
}

export interface ClaimListQuery {
  contextId?: string | null;
  status: ClaimStatus;
  before?: KnowledgeCursor;
  limit: number;
}

export interface MatrixListQuery {
  contextId?: string | null;
  status: MatrixStatus;
  before?: KnowledgeCursor;
  limit: number;
}

export interface KnowledgePage<T> {
  items: T[];
  next: KnowledgeCursor | null;
}

export interface OcrSourceIdentity {
  engine: string;
  engineVersion: string;
  languagePackVersion: string;
  languagesKey: string;
}

export interface KnowledgeAssetSource {
  workId: string;
  workTitle: string;
  editionId: string;
  editionTitle: string | null;
  assetId: string;
  assetHash: string;
  ocr: OcrSourceIdentity | null;
}

export interface KnowledgeAnnotationSource extends KnowledgeAssetSource {
  annotation: Annotation;
}

export interface NoteDraft {
  id: string;
  contextId: string | null;
  title: string;
  body: string;
}

export interface NoteChanges {
  contextId: string | null;
  title: string;
  body: string;
  expectedRevision: number;
  revisionId: string;
}

export interface EvidenceDraft {
  id: string;
  contextId: string | null;
  workId: string;
  editionId: string | null;
  assetId: string;
  annotationId: string;
  sourceSnapshot: EvidenceSourceSnapshot;
  title: string | null;
  summary: string;
  notes: string | null;
}

export interface DirectEvidenceDraft {
  annotation: AnnotationDraft;
  evidence: EvidenceDraft;
}

export interface EvidenceChanges {
  contextId: string | null;
  title: string | null;
  summary: string;
  notes: string | null;
  expectedRevision: number;
  revisionId: string;
}

export interface EvidenceRebindChanges {
  workId: string;
  editionId: string | null;
  assetId: string;
  annotationId: string;
  sourceSnapshot: EvidenceSourceSnapshot;
  expectedRevision: number;
  revisionId: string;
}

export interface ClaimDraft {
  id: string;
  contextId: string | null;
  statement: string;
  rationale: string | null;
  status: ClaimEditableStatus;
}

export interface ClaimChanges {
  contextId: string | null;
  statement: string;
  rationale: string | null;
  status: ClaimEditableStatus;
  expectedRevision: number;
  revisionId: string;
}

export interface ClaimEvidenceDraft {
  id: string;
  claimId: string;
  evidenceId: string;
  relation: ClaimEvidenceRelation;
  note: string | null;
}

export interface ClaimEvidenceChanges {
  relation: ClaimEvidenceRelation;
  note: string | null;
  expectedRevision: number;
  revisionId: string;
}

export interface MatrixDraft {
  id: string;
  contextId: string | null;
  title: string;
  description: string | null;
}

export interface MatrixChanges {
  contextId: string | null;
  title: string;
  description: string | null;
  status: 'active' | 'archived';
  expectedRevision: number;
  revisionId: string;
}

export interface MatrixStructureDraft {
  expectedStructureRevision: number;
  revisionId: string;
  columns: Array<Pick<MatrixColumn, 'id' | 'workId' | 'position'>>;
  rows: Array<
    Pick<MatrixRow, 'id' | 'kind' | 'position'> & {
      claimId: string | null;
      title: string | null;
      question: string | null;
    }
  >;
}

export interface MatrixCellDraft {
  id: string;
  matrixId: string;
  rowId: string;
  columnId: string;
  synthesis: string;
}

export interface MatrixCellChanges {
  synthesis: string;
  expectedRevision: number;
  revisionId: string;
}

export interface MatrixCellEvidenceDraft {
  id: string;
  cellId: string;
  evidenceId: string;
}

export interface KnowledgeRevisionDraft {
  expectedRevision: number;
  revisionId: string;
}

export interface NoteLinkDraft {
  id: string;
  noteId: string;
  target: NoteLinkTarget;
}

export type KnowledgeCreateResult<T> =
  | { kind: 'created'; value: T }
  | { kind: 'context-not-found' }
  | { kind: 'context-archived' }
  | { kind: 'source-not-found' }
  | { kind: 'conflict' };

export type KnowledgeChangeResult<T> =
  | { kind: 'saved'; value: T }
  | { kind: 'conflict'; current: T }
  | { kind: 'not-found' }
  | { kind: 'context-not-found' }
  | { kind: 'context-archived' }
  | { kind: 'source-not-found' };

export interface DirectEvidenceResult {
  annotation: Annotation;
  evidence: Evidence;
}

export interface KnowledgeRepository {
  getAnnotationSource(annotationId: string): Promise<KnowledgeAnnotationSource | null>;
  getAssetSource(
    assetId: string,
    editionId: string | null,
    pageNumber: number,
  ): Promise<KnowledgeAssetSource | null>;

  getNote(id: string): Promise<ResearchNote | null>;
  listNotes(query: KnowledgeListQuery): Promise<KnowledgePage<ResearchNote>>;
  createNote(draft: NoteDraft): Promise<KnowledgeCreateResult<ResearchNote>>;
  updateNote(id: string, changes: NoteChanges): Promise<KnowledgeChangeResult<ResearchNote>>;
  deleteNote(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ResearchNote>>;
  restoreNote(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ResearchNote>>;

  getEvidence(id: string): Promise<Evidence | null>;
  listEvidence(query: EvidenceListQuery): Promise<KnowledgePage<Evidence>>;
  createEvidence(draft: EvidenceDraft): Promise<KnowledgeCreateResult<Evidence>>;
  createAnnotationWithEvidence(
    draft: DirectEvidenceDraft,
  ): Promise<KnowledgeCreateResult<DirectEvidenceResult>>;
  updateEvidence(id: string, changes: EvidenceChanges): Promise<KnowledgeChangeResult<Evidence>>;
  rebindEvidence(
    id: string,
    changes: EvidenceRebindChanges,
  ): Promise<KnowledgeChangeResult<Evidence>>;
  deleteEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Evidence>>;
  restoreEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<Evidence>>;

  getClaim(id: string): Promise<Claim | null>;
  listClaims(query: ClaimListQuery): Promise<KnowledgePage<Claim>>;
  createClaim(draft: ClaimDraft): Promise<KnowledgeCreateResult<Claim>>;
  updateClaim(id: string, changes: ClaimChanges): Promise<KnowledgeChangeResult<Claim>>;
  deleteClaim(id: string, draft: KnowledgeRevisionDraft): Promise<KnowledgeChangeResult<Claim>>;
  restoreClaim(id: string, draft: KnowledgeRevisionDraft): Promise<KnowledgeChangeResult<Claim>>;

  listClaimEvidence(claimId: string, includeDeleted: boolean): Promise<ClaimEvidence[] | null>;
  getClaimEvidence(id: string): Promise<ClaimEvidence | null>;
  createClaimEvidence(draft: ClaimEvidenceDraft): Promise<KnowledgeCreateResult<ClaimEvidence>>;
  updateClaimEvidence(
    id: string,
    changes: ClaimEvidenceChanges,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>>;
  deleteClaimEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>>;
  restoreClaimEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<ClaimEvidence>>;

  getMatrix(id: string, includeDeletedStructure: boolean): Promise<MatrixDetail | null>;
  listMatrices(query: MatrixListQuery): Promise<KnowledgePage<ComparisonMatrix>>;
  createMatrix(draft: MatrixDraft): Promise<KnowledgeCreateResult<MatrixDetail>>;
  updateMatrix(id: string, changes: MatrixChanges): Promise<KnowledgeChangeResult<MatrixDetail>>;
  deleteMatrix(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>>;
  restoreMatrix(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>>;
  updateMatrixStructure(
    id: string,
    draft: MatrixStructureDraft,
  ): Promise<KnowledgeChangeResult<MatrixDetail>>;

  getMatrixCell(id: string): Promise<MatrixCell | null>;
  getMatrixCellWindow(
    matrixId: string,
    columnOffset: number,
    columnLimit: number,
    rowOffset: number,
    rowLimit: number,
  ): Promise<MatrixCellWindow | null>;
  createMatrixCell(draft: MatrixCellDraft): Promise<KnowledgeCreateResult<MatrixCell>>;
  updateMatrixCell(
    id: string,
    changes: MatrixCellChanges,
  ): Promise<KnowledgeChangeResult<MatrixCell>>;
  deleteMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>>;
  restoreMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>>;
  reviewMatrixCell(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCell>>;
  getMatrixCandidates(
    matrixId: string,
    rowId: string,
    columnId: string,
  ): Promise<MatrixCandidates | null>;

  getMatrixCellEvidence(id: string): Promise<MatrixCellEvidence | null>;
  listMatrixCellEvidence(
    cellId: string,
    includeDeleted: boolean,
  ): Promise<MatrixCellEvidence[] | null>;
  createMatrixCellEvidence(
    draft: MatrixCellEvidenceDraft,
  ): Promise<KnowledgeCreateResult<MatrixCellEvidence>>;
  deleteMatrixCellEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCellEvidence>>;
  restoreMatrixCellEvidence(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<MatrixCellEvidence>>;

  listNoteLinks(noteId: string, includeDeleted: boolean): Promise<NoteLink[] | null>;
  createNoteLink(draft: NoteLinkDraft): Promise<KnowledgeCreateResult<NoteLink>>;
  deleteNoteLink(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<NoteLink>>;
  restoreNoteLink(
    id: string,
    draft: KnowledgeRevisionDraft,
  ): Promise<KnowledgeChangeResult<NoteLink>>;

  listRevisions(entityType: KnowledgeEntityType, entityId: string): Promise<KnowledgeRevision[]>;
}

export function revisionReasonForStatus(status: KnowledgeBasicStatus): KnowledgeRevisionReason {
  return status === 'deleted' ? 'delete' : 'restore';
}
