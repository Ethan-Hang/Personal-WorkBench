import { describe, expect, it, vi } from 'vitest';
import {
  ACCOUNTS_API,
  GITHUB_AUTH_API,
  type AccountsResponse,
  type GitHubDeviceCode,
  type GitHubDevicePollResponse,
} from '@workbench/sync/contract';
import {
  AccountsApiError,
  bindGithubAccount,
  createAccount,
  deleteAccount,
  fetchAccounts,
  pollGithubDeviceFlow,
  startGithubDeviceFlow,
  switchAccount,
  unbindGithubAccount,
} from './accountsApi.js';

function mockResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as unknown as Response;
}

describe('accountsApi', () => {
  const sampleAccounts: AccountsResponse = {
    activeId: 'local-default',
    accounts: [
      {
        id: 'local-default',
        kind: 'local',
        displayName: '本地默认',
        createdAt: '2026-08-19T10:00:00.000Z',
        lastUsedAt: '2026-08-19T12:00:00.000Z',
      },
    ],
  };

  it('fetchAccounts sends GET to /api/accounts and returns validated response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAccounts));
    const result = await fetchAccounts(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.root(), { method: 'GET' });
    expect(result).toEqual(sampleAccounts);
  });

  it('createAccount sends POST with displayName to /api/accounts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(201, sampleAccounts));
    const result = await createAccount('工作账号', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.root(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '工作账号' }),
    });
    expect(result).toEqual(sampleAccounts);
  });

  it('switchAccount sends POST to /api/accounts/active', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAccounts));
    const result = await switchAccount('acc-123', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.active(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'acc-123' }),
    });
    expect(result).toEqual(sampleAccounts);
  });

  it('deleteAccount sends DELETE to /api/accounts/:id with encoded id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAccounts));
    const result = await deleteAccount('acc/special', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.byId('acc/special'), {
      method: 'DELETE',
    });
    expect(result).toEqual(sampleAccounts);
  });

  it('bindGithubAccount sends POST to bind endpoint with direction and github info', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAccounts));
    const body = {
      direction: 'cloud-to-local' as const,
      github: { login: 'octocat', userId: 123456 },
    };
    const result = await bindGithubAccount('local-default', body, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.bindGithub('local-default'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual(sampleAccounts);
  });

  it('unbindGithubAccount sends DELETE to github endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAccounts));
    const result = await unbindGithubAccount('local-default', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(ACCOUNTS_API.github('local-default'), {
      method: 'DELETE',
    });
    expect(result).toEqual(sampleAccounts);
  });

  it('startGithubDeviceFlow sends POST to /api/auth/github/device and returns device code', async () => {
    const deviceData: GitHubDeviceCode = {
      deviceCode: 'dc-123',
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900,
      interval: 5,
    };
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, deviceData));
    const result = await startGithubDeviceFlow(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GITHUB_AUTH_API.device, { method: 'POST' });
    expect(result).toEqual(deviceData);
  });

  it('pollGithubDeviceFlow sends POST with deviceCode and interval to /api/auth/github/device/poll', async () => {
    const pollResponse: GitHubDevicePollResponse = {
      status: 'pending',
      interval: 5,
    };
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, pollResponse));
    const result = await pollGithubDeviceFlow('dc-123', 5, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GITHUB_AUTH_API.poll, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: 'dc-123', interval: 5 }),
    });
    expect(result).toEqual(pollResponse);
  });

  it('throws AccountsApiError with server message and requestId on 4xx/5xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(400, {
        error: '不能删除当前账号',
        requestId: 'req-abc-123',
      }),
    );

    const promise = deleteAccount('local-default', fetchFn);
    await expect(promise).rejects.toBeInstanceOf(AccountsApiError);
    await expect(promise).rejects.toThrow('不能删除当前账号（请求编号 req-abc-123）');
  });

  it('throws AccountsApiError on contract schema mismatch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { invalid: 'shape' }));

    const promise = fetchAccounts(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(AccountsApiError);
    await expect(promise).rejects.toThrow('服务器响应形状不符合契约约定');
  });

  it('throws AccountsApiError on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = fetchAccounts(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(AccountsApiError);
    await expect(promise).rejects.toThrow('网络连接失败，请检查服务是否正常运行');
  });
});
