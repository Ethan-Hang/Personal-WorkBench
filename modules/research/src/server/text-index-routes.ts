import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RESEARCH_API_V1,
  pageTextSearchQuerySchema,
  startTextIndexInputSchema,
} from '../contract.js';
import { ReaderError } from '../reader/errors.js';
import type { ResearchTextIndexService } from '../reader/text-index-service.js';

const idParams = z.object({ id: z.string().min(1) });

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

function textIndexFailure(reply: FastifyReply, error: unknown) {
  if (!(error instanceof ReaderError)) throw error;
  return reply.code(error.status).send({ code: error.code, error: error.message });
}

async function textIndexRequest(reply: FastifyReply, run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return textIndexFailure(reply, error);
  }
}

export function registerResearchTextIndexRoutes(
  app: FastifyInstance,
  service: ResearchTextIndexService,
): void {
  app.get(RESEARCH_API_V1.assetTextIndex(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return { job: await service.get(parsed.data.id) };
  });

  const control = (
    url: string,
    action: (assetId: string, input: { priorityPage: number | null }) => Promise<unknown>,
  ) => {
    app.post(url, async (request, reply) => {
      const parsedParams = idParams.safeParse(request.params);
      if (!parsedParams.success) {
        return invalidRequest(reply, parsedParams.error.issues[0]?.message ?? 'ID 无效');
      }
      const parsedBody = startTextIndexInputSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return invalidRequest(reply, parsedBody.error.issues[0]?.message ?? '索引参数无效');
      }
      return textIndexRequest(reply, () => action(parsedParams.data.id, parsedBody.data));
    });
  };
  control(RESEARCH_API_V1.assetTextIndexStart(':id'), (assetId, input) =>
    service.start(assetId, input),
  );
  control(RESEARCH_API_V1.assetTextIndexResume(':id'), (assetId, input) =>
    service.resume(assetId, input),
  );
  control(RESEARCH_API_V1.assetTextIndexRebuild(':id'), (assetId, input) =>
    service.rebuild(assetId, input),
  );

  app.post(RESEARCH_API_V1.assetTextIndexPause(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return textIndexRequest(reply, () => service.pause(parsed.data.id));
  });

  app.post(RESEARCH_API_V1.assetTextIndexCancel(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return textIndexRequest(reply, () => service.cancel(parsed.data.id));
  });

  app.get(RESEARCH_API_V1.pageTextSearch, async (request, reply) => {
    const parsed = pageTextSearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return invalidRequest(reply, parsed.error.issues[0]?.message ?? '搜索参数无效');
    }
    return { results: await service.search(parsed.data) };
  });
}
