import { randomUUID } from 'node:crypto';
import {
  evidenceDetailSchema,
  evidencePageSchema,
  evidenceRebindPreviewSchema,
  evidenceSchema,
  evidenceSourceSnapshotSchema,
  noteLinkSchema,
  notesPageSchema,
  researchNoteSchema,
  type CreateDirectEvidenceInput,
  type CreateEvidenceInput,
  type CreateNoteInput,
  type CreateNoteLinkInput,
  type ConfirmEvidenceRebindInput,
  type Evidence,
  type EvidenceDetail,
  type EvidencePage,
  type EvidenceRebindPreview,
  type KnowledgeRevision,
  type KnowledgeRevisionInput,
  type ListEvidenceQuery,
  type ListNotesQuery,
  type NoteLink,
  type NotesPage,
  type ResearchNote,
  type PreviewEvidenceRebindInput,
  type UpdateEvidenceInput,
  type UpdateNoteInput,
} from '../contract.js';
import { KnowledgeError } from './errors.js';
import type {
  KnowledgeChangeResult,
  KnowledgeCreateResult,
  KnowledgeCursor,
  KnowledgeRepository,
} from './repository.js';

interface ResearchKnowledgeServiceOptions {
  createId?: () => string;
  now?: () => Date;
}

function encodeCursor(cursor: KnowledgeCursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url') : null;
}

function decodeCursor(cursor: string | null): KnowledgeCursor | undefined {
  if (cursor === null) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'updatedAt' in parsed &&
      typeof parsed.updatedAt === 'string' &&
      'id' in parsed &&
      typeof parsed.id === 'string'
    ) {
      return { updatedAt: parsed.updatedAt, id: parsed.id };
    }
  } catch {
    // handled below
  }
  throw new KnowledgeError('KNOWLEDGE_INVALID', '分页游标无效', 400);
}

function createResult<T>(result: KnowledgeCreateResult<T>): T {
  if (result.kind === 'created') return result.value;
  if (result.kind === 'context-not-found') {
    throw new KnowledgeError('KNOWLEDGE_CONTEXT_NOT_FOUND', '研究上下文不存在', 404);
  }
  if (result.kind === 'context-archived') {
    throw new KnowledgeError('KNOWLEDGE_CONTEXT_ARCHIVED', '归档上下文当前为只读', 409);
  }
  if (result.kind === 'source-not-found') {
    throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '证据来源不存在或关系已变化', 404);
  }
  throw new KnowledgeError('KNOWLEDGE_CONFLICT', '对象已存在', 409);
}

function changeResult<T>(
  result: KnowledgeChangeResult<T>,
  notFoundCode: 'KNOWLEDGE_NOTE_NOT_FOUND' | 'KNOWLEDGE_EVIDENCE_NOT_FOUND',
  label: string,
): T {
  if (result.kind === 'saved') return result.value;
  if (result.kind === 'not-found') {
    throw new KnowledgeError(notFoundCode, `${label}不存在`, 404);
  }
  if (result.kind === 'context-not-found') {
    throw new KnowledgeError('KNOWLEDGE_CONTEXT_NOT_FOUND', '研究上下文不存在', 404);
  }
  if (result.kind === 'context-archived') {
    throw new KnowledgeError('KNOWLEDGE_CONTEXT_ARCHIVED', '归档上下文当前为只读', 409);
  }
  if (result.kind === 'source-not-found') {
    throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '证据来源不存在或关系已变化', 404);
  }
  throw new KnowledgeError('KNOWLEDGE_CONFLICT', `${label}已在其他窗口更新`, 409, {
    current: result.current,
  });
}

function validateEvidenceShape(
  kind: CreateDirectEvidenceInput['kind'],
  anchor: CreateDirectEvidenceInput['anchor'],
  summary: string,
  sourceKind: CreateDirectEvidenceInput['sourceKind'],
  hasOcrSource: boolean,
): void {
  if (['highlight', 'underline', 'strikeout'].includes(kind) && anchor.quads.length === 0) {
    throw new KnowledgeError('KNOWLEDGE_INVALID', '文本证据至少需要一个 PDF 四边形', 400);
  }
  if (kind === 'area' && anchor.rect === null) {
    throw new KnowledgeError('KNOWLEDGE_INVALID', '区域证据需要 PDF 区域坐标', 400);
  }
  if (anchor.textQuote === null && summary.trim().length === 0) {
    throw new KnowledgeError('KNOWLEDGE_INVALID', '非文本证据需要填写证据说明', 400);
  }
  if (sourceKind === 'ocr' && !hasOcrSource) {
    throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '当前页面没有可追溯的 OCR 来源', 404);
  }
}

