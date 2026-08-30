import type {
  Annotation,
  Evidence,
  EvidenceSourceState,
  EvidenceSourceSnapshot,
  KnowledgeBasicStatus,
  KnowledgeRevision,
  KnowledgeRevisionReason,
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

  listRevisions(
    entityType: 'note' | 'evidence' | 'note-link',
    entityId: string,
  ): Promise<KnowledgeRevision[]>;
}

export function revisionReasonForStatus(status: KnowledgeBasicStatus): KnowledgeRevisionReason {
  return status === 'deleted' ? 'delete' : 'restore';
}
