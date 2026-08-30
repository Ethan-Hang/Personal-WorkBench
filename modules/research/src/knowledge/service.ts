import { randomUUID } from 'node:crypto';
import {
  KNOWLEDGE_SEARCH_ENTITY_TYPES,
  claimEvidenceSchema,
  claimsPageSchema,
  claimSchema,
  evidenceDetailSchema,
  evidencePageSchema,
  evidenceRebindPreviewSchema,
  evidenceSchema,
  evidenceSourceSnapshotSchema,
  matricesPageSchema,
  knowledgeSearchRebuildResponseSchema,
  knowledgeSearchResponseSchema,
  matrixCandidatesSchema,
  matrixCellEvidenceSchema,
  matrixCellSchema,
  matrixCellWindowSchema,
  matrixDetailSchema,
  noteLinkSchema,
  notesPageSchema,
  researchNoteSchema,
  writingBlockSchema,
  writingDocumentDetailSchema,
  writingDocumentsPageSchema,
  type CreateDirectEvidenceInput,
  type CreateClaimEvidenceInput,
  type CreateClaimInput,
  type CreateMatrixCellEvidenceInput,
  type CreateMatrixCellInput,
  type CreateMatrixInput,
  type CreateEvidenceInput,
  type CreateNoteInput,
  type CreateNoteLinkInput,
  type CreateWritingDocumentInput,
  type ConfirmEvidenceRebindInput,
  type Evidence,
  type EvidenceDetail,
  type EvidencePage,
  type EvidenceRebindPreview,
  type KnowledgeRevision,
  type KnowledgeEntityType,
  type KnowledgeRevisionInput,
  type KnowledgeSearchInput,
  type KnowledgeSearchRebuildResponse,
  type KnowledgeSearchResponse,
  type ListMatricesQuery,
  type ListEvidenceQuery,
  type ListClaimsQuery,
  type ListNotesQuery,
  type ListWritingDocumentsQuery,
  type NoteLink,
  type NotesPage,
  type MatricesPage,
  type MatrixCandidates,
  type MatrixCandidatesQuery,
  type MatrixCell,
  type MatrixCellEvidence,
  type MatrixCellWindow,
  type MatrixCellWindowQuery,
  type MatrixDetail,
  type ResearchNote,
  type Claim,
  type ClaimEvidence,
  type ClaimsPage,
  type PreviewEvidenceRebindInput,
  type UpdateEvidenceInput,
  type UpdateClaimEvidenceInput,
  type UpdateClaimInput,
  type UpdateMatrixCellInput,
  type UpdateMatrixInput,
  type UpdateMatrixStructureInput,
  type UpdateNoteInput,
  type UpdateWritingBlockInput,
  type UpdateWritingDocumentInput,
  type UpdateWritingStructureInput,
  type WritingBlock,
  type WritingDocumentDetail,
  type WritingDocumentsPage,
} from '../contract.js';
import { KnowledgeError } from './errors.js';
import type {
  KnowledgeChangeResult,
  KnowledgeCreateResult,
  KnowledgeCursor,
  KnowledgeRepository,
  KnowledgeSearchCursor,
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

function encodeSearchCursor(cursor: KnowledgeSearchCursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url') : null;
}

function decodeSearchCursor(cursor: string | null): KnowledgeSearchCursor | undefined {
  if (cursor === null) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.updatedAt === 'string' &&
      typeof parsed.entityType === 'string' &&
      KNOWLEDGE_SEARCH_ENTITY_TYPES.includes(
        parsed.entityType as (typeof KNOWLEDGE_SEARCH_ENTITY_TYPES)[number],
      ) &&
      typeof parsed.entityId === 'string' &&
      typeof parsed.seen === 'number' &&
      Number.isInteger(parsed.seen) &&
      parsed.seen >= 0
    ) {
      return {
        updatedAt: parsed.updatedAt,
        entityType: parsed.entityType as KnowledgeSearchCursor['entityType'],
        entityId: parsed.entityId,
        seen: parsed.seen,
      };
    }
  } catch {
    // handled below
  }
  throw new KnowledgeError('KNOWLEDGE_INVALID', '搜索分页游标无效', 400);
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
  notFoundCode:
    | 'KNOWLEDGE_NOTE_NOT_FOUND'
    | 'KNOWLEDGE_EVIDENCE_NOT_FOUND'
    | 'KNOWLEDGE_CLAIM_NOT_FOUND'
    | 'KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND'
    | 'KNOWLEDGE_MATRIX_NOT_FOUND'
    | 'KNOWLEDGE_MATRIX_CELL_NOT_FOUND'
    | 'KNOWLEDGE_MATRIX_CELL_EVIDENCE_NOT_FOUND'
    | 'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND'
    | 'KNOWLEDGE_WRITING_BLOCK_NOT_FOUND',
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

  async searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchResponse> {
    const page = await this.repository.searchKnowledge({
      query: input.query,
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      ...(input.workId ? { workId: input.workId } : {}),
      entityTypes: input.entityTypes,
      statuses: input.statuses,
      ...(input.sourceStates ? { sourceStates: input.sourceStates } : {}),
      before: decodeSearchCursor(input.cursor),
      limit: input.limit,
      maxResults: 500,
    });
    return knowledgeSearchResponseSchema.parse({
      results: page.items,
      nextCursor: encodeSearchCursor(page.next),
      maxResults: 500,
    });
  }

  async rebuildKnowledgeSearch(): Promise<KnowledgeSearchRebuildResponse> {
    return knowledgeSearchRebuildResponseSchema.parse(
      await this.repository.rebuildKnowledgeSearch(),
    );
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

  async listClaims(input: ListClaimsQuery): Promise<ClaimsPage> {
    const page = await this.repository.listClaims({
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      status: input.status,
      before: decodeCursor(input.cursor),
      limit: input.limit,
    });
    return claimsPageSchema.parse({ claims: page.items, nextCursor: encodeCursor(page.next) });
  }

  async getClaim(id: string): Promise<Claim> {
    const claim = await this.repository.getClaim(id);
    if (!claim) throw new KnowledgeError('KNOWLEDGE_CLAIM_NOT_FOUND', '观点不存在', 404);
    return claimSchema.parse(claim);
  }

  async createClaim(input: CreateClaimInput): Promise<Claim> {
    return claimSchema.parse(
      createResult(
        await this.repository.createClaim({
          id: this.createId(),
          contextId: input.contextId,
          statement: input.statement.trim(),
          rationale: input.rationale,
          status: input.status,
        }),
      ),
    );
  }

  async updateClaim(id: string, input: UpdateClaimInput): Promise<Claim> {
    const current = await this.getClaim(id);
    return claimSchema.parse(
      changeResult(
        await this.repository.updateClaim(id, {
          contextId: input.contextId === undefined ? current.contextId : input.contextId,
          statement: input.statement?.trim() ?? current.statement,
          rationale: input.rationale === undefined ? current.rationale : input.rationale,
          status: input.status ?? (current.status === 'deleted' ? 'draft' : current.status),
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_NOT_FOUND',
        '观点',
      ),
    );
  }

  async deleteClaim(id: string, input: KnowledgeRevisionInput): Promise<Claim> {
    return claimSchema.parse(
      changeResult(
        await this.repository.deleteClaim(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_NOT_FOUND',
        '观点',
      ),
    );
  }

  async restoreClaim(id: string, input: KnowledgeRevisionInput): Promise<Claim> {
    return claimSchema.parse(
      changeResult(
        await this.repository.restoreClaim(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_NOT_FOUND',
        '观点',
      ),
    );
  }

  async listClaimEvidence(claimId: string, includeDeleted: boolean): Promise<ClaimEvidence[]> {
    const relations = await this.repository.listClaimEvidence(claimId, includeDeleted);
    if (!relations) throw new KnowledgeError('KNOWLEDGE_CLAIM_NOT_FOUND', '观点不存在', 404);
    return relations.map((relation) => claimEvidenceSchema.parse(relation));
  }

  async createClaimEvidence(
    claimId: string,
    input: CreateClaimEvidenceInput,
  ): Promise<ClaimEvidence> {
    return claimEvidenceSchema.parse(
      createResult(
        await this.repository.createClaimEvidence({
          id: this.createId(),
          claimId,
          evidenceId: input.evidenceId,
          relation: input.relation,
          note: input.note,
        }),
      ),
    );
  }

  async updateClaimEvidence(id: string, input: UpdateClaimEvidenceInput): Promise<ClaimEvidence> {
    const current = await this.findClaimEvidence(id);
    return claimEvidenceSchema.parse(
      changeResult(
        await this.repository.updateClaimEvidence(id, {
          relation: input.relation ?? current.relation,
          note: input.note === undefined ? current.note : input.note,
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND',
        '观点证据关系',
      ),
    );
  }

  private async findClaimEvidence(id: string): Promise<ClaimEvidence> {
    const relation = await this.repository.getClaimEvidence(id);
    if (!relation) {
      throw new KnowledgeError('KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND', '观点证据关系不存在', 404);
    }
    return claimEvidenceSchema.parse(relation);
  }

  async deleteClaimEvidence(id: string, input: KnowledgeRevisionInput): Promise<ClaimEvidence> {
    return claimEvidenceSchema.parse(
      changeResult(
        await this.repository.deleteClaimEvidence(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND',
        '观点证据关系',
      ),
    );
  }

  async restoreClaimEvidence(id: string, input: KnowledgeRevisionInput): Promise<ClaimEvidence> {
    return claimEvidenceSchema.parse(
      changeResult(
        await this.repository.restoreClaimEvidence(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_CLAIM_EVIDENCE_NOT_FOUND',
        '观点证据关系',
      ),
    );
  }

  async listMatrices(input: ListMatricesQuery): Promise<MatricesPage> {
    const page = await this.repository.listMatrices({
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      status: input.status,
      before: decodeCursor(input.cursor),
      limit: input.limit,
    });
    return matricesPageSchema.parse({ matrices: page.items, nextCursor: encodeCursor(page.next) });
  }

  async getMatrix(id: string, includeDeletedStructure = false): Promise<MatrixDetail> {
    const matrix = await this.repository.getMatrix(id, includeDeletedStructure);
    if (!matrix) throw new KnowledgeError('KNOWLEDGE_MATRIX_NOT_FOUND', '矩阵不存在', 404);
    return matrixDetailSchema.parse(matrix);
  }

  async createMatrix(input: CreateMatrixInput): Promise<MatrixDetail> {
    return matrixDetailSchema.parse(
      createResult(
        await this.repository.createMatrix({
          id: this.createId(),
          contextId: input.contextId,
          title: input.title.trim(),
          description: input.description,
        }),
      ),
    );
  }

  async updateMatrix(id: string, input: UpdateMatrixInput): Promise<MatrixDetail> {
    const current = await this.getMatrix(id);
    return matrixDetailSchema.parse(
      changeResult(
        await this.repository.updateMatrix(id, {
          contextId: input.contextId === undefined ? current.contextId : input.contextId,
          title: input.title?.trim() ?? current.title,
          description: input.description === undefined ? current.description : input.description,
          status: input.status ?? (current.status === 'archived' ? 'archived' : 'active'),
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_NOT_FOUND',
        '矩阵',
      ),
    );
  }

  async deleteMatrix(id: string, input: KnowledgeRevisionInput): Promise<MatrixDetail> {
    return matrixDetailSchema.parse(
      changeResult(
        await this.repository.deleteMatrix(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_NOT_FOUND',
        '矩阵',
      ),
    );
  }

  async restoreMatrix(id: string, input: KnowledgeRevisionInput): Promise<MatrixDetail> {
    return matrixDetailSchema.parse(
      changeResult(
        await this.repository.restoreMatrix(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_NOT_FOUND',
        '矩阵',
      ),
    );
  }

  async updateMatrixStructure(
    id: string,
    input: UpdateMatrixStructureInput,
  ): Promise<MatrixDetail> {
    const columns = input.columns.map((column) => ({
      id: column.id ?? this.createId(),
      workId: column.workId,
      position: column.position,
    }));
    const rows = input.rows.map((row) =>
      row.kind === 'claim'
        ? {
            id: row.id ?? this.createId(),
            kind: 'claim' as const,
            claimId: row.claimId,
            title: null,
            question: null,
            position: row.position,
          }
        : {
            id: row.id ?? this.createId(),
            kind: 'dimension' as const,
            claimId: null,
            title: row.title,
            question: row.question,
            position: row.position,
          },
    );
    return matrixDetailSchema.parse(
      changeResult(
        await this.repository.updateMatrixStructure(id, {
          expectedStructureRevision: input.expectedStructureRevision,
          revisionId: this.createId(),
          columns,
          rows,
        }),
        'KNOWLEDGE_MATRIX_NOT_FOUND',
        '矩阵结构',
      ),
    );
  }

  async getMatrixCandidates(
    matrixId: string,
    input: MatrixCandidatesQuery,
  ): Promise<MatrixCandidates> {
    const candidates = await this.repository.getMatrixCandidates(
      matrixId,
      input.rowId,
      input.columnId,
    );
    if (!candidates) {
      throw new KnowledgeError('KNOWLEDGE_MATRIX_NOT_FOUND', '矩阵行列不存在', 404);
    }
    return matrixCandidatesSchema.parse(candidates);
  }

  async getMatrixCell(id: string): Promise<MatrixCell> {
    const cell = await this.repository.getMatrixCell(id);
    if (!cell) throw new KnowledgeError('KNOWLEDGE_MATRIX_CELL_NOT_FOUND', '矩阵单元格不存在', 404);
    return matrixCellSchema.parse(cell);
  }

  async getMatrixCellWindow(
    matrixId: string,
    input: MatrixCellWindowQuery,
  ): Promise<MatrixCellWindow> {
    const window = await this.repository.getMatrixCellWindow(
      matrixId,
      input.columnOffset,
      input.columnLimit,
      input.rowOffset,
      input.rowLimit,
    );
    if (!window) throw new KnowledgeError('KNOWLEDGE_MATRIX_NOT_FOUND', '矩阵不存在', 404);
    return matrixCellWindowSchema.parse(window);
  }

  async createMatrixCell(matrixId: string, input: CreateMatrixCellInput): Promise<MatrixCell> {
    return matrixCellSchema.parse(
      createResult(
        await this.repository.createMatrixCell({
          id: this.createId(),
          matrixId,
          rowId: input.rowId,
          columnId: input.columnId,
          synthesis: input.synthesis,
        }),
      ),
    );
  }

  async updateMatrixCell(id: string, input: UpdateMatrixCellInput): Promise<MatrixCell> {
    return matrixCellSchema.parse(
      changeResult(
        await this.repository.updateMatrixCell(id, {
          synthesis: input.synthesis,
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_NOT_FOUND',
        '矩阵单元格',
      ),
    );
  }

  async deleteMatrixCell(id: string, input: KnowledgeRevisionInput): Promise<MatrixCell> {
    return matrixCellSchema.parse(
      changeResult(
        await this.repository.deleteMatrixCell(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_NOT_FOUND',
        '矩阵单元格',
      ),
    );
  }

  async restoreMatrixCell(id: string, input: KnowledgeRevisionInput): Promise<MatrixCell> {
    return matrixCellSchema.parse(
      changeResult(
        await this.repository.restoreMatrixCell(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_NOT_FOUND',
        '矩阵单元格',
      ),
    );
  }

  async reviewMatrixCell(id: string, input: KnowledgeRevisionInput): Promise<MatrixCell> {
    return matrixCellSchema.parse(
      changeResult(
        await this.repository.reviewMatrixCell(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_NOT_FOUND',
        '矩阵单元格',
      ),
    );
  }

  async listMatrixCellEvidence(
    cellId: string,
    includeDeleted: boolean,
  ): Promise<MatrixCellEvidence[]> {
    const links = await this.repository.listMatrixCellEvidence(cellId, includeDeleted);
    if (!links) {
      throw new KnowledgeError('KNOWLEDGE_MATRIX_CELL_NOT_FOUND', '矩阵单元格不存在', 404);
    }
    return links.map((link) => matrixCellEvidenceSchema.parse(link));
  }

  async createMatrixCellEvidence(
    cellId: string,
    input: CreateMatrixCellEvidenceInput,
  ): Promise<MatrixCellEvidence> {
    return matrixCellEvidenceSchema.parse(
      createResult(
        await this.repository.createMatrixCellEvidence({
          id: this.createId(),
          cellId,
          evidenceId: input.evidenceId,
        }),
      ),
    );
  }

  async deleteMatrixCellEvidence(
    id: string,
    input: KnowledgeRevisionInput,
  ): Promise<MatrixCellEvidence> {
    return matrixCellEvidenceSchema.parse(
      changeResult(
        await this.repository.deleteMatrixCellEvidence(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_EVIDENCE_NOT_FOUND',
        '矩阵证据关系',
      ),
    );
  }

  async restoreMatrixCellEvidence(
    id: string,
    input: KnowledgeRevisionInput,
  ): Promise<MatrixCellEvidence> {
    return matrixCellEvidenceSchema.parse(
      changeResult(
        await this.repository.restoreMatrixCellEvidence(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_MATRIX_CELL_EVIDENCE_NOT_FOUND',
        '矩阵证据关系',
      ),
    );
  }

  async listWritingDocuments(input: ListWritingDocumentsQuery): Promise<WritingDocumentsPage> {
    const page = await this.repository.listWritingDocuments({
      ...('contextId' in input ? { contextId: input.contextId } : {}),
      status: input.status,
      before: decodeCursor(input.cursor),
      limit: input.limit,
    });
    return writingDocumentsPageSchema.parse({
      documents: page.items,
      nextCursor: encodeCursor(page.next),
    });
  }

  async getWritingDocument(
    id: string,
    includeDeletedStructure = false,
  ): Promise<WritingDocumentDetail> {
    const document = await this.repository.getWritingDocument(id, includeDeletedStructure);
    if (!document) {
      throw new KnowledgeError('KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND', '写作板不存在', 404);
    }
    return writingDocumentDetailSchema.parse(document);
  }

  async createWritingDocument(input: CreateWritingDocumentInput): Promise<WritingDocumentDetail> {
    return writingDocumentDetailSchema.parse(
      createResult(
        await this.repository.createWritingDocument({
          id: this.createId(),
          contextId: input.contextId,
          title: input.title.trim(),
        }),
      ),
    );
  }

  async updateWritingDocument(
    id: string,
    input: UpdateWritingDocumentInput,
  ): Promise<WritingDocumentDetail> {
    const current = await this.getWritingDocument(id);
    return writingDocumentDetailSchema.parse(
      changeResult(
        await this.repository.updateWritingDocument(id, {
          contextId: input.contextId === undefined ? current.contextId : input.contextId,
          title: input.title?.trim() ?? current.title,
          status: input.status ?? (current.status === 'archived' ? 'archived' : 'active'),
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND',
        '写作板',
      ),
    );
  }

  async deleteWritingDocument(
    id: string,
    input: KnowledgeRevisionInput,
  ): Promise<WritingDocumentDetail> {
    return writingDocumentDetailSchema.parse(
      changeResult(
        await this.repository.deleteWritingDocument(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND',
        '写作板',
      ),
    );
  }

  async restoreWritingDocument(
    id: string,
    input: KnowledgeRevisionInput,
  ): Promise<WritingDocumentDetail> {
    return writingDocumentDetailSchema.parse(
      changeResult(
        await this.repository.restoreWritingDocument(id, {
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND',
        '写作板',
      ),
    );
  }

  private async writingTargetLabel(
    kind: 'note' | 'evidence' | 'claim' | 'matrix',
    targetId: string,
  ): Promise<string> {
    if (kind === 'note') {
      const target = await this.repository.getNote(targetId);
      if (!target || target.status === 'deleted') {
        throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '笔记引用对象不存在', 404);
      }
      return target.title;
    }
    if (kind === 'evidence') {
      const target = await this.repository.getEvidence(targetId);
      if (!target || target.status === 'deleted') {
        throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '证据引用对象不存在', 404);
      }
      return target.title ?? target.sourceSnapshot.workTitle;
    }
    if (kind === 'claim') {
      const target = await this.repository.getClaim(targetId);
      if (!target || target.status === 'deleted') {
        throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '观点引用对象不存在', 404);
      }
      return target.statement;
    }
    const target = await this.repository.getMatrix(targetId, false);
    if (!target || target.status === 'deleted') {
      throw new KnowledgeError('KNOWLEDGE_SOURCE_NOT_FOUND', '矩阵引用对象不存在', 404);
    }
    return target.title;
  }

  async updateWritingStructure(
    id: string,
    input: UpdateWritingStructureInput,
  ): Promise<WritingDocumentDetail> {
    const full = await this.getWritingDocument(id, true);
    const existingSections = new Map(full.sections.map((section) => [section.id, section]));
    const existingBlocks = new Map(
      full.sections.flatMap((section) => section.blocks).map((block) => [block.id, block]),
    );
    const sections = await Promise.all(
      input.sections.map(async (section) => {
        const sectionId = section.id ?? this.createId();
        const blocks = await Promise.all(
          section.blocks.map(async (block) => {
            if ('id' in block) {
              const existing = existingBlocks.get(block.id);
              if (!existing) {
                throw new KnowledgeError(
                  'KNOWLEDGE_SOURCE_NOT_FOUND',
                  '写作块不属于当前写作板',
                  404,
                );
              }
              return {
                id: existing.id,
                sectionId,
                kind: existing.kind,
                text: existing.text,
                targetId: existing.targetId,
                targetLabel: existing.targetLabel,
                position: block.position,
                existing: true,
              };
            }
            if (block.kind === 'text') {
              return {
                id: this.createId(),
                sectionId,
                kind: 'text' as const,
                text: block.text,
                targetId: null,
                targetLabel: null,
                position: block.position,
                existing: false,
              };
            }
            return {
              id: this.createId(),
              sectionId,
              kind: block.kind,
              text: null,
              targetId: block.targetId,
              targetLabel: await this.writingTargetLabel(block.kind, block.targetId),
              position: block.position,
              existing: false,
            };
          }),
        );
        return {
          id: sectionId,
          title: section.title.trim(),
          position: section.position,
          existing: existingSections.has(sectionId),
          blocks,
        };
      }),
    );
    return writingDocumentDetailSchema.parse(
      changeResult(
        await this.repository.updateWritingStructure(id, {
          expectedStructureRevision: input.expectedStructureRevision,
          revisionId: this.createId(),
          sections,
        }),
        'KNOWLEDGE_WRITING_DOCUMENT_NOT_FOUND',
        '写作板结构',
      ),
    );
  }

  async updateWritingBlock(id: string, input: UpdateWritingBlockInput): Promise<WritingBlock> {
    return writingBlockSchema.parse(
      changeResult(
        await this.repository.updateWritingBlock(id, {
          text: input.text,
          expectedRevision: input.expectedRevision,
          revisionId: this.createId(),
        }),
        'KNOWLEDGE_WRITING_BLOCK_NOT_FOUND',
        '写作块',
      ),
    );
  }

  async listRevisions(
    entityType: KnowledgeEntityType,
    entityId: string,
  ): Promise<KnowledgeRevision[]> {
    return this.repository.listRevisions(entityType, entityId);
  }
}
