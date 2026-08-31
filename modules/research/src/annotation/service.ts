import { randomUUID } from 'node:crypto';
import {
  GENERAL_READING_CONTEXT_ID,
  annotationSchema,
  collectionReadingContextSchema,
  generalReadingLayerSchema,
  readingContextCatalogSchema,
  readingContextDeletionPreviewSchema,
  readingContextSchema,
  type Annotation,
  type AnnotationRevision,
  type AnnotationRevisionInput,
  type ArchiveReadingContextInput,
  type CollectionReadingContext,
  type CreateAnnotationInput,
  type CreateReadingContextInput,
  type ReadingContext,
  type ReadingContextCatalog,
  type ReadingContextDeletionPreview,
  type ReadingContextStatus,
  type SetCollectionReadingContextInput,
  type UpdateAnnotationInput,
  type UpdateReadingContextInput,
} from '../contract.js';
import { AnnotationError } from './errors.js';
import type {
  AnnotationAssetIdentity,
  AnnotationListQuery,
  AnnotationRepository,
  ChangeAnnotationResult,
  ReadingContextWriteResult,
} from './repository.js';

function normalizeName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

function contextWriteResult(result: ReadingContextWriteResult): ReadingContext {
  if (result.kind === 'saved') return readingContextSchema.parse(result.context);
  if (result.kind === 'not-found') {
    throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '阅读上下文不存在', 404);
  }
  throw new AnnotationError('ANNOTATION_CONFLICT', '已有同名的活动阅读上下文', 409);
}

function annotationChangeResult(result: ChangeAnnotationResult): Annotation {
  if (result.kind === 'saved') return annotationSchema.parse(result.annotation);
  if (result.kind === 'not-found') {
    throw new AnnotationError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
  }
  throw new AnnotationError('ANNOTATION_CONFLICT', '批注已在其他窗口更新', 409, {
    current: annotationSchema.parse(result.current),
  });
}

function validateGeometry(input: CreateAnnotationInput | UpdateAnnotationInput): void {
  if (!input.kind || !input.anchor) return;
  if (
    ['highlight', 'underline', 'strikeout'].includes(input.kind) &&
    input.anchor.quads.length === 0
  ) {
    throw new AnnotationError('ANNOTATION_INVALID', '文本批注至少需要一个 PDF 四边形', 400);
  }
  if (input.kind === 'area' && !input.anchor.rect) {
    throw new AnnotationError('ANNOTATION_INVALID', '区域批注需要 PDF 区域坐标', 400);
  }
}

function compatibleStatus(identity: AnnotationAssetIdentity, annotation: Annotation): Annotation {
  if (annotation.status === 'deleted') return annotation;
  const hashMatches = annotation.anchor.assetHash === identity.contentHash;
  const editionMatches =
    annotation.anchor.editionId === null ||
    identity.editionIds.includes(annotation.anchor.editionId);
  return hashMatches && editionMatches ? annotation : { ...annotation, status: 'needs-review' };
}

function draftStatus(
  identity: AnnotationAssetIdentity,
  anchor: CreateAnnotationInput['anchor'],
): 'active' | 'needs-review' {
  return anchor.assetHash === identity.contentHash &&
    (anchor.editionId === null || identity.editionIds.includes(anchor.editionId))
    ? 'active'
    : 'needs-review';
}

export interface AnnotationServiceOptions {
  createId?: () => string;
}

export class ResearchAnnotationService {
  private readonly createId: () => string;

  constructor(
    private readonly repository: AnnotationRepository,
    options: AnnotationServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
  }

  async listContexts(status: ReadingContextStatus | 'all'): Promise<ReadingContextCatalog> {
    return readingContextCatalogSchema.parse({
      general: generalReadingLayerSchema.parse({
        kind: 'general',
        id: GENERAL_READING_CONTEXT_ID,
        name: '通用批注',
      }),
      contexts: await this.repository.listReadingContexts(status),
    });
  }