function readerUrl(evidence: Evidence): string {
  const params = new URLSearchParams({
    page: String(evidence.sourceSnapshot.pageNumber),
    context: evidence.sourceSnapshot.contextId ?? 'general',
    annotation: evidence.annotationId,
  });
  return `/research/read/${encodeURIComponent(evidence.assetId)}?${params.toString()}`;
}

function sourceDifferences(
  before: Evidence['sourceSnapshot'],
  after: Evidence['sourceSnapshot'],
): EvidenceRebindPreview['differences'] {
  const values = [
    ['work', before.workId, after.workId],
    ['edition', before.editionId, after.editionId],
    ['asset', before.assetId, after.assetId],
    ['annotation', before.annotationId, after.annotationId],
    ['context', before.contextId, after.contextId],
    ['page', String(before.pageNumber), String(after.pageNumber)],
    ['text', before.anchor.textQuote?.exact ?? null, after.anchor.textQuote?.exact ?? null],
    ['kind', before.sourceKind, after.sourceKind],
  ] as const;
  return values
    .filter(([, oldValue, newValue]) => oldValue !== newValue)
    .map(([field, oldValue, newValue]) => ({
      field,
      before: oldValue,
      after: newValue,
    }));
}

export class ResearchKnowledgeService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: KnowledgeRepository,
    options: ResearchKnowledgeServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async listNotes(input: ListNotesQuery): Promise<NotesPage> {
    const page = await this.repository.listNotes({
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      status: input.status,
      before: decodeCursor(input.cursor),
      limit: input.limit,
    });
    return notesPageSchema.parse({ notes: page.items, nextCursor: encodeCursor(page.next) });
  }

  async getNote(id: string): Promise<ResearchNote> {
    const note = await this.repository.getNote(id);
    if (!note) throw new KnowledgeError('KNOWLEDGE_NOTE_NOT_FOUND', '笔记不存在', 404);
    return researchNoteSchema.parse(note);
  }

  async createNote(input: CreateNoteInput): Promise<ResearchNote> {
    return researchNoteSchema.parse(
      createResult(
        await this.repository.createNote({
          id: this.createId(),
          contextId: input.contextId,
          title: input.title.trim(),
          body: input.body,
        }),
      ),
    );
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<ResearchNote> {
    const current = await this.getNote(id);
    return researchNoteSchema.parse(
      changeResult(
        await this.repository.updateNote(id, {
          contextId: input.contextId === undefined ? current.contextId : input.contextId,
          title: input.title?.trim() ?? current.title,
          body: input.body ?? current.body,
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_NOTE_NOT_FOUND',
        '笔记',
      ),
    );
  }

  async deleteNote(id: string, input: KnowledgeRevisionInput): Promise<ResearchNote> {
    return researchNoteSchema.parse(
      changeResult(
        await this.repository.deleteNote(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_NOTE_NOT_FOUND',
        '笔记',
      ),
    );
  }

  async restoreNote(id: string, input: KnowledgeRevisionInput): Promise<ResearchNote> {
    return researchNoteSchema.parse(
      changeResult(
        await this.repository.restoreNote(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_NOTE_NOT_FOUND',
        '笔记',
      ),
    );
  }

  async listNoteLinks(noteId: string, includeDeleted: boolean): Promise<NoteLink[]> {
    const links = await this.repository.listNoteLinks(noteId, includeDeleted);
    if (!links) throw new KnowledgeError('KNOWLEDGE_NOTE_NOT_FOUND', '笔记不存在', 404);
    return links.map((link) => noteLinkSchema.parse(link));
  }

  async createNoteLink(noteId: string, input: CreateNoteLinkInput): Promise<NoteLink> {
    return noteLinkSchema.parse(
      createResult(
        await this.repository.createNoteLink({
          id: this.createId(),
          noteId,
          target: input.target,
        }),
      ),
    );
  }

  async deleteNoteLink(id: string, input: KnowledgeRevisionInput): Promise<NoteLink> {
    return noteLinkSchema.parse(
      changeResult(
        await this.repository.deleteNoteLink(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_NOTE_NOT_FOUND',
        '笔记资源链接',
      ),
    );
  }

  async restoreNoteLink(id: string, input: KnowledgeRevisionInput): Promise<NoteLink> {
    return noteLinkSchema.parse(
      changeResult(
        await this.repository.restoreNoteLink(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_NOTE_NOT_FOUND',
        '笔记资源链接',
      ),
    );
  }

  async listEvidence(input: ListEvidenceQuery): Promise<EvidencePage> {
    const page = await this.repository.listEvidence({
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      ...(input.workId ? { workId: input.workId } : {}),
      ...(input.sourceState ? { sourceState: input.sourceState } : {}),
      status: input.status,
      before: decodeCursor(input.cursor),
      limit: input.limit,
    });
    return evidencePageSchema.parse({ evidence: page.items, nextCursor: encodeCursor(page.next) });
  }

  async getEvidence(id: string): Promise<EvidenceDetail> {
    const evidence = await this.repository.getEvidence(id);
    if (!evidence) throw new KnowledgeError('KNOWLEDGE_EVIDENCE_NOT_FOUND', '证据不存在', 404);
    return evidenceDetailSchema.parse({
      ...evidence,
      sourceLink: {
        assetId: evidence.assetId,
        annotationId: evidence.annotationId,
        contextId: evidence.sourceSnapshot.contextId,
        pageNumber: evidence.sourceSnapshot.pageNumber,
        anchor: evidence.sourceSnapshot.anchor,
        sourceState: evidence.sourceState,
        readerUrl: readerUrl(evidence),
      },
    });
  }

  async createEvidence(input: CreateEvidenceInput): Promise<EvidenceDetail> {
    const source = await this.repository.getAnnotationSource(input.annotationId);
    if (!source || source.annotation.status === 'deleted') {
      throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '活动批注不存在', 404);
    }
    validateEvidenceShape(
      source.annotation.kind,
      source.annotation.anchor,
      input.summary,
      input.sourceKind,
      source.ocr !== null,
    );
    const sourceSnapshot = evidenceSourceSnapshotSchema.parse({
      workId: source.workId,
      editionId: source.editionId,
      assetId: source.assetId,
      annotationId: source.annotation.id,
      contextId: source.annotation.contextId,
      pageNumber: source.annotation.pageNumber,
      anchor: source.annotation.anchor,
      sourceKind: input.sourceKind,
      annotationRevision: source.annotation.revision,
      assetHash: source.assetHash,
      workTitle: source.workTitle,
      editionTitle: source.editionTitle,
      ocr: input.sourceKind === 'ocr' ? source.ocr : null,
      extractedAt: this.now().toISOString(),
    });
    const evidence = evidenceSchema.parse(
      createResult(
        await this.repository.createEvidence({
          id: this.createId(),
          contextId: input.contextId,
          workId: source.workId,
          editionId: source.editionId,
          assetId: source.assetId,
          annotationId: source.annotation.id,
          sourceSnapshot,
          title: input.title,
          summary: input.summary,
          notes: input.notes,
        }),
      ),
    );
    return this.getEvidence(evidence.id);
  }

  async previewEvidenceRebind(
    id: string,
    input: PreviewEvidenceRebindInput,
  ): Promise<EvidenceRebindPreview> {
    const current = await this.getEvidence(id);
    if (current.status === 'deleted') {
      throw new KnowledgeError('KNOWLEDGE_CONFLICT', '已删除证据需要先恢复', 409, { current });
    }
    const source = await this.repository.getAnnotationSource(input.annotationId);
    if (!source || source.annotation.status === 'deleted') {
      throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '目标批注不存在', 404);
    }
    validateEvidenceShape(
      source.annotation.kind,
      source.annotation.anchor,
      current.summary,
      input.sourceKind,
      source.ocr !== null,
    );
    const newSource = evidenceSourceSnapshotSchema.parse({
      workId: source.workId,
      editionId: source.editionId,
      assetId: source.assetId,
      annotationId: source.annotation.id,
      contextId: source.annotation.contextId,
      pageNumber: source.annotation.pageNumber,
      anchor: source.annotation.anchor,
      sourceKind: input.sourceKind,
      annotationRevision: source.annotation.revision,
      assetHash: source.assetHash,
      workTitle: source.workTitle,
      editionTitle: source.editionTitle,
      ocr: input.sourceKind === 'ocr' ? source.ocr : null,
      extractedAt: this.now().toISOString(),
    });
    return evidenceRebindPreviewSchema.parse({
      evidenceId: id,
      expectedRevision: current.revision,
      targetAnnotationRevision: source.annotation.revision,
      oldSource: current.sourceSnapshot,
      newSource,
      differences: sourceDifferences(current.sourceSnapshot, newSource),
    });
  }

  async confirmEvidenceRebind(
    id: string,
    input: ConfirmEvidenceRebindInput,
  ): Promise<EvidenceDetail> {
    const current = await this.getEvidence(id);
    if (current.revision !== input.expectedRevision) {
      throw new KnowledgeError('KNOWLEDGE_CONFLICT', '证据已在其他窗口更新', 409, { current });
    }
    const preview = await this.previewEvidenceRebind(id, input);
    if (preview.targetAnnotationRevision !== input.targetAnnotationRevision) {
      throw new KnowledgeError('KNOWLEDGE_CONFLICT', '目标批注已变化，请重新查看差异', 409, {
        preview,
      });
    }
    const saved = changeResult(
      await this.repository.rebindEvidence(id, {
        workId: preview.newSource.workId,
        editionId: preview.newSource.editionId,
        assetId: preview.newSource.assetId,
        annotationId: preview.newSource.annotationId,
        sourceSnapshot: preview.newSource,
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
      'KNOWLEDGE_EVIDENCE_NOT_FOUND',
      '证据',
    );
    return this.getEvidence(saved.id);
  }

  async createDirectEvidence(input: CreateDirectEvidenceInput): Promise<EvidenceDetail> {
    const source = await this.repository.getAssetSource(
      input.assetId,
      input.editionId,
      input.anchor.pageNumber,
    );
    if (!source || input.anchor.assetHash !== source.assetHash) {
      throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', 'PDF 来源不存在或文件已变化', 404);
    }
    validateEvidenceShape(
      input.kind,
      input.anchor,
      input.summary,
      input.sourceKind,
      source.ocr !== null,
    );
    const annotationId = this.createId();
    const evidenceId = this.createId();
    const sourceSnapshot = evidenceSourceSnapshotSchema.parse({
      workId: source.workId,
      editionId: source.editionId,
      assetId: source.assetId,
      annotationId,
      contextId: input.contextId,
      pageNumber: input.anchor.pageNumber,
      anchor: { ...input.anchor, editionId: source.editionId },
      sourceKind: input.sourceKind,
      annotationRevision: 1,
      assetHash: source.assetHash,
      workTitle: source.workTitle,
      editionTitle: source.editionTitle,
      ocr: input.sourceKind === 'ocr' ? source.ocr : null,
      extractedAt: this.now().toISOString(),
    });
    const result = createResult(
      await this.repository.createAnnotationWithEvidence({
        annotation: {
          id: annotationId,
          assetId: source.assetId,
          editionId: source.editionId,
          contextId: input.contextId,
          kind: input.kind,
          pageNumber: input.anchor.pageNumber,
          anchor: sourceSnapshot.anchor,
          body: input.body,
          color: input.color,
          status: 'active',
        },
        evidence: {
          id: evidenceId,
          contextId: input.contextId,
          workId: source.workId,
          editionId: source.editionId,
          assetId: source.assetId,
          annotationId,
          sourceSnapshot,
          title: input.title,
          summary: input.summary,
          notes: input.notes,
        },
      }),
    );
    return this.getEvidence(result.evidence.id);
  }

  async updateEvidence(id: string, input: UpdateEvidenceInput): Promise<EvidenceDetail> {
    const current = await this.getEvidence(id);
    const saved = changeResult(
      await this.repository.updateEvidence(id, {
        contextId: input.contextId === undefined ? current.contextId : input.contextId,
        title: input.title === undefined ? current.title : input.title,
        summary: input.summary ?? current.summary,
        notes: input.notes === undefined ? current.notes : input.notes,
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
      'KNOWLEDGE_EVIDENCE_NOT_FOUND',
      '证据',
    );
    return this.getEvidence(saved.id);
  }

  async deleteEvidence(id: string, input: KnowledgeRevisionInput): Promise<EvidenceDetail> {
    const saved = changeResult(
      await this.repository.deleteEvidence(id, {
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
      'KNOWLEDGE_EVIDENCE_NOT_FOUND',
      '证据',
    );
    return this.getEvidence(saved.id);
  }

  async restoreEvidence(id: string, input: KnowledgeRevisionInput): Promise<EvidenceDetail> {
    const saved = changeResult(
      await this.repository.restoreEvidence(id, {
        expectedRevision: input.expectedRevision,
        revisionId: this.createId(),
      }),
      'KNOWLEDGE_EVIDENCE_NOT_FOUND',
      '证据',
    );
    return this.getEvidence(saved.id);
  }

  async listRevisions(
    entityType: 'note' | 'evidence' | 'note-link',
    entityId: string,
  ): Promise<KnowledgeRevision[]> {
    return this.repository.listRevisions(entityType, entityId);
  }
}
