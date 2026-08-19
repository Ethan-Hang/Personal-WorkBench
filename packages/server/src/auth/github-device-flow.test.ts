import { describe, expect, it, vi } from 'vitest';
import { GITHUB_CLIENT_ID, GitHubDeviceFlowClient } from './github-device-flow.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(...responses: Response[]): typeof fetch {
  return vi.fn(async () => {
    const response = responses.shift();
    if (response === undefined) throw new Error('测试没有准备足够的 GitHub 响应');
    return response;
  }) as unknown as typeof fetch;
}

describe('GitHubDeviceFlowClient', () => {
  it('只用公开 client_id 发起 Device Flow，不发送 scope 或 client_secret', async () => {
    const fetcher = mockFetch(
      json({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      }),
    );
    const client = new GitHubDeviceFlowClient(fetcher);

    await expect(client.start()).resolves.toEqual({
      deviceCode: 'device-code',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    });

    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(url).toBe('https://github.com/login/device/code');
    expect(init?.method).toBe('POST');
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({ client_id: GITHUB_CLIENT_ID });
  });

  it('把 authorization_pending 映射为继续等待', async () => {
    const client = new GitHubDeviceFlowClient(mockFetch(json({ error: 'authorization_pending' })));
    await expect(client.poll('device-code', 5)).resolves.toEqual({
      status: 'pending',
      interval: 5,
    });
  });

  it('slow_down 优先采用 GitHub 返回的新 interval，缺省时累加五秒', async () => {
    const withInterval = new GitHubDeviceFlowClient(
      mockFetch(json({ error: 'slow_down', interval: 12 })),
    );
    await expect(withInterval.poll('device-code', 5)).resolves.toEqual({
      status: 'slow_down',
      interval: 12,
    });

    const withoutInterval = new GitHubDeviceFlowClient(mockFetch(json({ error: 'slow_down' })));
    await expect(withoutInterval.poll('device-code', 5)).resolves.toEqual({
      status: 'slow_down',
      interval: 10,
    });
  });

  it.each([
    ['expired_token', 'expired'],
    ['access_denied', 'denied'],
  ] as const)('把 %s 映射为 %s', async (error, status) => {
    const client = new GitHubDeviceFlowClient(mockFetch(json({ error })));
    await expect(client.poll('device-code', 5)).resolves.toEqual({ status });
  });

  it('授权成功后读取用户身份，并保留未来可能出现的 refresh 字段', async () => {
    const fetcher = mockFetch(
      json({
        access_token: 'ghu_token',
        token_type: 'bearer',
        scope: '',
        refresh_token: 'ghr_refresh',
        expires_in: 28_800,
        refresh_token_expires_in: 15_552_000,
      }),
      json({ login: 'Ethan-Hang', id: 12345 }),
    );
    const client = new GitHubDeviceFlowClient(fetcher);

    await expect(client.poll('device-code', 5)).resolves.toEqual({
      status: 'authorized',
      credential: {
        accessToken: 'ghu_token',
        tokenType: 'bearer',
        scope: '',
        refreshToken: 'ghr_refresh',
        expiresIn: 28_800,
        refreshTokenExpiresIn: 15_552_000,
      },
      user: { login: 'Ethan-Hang', id: 12345 },
    });

    const [tokenUrl, tokenInit] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(tokenUrl).toBe('https://github.com/login/oauth/access_token');
    const tokenBody = new URLSearchParams(String(tokenInit?.body));
    expect(Object.fromEntries(tokenBody)).toEqual({
      client_id: GITHUB_CLIENT_ID,
      device_code: 'device-code',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    expect(Object.fromEntries(tokenBody)).not.toHaveProperty('client_secret');

    const [userUrl, userInit] = vi.mocked(fetcher).mock.calls[1] ?? [];
    expect(userUrl).toBe('https://api.github.com/user');
    expect(new Headers(userInit?.headers).get('authorization')).toBe('Bearer ghu_token');
  });

  it('把网络故障映射为上游服务错误', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const client = new GitHubDeviceFlowClient(fetcher);

    await expect(client.start()).rejects.toMatchObject({
      message: 'GitHub Device Flow 初始化请求失败',
      statusCode: 502,
    });
  });
});
