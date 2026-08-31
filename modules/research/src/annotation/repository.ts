import type {
  Annotation,
  AnnotationAnchor,
  AnnotationKind,
  AnnotationRevision,
  AnnotationStatus,
  ReadingContext,
  ReadingContextArchiveStrategy,
  ReadingContextDeletionPreview,
  ReadingContextStatus,
} from '../contract.js';

export interface ReadingContextDraft {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  color: string | null;
}

export interface ReadingContextChanges {
  name: string;
  normalizedName: string;
  description: string | null;
  color: string | null;
}

export type ReadingContextWriteResult =
  { kind: 'saved'; context: ReadingContext } | { kind: 'conflict' } | { kind: 'not-found' };

export interface ArchiveReadingContextResult {
  context: ReadingContext;
  movedAnnotations: number;
}

export type ReadingContextArchiveResult =
  { kind: 'archived'; result: ArchiveReadingContextResult } | { kind: 'not-found' };

export interface CollectionContextRecord {
  collectionId: string;
  context: ReadingContext | null;
  updatedAt: string | null;
}

export type CollectionContextWriteResult =
  | { kind: 'saved'; binding: CollectionContextRecord }
  | { kind: 'collection-not-found' }
  | { kind: 'context-not-found' };

export interface AnnotationAssetIdentity {
  assetId: string;
  contentHash: string;
  editionIds: string[];
}

export interface AnnotationDraft {
  id: string;
  assetId: string;
  editionId: string | null;
  contextId: string | null;
  kind: AnnotationKind;
  pageNumber: number;
  anchor: AnnotationAnchor;
  body: string | null;
  color: string | null;
  status: AnnotationStatus;
}

export interface AnnotationChanges {
  kind: AnnotationKind;
  pageNumber: number;
  anchor: AnnotationAnchor;
  editionId: string | null;
  body: string | null;
  color: string | null;
  status: Exclude<AnnotationStatus, 'deleted'>;
  expectedRevision: number;
  revisionId: string;
}

export interface AnnotationListQuery {
  assetId: string;
  contextIds: string[];
  includeGeneral: boolean;
  includeDeleted: boolean;
}

export type CreateAnnotationResult =
  | { kind: 'created'; annotation: Annotation }
  | { kind: 'asset-not-found' }
  | { kind: 'context-not-found' };

export type ChangeAnnotationResult =
  | { kind: 'saved'; annotation: Annotation }
  | { kind: 'conflict'; current: Annotation }
  | { kind: 'not-found' };

export interface AnnotationRevisionDraft {
  expectedRevision: number;
  revisionId: string;
}

export interface RestoreAnnotationDraft extends AnnotationRevisionDraft {
  status: Exclude<AnnotationStatus, 'deleted'>;
}

export interface AnnotationRepository {
  listReadingContexts(status: ReadingContextStatus | 'all'): Promise<ReadingContext[]>;
  getReadingContext(id: string): Promise<ReadingContext | null>;
  createReadingContext(draft: ReadingContextDraft): Promise<ReadingContextWriteResult>;
  updateReadingContext(
    id: string,
    changes: ReadingContextChanges,
  ): Promise<ReadingContextWriteResult>;
  previewReadingContextArchive(id: string): Promise<ReadingContextDeletionPreview | null>;
  archiveReadingContext(
    id: string,
    strategy: ReadingContextArchiveStrategy,
    revisionId: () => string,
  ): Promise<ReadingContextArchiveResult>;
  restoreReadingContext(id: string): Promise<ReadingContextWriteResult>;
  getCollectionContext(collectionId: string): Promise<CollectionContextRecord | null>;
  setCollectionContext(
    collectionId: string,
    contextId: string | null,
  ): Promise<CollectionContextWriteResult>;

  getAnnotationAssetIdentity(assetId: string): Promise<AnnotationAssetIdentity | null>;
  listAnnotations(query: AnnotationListQuery): Promise<Annotation[]>;
  getAnnotation(id: string): Promise<Annotation | null>;
  createAnnotation(draft: AnnotationDraft): Promise<CreateAnnotationResult>;
  updateAnnotation(id: string, changes: AnnotationChanges): Promise<ChangeAnnotationResult>;
  deleteAnnotation(id: string, draft: AnnotationRevisionDraft): Promise<ChangeAnnotationResult>;
  restoreAnnotation(id: string, draft: RestoreAnnotationDraft): Promise<ChangeAnnotationResult>;
  listAnnotationRevisions(id: string): Promise<AnnotationRevision[] | null>;
}
