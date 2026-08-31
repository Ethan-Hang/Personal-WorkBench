import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RESEARCH_API_V1,
  commitInteropImportInputSchema,
  createInteropImportInputSchema,
  interopImportRecordsQuerySchema,
  pickInteropSourceInputSchema,
  updateInteropRecordDecisionInputSchema,
} from '../contract.js';
import {
  InteropServiceError,
  type ResearchInteropImportService,
} from '../interop/records/service.js';

const idParams = z.object({ id: z.string().min(1) });
const decisionParams = z.object({ id: z.string().min(1), recordId: z.string().min(1) });

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown, reply: FastifyReply): T | FastifyReply {
  const parsed = schema.safeParse(value ?? {});
  return parsed.success
    ? parsed.data
    : invalidRequest(reply, parsed.error.issues[0]?.message ?? '请求无效');
}

async function interopRequest(reply: FastifyReply, run: () => unknown | Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof InteropServiceError)) throw error;
    return reply.code(error.status).send({ code: error.code, error: error.message });
  }
}

export function registerResearchInteropRoutes(
  app: FastifyInstance,
  service: ResearchInteropImportService,
): void {
  app.post(RESEARCH_API_V1.interopImportPickSource, async (request, reply) => {
    const input = parseBody(pickInteropSourceInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () => service.pickSource(input.format));
  });

  app.post(RESEARCH_API_V1.interopImports, async (request, reply) => {
    const input = parseBody(createInteropImportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, async () => {
      const created = await service.createImport(input);
      return reply.code(201).send(created);
    });
  });

  app.get(RESEARCH_API_V1.interopImport(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    return interopRequest(reply, () => service.getImport(params.data.id));
  });

  app.post(RESEARCH_API_V1.interopImportParse(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    return interopRequest(reply, () => reply.code(202).send(service.startParse(params.data.id)));
  });

  app.get(RESEARCH_API_V1.interopImportRecords(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    const query = interopImportRecordsQuerySchema.safeParse(request.query ?? {});
    if (!query.success) return invalidRequest(reply, '分页参数无效');
    return interopRequest(reply, () => service.listRecords(params.data.id, query.data));
  });

  app.put(
    RESEARCH_API_V1.interopImportRecordDecision(':id', ':recordId'),
    async (request, reply) => {
      const params = decisionParams.safeParse(request.params);
      if (!params.success) return invalidRequest(reply, '记录 ID 无效');
      const input = parseBody(updateInteropRecordDecisionInputSchema, request.body, reply);
      if ('sent' in input) return input;
      return interopRequest(reply, () => service.saveDecision(params.data.recordId, input));
    },
  );

  app.post(RESEARCH_API_V1.interopImportCancel(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    return interopRequest(reply, () => service.cancel(params.data.id));
  });

  app.post(RESEARCH_API_V1.interopImportCommit(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    const input = parseBody(commitInteropImportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () => service.commit(params.data.id, input.expectedRevision));
  });
}
