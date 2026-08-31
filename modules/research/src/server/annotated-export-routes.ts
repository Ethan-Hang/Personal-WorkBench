import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RESEARCH_API_V1,
  annotatedExportPreviewInputSchema,
  pickAnnotatedExportTargetInputSchema,
  retryAnnotatedExportInputSchema,
  startAnnotatedExportInputSchema,
} from '../contract.js';
import type { ResearchAnnotatedExportService } from '../annotated-export/service.js';
import { ReaderError } from '../reader/errors.js';

const idParams = z.object({ id: z.string().min(1) });

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

async function exportRequest(reply: FastifyReply, run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ReaderError)) throw error;
    return reply.code(error.status).send({
      code: error.code,
      error: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
}

function parseId(params: unknown, reply: FastifyReply): string | FastifyReply {
  const parsed = idParams.safeParse(params);
  return parsed.success
    ? parsed.data.id
    : invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | FastifyReply {
  const parsed = schema.safeParse(body ?? {});
  return parsed.success
    ? parsed.data
    : invalidRequest(reply, parsed.error.issues[0]?.message ?? '请求无效');
}

export function registerResearchAnnotatedExportRoutes(
  app: FastifyInstance,
  service: ResearchAnnotatedExportService,
): void {
  app.post(RESEARCH_API_V1.assetAnnotatedExportPreview(':id'), async (request, reply) => {
    const assetId = parseId(request.params, reply);
    if (typeof assetId !== 'string') return assetId;
    const input = parseBody(annotatedExportPreviewInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return exportRequest(reply, () => service.preview(assetId, input));
  });

  app.post(RESEARCH_API_V1.assetAnnotatedExportPickTarget(':id'), async (request, reply) => {
    const assetId = parseId(request.params, reply);
    if (typeof assetId !== 'string') return assetId;
    const input = parseBody(pickAnnotatedExportTargetInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return exportRequest(reply, () => service.pickTarget(input));
  });

  app.post(RESEARCH_API_V1.assetAnnotatedExports(':id'), async (request, reply) => {
    const assetId = parseId(request.params, reply);
    if (typeof assetId !== 'string') return assetId;
    const input = parseBody(startAnnotatedExportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return exportRequest(reply, () => service.start(assetId, input));
  });

  app.get(RESEARCH_API_V1.annotatedExportJob(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return exportRequest(reply, () => service.get(id));
  });

  app.post(RESEARCH_API_V1.annotatedExportCancel(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return exportRequest(reply, () => service.cancel(id));
  });

  app.post(RESEARCH_API_V1.annotatedExportRetry(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    const input = parseBody(retryAnnotatedExportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return exportRequest(reply, () => service.retry(id, input));
  });

  app.post(RESEARCH_API_V1.annotatedExportOpenLocation(':id'), async (request, reply) => {
    const id = parseId(request.params, reply);
    if (typeof id !== 'string') return id;
    return exportRequest(reply, () => service.openLocation(id));
  });
}
