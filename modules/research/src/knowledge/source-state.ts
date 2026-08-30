import type {
  EvidenceSourceSnapshot,
  EvidenceSourceState,
  KnowledgeBasicStatus,
} from '../contract.js';
import type { OcrSourceIdentity } from './repository.js';

export interface EvidenceSourceStateInput {
  snapshot: EvidenceSourceSnapshot;
  sourceAvailable: boolean;
  currentAssetHash: string;
  annotationStatus: KnowledgeBasicStatus | 'needs-review';
  annotationRevision: number;
  currentOcr: OcrSourceIdentity | null;
}

function sameOcr(
  expected: EvidenceSourceSnapshot['ocr'],
  current: OcrSourceIdentity | null,
): boolean {
  if (expected === null || current === null) return expected === current;
  return (
    expected.engine === current.engine &&
    expected.engineVersion === current.engineVersion &&
    expected.languagePackVersion === current.languagePackVersion &&
    expected.languagesKey === current.languagesKey
  );
}

export function evidenceSourceState(input: EvidenceSourceStateInput): EvidenceSourceState {
  if (!input.sourceAvailable) return 'source-unavailable';
  if (input.currentAssetHash !== input.snapshot.assetHash) return 'asset-mismatch';
  if (input.annotationStatus === 'deleted') return 'annotation-deleted';
  if (input.annotationRevision !== input.snapshot.annotationRevision) {
    return 'annotation-revised';
  }
  if (input.snapshot.sourceKind === 'ocr' && !sameOcr(input.snapshot.ocr, input.currentOcr)) {
    return 'annotation-revised';
  }
  return 'current';
}