  async getContext(id: string): Promise<ReadingContext> {
    const context = await this.repository.getReadingContext(id);
    if (!context)
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '阅读上下文不存在', 404);
    return readingContextSchema.parse(context);
  }

  async createContext(input: CreateReadingContextInput): Promise<ReadingContext> {
    return contextWriteResult(
      await this.repository.createReadingContext({
        id: this.createId(),
        name: input.name.trim(),
        normalizedName: normalizeName(input.name),
        description: input.description,
        color: input.color,
      }),
    );
  }

  async updateContext(id: string, input: UpdateReadingContextInput): Promise<ReadingContext> {
    const current = await this.repository.getReadingContext(id);
    if (!current)
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '阅读上下文不存在', 404);
    const name = input.name?.trim() ?? current.name;
    return contextWriteResult(
      await this.repository.updateReadingContext(id, {
        name,
        normalizedName: normalizeName(name),
        description: input.description === undefined ? current.description : input.description,
        color: input.color === undefined ? current.color : input.color,
      }),
    );
  }

  async previewContextArchive(id: string): Promise<ReadingContextDeletionPreview> {
    const preview = await this.repository.previewReadingContextArchive(id);
    if (!preview) {
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '阅读上下文不存在', 404);
    }
    return readingContextDeletionPreviewSchema.parse(preview);
  }

  async archiveContext(id: string, input: ArchiveReadingContextInput) {
    const archived = await this.repository.archiveReadingContext(id, input.strategy, this.createId);
    if (archived.kind === 'not-found') {
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '阅读上下文不存在', 404);
    }
    return {
      context: readingContextSchema.parse(archived.result.context),
      movedAnnotations: archived.result.movedAnnotations,
    };
  }

  async restoreContext(id: string): Promise<ReadingContext> {
    return contextWriteResult(await this.repository.restoreReadingContext(id));
  }

  async getCollectionContext(collectionId: string): Promise<CollectionReadingContext> {
    const binding = await this.repository.getCollectionContext(collectionId);
    if (!binding) throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '目录不存在', 404);
    return collectionReadingContextSchema.parse(binding);
  }

  async setCollectionContext(
    collectionId: string,
    input: SetCollectionReadingContextInput,
  ): Promise<CollectionReadingContext> {
    const result = await this.repository.setCollectionContext(collectionId, input.contextId);
    if (result.kind === 'collection-not-found') {
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '目录不存在', 404);
    }
    if (result.kind === 'context-not-found') {
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '活动阅读上下文不存在', 404);
    }
    return collectionReadingContextSchema.parse(result.binding);
  }

  private async assetIdentity(assetId: string): Promise<AnnotationAssetIdentity> {
    const identity = await this.repository.getAnnotationAssetIdentity(assetId);
    if (!identity) {
      throw new AnnotationError('ANNOTATION_ASSET_NOT_FOUND', 'PDF 附件不存在', 404);
    }
    return identity;
  }

  async listAnnotations(query: AnnotationListQuery): Promise<Annotation[]> {
    const identity = await this.assetIdentity(query.assetId);
    return (await this.repository.listAnnotations(query)).map((annotation) =>
      annotationSchema.parse(compatibleStatus(identity, annotation)),
    );
  }

  async getAnnotation(id: string): Promise<Annotation> {
    const annotation = await this.repository.getAnnotation(id);
    if (!annotation) throw new AnnotationError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
    const identity = await this.assetIdentity(annotation.assetId);
    return annotationSchema.parse(compatibleStatus(identity, annotation));
  }

  async createAnnotation(assetId: string, input: CreateAnnotationInput): Promise<Annotation> {
    validateGeometry(input);
    const identity = await this.assetIdentity(assetId);
    const result = await this.repository.createAnnotation({
      id: this.createId(),
      assetId,
      editionId:
        input.anchor.editionId !== null && identity.editionIds.includes(input.anchor.editionId)
          ? input.anchor.editionId
          : null,
      contextId: input.contextId,
      kind: input.kind,
      pageNumber: input.anchor.pageNumber,
      anchor: input.anchor,
      body: input.body,
      color: input.color,
      status: draftStatus(identity, input.anchor),
    });
    if (result.kind === 'asset-not-found') {
      throw new AnnotationError('ANNOTATION_ASSET_NOT_FOUND', 'PDF 附件不存在', 404);
    }
    if (result.kind === 'context-not-found') {
      throw new AnnotationError('ANNOTATION_CONTEXT_NOT_FOUND', '活动阅读上下文不存在', 404);
    }
    return annotationSchema.parse(result.annotation);
  }

  async updateAnnotation(id: string, input: UpdateAnnotationInput): Promise<Annotation> {
    const current = await this.repository.getAnnotation(id);
    if (!current) throw new AnnotationError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
    if (current.status === 'deleted') {
      throw new AnnotationError('ANNOTATION_CONFLICT', '已删除批注需要先恢复', 409, { current });
    }
    const anchor = input.anchor ?? current.anchor;
    const kind = input.kind ?? current.kind;
    validateGeometry({ ...input, kind, anchor });
    const identity = await this.assetIdentity(current.assetId);
    return annotationChangeResult(
      await this.repository.updateAnnotation(id, {
        kind,
        pageNumber: anchor.pageNumber,
        anchor,
        editionId:
          anchor.editionId !== null && identity.editionIds.includes(anchor.editionId)
            ? anchor.editionId
            : null,
        body: input.body === undefined ? current.body : input.body,
        color: input.color === undefined ? current.color : input.color,
        status: draftStatus(identity, anchor),
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
    );
  }

  async deleteAnnotation(id: string, input: AnnotationRevisionInput): Promise<Annotation> {
    return annotationChangeResult(
      await this.repository.deleteAnnotation(id, {
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
    );
  }

  async restoreAnnotation(id: string, input: AnnotationRevisionInput): Promise<Annotation> {
    const current = await this.repository.getAnnotation(id);
    if (!current) throw new AnnotationError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
    const identity = await this.assetIdentity(current.assetId);
    return annotationChangeResult(
      await this.repository.restoreAnnotation(id, {
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
        status: draftStatus(identity, current.anchor),
      }),
    );
  }

  async listAnnotationRevisions(id: string): Promise<AnnotationRevision[]> {
    const revisions = await this.repository.listAnnotationRevisions(id);
    if (!revisions) throw new AnnotationError('ANNOTATION_NOT_FOUND', '批注不存在', 404);
    return revisions;
  }
}
