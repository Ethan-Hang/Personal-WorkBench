import { describe, expect, it } from 'vitest';
import {
  RESEARCH_API_V1,
  annotatedExportJobSchema,
  annotatedExportPreviewInputSchema,
  annotationAnchorSchema,
  assetLocationViewSchema,
  createAnnotationInputSchema,
  createEvidenceInputSchema,
  createNoteInputSchema,
  evidenceSchema,
  evidenceSourceSnapshotSchema,
  importItemViewSchema,
  interopImportJobViewSchema,
  interopImportRecordsPageSchema,
  interopExportPreviewSchema,
  renderCitationInputSchema,
  interopRecordDecisionSchema,
  interopRecordViewSchema,
  metadataAssertionViewSchema,
  ocrJobSchema,
  pageTextSearchResponseSchema,
  readerManifestSchema,
  researchNoteSchema,
  readingContextCatalogSchema,
  saveReaderStateInputSchema,
  startOcrInputSchema,
  textIndexJobSchema,
  workDetailViewSchema,
  workViewSchema,
  writingBlockSchema,
} from './contract.js';

const instant = '2026-08-23T10:20:30.000Z';

describe('research contract', () => {
  it('所有端点共用带版本的模块前缀', () => {
    expect(RESEARCH_API_V1.works).toBe('/api/research/v1/works');
    expect(RESEARCH_API_V1.work('work-1')).toBe('/api/research/v1/works/work-1');
    expect(RESEARCH_API_V1.importConfirm('session-1')).toBe(
      '/api/research/v1/import-sessions/session-1/confirm',
    );
    expect(RESEARCH_API_V1.readerManifest('asset-1')).toBe(
      '/api/research/v1/assets/asset-1/reader',
    );
    expect(RESEARCH_API_V1.assetContent('asset-1')).toBe('/api/research/v1/assets/asset-1/content');
    expect(RESEARCH_API_V1.annotation('annotation-1')).toBe(
      '/api/research/v1/annotations/annotation-1',
    );
    expect(RESEARCH_API_V1.assetTextIndexStart('asset-1')).toBe(
      '/api/research/v1/assets/asset-1/text-index/start',
    );
    expect(RESEARCH_API_V1.assetOcrStart('asset-1')).toBe(
      '/api/research/v1/assets/asset-1/ocr/start',
    );
    expect(RESEARCH_API_V1.assetAnnotatedExports('asset-1')).toBe(
      '/api/research/v1/assets/asset-1/annotated-exports',
    );
    expect(RESEARCH_API_V1.annotatedExportJob('export-1')).toBe(
      '/api/research/v1/annotated-exports/export-1',
    );
    expect(RESEARCH_API_V1.knowledgeSummary).toBe('/api/research/v1/knowledge/summary');
    expect(RESEARCH_API_V1.note('note-1')).toBe('/api/research/v1/notes/note-1');
    expect(RESEARCH_API_V1.evidenceRebind('evidence-1')).toBe(
      '/api/research/v1/evidence/evidence-1/rebind',
    );
    expect(RESEARCH_API_V1.interopImportRecordDecision('job-1', 'record-2')).toBe(
      '/api/research/v1/interop/imports/job-1/records/record-2/decision',
    );
    expect(RESEARCH_API_V1.interopExportPreview).toBe('/api/research/v1/interop/exports/preview');
    expect(RESEARCH_API_V1.interopCitationRender).toBe('/api/research/v1/interop/citations/render');
  });

  it('知识对象保留通用上下文和不可变来源快照', () => {
    const sourceSnapshot = evidenceSourceSnapshotSchema.parse({
      workId: 'work-1',
      editionId: 'edition-1',
      assetId: 'asset-1',
      annotationId: 'annotation-1',
      contextId: null,
      pageNumber: 4,
      anchor: {
        pageNumber: 4,
        pageSize: { width: 612, height: 792 },
        rect: { x: 10, y: 20, width: 30, height: 12 },
        quads: [],
        textQuote: {
          exact: 'evidence text',
          prefix: 'before',
          suffix: 'after',
          fingerprint: 'b'.repeat(64),
        },
        assetHash: 'a'.repeat(64),
        editionId: 'edition-1',
      },
      sourceKind: 'pdf',
      annotationRevision: 1,
      assetHash: 'a'.repeat(64),
      workTitle: 'Research Workbench',
      editionTitle: 'Journal edition',
      ocr: null,
      extractedAt: instant,
    });

    expect(createNoteInputSchema.parse({ title: 'Methods' })).toEqual({
      contextId: null,
      title: 'Methods',
      body: '',
    });
    expect(
      createEvidenceInputSchema.parse({ annotationId: 'annotation-1', sourceKind: 'pdf' }),
    ).toMatchObject({ contextId: null, title: null, summary: '', notes: null });
    expect(
      researchNoteSchema.parse({
        id: 'note-1',
        contextId: null,
        title: 'Methods',
        body: '',
        status: 'active',
        revision: 1,
        createdAt: instant,
        updatedAt: instant,
        deletedAt: null,
      }),
    ).toMatchObject({ contextId: null, revision: 1 });
    expect(
      evidenceSchema.parse({
        id: 'evidence-1',
        contextId: null,
        workId: 'work-1',
        editionId: 'edition-1',
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        sourceSnapshot,
        sourceState: 'current',
        title: null,
        summary: '',
        notes: null,
        status: 'active',
        revision: 1,
        createdAt: instant,
        updatedAt: instant,
        deletedAt: null,
      }),
    ).toMatchObject({ sourceSnapshot: { contextId: null, annotationRevision: 1 } });
  });

  it('批注契约显式区分通用层并保留跨版本锚点', () => {
    expect(
      readingContextCatalogSchema.parse({
        general: { kind: 'general', id: 'general', name: '通用批注' },
        contexts: [],
      }),
    ).toMatchObject({ general: { id: 'general' } });
    const anchor = annotationAnchorSchema.parse({
      pageNumber: 4,
      pageSize: { width: 612, height: 792 },
      rect: null,
      quads: [{ x1: 1, y1: 2, x2: 3, y2: 2, x3: 1, y3: 1, x4: 3, y4: 1 }],
      textQuote: {
        exact: 'quoted text',
        prefix: 'before',
        suffix: 'after',
        fingerprint: 'b'.repeat(64),
      },
      assetHash: 'a'.repeat(64),
      editionId: 'edition-1',
    });
    expect(
      createAnnotationInputSchema.parse({
        contextId: null,
        kind: 'highlight',
        anchor,
      }),
    ).toMatchObject({
      contextId: null,
      anchor: {
        pageNumber: 4,
        assetHash: 'a'.repeat(64),
        editionId: 'edition-1',
        textQuote: { fingerprint: 'b'.repeat(64) },
      },
    });
  });

  it('阅读器 manifest 不暴露本地路径并携带可恢复状态', () => {
    const manifest = readerManifestSchema.parse({
      assetId: 'asset-1',
      contentHash: 'a'.repeat(64),
      byteSize: 42,
      mimeType: 'application/pdf',
      displayName: 'paper.pdf',
      editionId: 'edition-1',
      contentUrl: RESEARCH_API_V1.assetContent('asset-1'),
      state: {
        assetId: 'asset-1',
        pageNumber: 7,
        pageOffsetRatio: 0.25,
        zoom: 1.5,
        rotation: 90,
        layout: 'continuous',
        lastContextId: null,
        revision: 3,
        createdAt: instant,
        updatedAt: instant,
      },
    });

    expect(manifest).toMatchObject({
      assetId: 'asset-1',
      contentUrl: '/api/research/v1/assets/asset-1/content',
      state: { pageNumber: 7, rotation: 90, lastContextId: null },
    });
    expect(JSON.stringify(manifest)).not.toContain('/Users/');
  });

  it('页级索引显式区分 OCR 建议并返回可定位搜索结果', () => {
    expect(
      textIndexJobSchema.parse({
        assetId: 'asset-1',
        status: 'ocr-recommended',
        nextPage: 11,
        totalPages: 10,
        indexedPages: 10,
        textCharacters: 0,
        assetHash: 'a'.repeat(64),
        parserVersion: 'pdfjs-test',
        errorCode: 'OCR_RECOMMENDED',
        createdAt: instant,
        updatedAt: instant,
        completedAt: null,
      }),
    ).toMatchObject({ status: 'ocr-recommended', textCharacters: 0 });
    expect(
      pageTextSearchResponseSchema.parse({
        results: [
          {
            assetId: 'asset-1',
            displayName: 'paper.pdf',
            pageNumber: 3,
            source: 'pdf',
            snippet: 'matched page text',
            matchStart: 0,
            matchEnd: 7,
            pageSize: { width: 612, height: 792 },
            position: { x: 72, y: 700, width: 50, height: 12 },
          },
        ],
      }).results[0],
    ).toMatchObject({ pageNumber: 3, position: { x: 72, y: 700 } });
  });

  it('OCR 必须由用户确认语言后启动，并返回可恢复进度', () => {
    expect(
      startOcrInputSchema.parse({ languages: ['eng', 'chi_sim', 'eng'], confirmed: true }),
    ).toEqual({ languages: ['chi_sim', 'eng'], confirmed: true });
    expect(() => startOcrInputSchema.parse({ languages: ['eng'], confirmed: false })).toThrow();
    expect(
      ocrJobSchema.parse({
        id: 'ocr-1',
        assetId: 'asset-1',
        assetHash: 'c'.repeat(64),
        status: 'interrupted',
        languages: ['chi_sim', 'eng'],
        engine: 'tesseract.js',
        engineVersion: '7.0.0',
        languagePackVersion: '4.0.0_best_int/npm-1.0.0',
        nextPage: 3,
        totalPages: 8,
        processedPages: 2,
        errorCode: 'PROCESS_RESTARTED',
        createdAt: instant,
        updatedAt: instant,
        completedAt: null,
      }),
    ).toMatchObject({ status: 'interrupted', processedPages: 2 });
  });

  it('带批注副本固定可见层范围，并在报告中逐项记录处理方式', () => {
    expect(
      annotatedExportPreviewInputSchema.parse({
        includeGeneral: true,
        contextIds: ['context-b', 'context-a', 'context-b'],
      }),
    ).toEqual({ includeGeneral: true, contextIds: ['context-a', 'context-b'] });
    const job = annotatedExportJobSchema.parse({
      id: 'export-1',
      assetId: 'asset-1',
      status: 'completed',
      options: {
        includeGeneral: true,
        contextIds: ['context-a'],
        targetPath: '/exports/paper-annotated.pdf',
        overwriteConfirmed: false,
      },
      targetPath: '/exports/paper-annotated.pdf',
      completedAnnotations: 1,
      totalAnnotations: 1,
      report: {
        schemaVersion: 1,
        assetId: 'asset-1',
        sourceHash: 'a'.repeat(64),
        outputHash: 'b'.repeat(64),
        sourceBytes: 42,
        outputBytes: 84,
        pageCount: 2,
        targetPath: '/exports/paper-annotated.pdf',
        standardCount: 1,
        flattenedCount: 0,
        skippedCount: 0,
        sourceHashUnchanged: true,
        outputReadable: true,
        fullRewrite: true,
        decisions: [
          {
            annotationId: 'annotation-1',
            revision: 2,
            contextId: 'context-a',
            kind: 'highlight',
            treatment: 'standard',
            warning: null,
          },
        ],
        warnings: ['输出是新的完整重写副本'],
        completedAt: instant,
      },
      errorCode: null,
      createdAt: instant,
      updatedAt: instant,
      completedAt: instant,
    });
    expect(job.report?.decisions[0]).toEqual({
      annotationId: 'annotation-1',
      revision: 2,
      contextId: 'context-a',
      kind: 'highlight',
      treatment: 'standard',
      warning: null,
    });
    expect(JSON.stringify(job.report)).not.toContain('body');
  });

  it('未保存阅读状态使用 revision 0，不伪造持久化时间', () => {
    const base = {
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
    };
    expect(readerManifestSchema.shape.state.parse(base)).toEqual(base);
    expect(() => readerManifestSchema.shape.state.parse({ ...base, createdAt: instant })).toThrow();
  });

  it('阅读状态拒绝非法页面、缩放、旋转和布局', () => {
    const valid = {
      pageNumber: 1,
      pageOffsetRatio: 0,
      zoom: 1,
      rotation: 0,
      layout: 'single-page',
      lastContextId: null,
      expectedRevision: 0,
    };
    expect(saveReaderStateInputSchema.parse(valid)).toEqual(valid);
    expect(() => saveReaderStateInputSchema.parse({ ...valid, pageNumber: 0 })).toThrow();
    expect(() => saveReaderStateInputSchema.parse({ ...valid, zoom: 9 })).toThrow();
    expect(() => saveReaderStateInputSchema.parse({ ...valid, rotation: 45 })).toThrow();
    expect(() => saveReaderStateInputSchema.parse({ ...valid, layout: 'spread' })).toThrow();
  });

  it('允许 unknown 类型和不完整元数据进入文献库', () => {
    expect(
      workViewSchema.parse({
        id: 'work-1',
        type: 'unknown',
        title: '',
        year: null,
        status: 'active',
        preferredEditionId: null,
        authors: [],
        attachmentCount: 0,
        collectionIds: [],
        storageModes: [],
        fileStatus: 'none',
        createdAt: instant,
        updatedAt: instant,
        trashedAt: null,
      }),
    ).toMatchObject({ type: 'unknown', attachmentCount: 0, fileStatus: 'none' });
  });

  it('同一字段可保留多来源候选和人工确认值', () => {
    const assertions = [
      {
        id: 'a-embedded',
        entityType: 'work',
        entityId: 'work-1',
        fieldName: 'title',
        value: 'Embedded title',
        sourceKind: 'embedded-pdf',
        sourceRecordId: 'source-1',
        observedAt: instant,
        isUserConfirmed: false,
        isSelected: false,
      },
      {
        id: 'a-user',
        entityType: 'work',
        entityId: 'work-1',
        fieldName: 'title',
        value: '人工标题',
        sourceKind: 'user',
        sourceRecordId: null,
        observedAt: instant,
        isUserConfirmed: true,
        isSelected: true,
      },
    ].map((value) => metadataAssertionViewSchema.parse(value));

    expect(assertions).toHaveLength(2);
    expect(assertions.find((value) => value.isSelected)?.sourceKind).toBe('user');
  });

  it('缺失位置保留原路径、解析路径和机器可读原因', () => {
    expect(
      assetLocationViewSchema.parse({
        id: 'location-1',
        assetId: 'asset-1',
        mode: 'linked',
        originalPath: '../论文/样本.pdf',
        resolvedPath: '/Volumes/Papers/论文/样本.pdf',
        objectKey: null,
        state: 'missing',
        errorCode: 'ENOENT',
        lastCheckedAt: instant,
      }),
    ).toMatchObject({ state: 'missing', errorCode: 'ENOENT' });
  });

  it('解析失败的导入仍保留可继续确认的状态', () => {
    expect(
      importItemViewSchema.parse({
        id: 'item-1',
        sessionId: 'session-1',
        fileName: 'broken.pdf',
        storageMode: 'managed',
        stage: 'metadata-failed',
        assetId: 'asset-1',
        workId: null,
        editionId: null,
        error: {
          code: 'PDF_INVALID',
          stage: 'metadata',
          retryable: false,
          message: 'PDF 无法解析，可人工录入元数据',
        },
        createdAt: instant,
        updatedAt: instant,
      }),
    ).toMatchObject({ stage: 'metadata-failed', assetId: 'asset-1' });
  });

  it('详情能表达 Work / Edition / Asset / Location / Attachment', () => {
    const detail = workDetailViewSchema.parse({
      work: {
        id: 'work-1',
        type: 'article',
        title: 'Research Workbench',
        year: 2026,
        status: 'active',
        preferredEditionId: 'edition-1',
        authors: [],
        attachmentCount: 1,
        collectionIds: ['collection-1', 'collection-2'],
        storageModes: ['managed'],
        fileStatus: 'available',
        createdAt: instant,
        updatedAt: instant,
        trashedAt: null,
      },
      editions: [
        {
          id: 'edition-1',
          workId: 'work-1',
          kind: 'journal',
          title: 'Research Workbench',
          publicationTitle: 'Workbench Journal',
          publishedDate: '2026-08-23',
          contributors: [],
          identifiers: [{ scheme: 'doi', value: '10.1000/example' }],
          attachments: [
            {
              id: 'attachment-1',
              editionId: 'edition-1',
              assetId: 'asset-1',
              role: 'primary-pdf',
              displayName: 'paper.pdf',
              status: 'active',
              asset: {
                id: 'asset-1',
                algorithm: 'sha256',
                contentHash: 'a'.repeat(64),
                byteSize: 42,
                mimeType: 'application/pdf',
                state: 'active',
                locations: [
                  {
                    id: 'location-1',
                    assetId: 'asset-1',
                    mode: 'managed',
                    originalPath: '/tmp/paper.pdf',
                    resolvedPath: '/tmp/library/sha256/aa/aa/' + 'a'.repeat(64),
                    objectKey: 'sha256/aa/aa/' + 'a'.repeat(64),
                    state: 'available',
                    errorCode: null,
                    lastCheckedAt: instant,
                  },
                ],
              },
            },
          ],
        },
      ],
      assertions: [],
    });

    expect(detail.editions[0]?.attachments[0]?.asset.locations[0]?.mode).toBe('managed');
  });

  it('拒绝互相矛盾的位置形状', () => {
    expect(() =>
      assetLocationViewSchema.parse({
        id: 'bad',
        assetId: 'asset-1',
        mode: 'managed',
        originalPath: '/tmp/paper.pdf',
        resolvedPath: '/tmp/object',
        objectKey: null,
        state: 'available',
        errorCode: null,
        lastCheckedAt: instant,
      }),
    ).toThrow();
  });

  it('互操作记录保留未知字段、格式影子和逐条诊断', () => {
    const record = interopRecordViewSchema.parse({
      id: 'record-1',
      sourceId: 'source-1',
      ordinal: 0,
      sourceKey: 'smith2026',
      rawHash: 'b'.repeat(64),
      rawRecord: '@article{smith2026, custom = {kept}}',
      summary: 'Research Workbench',
      formatShadow: {
        fields: { custom: 'kept' },
        unknownFields: ['custom'],
      },
      mapped: {
        type: 'article',
        sourceType: 'article',
        title: 'Research Workbench',
        abstract: null,
        issued: { year: 2026, month: null, day: null, literal: '2026' },
        publicationTitle: null,
        publisher: null,
        volume: null,
        issue: null,
        pages: null,
        contributors: [
          {
            kind: 'structured',
            family: 'Smith',
            given: 'Ada',
            literal: null,
            suffix: null,
            nonDroppingParticle: null,
          },
        ],
        identifiers: [{ scheme: 'doi', value: '10.1000/example' }],
        tagSuggestions: [],
      },
      diagnostics: [
        {
          code: 'unknown-field',
          severity: 'info',
          message: '保留未知字段 custom',
          field: 'custom',
          path: null,
          line: null,
          recoverable: true,
        },
      ],
      decision: null,
      status: 'valid',
      revision: 1,
      committedWorkId: null,
      committedEditionId: null,
      createdAt: instant,
      updatedAt: instant,
    });

    expect(record.formatShadow).toMatchObject({ fields: { custom: 'kept' } });
    expect(record.diagnostics[0]?.code).toBe('unknown-field');
  });

  it('互操作契约支持部分无效、分页和明确的附件决定', () => {
    const decision = interopRecordDecisionSchema.parse({
      action: 'accept',
      attachmentCandidates: [
        {
          id: 'attachment-candidate-1',
          sourceValue: 'paper.pdf',
          resolvedPath: '/tmp/paper.pdf',
          displayName: 'paper.pdf',
          mimeType: 'application/pdf',
          exists: true,
          action: 'linked',
        },
      ],
    });
    expect(decision.fieldSuggestions).toEqual([]);

    const page = interopImportRecordsPageSchema.parse({
      items: [],
      total: 10_000,
      offset: 9_950,
      limit: 50,
      nextOffset: null,
    });
    expect(page.total).toBe(10_000);

    expect(() =>
      interopImportRecordsPageSchema.parse({
        items: [],
        total: 10_000,
        offset: 0,
        limit: 201,
        nextOffset: 201,
      }),
    ).toThrow();
  });

  it('互操作任务统计和 revision 经过同一 schema 往返', () => {
    const job = interopImportJobViewSchema.parse({
      id: 'job-1',
      requestId: 'request-1',
      source: {
        id: 'source-1',
        format: 'ris',
        displayName: 'library.ris',
        sourcePath: '/tmp/library.ris',
        contentHash: 'a'.repeat(64),
        byteSize: 2048,
        encoding: 'utf-8',
        parserName: '@citation-js/plugin-ris',
        parserVersion: '0.8.2',
        createdAt: instant,
      },
      status: 'awaiting-review',
      summary: {
        total: 2,
        processed: 2,
        valid: 1,
        invalid: 1,
        needsReview: 0,
        accepted: 0,
        skipped: 0,
        committed: 0,
        failed: 0,
        attachments: 0,
      },
      checkpointOrdinal: 2,
      errorCode: null,
      errorDetail: null,
      revision: 3,
      createdAt: instant,
      updatedAt: instant,
      completedAt: null,
    });

    expect(interopImportJobViewSchema.parse(JSON.parse(JSON.stringify(job)))).toEqual(job);
  });

  it('导出冻结项携带 key 来源和 revision，写作引用保留完整 intent', () => {
    const preview = interopExportPreviewSchema.parse({
      jobId: 'export-1',
      previewToken: 'token-1',
      format: 'bibtex',
      scope: { kind: 'selection', workIds: ['work-1'] },
      editionPolicy: 'preferred',
      frozenEntities: [
        {
          workId: 'work-1',
          workRevision: 2,
          editionId: 'edition-1',
          editionRevision: 3,
          citationKey: 'smith2026',
          citationKeySource: 'user',
          citationKeyRevision: 4,
        },
      ],
      workCount: 1,
      recordCount: 1,
      issueCount: 0,
      losses: [],
      revision: 1,
    });
    expect(preview.frozenEntities[0]).toMatchObject({
      citationKeySource: 'user',
      citationKeyRevision: 4,
    });

    const citation = writingBlockSchema.parse({
      id: 'block-1',
      documentId: 'document-1',
      sectionId: 'section-1',
      kind: 'citation',
      text: null,
      targetId: 'work-1',
      targetLabel: 'Research paper',
      targetState: 'current',
      targetUrl: '/research?work=work-1',
      sourceState: null,
      citation: {
        editionId: 'edition-1',
        locator: '42',
        label: 'page',
        prefix: null,
        suffix: null,
        suppressAuthor: false,
      },
      position: 0,
      status: 'active',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
      deletedAt: null,
    });
    expect(citation).toMatchObject({ kind: 'citation', targetId: 'work-1' });
    if (citation.kind !== 'citation') throw new Error('expected citation block');
    expect(
      renderCitationInputSchema.parse({
        style: 'apa',
        mode: 'bibliography',
        items: [
          {
            workId: citation.targetId,
            editionId: citation.citation.editionId,
            locator: citation.citation.locator,
          },
        ],
      }),
    ).toMatchObject({ locale: 'en-US', mode: 'bibliography' });
  });
});
