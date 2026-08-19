import type { FastifyInstance } from 'fastify';
import {
  GITHUB_AUTH_API,
  githubDevicePollBodySchema,
  githubDevicePollResponseSchema,
} from '@workbench/sync/contract';
import type { GitHubDeviceFlow } from './github-device-flow.js';

function badRequest(message: string): Error {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}

export function registerGitHubAuthRoutes(app: FastifyInstance, flow: GitHubDeviceFlow): void {
  app.post(GITHUB_AUTH_API.device, async () => flow.start());

  app.post(GITHUB_AUTH_API.poll, async (request) => {
    const body = githubDevicePollBodySchema.safeParse(request.body);
    if (!body.success) throw badRequest('deviceCode 与 interval 必须是有效值');
    return githubDevicePollResponseSchema.parse(
      await flow.poll(body.data.deviceCode, body.data.interval),
    );
  });
}
