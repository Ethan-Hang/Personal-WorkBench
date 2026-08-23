import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESEARCH_API_V1 } from '../contract.js';
import {
  fetchWorks,
  postCheckLocation,
  postPrepareImport,
  postUploadPdf,
  putWorkCollections,
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
});
