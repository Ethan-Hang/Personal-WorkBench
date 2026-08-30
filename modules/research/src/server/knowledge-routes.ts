import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CLAIM_STATUSES,
  GENERAL_READING_CONTEXT_ID,
  KNOWLEDGE_BASIC_STATUSES,
  MATRIX_STATUSES,
  RESEARCH_API_V1,
  WRITING_DOCUMENT_STATUSES,
  createClaimEvidenceInputSchema,
  createClaimInputSchema,
  createMatrixCellEvidenceInputSchema,
  createMatrixCellInputSchema,
  createMatrixInputSchema,
  createEvidenceRequestSchema,
  createNoteInputSchema,
  createNoteLinkInputSchema,
  createWritingDocumentInputSchema,
  evidenceRebindRequestSchema,
  knowledgeRevisionInputSchema,
  knowledgeExportPreviewInputSchema,
  pickKnowledgeExportTargetInputSchema,
  startKnowledgeExportInputSchema,
  knowledgeSearchInputSchema,
  matrixCandidatesQuerySchema,
  matrixCellWindowQuerySchema,
  reviewMatrixCellInputSchema,
  updateClaimEvidenceInputSchema,
  updateClaimInputSchema,
  updateMatrixCellInputSchema,
  updateMatrixInputSchema,
  updateMatrixStructureInputSchema,
  updateEvidenceInputSchema,
  updateNoteInputSchema,
  updateWritingBlockInputSchema,
  updateWritingDocumentInputSchema,
  updateWritingStructureInputSchema,
} from '../contract.js';
import { KnowledgeError } from '../knowledge/errors.js';
import type { ResearchKnowledgeService } from '../knowledge/service.js';

