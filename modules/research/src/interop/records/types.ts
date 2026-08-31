import { createHash } from 'node:crypto';
import type { InteropAttachmentCandidate, InteropDiagnostic } from '../../contract.js';

export type CslRecord = Record<string, unknown>;

export interface ParsedInteropEnvelope {
  ordinal: number;
  sourceKey: string | null;
  rawHash: string;
  rawRecord: string;
  formatShadow: unknown;
  csl: CslRecord | null;
  diagnostics: InteropDiagnostic[];
  attachmentCandidates: InteropAttachmentCandidate[];
}

export interface ParseInteropOptions {
  maxRecords?: number;
  maxRecordBytes?: number;
}

export const DEFAULT_MAX_INTEROP_RECORDS = 100_000;
export const DEFAULT_MAX_INTEROP_RECORD_BYTES = 2_000_000;

export class InteropParseError extends Error {
  constructor(
    readonly code:
      | 'RESEARCH_INTEROP_UNSUPPORTED_ENCODING'
      | 'RESEARCH_INTEROP_MALFORMED_BOUNDARY'
      | 'RESEARCH_INTEROP_INVALID_RECORD',
    message: string,
  ) {
    super(message);
    this.name = 'InteropParseError';
  }
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function attachmentCandidate(
  rawHash: string,
  value: string,
  index: number,
): InteropAttachmentCandidate {
  const withoutScheme = value.replace(/^file:\/\//i, '');
  const displayName = withoutScheme.split(/[\\/]/).filter(Boolean).at(-1) ?? withoutScheme;
  return {
    id: `attachment-${sha256(`${rawHash}:${index}:${value}`).slice(0, 24)}`,
    sourceValue: value,
    resolvedPath: null,
    displayName: displayName || `attachment-${index + 1}`,
    mimeType: /\.pdf$/i.test(withoutScheme) ? 'application/pdf' : null,
    exists: null,
    action: 'unconfirmed',
  };
}

export function enforceRecordLimits(
  records: ParsedInteropEnvelope[],
  options: ParseInteropOptions,
): ParsedInteropEnvelope[] {
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_INTEROP_RECORDS;
  const maxRecordBytes = options.maxRecordBytes ?? DEFAULT_MAX_INTEROP_RECORD_BYTES;
  if (records.length > maxRecords) {
    throw new InteropParseError(
      'RESEARCH_INTEROP_INVALID_RECORD',
      `记录数 ${records.length} 超过上限 ${maxRecords}`,
    );
  }
  for (const record of records) {
    if (Buffer.byteLength(record.rawRecord) > maxRecordBytes) {
      throw new InteropParseError(
        'RESEARCH_INTEROP_INVALID_RECORD',
        `第 ${record.ordinal + 1} 条记录超过 ${maxRecordBytes} 字节`,
      );
    }
  }
  return records;
}
