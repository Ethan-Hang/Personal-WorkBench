import { describe, expect, it } from 'vitest';
import { extractIdentifiers, normalizeArxivId, normalizeDoi } from './identifiers.js';

describe('DOI 规范化', () => {
  it.each([
    ['10.1000/ABC.Def', '10.1000/abc.def'],
    ['doi: 10.1000/ABC.Def.', '10.1000/abc.def'],
    ['https://doi.org/10.1000%2FABC.Def', '10.1000/abc.def'],
    ['https://dx.doi.org/10.5555/(SICI)1234', '10.5555/(sici)1234'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeDoi(raw)).toBe(expected);
  });

  it.each(['not-a-doi', '10.1/x', 'doi:', 'https://example.com/10.1000/x'])('拒绝 %s', (raw) =>
    expect(normalizeDoi(raw)).toBeNull(),
  );
});

describe('arXiv ID 规范化', () => {
  it.each([
    ['arXiv:2401.12345v2', '2401.12345v2'],
    ['https://arxiv.org/abs/2401.1234', '2401.1234'],
    ['https://arxiv.org/pdf/hep-th/9901001.pdf', 'hep-th/9901001'],
    ['CS.AI/0301001', 'cs.ai/0301001'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeArxivId(raw)).toBe(expected);
  });

  it('拒绝普通年份和不完整编号', () => {
    expect(normalizeArxivId('2026')).toBeNull();
    expect(normalizeArxivId('2401.12')).toBeNull();
  });
});

it('从混合文本提取并按规范值去重', () => {
  expect(
    extractIdentifiers(
      'DOI: 10.1000/Example. mirror https://doi.org/10.1000/example; arXiv:2401.12345v2',
    ),
  ).toEqual([
    { scheme: 'doi', value: '10.1000/Example.', normalizedValue: '10.1000/example' },
    { scheme: 'arxiv', value: '2401.12345v2', normalizedValue: '2401.12345v2' },
  ]);
});
