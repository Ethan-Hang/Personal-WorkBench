import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RESEARCH_API_V1,
  commitInteropImportInputSchema,
  createInteropImportInputSchema,
  interopImportRecordsQuerySchema,
  pickInteropExportTargetInputSchema,
  pickInteropSourceInputSchema,
  previewInteropExportInputSchema,
  renderCitationInputSchema,
  startInteropExportInputSchema,
  updateCitationKeyInputSchema,
  updateInteropRecordDecisionInputSchema,
  interopAdapterNegotiationInputSchema,
} from '../contract.js';
import {
  defaultInteropAdapterRegistry,
  type InteropAdapterRegistry,
} from '../interop/adapter/registry.js';
import type { ResearchInteropExportService } from '../interop/export/service.js';
import type { ResearchCitationService } from '../interop/citation/service.js';
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
  exportService?: ResearchInteropExportService,
  citationProcessor?: ResearchCitationService,
  adapterRegistry: InteropAdapterRegistry = defaultInteropAdapterRegistry,
): void {
  app.get(RESEARCH_API_V1.interopAdapters, async () => adapterRegistry.list());

  app.post(RESEARCH_API_V1.interopAdapterNegotiate, async (request, reply) => {
    const input = parseBody(interopAdapterNegotiationInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return adapterRegistry.negotiate(input);
  });

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

  if (!exportService) return;

  app.post(RESEARCH_API_V1.interopExportPreview, async (request, reply) => {
    const input = parseBody(previewInteropExportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () => exportService.preview(input));
  });

  app.post(RESEARCH_API_V1.interopExportPickTarget, async (request, reply) => {
    const input = parseBody(pickInteropExportTargetInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () => exportService.pickTarget(input.format));
  });

  app.get(RESEARCH_API_V1.interopExport(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    return interopRequest(reply, () => exportService.get(params.data.id));
  });

  app.post(RESEARCH_API_V1.interopExport(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    const input = parseBody(startInteropExportInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () =>
      reply.code(202).send(exportService.start(params.data.id, input)),
    );
  });

  app.post(RESEARCH_API_V1.interopExportCancel(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, '任务 ID 无效');
    return interopRequest(reply, () => exportService.cancel(params.data.id));
  });

  app.put(RESEARCH_API_V1.interopCitationKey(':id'), async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return invalidRequest(reply, 'Work ID 无效');
    const input = parseBody(updateCitationKeyInputSchema, request.body, reply);
    if ('sent' in input) return input;
    return interopRequest(reply, () =>
      exportService.saveCitationKey({ workId: params.data.id, ...input }),
    );
  });

  if (citationProcessor) {
    app.post(RESEARCH_API_V1.interopCitationRender, async (request, reply) => {
      const input = parseBody(renderCitationInputSchema, request.body, reply);
      if ('sent' in input) return input;
      return interopRequest(reply, () => citationProcessor.render(input));
    });
  }
}
