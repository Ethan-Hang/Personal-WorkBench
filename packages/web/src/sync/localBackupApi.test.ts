import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_BACKUP_API,
  type BackupListItem,
  type LocalBackupConfig,
} from '@workbench/sync/contract';
import {
  LocalBackupApiError,
  deleteLocalBackup,
  fetchLocalBackupConfig,
  fetchLocalBackupList,
  runLocalBackup,
  updateLocalBackupConfig,
} from './localBackupApi.js';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body !== undefined ? JSON.stringify(body) : ''),
  } as unknown as Response;
}

describe('localBackupApi', () => {
  const sampleConfig: LocalBackupConfig = {
    targetDir: '',
    resolvedDir: 'D:/Github/Personal-WorkBench/data/local/backups',
    autoEnabled: false,
    retentionCount: 5,
  };

  const sampleBackupItem: BackupListItem = {
    name: '2026-08-20T12-00-00Z-local-default.db.gz',
    complete: true,
    meta: {
      v: 1,
      createdAt: '2026-08-20T12:00:00.000Z',
      accountId: 'local-default',
      device: 'win-pc',
      appVersion: '0.1.0',
      migrations: { core: 1, todo: 1, 'campus-recruit': 1 },
      counts: { items: 30, campus_recruit_applications: 10 },
      bytes: 204800,
      sha256: 'hash123456',
      reason: '恢复前快照',
    },
  };

  const sampleOrphanItem: BackupListItem = {
    name: '2026-08-20T12-05-00Z-orphan.db.gz',
    complete: false,
    meta: null,
  };

  it('fetchLocalBackupConfig sends GET to /api/local-backup/config', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleConfig));
    const result = await fetchLocalBackupConfig(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_BACKUP_API.config(), { method: 'GET' });
    expect(result).toEqual(sampleConfig);
  });

  it('updateLocalBackupConfig sends PUT to /api/local-backup/config with JSON body', async () => {
    const updatedConfig: LocalBackupConfig = {
      targetDir: 'D:/custom_backups',
      resolvedDir: 'D:/custom_backups',
      autoEnabled: true,
      retentionCount: 10,
    };
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, updatedConfig));
    const patch = {
      targetDir: 'D:/custom_backups',
      autoEnabled: true,
      retentionCount: 10,
    };
    const result = await updateLocalBackupConfig(patch, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_BACKUP_API.config(), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    expect(result).toEqual(updatedConfig);
  });

  it('runLocalBackup sends POST to /api/local-backup/run', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleBackupItem));
    const result = await runLocalBackup(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_BACKUP_API.run(), { method: 'POST' });
    expect(result).toEqual(sampleBackupItem);
  });

  it('fetchLocalBackupList sends GET to /api/local-backup/list and returns list including orphans', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mockResponse(200, [sampleBackupItem, sampleOrphanItem]));
    const result = await fetchLocalBackupList(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_BACKUP_API.list(), { method: 'GET' });
    expect(result).toEqual([sampleBackupItem, sampleOrphanItem]);
  });

  it('deleteLocalBackup sends DELETE to /api/local-backup/:name with URL encoded name', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { ok: true }));
    await deleteLocalBackup('2026-08-20T12-00-00Z.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_BACKUP_API.item('2026-08-20T12-00-00Z.db.gz'), {
      method: 'DELETE',
    });
  });

  it('throws LocalBackupApiError with server message, status, and requestId on error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(400, {
        error: '备份目录不存在：D:/non_existent',
        requestId: 'req-local-123',
      }),
    );

    const promise = updateLocalBackupConfig({ targetDir: 'D:/non_existent' }, fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalBackupApiError);
    await expect(promise).rejects.toThrow(
      '备份目录不存在：D:/non_existent（请求编号 req-local-123）',
    );
  });

  it('throws LocalBackupApiError on contract schema mismatch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { invalid: 'schema' }));

    const promise = fetchLocalBackupConfig(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalBackupApiError);
    await expect(promise).rejects.toThrow('服务器响应形状不符合契约约定');
  });

  it('throws LocalBackupApiError on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = fetchLocalBackupList(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalBackupApiError);
    await expect(promise).rejects.toThrow('网络连接失败，请检查服务是否正常运行');
  });
});
