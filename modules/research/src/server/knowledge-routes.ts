import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  GENERAL_READING_CONTEXT_ID,
  KNOWLEDGE_BASIC_STATUSES,
  RESEARCH_API_V1,
  createEvidenceRequestSchema,
  createNoteInputSchema,
  createNoteLinkInputSchema,
  evidenceRebindRequestSchema,
  knowledgeRevisionInputSchema,
  updateEvidenceInputSchema,
  updateNoteInputSchema,
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
const linkListQuery = z.object({
  includeDeleted: z.enum(['true', 'false']).default('false'),
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

export function registerResearchKnowledgeRoutes(
  app: FastifyInstance,
  service: ResearchKnowledgeService,
): void {
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
}
