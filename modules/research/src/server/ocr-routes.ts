import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RESEARCH_API_V1, startOcrInputSchema } from '../contract.js';
import type { ResearchOcrService } from '../ocr/service.js';
import { ReaderError } from '../reader/errors.js';

const idParams = z.object({ id: z.string().min(1) });

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

async function ocrRequest(reply: FastifyReply, run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ReaderError)) throw error;
    return reply.code(error.status).send({ code: error.code, error: error.message });
  }
}

export function registerResearchOcrRoutes(app: FastifyInstance, service: ResearchOcrService): void {
  app.get(RESEARCH_API_V1.assetOcr(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return { job: await service.get(parsed.data.id) };
  });

  const create = (url: string, action: 'start' | 'rebuild') => {
    app.post(url, async (request, reply) => {
      const parsedParams = idParams.safeParse(request.params);
      if (!parsedParams.success) {
        return invalidRequest(reply, parsedParams.error.issues[0]?.message ?? 'ID 无效');
      }
      const parsedBody = startOcrInputSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return invalidRequest(reply, parsedBody.error.issues[0]?.message ?? 'OCR 参数无效');
      }
      return ocrRequest(reply, () => service[action](parsedParams.data.id, parsedBody.data));
    });
  };
  create(RESEARCH_API_V1.assetOcrStart(':id'), 'start');
  create(RESEARCH_API_V1.assetOcrRebuild(':id'), 'rebuild');

  for (const [url, action] of [
    [RESEARCH_API_V1.assetOcrPause(':id'), 'pause'],
    [RESEARCH_API_V1.assetOcrCancel(':id'), 'cancel'],
    [RESEARCH_API_V1.assetOcrResume(':id'), 'resume'],
  ] as const) {
    app.post(url, async (request, reply) => {
      const parsed = idParams.safeParse(request.params);
      if (!parsed.success) {
        return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
      }
      return ocrRequest(reply, () => service[action](parsed.data.id));
    });
  }
}
