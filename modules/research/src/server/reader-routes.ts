import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RESEARCH_API_V1, saveReaderStateInputSchema } from '../contract.js';
import type { ReaderContentSource } from '../reader/content-source.js';
import { ReaderError } from '../reader/errors.js';
import { planReaderResponse } from '../reader/range-response.js';
import type { ResearchReaderService } from '../reader/service.js';

const idParams = z.object({ id: z.string().min(1) });

function invalidRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ code: 'INVALID_INPUT', error: message });
}

function readerFailure(reply: FastifyReply, error: unknown) {
  if (!(error instanceof ReaderError)) throw error;
  return reply.code(error.status).send({
    code: error.code,
    error: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  });
}

async function readerRequest(reply: FastifyReply, run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return readerFailure(reply, error);
  }
}

export function registerResearchReaderRoutes(
  app: FastifyInstance,
  service: ResearchReaderService,
  contentSource: ReaderContentSource,
): void {
  app.get(RESEARCH_API_V1.readerManifest(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return readerRequest(reply, () => service.getManifest(parsed.data.id));
  });

  app.get(RESEARCH_API_V1.readerState(':id'), async (request, reply) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
    return readerRequest(reply, () => service.getState(parsed.data.id));
  });

  app.put(RESEARCH_API_V1.readerState(':id'), async (request, reply) => {
    const parsedParams = idParams.safeParse(request.params);
    if (!parsedParams.success) {
      return invalidRequest(reply, parsedParams.error.issues[0]?.message ?? 'ID 无效');
    }
    const parsedBody = saveReaderStateInputSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return invalidRequest(reply, parsedBody.error.issues[0]?.message ?? '阅读状态无效');
    }
    return readerRequest(reply, () => service.saveState(parsedParams.data.id, parsedBody.data));
  });

  app.get(
    RESEARCH_API_V1.assetContent(':id'),
    { exposeHeadRoute: true },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = idParams.safeParse(request.params);
      if (!parsed.success) {
        return invalidRequest(reply, parsed.error.issues[0]?.message ?? 'ID 无效');
      }
      return readerRequest(reply, async () => {
        const content = await contentSource.resolve(parsed.data.id);
        const noneMatch = request.headers['if-none-match'];
        if (noneMatch === content.etag || noneMatch === '*') {
          return reply
            .code(304)
            .headers({ etag: content.etag, 'cache-control': 'private, no-store' })
            .send();
        }
        const ifRange = request.headers['if-range'];
        const requestedRange =
          ifRange !== undefined && ifRange !== content.etag ? undefined : request.headers.range;
        const plan = planReaderResponse(content, requestedRange);
        if (!plan) {
          return reply
            .code(416)
            .headers({
              'accept-ranges': 'bytes',
              'content-range': `bytes */${content.byteSize}`,
              etag: content.etag,
            })
            .send({ code: 'READER_RANGE_INVALID', error: '请求的 PDF 字节范围无效' });
        }
        reply.code(plan.status).headers(plan.headers);
        if (request.method === 'HEAD') {
          reply.hijack();
          reply.raw.writeHead(plan.status, plan.headers);
          reply.raw.end();
          return reply;
        }

        const stream = content.open(plan.range);
        const destroy = () => stream.destroy();
        request.raw.once('aborted', destroy);
        reply.raw.once('close', destroy);
        stream.once('close', () => {
          request.raw.off('aborted', destroy);
          reply.raw.off('close', destroy);
        });
        return reply.send(stream);
      });
    },
  );
}
