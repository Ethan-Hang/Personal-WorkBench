import { describe, expect, it, vi } from 'vitest';
import { GIST_SYNC_API, type SyncStatus } from '@workbench/sync/contract';
import { fetchSyncStatus, pullSync, pushSync, SyncApiError, unlockSync } from './syncApi.js';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body !== undefined ? JSON.stringify(body) : ''),
  } as unknown as Response;
}

describe('syncApi', () => {
  const sampleStatus: SyncStatus = {
    linked: true,
    protectedByOsVault: true,
    unlocked: true,
    gistId: 'gist-abc-123',
    cloudUpdatedAt: '2026-08-19T20:00:00.000Z',
    cloudDevice: 'MacBook-Pro',
    lastSeenUpdatedAt: '2026-08-19T20:00:00.000Z',
    conflict: false,
    pendingDirection: null,
  };

  it('fetchSyncStatus sends GET to /api/sync/status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleStatus));
    const result = await fetchSyncStatus(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GIST_SYNC_API.status(), { method: 'GET' });
    expect(result).toEqual(sampleStatus);
  });

  it('unlockSync sends POST to /api/sync/unlock with passphrase and remember flag', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleStatus));
    const body = { passphrase: 'secret-passphrase', remember: true };
    const result = await unlockSync(body, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GIST_SYNC_API.unlock(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual(sampleStatus);
  });

  it('pushSync sends POST to /api/sync/push with force flag', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleStatus));
    const result = await pushSync({ force: true }, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GIST_SYNC_API.push(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
    expect(result).toEqual(sampleStatus);
  });

  it('pushSync default call sends empty options', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleStatus));
    const result = await pushSync({}, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GIST_SYNC_API.push(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(result).toEqual(sampleStatus);
  });

  it('pullSync sends POST to /api/sync/pull', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleStatus));
    const result = await pullSync(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(GIST_SYNC_API.pull(), { method: 'POST' });
    expect(result).toEqual(sampleStatus);
  });

  it('throws SyncApiError with requestId on 4xx/5xx responses', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(409, {
        error: '云端设置已被修改，请先选择保留哪一边',
        requestId: 'req-409-abc',
      }),
    );

    await expect(pushSync({}, fetchFn)).rejects.toThrow(SyncApiError);
    await expect(pushSync({}, fetchFn)).rejects.toThrow(
      '云端设置已被修改，请先选择保留哪一边（请求编号 req-409-abc）',
    );
  });

  it('throws SyncApiError on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(fetchSyncStatus(fetchFn)).rejects.toThrow('网络连接失败，请检查服务是否正常运行');
  });

  it('throws SyncApiError when response does not match contract schema', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { invalid: 'shape' }));

    await expect(fetchSyncStatus(fetchFn)).rejects.toThrow('服务器响应形状不符合契约约定');
  });
});
