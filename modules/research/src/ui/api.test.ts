import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESEARCH_API_V1 } from '../contract.js';
import {
  fetchAttachmentDeletionPreview,
  fetchManagedStorageStatus,
  fetchOcrJob,
  fetchPageTextSearch,
  fetchTextIndexJob,
  fetchAnnotations,
  fetchAnnotation,
  fetchAnnotatedExport,
  fetchKnowledgeEvidence,
  fetchKnowledgeNotes,
  fetchKnowledgeSearch,
  fetchNoteLinks,
  fetchReadingContexts,
  fetchReaderManifest,
  fetchWorks,
  fetchWritingDocument,
  fetchWritingDocuments,
  patchWritingBlock,
  patchWorkMetadata,
  patchAnnotation,
  postCheckLocation,
  postAnnotation,
  postAnnotatedExport,
  postAnnotatedExportPreview,
  postCancelAnnotatedExport,
  postReadingContext,
  postKnowledgeEvidence,
  postKnowledgeNote,
  postNoteLink,
  postRebuildKnowledgeSearch,
  postOpenAnnotatedExportLocation,
  postPickAnnotatedExportTarget,
  postPermanentDeleteAttachment,
  postManagedRootMigration,
  postCancelManagedRootMigration,
  postPrepareImport,
  postStartOcr,
  postStartTextIndex,
  postRestoreAttachment,
  postRestoreAnnotation,
  postRetryAnnotatedExport,
  postRetryManagedRootMigration,
  postUploadPdf,
  postWritingDocument,
  putWritingStructure,
  putWorkCollections,
  putReaderState,
  deleteResearchAnnotation,
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
  it('正文索引客户端保留任务控制、进度和页级搜索参数', async () => {
    respondWith({ job: null });
    await expect(fetchTextIndexJob('asset-1')).resolves.toBeNull();
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.assetTextIndex('asset-1'));

    const job = {
      assetId: 'asset-1',
      status: 'queued',
      nextPage: 1,
      totalPages: 0,
      indexedPages: 0,
      textCharacters: 0,
      assetHash: 'a'.repeat(64),
      parserVersion: 'pdfjs-test',
      errorCode: null,
      createdAt: instant,
      updatedAt: instant,
      completedAt: null,
    };
    respondWith(job);
    await postStartTextIndex('asset-1', 7);
    expect(calls[1]).toMatchObject({
      url: RESEARCH_API_V1.assetTextIndexStart('asset-1'),
      init: { method: 'POST' },
    });
    expect(parsedBody(calls[1]!)).toEqual({ priorityPage: 7 });

    respondWith({
      results: [
        {
          assetId: 'asset-1',
          displayName: 'paper.pdf',
          pageNumber: 7,
          source: 'pdf',
          snippet: 'search result',
          matchStart: 0,
          matchEnd: 6,
          pageSize: null,
          position: null,
        },
      ],
    });
    await expect(fetchPageTextSearch('search', { assetId: 'asset-1' })).resolves.toHaveLength(1);
    expect(calls[2]?.url).toContain('query=search&assetId=asset-1');
  });

  it('OCR 客户端明确提交语言和用户确认', async () => {
    respondWith({ job: null });
    await expect(fetchOcrJob('asset-1')).resolves.toBeNull();
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.assetOcr('asset-1'));

    respondWith({
      id: 'ocr-1',
      assetId: 'asset-1',
      assetHash: 'a'.repeat(64),
      status: 'queued',
      languages: ['chi_sim', 'eng'],
      engine: 'tesseract.js',
      engineVersion: '7.0.0',
      languagePackVersion: 'packs-v1',
      nextPage: 1,
      totalPages: 0,
      processedPages: 0,
      errorCode: null,
      createdAt: instant,
      updatedAt: instant,
      completedAt: null,
    });
    await postStartOcr('asset-1', ['eng', 'chi_sim']);
    expect(calls[1]).toMatchObject({
      url: RESEARCH_API_V1.assetOcrStart('asset-1'),
      init: { method: 'POST' },
    });
    expect(parsedBody(calls[1]!)).toEqual({ languages: ['eng', 'chi_sim'], confirmed: true });
  });

  it('批注和上下文客户端保留图层、锚点与 revision 请求', async () => {
    const context = {
      id: 'context-1',
      name: 'Review',
      description: null,
      color: null,
      status: 'active',
      createdAt: instant,
      updatedAt: instant,
      archivedAt: null,
    };
    respondWith({
      general: { kind: 'general', id: 'general', name: '通用批注' },
      contexts: [context],
    });
    expect((await fetchReadingContexts()).contexts[0]?.id).toBe('context-1');

    respondWith(context);
    await postReadingContext({ name: 'Review', description: null, color: null });
    expect(calls[1]).toMatchObject({
      url: RESEARCH_API_V1.readingContexts,
      init: { method: 'POST' },
    });

    const annotation = {
      id: 'annotation-1',
      assetId: 'asset-1',
      editionId: null,
      contextId: 'context-1',
      kind: 'highlight',
      pageNumber: 1,
      anchor: {
        pageNumber: 1,
        pageSize: { width: 612, height: 792 },
        rect: null,
        quads: [{ x1: 1, y1: 2, x2: 3, y2: 2, x3: 1, y3: 1, x4: 3, y4: 1 }],
        textQuote: null,
        assetHash: 'a'.repeat(64),
        editionId: null,
      },
      body: null,
      color: '#facc15',
      status: 'active',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
    };
    respondWith(annotation);
    await postAnnotation('asset-1', {
      contextId: 'context-1',
      kind: 'highlight',
      anchor: annotation.anchor,
      body: null,
      color: '#facc15',
    });
    expect(calls[2]).toMatchObject({
      url: RESEARCH_API_V1.assetAnnotations('asset-1'),
      init: { method: 'POST' },
    });

    respondWith([annotation]);
    await fetchAnnotations('asset-1', {
      contextIds: ['context-1'],
      includeGeneral: true,
    });
    expect(calls[3]?.url).toContain('contextIds=context-1');

    respondWith({ ...annotation, body: 'updated', revision: 2 });
    await patchAnnotation(annotation.id, { body: 'updated', expectedRevision: 1 });
    expect(parsedBody(calls[4]!)).toEqual({ body: 'updated', expectedRevision: 1 });

    respondWith({ ...annotation, status: 'deleted', revision: 3, deletedAt: instant });
    await deleteResearchAnnotation(annotation.id, 2);
    expect(calls[5]?.init?.method).toBe('DELETE');
    expect(parsedBody(calls[5]!)).toEqual({ expectedRevision: 2 });

    respondWith({ ...annotation, revision: 4 });
    await postRestoreAnnotation(annotation.id, 3);
    expect(calls[6]?.url).toBe(RESEARCH_API_V1.annotationRestore(annotation.id));

    respondWith(annotation);
    await expect(fetchAnnotation(annotation.id)).resolves.toMatchObject({ id: annotation.id });
    expect(calls[7]?.url).toBe(RESEARCH_API_V1.annotation(annotation.id));
  });

  it('研究知识客户端保留上下文筛选和两种证据创建模式', async () => {
    const note = {
      id: 'note-1',
      contextId: null,
      title: 'Research note',
      body: '',
      status: 'active',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
    } as const;
    respondWith({ notes: [note], nextCursor: null });
    await expect(
      fetchKnowledgeNotes({ contextId: null, status: 'active', limit: 20 }),
    ).resolves.toMatchObject({ notes: [{ id: 'note-1' }] });
    expect(calls[0]?.url).toBe(`${RESEARCH_API_V1.notes}?contextId=general&status=active&limit=20`);

    respondWith(note);
    await postKnowledgeNote({ contextId: null, title: note.title, body: '' });
    expect(calls[1]).toMatchObject({ url: RESEARCH_API_V1.notes, init: { method: 'POST' } });

    respondWith([]);
    await expect(fetchNoteLinks(note.id)).resolves.toEqual([]);
    expect(calls[2]?.url).toBe(`${RESEARCH_API_V1.noteLinks(note.id)}?includeDeleted=false`);

    const anchor = {
      pageNumber: 2,
      pageSize: { width: 612, height: 792 },
      rect: null,
      quads: [{ x1: 1, y1: 2, x2: 3, y2: 2, x3: 1, y3: 1, x4: 3, y4: 1 }],
      textQuote: {
        exact: 'source text',
        prefix: '',
        suffix: '',
        fingerprint: 'b'.repeat(64),
      },
      assetHash: 'a'.repeat(64),
      editionId: 'edition-1',
    };
    const evidence = {
      id: 'evidence-1',
      contextId: null,
      workId: 'work-1',
      editionId: 'edition-1',
      assetId: 'asset-1',
      annotationId: 'annotation-1',
      sourceSnapshot: {
        workId: 'work-1',
        editionId: 'edition-1',
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        contextId: null,
        pageNumber: 2,
        anchor,
        sourceKind: 'pdf',
        annotationRevision: 1,
        assetHash: 'a'.repeat(64),
        workTitle: 'Paper',
        editionTitle: null,
        ocr: null,
        extractedAt: instant,
      },
      sourceState: 'current',
      title: null,
      summary: 'source text',
      notes: null,
      status: 'active',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
    } as const;
    const link = {
      id: 'link-1',
      noteId: note.id,
      target: { kind: 'evidence', evidenceId: evidence.id },
      status: 'active',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
    } as const;
    respondWith(link);
    await postNoteLink(note.id, { target: link.target });
    expect(calls[3]).toMatchObject({
      url: RESEARCH_API_V1.noteLinks(note.id),
      init: { method: 'POST' },
    });

    respondWith({ evidence: [evidence], nextCursor: null });
    await fetchKnowledgeEvidence({ contextId: null, sourceState: 'current' });
    expect(calls[4]?.url).toBe(`${RESEARCH_API_V1.evidence}?contextId=general&sourceState=current`);

    respondWith({
      ...evidence,
      sourceLink: {
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        contextId: null,
        pageNumber: 2,
        anchor,
        sourceState: 'current',
        readerUrl: '/research/read/asset-1?page=2&context=general&annotation=annotation-1',
      },
    });
    await postKnowledgeEvidence({
      mode: 'annotation',
      contextId: null,
      annotationId: 'annotation-1',
      sourceKind: 'pdf',
      title: null,
      summary: 'source text',
      notes: null,
    });
    expect(calls[5]).toMatchObject({
      url: RESEARCH_API_V1.evidence,
      init: { method: 'POST' },
    });
    expect(parsedBody(calls[5]!)).toMatchObject({
      mode: 'annotation',
      annotationId: 'annotation-1',
    });

    respondWith({
      ...evidence,
      sourceLink: {
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        contextId: null,
        pageNumber: 2,
        anchor,
        sourceState: 'current',
        readerUrl: '/research/read/asset-1?page=2&context=general&annotation=annotation-1',
      },
    });
    await postKnowledgeEvidence({
      mode: 'direct',
      contextId: null,
      assetId: 'asset-1',
      editionId: 'edition-1',
      kind: 'highlight',
      anchor,
      body: null,
      color: '#facc15',
      sourceKind: 'pdf',
      title: null,
      summary: 'source text',
      notes: null,
    });
    expect(parsedBody(calls[6]!)).toMatchObject({ mode: 'direct', assetId: 'asset-1' });
  });

  it('写作板客户端保留结构与文本的独立 revision', async () => {
    const document = {
      id: 'document-1',
      contextId: null,
      title: 'Research draft',
      status: 'active',
      structureRevision: 2,
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      archivedAt: null,
      deletedAt: null,
      sections: [
        {
          id: 'section-1',
          documentId: 'document-1',
          title: 'Introduction',
          position: 0,
          status: 'active',
          revision: 1,
          createdAt: instant,
          updatedAt: instant,
          deletedAt: null,
          blocks: [
            {
              id: 'block-1',
              documentId: 'document-1',
              sectionId: 'section-1',
              kind: 'text',
              text: 'Draft paragraph.',
              targetId: null,
              targetLabel: null,
              targetState: null,
              targetUrl: null,
              sourceState: null,
              position: 0,
              status: 'active',
              revision: 1,
              createdAt: instant,
              updatedAt: instant,
              deletedAt: null,
            },
          ],
        },
      ],
    } as const;

    respondWith({ documents: [document], nextCursor: null });
    await fetchWritingDocuments({ contextId: null, status: 'active', limit: 20 });
    expect(calls[0]?.url).toBe(
      `${RESEARCH_API_V1.writingDocuments}?contextId=general&status=active&limit=20`,
    );

    respondWith(document);
    await fetchWritingDocument(document.id, true);
    expect(calls[1]?.url).toBe(
      `${RESEARCH_API_V1.writingDocument(document.id)}?includeDeletedStructure=true`,
    );

    respondWith({ ...document, sections: [], structureRevision: 1 });
    await postWritingDocument({ contextId: null, title: document.title });
    expect(calls[2]).toMatchObject({
      url: RESEARCH_API_V1.writingDocuments,
      init: { method: 'POST' },
    });

    respondWith(document);
    await putWritingStructure(document.id, {
      expectedStructureRevision: 1,
      sections: [
        {
          title: 'Introduction',
          position: 0,
          blocks: [{ kind: 'text', text: 'Draft paragraph.', position: 0 }],
        },
      ],
    });
    expect(parsedBody(calls[3]!)).toMatchObject({ expectedStructureRevision: 1 });

    respondWith({ ...document.sections[0]!.blocks[0], text: 'Revised.', revision: 2 });
    await patchWritingBlock('block-1', { text: 'Revised.', expectedRevision: 1 });
    expect(calls[4]?.url).toBe(RESEARCH_API_V1.writingBlock('block-1'));
    expect(parsedBody(calls[4]!)).toEqual({ text: 'Revised.', expectedRevision: 1 });
  });

  it('统一检索客户端编码多值筛选并显式调用重建', async () => {
    respondWith({
      results: [
        {
          entityType: 'evidence',
          entityId: 'evidence-1',
          contextId: null,
          workId: 'work-1',
          title: 'Search result',
          excerpt: 'Matched body',
          matchedFields: ['body'],
          status: 'active',
          sourceState: 'current',
          targetUrl: '/research/read/asset-1?page=1&context=general&annotation=annotation-1',
          updatedAt: instant,
        },
      ],
      nextCursor: null,
      maxResults: 500,
    });
    await fetchKnowledgeSearch({
      query: 'matched',
      contextId: null,
      workId: 'work-1',
      entityTypes: ['evidence', 'claim'],
      statuses: ['active', 'archived'],
      sourceStates: ['current', 'source-unavailable'],
      cursor: null,
      limit: 20,
    });
    expect(calls[0]?.url).toBe(
      `${RESEARCH_API_V1.knowledgeSearch}?contextId=general&limit=20&query=matched&workId=work-1&entityTypes=evidence%2Cclaim&statuses=active%2Carchived&sourceStates=current%2Csource-unavailable`,
    );

    respondWith({ notes: 1, evidence: 2, claims: 3, writingDocuments: 4, total: 10 });
    await postRebuildKnowledgeSearch();
    expect(calls[1]).toMatchObject({
      url: RESEARCH_API_V1.knowledgeSearchRebuild,
      init: { method: 'POST' },
    });
  });

  it('带批注副本客户端完整保留选择、预览、任务控制与位置操作', async () => {
    const options = {
      includeGeneral: true,
      contextIds: ['context-1'],
      targetPath: '/exports/paper.pdf',
      overwriteConfirmed: false,
    };
    respondWith({ path: options.targetPath, cancelled: false });
    await postPickAnnotatedExportTarget('asset-1', { suggestedName: 'paper.pdf' });
    expect(calls[0]?.url).toBe(RESEARCH_API_V1.assetAnnotatedExportPickTarget('asset-1'));

    respondWith({
      assetId: 'asset-1',
      sourceHash: 'a'.repeat(64),
      sourceBytes: 42,
      estimatedOutputBytes: 84,
      pageCount: 1,
      annotationCount: 0,
      standardCount: 0,
      flattenedCount: 0,
      skippedCount: 0,
      targetPath: options.targetPath,
      targetExists: false,
      decisions: [],
      warnings: ['输出是新的完整重写副本'],
    });
    await postAnnotatedExportPreview('asset-1', options);
    expect(parsedBody(calls[1]!)).toMatchObject({
      includeGeneral: true,
      contextIds: ['context-1'],
    });

    const job = {
      id: 'export-1',
      assetId: 'asset-1',
      status: 'queued',
      options,
      targetPath: options.targetPath,
      completedAnnotations: 0,
      totalAnnotations: 0,
      report: null,
      errorCode: null,
      createdAt: instant,
      updatedAt: instant,
      completedAt: null,
    };
    respondWith(job);
    await postAnnotatedExport('asset-1', options);
    expect(calls[2]?.url).toBe(RESEARCH_API_V1.assetAnnotatedExports('asset-1'));

    respondWith(job);
    await fetchAnnotatedExport(job.id);
    respondWith({ ...job, status: 'cancelled', errorCode: 'EXPORT_CANCELLED' });
    await postCancelAnnotatedExport(job.id);
    respondWith({ ...job, options: { ...options, overwriteConfirmed: true } });
    await postRetryAnnotatedExport(job.id, { overwriteConfirmed: true });
    expect(parsedBody(calls[5]!)).toEqual({ overwriteConfirmed: true });
    respondWith({ opened: true });
    await expect(postOpenAnnotatedExportLocation(job.id)).resolves.toEqual({ opened: true });
    expect(calls[6]?.url).toBe(RESEARCH_API_V1.annotatedExportOpenLocation(job.id));
  });

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
