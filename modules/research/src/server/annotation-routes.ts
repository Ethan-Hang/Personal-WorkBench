import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  GENERAL_READING_CONTEXT_ID,
  READING_CONTEXT_STATUSES,
  RESEARCH_API_V1,
  annotationRevisionInputSchema,
  archiveReadingContextInputSchema,
  createAnnotationInputSchema,
  createReadingContextInputSchema,
  setCollectionReadingContextInputSchema,
  updateAnnotationInputSchema,
  updateReadingContextInputSchema,
} from '../contract.js';
import { AnnotationError } from '../annotation/errors.js';
import type { ResearchAnnotationService } from '../annotation/service.js';

const idParams = z.object({ id: z.string().min(1) });
const contextListQuery = z.object({
  status: z.union([z.enum(READING_CONTEXT_STATUSES), z.literal('all')]).default('active'),
});
const annotationListQuery = z.object({
  contextIds: z.union([z.string(), z.array(z.string())]).optional(),
  includeGeneral: z.enum(['true', 'false']).default('true'),
  includeDeleted: z.enum(['true', 'false']).default('false'),
});

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

function annotationFailure(reply: FastifyReply, error: unknown) {
  if (!(error instanceof AnnotationError)) throw error;
  return reply.code(error.status).send({
    code: error.code,
    error: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

async function annotationRequest(reply: FastifyReply, run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return annotationFailure(reply, error);
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

export function registerResearchAnnotationRoutes(
  app: FastifyInstance,
  service: ResearchAnnotationService,
): void {
  app.get(RESEARCH_API_V1.readingContexts, async (request, reply) => {
    const parsed = contextListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    return annotationRequest(reply, () => service.listContexts(parsed.data.status));
  });

  app.post(RESEARCH_API_V1.readingContexts, async (request, reply) => {
    const input = parseBody(createReadingContextInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.createContext(input));
  });

  app.get(RESEARCH_API_V1.readingContext(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.getContext(id));
  });

  app.patch(RESEARCH_API_V1.readingContext(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateReadingContextInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.updateContext(id, input));
  });

  app.get(RESEARCH_API_V1.readingContextDeletionPreview(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.previewContextArchive(id));
  });

  app.post(RESEARCH_API_V1.readingContextArchive(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(archiveReadingContextInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.archiveContext(id, input));
  });

  app.post(RESEARCH_API_V1.readingContextRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.restoreContext(id));
  });

  app.get(RESEARCH_API_V1.collectionReadingContext(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.getCollectionContext(id));
  });

  app.put(RESEARCH_API_V1.collectionReadingContext(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(setCollectionReadingContextInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.setCollectionContext(id, input));
  });

  app.get(RESEARCH_API_V1.assetAnnotations(':id'), async (request, reply) => {
    const assetId = parseId(request.params, reply);
    if (typeof assetId !== 'string') return assetId;
    const parsed = annotationListQuery.safeParse(request.query ?? {});
    if (!parsed.success)
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '筛选无效');
    const rawContextIds = parsed.data.contextIds ?? [];
    const values = Array.isArray(rawContextIds) ? rawContextIds : [rawContextIds];
    const contextIds = [
      ...new Set(
        values
          .flatMap((value) => value.split(','))
          .map((value) => value.trim())
          .filter((value) => value && value !== GENERAL_READING_CONTEXT_ID),
      ),
    ];
    const includeGeneral =
      parsed.data.includeGeneral === 'true' ||
      values.some((value) => value.split(',').includes(GENERAL_READING_CONTEXT_ID));
    return annotationRequest(reply, () =>
      service.listAnnotations({
        assetId,
        contextIds,
        includeGeneral,
        includeDeleted: parsed.data.includeDeleted === 'true',
      }),
    );
  });

  app.post(RESEARCH_API_V1.assetAnnotations(':id'), async (request, reply) => {
    const assetId = parseId(request.params, reply);
    if (typeof assetId !== 'string') return assetId;
    const input = parseBody(createAnnotationInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.createAnnotation(assetId, input));
  });

  app.get(RESEARCH_API_V1.annotation(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.getAnnotation(id));
  });

  app.patch(RESEARCH_API_V1.annotation(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(updateAnnotationInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.updateAnnotation(id, input));
  });

  app.delete(RESEARCH_API_V1.annotation(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(annotationRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.deleteAnnotation(id, input));
  });

  app.post(RESEARCH_API_V1.annotationRestore(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(annotationRevisionInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return annotationRequest(reply, () => service.restoreAnnotation(id, input));
  });

  app.get(RESEARCH_API_V1.annotationRevisions(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return annotationRequest(reply, () => service.listAnnotationRevisions(id));
  });
}
