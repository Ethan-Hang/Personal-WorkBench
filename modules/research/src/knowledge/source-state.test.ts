import { describe, expect, it } from 'vitest';
import type { EvidenceSourceSnapshot } from '../contract.js';
import { evidenceSourceState, type EvidenceSourceStateInput } from './source-state.js';

const snapshot: EvidenceSourceSnapshot = {
  workId: 'work-1',
  editionId: 'edition-1',
  assetId: 'asset-1',
  annotationId: 'annotation-1',
  contextId: null,
  pageNumber: 1,
  anchor: {
    pageNumber: 1,
    pageSize: { width: 612, height: 792 },
    rect: null,
    quads: [],
    textQuote: null,
    assetHash: 'a'.repeat(64),
    editionId: 'edition-1',
  },
  sourceKind: 'pdf',
  annotationRevision: 2,
  assetHash: 'a'.repeat(64),
  workTitle: 'Paper',
  editionTitle: 'Edition',
  ocr: null,
  extractedAt: '2026-08-30T00:00:00.000Z',
};

function state(overrides: Partial<EvidenceSourceStateInput> = {}) {
  return evidenceSourceState({
    snapshot,
    sourceAvailable: true,
    currentAssetHash: snapshot.assetHash,
    annotationStatus: 'active',
    annotationRevision: snapshot.annotationRevision,
    currentOcr: null,
    ...overrides,
  });
}

describe('evidenceSourceState', () => {
  it('返回 current，并按严重度覆盖 revision 差异', () => {
    expect(state()).toBe('current');
    expect(state({ annotationRevision: 3 })).toBe('annotation-revised');
    expect(state({ annotationStatus: 'deleted', annotationRevision: 3 })).toBe(
      'annotation-deleted',
    );
    expect(
      state({
        currentAssetHash: 'b'.repeat(64),
        annotationStatus: 'deleted',
        annotationRevision: 3,
      }),
    ).toBe('asset-mismatch');
    expect(
      state({
        sourceAvailable: false,
        currentAssetHash: 'b'.repeat(64),
        annotationStatus: 'deleted',
      }),
    ).toBe('source-unavailable');
  });

  it('OCR 缓存版本变化进入复核状态', () => {
    const ocr = {
      engine: 'tesseract',
      engineVersion: '7.0.0',
      languagePackVersion: '2026.08',
      languagesKey: 'eng',
    };
    const ocrSnapshot = { ...snapshot, sourceKind: 'ocr' as const, ocr };
    expect(state({ snapshot: ocrSnapshot, currentOcr: ocr })).toBe('current');
    expect(
      state({
        snapshot: ocrSnapshot,
        currentOcr: { ...ocr, engineVersion: '7.1.0' },
      }),
    ).toBe('annotation-revised');
    expect(state({ snapshot: ocrSnapshot, currentOcr: null })).toBe('annotation-revised');
  });
});