const idParams = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  contextId: z.string().min(1).optional(),
  status: z.enum(KNOWLEDGE_BASIC_STATUSES).default('active'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const evidenceListQuery = listQuery.extend({
  workId: z.string().min(1).optional(),
  sourceState: z
    .enum([
      'current',
      'annotation-revised',
      'annotation-deleted',
      'asset-mismatch',
      'source-unavailable',
    ])
    .optional(),
});
const claimListQuery = z.object({
  contextId: z.string().min(1).optional(),
  status: z.enum(CLAIM_STATUSES).default('active'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const matrixListQuery = z.object({
  contextId: z.string().min(1).optional(),
  status: z.enum(MATRIX_STATUSES).default('active'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const writingDocumentListQuery = z.object({
  contextId: z.string().min(1).optional(),
  status: z.enum(WRITING_DOCUMENT_STATUSES).default('active'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
const linkListQuery = z.object({
  includeDeleted: z.enum(['true', 'false']).default('false'),
});
const writingDocumentDetailQuery = z.object({
  includeDeletedStructure: z.enum(['true', 'false']).default('false'),
});
const knowledgeSearchRouteQuery = z.object({
  query: z.string().trim().min(1).max(500),
  contextId: z.string().min(1).optional(),
  workId: z.string().min(1).optional(),
  entityTypes: z.string().max(200).optional(),
  statuses: z.string().max(200).optional(),
  sourceStates: z.string().max(300).optional(),
  cursor: z.string().min(1).max(1_024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'KNOWLEDGE_INVALID', error: message });
}

function knowledgeFailure(reply: FastifyReply, error: unknown) {
  if (!(error instanceof KnowledgeError)) throw error;
  return reply.code(error.status).send({
    code: error.code,
    error: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

async function knowledgeRequest(reply: FastifyReply, run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return knowledgeFailure(reply, error);
  }
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | FastifyReply {
  const parsed = schema.safeParse(body ?? {});
  return parsed.success
    ? parsed.data
    : invalidRequest(reply, parsed.error.issues[0]?.message ?? '请求无效');
}

function parseId(params: unknown, reply: FastifyReply): string | FastifyReply {
  const parsed = idParams.safeParse(params);
  return parsed.success
    ? parsed.data.id
    : invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
}

function parsedContextId(value: string | undefined): string | null | undefined {
  return value === undefined ? undefined : value === GENERAL_READING_CONTEXT_ID ? null : value;
}

function commaSeparated(value: string | undefined): string[] | undefined {
  return value?.split(',').map((item) => item.trim());
}

export function registerResearchKnowledgeRoutes(
  app: FastifyInstance,
  service: ResearchKnowledgeService,
): void {
  app.get(RESEARCH_API_V1.knowledgeSearch, async (request, reply) => {
    const routeQuery = knowledgeSearchRouteQuery.safeParse(request.query ?? {});
    if (!routeQuery.success)
      return invalidRequest(reply, routeQuery.error.issues[0]?.message ?? '搜索条件无效');
    const contextId = parsedContextId(routeQuery.data.contextId);
    const input = knowledgeSearchInputSchema.safeParse({
      query: routeQuery.data.query,
      ...(contextId !== undefined ? { contextId } : {}),
      ...(routeQuery.data.workId ? { workId: routeQuery.data.workId } : {}),
      ...(routeQuery.data.entityTypes
        ? { entityTypes: commaSeparated(routeQuery.data.entityTypes) }
        : {}),
      ...(routeQuery.data.statuses ? { statuses: commaSeparated(routeQuery.data.statuses) } : {}),
      ...(routeQuery.data.sourceStates
        ? { sourceStates: commaSeparated(routeQuery.data.sourceStates) }
        : {}),
      cursor: routeQuery.data.cursor ?? null,
      limit: routeQuery.data.limit,
    });
    if (!input.success)
      return invalidRequest(reply, input.error.issues[0]?.message ?? '搜索条件无效');
    return knowledgeRequest(reply, () => service.searchKnowledge(input.data));
  });

  app.post(RESEARCH_API_V1.knowledgeSearchRebuild, async (_request, reply) =>
    knowledgeRequest(reply, () => service.rebuildKnowledgeSearch()),
  );

  app.post(RESEARCH_API_V1.knowledgeExportPreview, async (request, reply) => {
    const input = parseBody(knowledgeExportPreviewInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.previewKnowledgeExport(input));
  });

  app.post(RESEARCH_API_V1.knowledgeExportPickTarget, async (request, reply) => {
    const input = parseBody(pickKnowledgeExportTargetInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.pickKnowledgeExportTarget(input));
  });

  app.post(RESEARCH_API_V1.knowledgeExports, async (request, reply) => {
    const input = parseBody(startKnowledgeExportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.startKnowledgeExport(input));
  });

  app.get(RESEARCH_API_V1.notes, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const contextId = parsedContextId(parsed.data.contextId);
    return knowledgeRequest(reply, () =>
      service.listNotes({
        ...(contextId !== undefined ? { contextId } : {}),
        status: parsed.data.status,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      }),
    );
  });

  app.post(RESEARCH_API_V1.notes, async (request, reply) => {
    const input = parseBody(createNoteInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createNote(input));
  });

  app.get(RESEARCH_API_V1.note(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.getNote(id));
  });

  app.patch(RESEARCH_API_V1.note(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateNoteInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateNote(id, input));
  });

  app.delete(RESEARCH_API_V1.note(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteNote(id, input));
  });

  app.post(RESEARCH_API_V1.noteRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreNote(id, input));
  });

  app.get(RESEARCH_API_V1.noteRevisions(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.listRevisions('note', id));
  });

  app.get(RESEARCH_API_V1.noteLinks(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const parsed = linkListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    return knowledgeRequest(reply, () =>
      service.listNoteLinks(id, parsed.data.includeDeleted === 'true'),
    );
  });

  app.post(RESEARCH_API_V1.noteLinks(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(createNoteLinkInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createNoteLink(id, input));
  });

  app.delete(RESEARCH_API_V1.noteLink(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteNoteLink(id, input));
  });

  app.post(RESEARCH_API_V1.noteLinkRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreNoteLink(id, input));
  });

  app.get(RESEARCH_API_V1.evidence, async (request, reply) => {
    const parsed = evidenceListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const contextId = parsedContextId(parsed.data.contextId);
    return knowledgeRequest(reply, () =>
      service.listEvidence({
        ...(contextId !== undefined ? { contextId } : {}),
        ...(parsed.data.workId ? { workId: parsed.data.workId } : {}),
        ...(parsed.data.sourceState ? { sourceState: parsed.data.sourceState } : {}),
        status: parsed.data.status,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      }),
    );
  });

  app.post(RESEARCH_API_V1.evidence, async (request, reply) => {
    const input = parseBody(createEvidenceRequestSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () =>
      input.mode === 'annotation'
        ? service.createEvidence(input)
        : service.createDirectEvidence(input),
    );
  });

  app.get(RESEARCH_API_V1.evidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.getEvidence(id));
  });

  app.patch(RESEARCH_API_V1.evidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateEvidenceInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateEvidence(id, input));
  });

  app.post(RESEARCH_API_V1.evidenceRebind(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(evidenceRebindRequestSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () =>
      input.mode === 'preview'
        ? service.previewEvidenceRebind(id, input)
        : service.confirmEvidenceRebind(id, input),
    );
  });

  app.delete(RESEARCH_API_V1.evidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteEvidence(id, input));
  });

  app.post(RESEARCH_API_V1.evidenceRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreEvidence(id, input));
  });

  app.get(RESEARCH_API_V1.evidenceRevisions(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.listRevisions('evidence', id));
  });

  app.get(RESEARCH_API_V1.claims, async (request, reply) => {
    const parsed = claimListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const contextId = parsedContextId(parsed.data.contextId);
    return knowledgeRequest(reply, () =>
      service.listClaims({
        ...(contextId !== undefined ? { contextId } : {}),
        status: parsed.data.status,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      }),
    );
  });

  app.post(RESEARCH_API_V1.claims, async (request, reply) => {
    const input = parseBody(createClaimInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createClaim(input));
  });

  app.get(RESEARCH_API_V1.claim(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.getClaim(id));
  });

  app.patch(RESEARCH_API_V1.claim(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateClaimInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateClaim(id, input));
  });

  app.delete(RESEARCH_API_V1.claim(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteClaim(id, input));
  });

  app.post(RESEARCH_API_V1.claimRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreClaim(id, input));
  });

  app.get(RESEARCH_API_V1.claimRevisions(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.listRevisions('claim', id));
  });

  app.get(RESEARCH_API_V1.claimEvidence(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const parsed = linkListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    return knowledgeRequest(reply, () =>
      service.listClaimEvidence(id, parsed.data.includeDeleted === 'true'),
    );
  });

  app.post(RESEARCH_API_V1.claimEvidence(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(createClaimEvidenceInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createClaimEvidence(id, input));
  });

  app.patch(RESEARCH_API_V1.claimEvidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateClaimEvidenceInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateClaimEvidence(id, input));
  });

  app.delete(RESEARCH_API_V1.claimEvidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteClaimEvidence(id, input));
  });

  app.post(RESEARCH_API_V1.claimEvidenceRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreClaimEvidence(id, input));
  });

  app.get(RESEARCH_API_V1.matrices, async (request, reply) => {
    const parsed = matrixListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const contextId = parsedContextId(parsed.data.contextId);
    return knowledgeRequest(reply, () =>
      service.listMatrices({
        ...(contextId !== undefined ? { contextId } : {}),
        status: parsed.data.status,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      }),
    );
  });

  app.post(RESEARCH_API_V1.matrices, async (request, reply) => {
    const input = parseBody(createMatrixInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createMatrix(input));
  });

  app.get(RESEARCH_API_V1.matrix(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const parsed = linkListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    return knowledgeRequest(reply, () =>
      service.getMatrix(id, parsed.data.includeDeleted === 'true'),
    );
  });

  app.patch(RESEARCH_API_V1.matrix(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateMatrixInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateMatrix(id, input));
  });

  app.delete(RESEARCH_API_V1.matrix(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteMatrix(id, input));
  });

  app.post(RESEARCH_API_V1.matrixRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreMatrix(id, input));
  });

  app.get(RESEARCH_API_V1.matrixRevisions(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.listRevisions('matrix', id));
  });

  app.put(RESEARCH_API_V1.matrixStructure(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateMatrixStructureInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateMatrixStructure(id, input));
  });

  app.get(RESEARCH_API_V1.matrixCandidates(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = matrixCandidatesQuerySchema.safeParse(request.query ?? {});
    if (!input.success)
      return invalidRequest(reply, input.error.issues[0]?.message ?? '矩阵行列无效');
    return knowledgeRequest(reply, () => service.getMatrixCandidates(id, input.data));
  });

  app.post(RESEARCH_API_V1.matrixCells(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(createMatrixCellInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createMatrixCell(id, input));
  });

  app.get(RESEARCH_API_V1.matrixCells(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = matrixCellWindowQuerySchema.safeParse(request.query ?? {});
    if (!input.success)
      return invalidRequest(reply, input.error.issues[0]?.message ?? '矩阵窗口无效');
    return knowledgeRequest(reply, () => service.getMatrixCellWindow(id, input.data));
  });

  app.get(RESEARCH_API_V1.matrixCell(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return knowledgeRequest(reply, () => service.getMatrixCell(id));
  });

  app.patch(RESEARCH_API_V1.matrixCell(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateMatrixCellInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateMatrixCell(id, input));
  });

  app.delete(RESEARCH_API_V1.matrixCell(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteMatrixCell(id, input));
  });

  app.post(RESEARCH_API_V1.matrixCellRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreMatrixCell(id, input));
  });

  app.get(RESEARCH_API_V1.matrixCellEvidence(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const parsed = linkListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    return knowledgeRequest(reply, () =>
      service.listMatrixCellEvidence(id, parsed.data.includeDeleted === 'true'),
    );
  });

  app.post(RESEARCH_API_V1.matrixCellEvidence(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(createMatrixCellEvidenceInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createMatrixCellEvidence(id, input));
  });

  app.post(RESEARCH_API_V1.matrixCellReview(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(reviewMatrixCellInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.reviewMatrixCell(id, input));
  });

  app.delete(RESEARCH_API_V1.matrixCellEvidenceItem(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteMatrixCellEvidence(id, input));
  });

  app.post(RESEARCH_API_V1.matrixCellEvidenceRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreMatrixCellEvidence(id, input));
  });

  app.get(RESEARCH_API_V1.writingDocuments, async (request, reply) => {
    const parsed = writingDocumentListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const contextId = parsedContextId(parsed.data.contextId);
    return knowledgeRequest(reply, () =>
      service.listWritingDocuments({
        ...(contextId !== undefined ? { contextId } : {}),
        status: parsed.data.status,
        cursor: parsed.data.cursor ?? null,
        limit: parsed.data.limit,
      }),
    );
  });

  app.post(RESEARCH_API_V1.writingDocuments, async (request, reply) => {
    const input = parseBody(createWritingDocumentInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.createWritingDocument(input));
  });

  app.get(RESEARCH_API_V1.writingDocument(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const parsed = writingDocumentDetailQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '结构筛选无效');
    return knowledgeRequest(reply, () =>
      service.getWritingDocument(id, parsed.data.includeDeletedStructure === 'true'),
    );
  });

  app.patch(RESEARCH_API_V1.writingDocument(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateWritingDocumentInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateWritingDocument(id, input));
  });

  app.delete(RESEARCH_API_V1.writingDocument(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.deleteWritingDocument(id, input));
  });

  app.post(RESEARCH_API_V1.writingDocumentRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(knowledgeRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.restoreWritingDocument(id, input));
  });

  app.put(RESEARCH_API_V1.writingDocumentStructure(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateWritingStructureInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateWritingStructure(id, input));
  });

  app.patch(RESEARCH_API_V1.writingBlock(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateWritingBlockInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return knowledgeRequest(reply, () => service.updateWritingBlock(id, input));
  });
}
