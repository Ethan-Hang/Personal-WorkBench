import { describe, expect, it } from 'vitest';
import {
  RESEARCH_API_V1,
  assetLocationViewSchema,
  importItemViewSchema,
  metadataAssertionViewSchema,
  workDetailViewSchema,
  workViewSchema,
} from './contract.js';

const instant = '2026-08-23T10:20:30.000Z';

describe('research contract', () => {
  it('所有端点共用带版本的模块前缀', () => {
    expect(RESEARCH_API_V1.works).toBe('/api/research/v1/works');
    expect(RESEARCH_API_V1.work('work-1')).toBe('/api/research/v1/works/work-1');
    expect(RESEARCH_API_V1.importConfirm('session-1')).toBe(
      '/api/research/v1/import-sessions/session-1/confirm',
    );
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
        attachmentCount: 0,
        collectionIds: [],
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
        attachmentCount: 1,
        collectionIds: ['collection-1', 'collection-2'],
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
});
