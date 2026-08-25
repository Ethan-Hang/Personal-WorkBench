import { describe, expect, it } from 'vitest';
import { buildLocalMetadata } from './metadata.js';

describe('本地元数据建议', () => {
  it('同时保留 embedded、首页和文件名来源，不提前覆盖', () => {
    const result = buildLocalMetadata('/tmp/file_name-paper.pdf', {
      pageCount: 2,
      metadata: {
        title: 'Embedded title',
        author: 'Ada Lovelace; Alan Turing',
        subject: 'Local-first research',
        keywords: 'library, metadata',
        creationDate: null,
      },
      firstPageText: 'First page title doi:10.1000/Example arXiv:2401.12345v2',
    });

    expect(result.suggestions.filter((item) => item.fieldName === 'title')).toEqual([
      { fieldName: 'title', value: 'Embedded title', sourceKind: 'embedded-pdf' },
      expect.objectContaining({ sourceKind: 'first-page' }),
      { fieldName: 'title', value: 'file name paper', sourceKind: 'filename' },
    ]);
    expect(result.suggestions).toContainEqual({
      fieldName: 'authors',
      value: ['Ada Lovelace', 'Alan Turing'],
      sourceKind: 'embedded-pdf',
    });
    expect(result.identifiers).toEqual([
      expect.objectContaining({ scheme: 'doi', normalizedValue: '10.1000/example' }),
      expect.objectContaining({ scheme: 'arxiv', normalizedValue: '2401.12345v2' }),
    ]);
  });

  it('扫描型或损坏 PDF 仍返回文件名建议和明确警告', () => {
    expect(
      buildLocalMetadata('/tmp/scan_001.pdf', {
        pageCount: 1,
        metadata: {
          title: null,
          author: null,
          subject: null,
          keywords: null,
          creationDate: null,
        },
        firstPageText: '',
      }),
    ).toMatchObject({
      suggestions: [{ fieldName: 'title', value: 'scan 001', sourceKind: 'filename' }],
      warnings: ['PDF 首页没有可提取文本'],
    });

    expect(buildLocalMetadata('/tmp/broken.pdf', null, 'PDF 无法解析')).toMatchObject({
      suggestions: [{ fieldName: 'title', value: 'broken', sourceKind: 'filename' }],
      warnings: ['PDF 无法解析'],
    });
  });
});
