import { describe, expect, it } from 'vitest';
import { mapInteropRecord } from './mapper.js';
import type { ParsedInteropEnvelope } from './types.js';

function envelope(csl: Record<string, unknown>): ParsedInteropEnvelope {
  return {
    ordinal: 0,
    sourceKey: null,
    rawHash: 'a'.repeat(64),
    rawRecord: JSON.stringify(csl),
    formatShadow: {},
    csl,
    diagnostics: [],
    attachmentCandidates: [],
  };
}

describe('mapInteropRecord', () => {
  it('未知类型和空标题进入审查，不以空值删除字段', () => {
    const result = mapInteropRecord(envelope({ type: 'legal_case', abstract: '' }));
    expect(result.status).toBe('needs-review');
    expect(result.mapped).toMatchObject({ type: 'unknown', sourceType: 'legal_case', title: '' });
    expect(result.diagnostics.map((item) => item.code)).toEqual(['unknown-type', 'field-conflict']);
  });

  it('规范化判断 DOI/arXiv，但保留来源值', () => {
    const result = mapInteropRecord(
      envelope({
        type: 'article-journal',
        title: 'Identifiers',
        DOI: 'https://doi.org/10.1000/Test',
        URL: 'https://arxiv.org/abs/2401.01234v2',
      }),
    );
    expect(result.mapped?.identifiers).toEqual([
      { scheme: 'doi', value: 'https://doi.org/10.1000/Test' },
      { scheme: 'arxiv', value: '2401.01234v2' },
    ]);
  });
});
