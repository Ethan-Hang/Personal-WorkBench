import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_IMPORT_API,
  type LocalImportAsNewAccountResponse,
  type LocalImportPreflightResponse,
  type RestoreState,
} from '@workbench/sync/contract';
import {
  LocalImportApiError,
  confirmLocalImport,
  importAsNewAccount,
  pickLocalFile,
  preflightLocalImport,
  uploadLocalBackupFile,
} from './localImportApi.js';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body !== undefined ? JSON.stringify(body) : ''),
  } as unknown as Response;
}

describe('localImportApi', () => {
  const samplePreflightResponse: LocalImportPreflightResponse = {
    name: 'D:/backups/2026-08-20.db.gz',
    compatible: true,
    meta: {
      v: 1,
      createdAt: '2026-08-20T12:00:00.000Z',
      accountId: 'local-default',
      device: 'win-laptop',
      appVersion: '0.1.0',
      migrations: { core: 1, todo: 1, 'campus-recruit': 1 },
      counts: { items: 25 },
      bytes: 102400,
      sha256: 'sha256-sample',
      reason: '手动导出快照',
    },
    diff: {
      core: {
        added: [{ id: 'item-1', title: '新增待办' }],
        removed: [{ id: 'item-2', title: '本地独有' }],
        modified: [{ id: 'item-3', title: '修改待办', localTitle: '旧标题' }],
      },
      modules: [
        {
          table: 'campus_recruit_applications',
          moduleId: 'campus-recruit',
          moduleName: '秋招投递表',
          localCount: 5,
          remoteCount: 8,
        },
      ],
    },
  };

  const sampleNullMetaPreflightResponse: LocalImportPreflightResponse = {
    name: 'D:/backups/raw_without_meta.db.gz',
    compatible: true,
    meta: null,
    diff: {
      core: {
        added: [],
        removed: [],
        modified: [],
      },
      modules: [],
    },
  };

  const sampleIncompatiblePreflightResponse: LocalImportPreflightResponse = {
    name: 'D:/backups/future_version.db.gz',
    compatible: false,
    reason: '备份迁移水位超前于当前客户端代码，请升级应用后重试',
    meta: {
      v: 1,
      createdAt: '2026-08-25T12:00:00.000Z',
      accountId: 'local-default',
      device: 'future-device',
      appVersion: '0.9.0',
      migrations: { core: 5, todo: 3 },
      counts: { items: 50 },
      bytes: 204800,
      sha256: 'future-sha256',
    },
    diff: {
      core: {
        added: [],
        removed: [],
        modified: [],
      },
      modules: [],
    },
  };

  const sampleRestoreState: RestoreState = {
    state: 'restoring',
    step: 'verify',
    message: '正在校验快照并准备热替换',
    canRollback: true,
    generation: 2,
  };

  const sampleAsNewAccountResponse: LocalImportAsNewAccountResponse = {
    id: 'account_new_imported_123',
    displayName: '导入的工作区',
  };

  it('preflightLocalImport sends POST to /api/local-import/preflight with filePath and parses response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, samplePreflightResponse));
    const result = await preflightLocalImport('D:/backups/2026-08-20.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_IMPORT_API.preflight(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'D:/backups/2026-08-20.db.gz' }),
    });
    expect(result).toEqual(samplePreflightResponse);
  });

  it('preflightLocalImport correctly handles meta being null when .meta.json is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleNullMetaPreflightResponse));
    const result = await preflightLocalImport('D:/backups/raw_without_meta.db.gz', fetchFn);

    expect(result.meta).toBeNull();
    expect(result.compatible).toBe(true);
  });

  it('preflightLocalImport correctly receives compatible=false and reason for future backups', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mockResponse(200, sampleIncompatiblePreflightResponse));
    const result = await preflightLocalImport('D:/backups/future_version.db.gz', fetchFn);

    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('请升级应用后重试');
  });

  it('confirmLocalImport sends POST to /api/local-import/confirm with filePath and parses RestoreState', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleRestoreState));
    const result = await confirmLocalImport('D:/backups/2026-08-20.db.gz', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_IMPORT_API.confirm(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath: 'D:/backups/2026-08-20.db.gz' }),
    });
    expect(result).toEqual(sampleRestoreState);
  });

  it('importAsNewAccount sends POST to /api/local-import/as-new-account with filePath and displayName', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, sampleAsNewAccountResponse));
    const result = await importAsNewAccount('D:/backups/2026-08-20.db.gz', '导入的工作区', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_IMPORT_API.asNewAccount(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filePath: 'D:/backups/2026-08-20.db.gz',
        displayName: '导入的工作区',
      }),
    });
    expect(result).toEqual(sampleAsNewAccountResponse);
  });

  it('throws LocalImportApiError with server message, status, and requestId on 409 conflict', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(409, {
        error: '必须先对该文件完成预检才能确认导入',
        requestId: 'req-import-409',
      }),
    );

    const promise = confirmLocalImport('D:/backups/changed.db.gz', fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalImportApiError);
    await expect(promise).rejects.toThrow(
      '必须先对该文件完成预检才能确认导入（请求编号 req-import-409）',
    );
  });

  it('throws LocalImportApiError on schema mismatch', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { unexpected: true }));

    const promise = preflightLocalImport('D:/backups/test.db.gz', fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalImportApiError);
    await expect(promise).rejects.toThrow('服务器响应形状不符合契约约定');
  });

  it('throws LocalImportApiError on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const promise = importAsNewAccount('D:/test.db.gz', '新账号', fetchFn);
    await expect(promise).rejects.toBeInstanceOf(LocalImportApiError);
    await expect(promise).rejects.toThrow('网络连接失败，请检查服务是否正常运行');
  });

  it('pickLocalFile sends POST to /api/local-import/pick-file with initialDir', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        mockResponse(200, { filePath: 'D:/backups/selected.db.gz', cancelled: false }),
      );
    const result = await pickLocalFile('D:/backups', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(LOCAL_IMPORT_API.pickFile(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initialDir: 'D:/backups' }),
    });
    expect(result).toEqual({ filePath: 'D:/backups/selected.db.gz', cancelled: false });
  });

  it('uploadLocalBackupFile sends binary POST to /api/local-import/upload', async () => {
    const mockFile = {
      name: 'backup.db.gz',
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as unknown as File;

    const fetchFn = vi.fn().mockResolvedValue(
      mockResponse(200, {
        filePath: 'C:/temp/uploaded.db.gz',
        fileName: 'backup.db.gz',
        bytes: 3,
      }),
    );
    const result = await uploadLocalBackupFile(mockFile, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(
      LOCAL_IMPORT_API.upload(),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-file-name': encodeURIComponent('backup.db.gz'),
        },
      }),
    );
    expect(result).toEqual({
      filePath: 'C:/temp/uploaded.db.gz',
      fileName: 'backup.db.gz',
      bytes: 3,
    });
  });
});
