import { describe, expect, it, vi } from 'vitest';
import {
  SYNC_API,
  RESTORE_API,
  type BackupConfig,
  type BackupListItem,
  type RestorePreflightResponse,
  type RestoreState,
} from '@workbench/sync/contract';
import {
  BackupApiError,
  confirmRestore,
  deleteBackup,
  fetchBackupConfig,
  fetchBackupList,
  fetchRestoreState,
  preflightRestore,
  rollbackRestore,
  runBackup,
  updateBackupConfig,
} from './backupApi.js';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body !== undefined ? JSON.stringify(body) : ''),
  } as unknown as Response;
}

describe('backupApi', () => {
  const sampleConfig: BackupConfig = {
    configured: true,
    url: 'https://dav.jianguoyun.com/dav/',
    username: 'user@example.com',
    autoEnabled: false,
    retentionCount: 10,
  };

  const sampleBackupItem: BackupListItem = {
    name: '2026-08-19T12-00-00Z-local-default.db.gz',
    complete: true,
    meta: {
      v: 1,
      createdAt: '2026-08-19T12:00:00.000Z',
      accountId: 'local-default',
      device: 'win-laptop',
      appVersion: '0.1.0',
      migrations: { core: 1, todo: 1, 'campus-recruit': 1 },
      counts: { items: 25, campus_recruit_applications: 8 },
      bytes: 102400,
      sha256: 'abc123hash',
    },
  };

  it('fetchBackupConfig sends GET to /api/backup/config', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleConfig));
    const result = await fetchBackupConfig(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(SYNC_API.backupConfig(), { method: 'GET' });
    expect(result).toEqual(sampleConfig);
  });

  it('updateBackupConfig sends PUT to /api/backup/config with JSON body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleConfig));
    const patch = { autoEnabled: true, retentionCount: 15 };
    const result = await updateBackupConfig(patch, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(SYNC_API.backupConfig(), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    expect(result).toEqual(sampleConfig);
  });

  it('runBackup sends POST to /api/backup/run', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleBackupItem));
    const result = await runBackup(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(SYNC_API.backupRun(), { method: 'POST' });
    expect(result).toEqual(sampleBackupItem);
  });

  it('fetchBackupList sends GET to /api/backup/list', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, [sampleBackupItem]));
    const result = await fetchBackupList(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(SYNC_API.backupList(), { method: 'GET' });
    expect(result).toEqual([sampleBackupItem]);
  });

  it('deleteBackup sends DELETE to /api/backup/:name', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { ok: true }));
    await deleteBackup('sample.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(SYNC_API.backupItem('sample.db.gz'), {
      method: 'DELETE',
    });
  });

  it('preflightRestore sends POST with name to /api/restore/preflight and parses diff report', async () => {
    const samplePreflight: RestorePreflightResponse = {
      name: 'sample.db.gz',
      compatible: true,
      meta: sampleBackupItem.meta!,
      diff: {
        core: {
          added: [{ id: 'task-1', title: '云端新增任务' }],
          removed: [{ id: 'task-2', title: '本地将被覆盖任务' }],
          modified: [{ id: 'task-3', title: '云端标题', localTitle: '本地标题' }],
        },
        modules: [
          {
            table: 'campus_recruit_applications',
            moduleId: 'campus-recruit',
            moduleName: '秋招管理',
            localCount: 5,
            remoteCount: 8,
          },
        ],
      },
    };

    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, samplePreflight));
    const result = await preflightRestore('sample.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(RESTORE_API.preflight(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'sample.db.gz' }),
    });
    expect(result).toEqual(samplePreflight);
  });

  it('confirmRestore sends POST with name to /api/restore/confirm', async () => {
    const sampleState: RestoreState = {
      state: 'restoring',
      step: 'download',
      message: '正在从云端下载快照...',
    };

    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleState));
    const result = await confirmRestore('sample.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(RESTORE_API.confirm(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'sample.db.gz' }),
    });
    expect(result).toEqual(sampleState);
  });

  it('rollbackRestore sends POST to /api/restore/rollback', async () => {
    const sampleState: RestoreState = {
      state: 'idle',
      message: '已成功回退至恢复前数据库',
    };

    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleState));
    const result = await rollbackRestore(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(RESTORE_API.rollback(), { method: 'POST' });
    expect(result).toEqual(sampleState);
  });

  it('fetchRestoreState sends GET to /api/restore/state', async () => {
    const sampleState: RestoreState = {
      state: 'idle',
    };

    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleState));
    const result = await fetchRestoreState(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(RESTORE_API.state(), { method: 'GET' });
    expect(result).toEqual(sampleState);
  });

  it('throws BackupApiError with server message, status, requestId, and state on error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(409, {
        error: '备份的水位超前于当前代码（迁移谱系 core 领先 1 个版本），无法向下兼容恢复',
        requestId: 'req-sync-999',
        state: 'error',
        step: 'verify',
      }),
    );

    const promise = preflightRestore('future.db.gz', fetchFn);
    await expect(promise).rejects.toBeInstanceOf(BackupApiError);
    await expect(promise).rejects.toThrow(
      '备份的水位超前于当前代码（迁移谱系 core 领先 1 个版本），无法向下兼容恢复（请求编号 req-sync-999）',
    );
  });

  it('throws BackupApiError on contract schema mismatch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { wrong: 'format' }));

    const promise = fetchBackupConfig(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(BackupApiError);
    await expect(promise).rejects.toThrow('服务器响应形状不符合契约约定');
  });

  it('throws BackupApiError on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = fetchBackupList(fetchFn);
    await expect(promise).rejects.toBeInstanceOf(BackupApiError);
    await expect(promise).rejects.toThrow('网络连接失败，请检查服务是否正常运行');
  });
});
