import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESEARCH_API_V1 } from '../contract.js';
import {
  fetchAttachmentDeletionPreview,
  fetchManagedStorageStatus,
  fetchReaderManifest,
  fetchWorks,
  patchWorkMetadata,
  postCheckLocation,
  postPermanentDeleteAttachment,
  postManagedRootMigration,
  postCancelManagedRootMigration,
  postPrepareImport,
  postRestoreAttachment,
  postRetryManagedRootMigration,
  postUploadPdf,
  putWorkCollections,
  putReaderState,
} from './api.js';

type CapturedCall = { url: string; init: RequestInit | undefined };

const instant = '2026-08-23T10:20:30.000Z';
let calls: CapturedCall[];
let originalFetch: typeof globalThis.fetch;

function respondWith(payload: unknown, status = 200) {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof globalThis.fetch;
}

function parsedBody(call: CapturedCall): unknown {
  return JSON.parse(String(call.init?.body));
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('research ui api', () => {
  it('阅读器 manifest 与状态保存共用 Asset 路径和契约', async () => {
    const state = {
      assetId: 'asset-1',
      pageNumber: 1,
      pageOffsetRatio: 0,
      zoom: 1,
      rotation: 0,
      layout: 'continuous',
      lastContextId: null,
      revision: 0,
      createdAt: null,
      updatedAt: null,
    } as const;
    respondWith({
      assetId: 'asset-1',
      contentHash: 'a'.repeat(64),
      byteSize: 42,
      mimeType: 'application/pdf',
      displayName: 'paper.pdf',
      editionId: null,
      contentUrl: RESEARCH_API_V1.assetContent('asset-1'),
      state,
    });
    expect(await fetchReaderManifest('asset-1')).toMatchObject({ state: { revision: 0 } });
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.readerManifest('asset-1'));

    respondWith({ ...state, pageNumber: 4, revision: 1, createdAt: instant, updatedAt: instant });
    await putReaderState('asset-1', {
      pageNumber: 4,
      pageOffsetRatio: 0.5,
      zoom: 1.25,
      rotation: 90,
      layout: 'single-page',
      lastContextId: null,
      expectedRevision: 0,
    });
    expect(calls[1]?.url).toBe(RESEARCH_API_V1.readerState('asset-1'));
    expect(calls[1]?.init?.method).toBe('PUT');
  });
  it('按目录、状态和检索词读取文献列表并校验响应', async () => {
    respondWith({
      works: [
        {
          id: 'work-1',
          type: 'article',
          title: 'Research Workbench',
          year: 2026,
          status: 'active',
          preferredEditionId: 'edition-1',
          authors: ['Ada Lovelace'],
          attachmentCount: 1,
          collectionIds: ['collection-1'],
          storageModes: ['managed'],
          fileStatus: 'available',
          createdAt: instant,
          updatedAt: instant,
          trashedAt: null,
        },
      ],
      nextCursor: null,
    });

    const result = await fetchWorks({
      status: 'active',
      collectionId: 'collection-1',
      query: 'graph neural',
      limit: 50,
    });

    expect(calls[0]?.url).toBe(
      `${RESEARCH_API_V1.works}?status=active&collectionId=collection-1&query=graph+neural&limit=50`,
    );
    expect(calls[0]?.init?.method).toBeUndefined();
    expect(result.works[0]?.storageModes).toEqual(['managed']);
  });

  it('创建导入会话时发送保存方式、路径和幂等请求号', async () => {
    respondWith({
      id: 'session-1',
      status: 'draft',
      requestId: 'request-1',
      createdAt: instant,
      updatedAt: instant,
      items: [],
    });
    const input = {
      files: [{ path: '/Papers/paper.pdf', storageMode: 'linked' as const }],
      requestId: 'request-1',
    };

    await postPrepareImport(input);

    expect(calls[0]?.url).toBe(RESEARCH_API_V1.importSessions);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBe('application/json');
    expect(parsedBody(calls[0]!)).toEqual(input);
  });

  it('无请求体的文件检查不会发送 JSON content-type', async () => {
    respondWith({ ok: true });

    await postCheckLocation('location-1');

    expect(calls[0]?.url).toBe(RESEARCH_API_V1.locationCheck('location-1'));
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBeNull();
  });

  it('浏览器托管上传使用原始 PDF 请求体和文件名查询参数', async () => {
    respondWith({
      id: 'session-upload',
      status: 'draft',
      createdAt: instant,
      updatedAt: instant,
      items: [],
    });
    const file = new File([Buffer.from('%PDF-1.7\n%%EOF')], '论文 样本.pdf', {
      type: 'application/pdf',
    });

    await postUploadPdf(file, 'upload-request');

    expect(calls[0]?.url).toBe(
      `${RESEARCH_API_V1.importUpload}?fileName=%E8%AE%BA%E6%96%87+%E6%A0%B7%E6%9C%AC.pdf&requestId=upload-request`,
    );
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.body).toBe(file);
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBe('application/pdf');
  });

  it('更新多目录归属时使用 PUT 并拒绝不符合详情契约的响应', async () => {
    respondWith({ wrong: 'shape' });

    await expect(putWorkCollections('work-1', ['c-1', 'c-2'])).rejects.toThrow();
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.workCollections('work-1'));
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(parsedBody(calls[0]!)).toEqual({ collectionIds: ['c-1', 'c-2'] });
  });

  it('元数据编辑发送字段级修改和乐观版本号', async () => {
    respondWith({ wrong: 'shape' });
    const input = {
      expectedWorkRevision: 4,
      work: { title: 'Human corrected title' },
      edition: {
        id: 'edition-1',
        expectedRevision: 2,
        authors: ['Ada Lovelace'],
      },
    };

    await expect(patchWorkMetadata('work-1', input)).rejects.toThrow();
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.workMetadata('work-1'));
    expect(calls[0]?.init?.method).toBe('PATCH');
    expect(parsedBody(calls[0]!)).toEqual(input);
  });

  it('附件恢复与永久删除分开调用，并先读取删除影响', async () => {
    respondWith({
      attachmentId: 'attachment-1',
      assetId: 'asset-1',
      displayName: 'notes.txt',
      otherAttachmentCount: 0,
      managedObjectCount: 0,
      linkedLocationCount: 1,
      confirmationToken: 'confirmation-1',
    });
    const preview = await fetchAttachmentDeletionPreview('attachment-1');
    expect(preview.linkedLocationCount).toBe(1);
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.attachmentDeletionPreview('attachment-1'));

    respondWith({ deleted: true, linkedSourcesDeleted: false });
    await postPermanentDeleteAttachment('attachment-1', preview.confirmationToken);
    expect(calls[1]?.url).toBe(RESEARCH_API_V1.attachmentPermanentDelete('attachment-1'));
    expect(parsedBody(calls[1]!)).toEqual({ confirmationToken: 'confirmation-1' });

    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof globalThis.fetch;
    await postRestoreAttachment('attachment-1');
    expect(calls[2]).toMatchObject({
      url: RESEARCH_API_V1.attachmentRestore('attachment-1'),
      init: { method: 'POST' },
    });
  });

  it('托管根迁移使用可轮询、可取消和可重试的持久化任务', async () => {
    const job = {
      id: 'root-migration-1',
      status: 'running',
      sourceRoot: '/old/managed',
      targetRoot: '/new/managed',
      totalObjects: 3,
      copiedObjects: 1,
      totalBytes: 300,
      copiedBytes: 100,
      errorCode: null,
      createdAt: instant,
      updatedAt: instant,
      completedAt: null,
    } as const;
    respondWith(job);
    expect(await postManagedRootMigration('/new/managed')).toMatchObject({
      id: job.id,
      status: 'running',
    });
    expect(calls[0]).toMatchObject({
      url: RESEARCH_API_V1.managedRootMigrations,
      init: { method: 'POST' },
    });
    expect(parsedBody(calls[0]!)).toEqual({ targetRoot: '/new/managed' });

    respondWith({ activeRoot: '/old/managed', latestMigration: job });
    expect(await fetchManagedStorageStatus()).toMatchObject({
      activeRoot: '/old/managed',
      latestMigration: { id: job.id },
    });

    respondWith({ ...job, status: 'cancelled', errorCode: 'ROOT_MIGRATION_CANCELLED' });
    await postCancelManagedRootMigration(job.id);
    expect(calls[2]?.url).toBe(RESEARCH_API_V1.managedRootMigrationCancel(job.id));

    respondWith(job);
    await postRetryManagedRootMigration(job.id);
    expect(calls[3]?.url).toBe(RESEARCH_API_V1.managedRootMigrationRetry(job.id));
  });
});
