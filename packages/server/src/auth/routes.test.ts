import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { GITHUB_AUTH_API, type GitHubDevicePollResponse } from '@workbench/sync/contract';
import type { GitHubDeviceFlow } from './github-device-flow.js';
import { registerGitHubAuthRoutes } from './routes.js';

function fakeFlow(pollResult: GitHubDevicePollResponse): GitHubDeviceFlow {
  return {
    async start() {
      return {
        deviceCode: 'device-code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://github.com/login/device',
        expiresIn: 900,
        interval: 5,
      };
    },
    async poll() {
      return pollResult;
    },
  };
}

describe('GitHub Device Flow routes', () => {
  it('暴露发起 Device Flow 的端点', async () => {
    const app = Fastify();
    registerGitHubAuthRoutes(app, fakeFlow({ status: 'pending', interval: 5 }));
    const response = await app.inject({ method: 'POST', url: GITHUB_AUTH_API.device });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userCode: 'ABCD-EFGH', interval: 5 });
    await app.close();
  });

  it('拒绝缺少 deviceCode 或 interval 的轮询请求', async () => {
    const app = Fastify();
    registerGitHubAuthRoutes(app, fakeFlow({ status: 'pending', interval: 5 }));
    const response = await app.inject({
      method: 'POST',
      url: GITHUB_AUTH_API.poll,
      payload: { deviceCode: '' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('返回可供前端继续调度的 slow_down interval', async () => {
    const app = Fastify();
    registerGitHubAuthRoutes(app, fakeFlow({ status: 'slow_down', interval: 10 }));
    const response = await app.inject({
      method: 'POST',
      url: GITHUB_AUTH_API.poll,
      payload: { deviceCode: 'device-code', interval: 5 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'slow_down', interval: 10 });
    await app.close();
  });
});
