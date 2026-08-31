import type { ReaderContentRange, ResolvedReaderContent } from './content-source.js';

export type ParsedRange =
  { kind: 'full' } | { kind: 'partial'; range: ReaderContentRange } | { kind: 'invalid' };

export function parseByteRange(header: string | undefined, size: number): ParsedRange {
  if (header === undefined) return { kind: 'full' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'invalid' };
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size <= 0) {
      return { kind: 'invalid' };
    }
    return {
      kind: 'partial',
      range: { start: Math.max(0, size - suffixLength), end: size - 1 },
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'partial',
    range: { start, end: Math.min(requestedEnd, size - 1) },
  };
}

export interface ReaderResponsePlan {
  status: 200 | 206;
  range: ReaderContentRange | undefined;
  headers: Record<string, string>;
}

export function planReaderResponse(
  content: ResolvedReaderContent,
  rangeHeader: string | undefined,
): ReaderResponsePlan | null {
  const parsed = parseByteRange(rangeHeader, content.byteSize);
  if (parsed.kind === 'invalid') return null;
  const range = parsed.kind === 'partial' ? parsed.range : undefined;
  const contentLength = range ? range.end - range.start + 1 : content.byteSize;
  const headers: Record<string, string> = {
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-length': String(contentLength),
    'content-type': content.mimeType,
    etag: content.etag,
    'x-content-type-options': 'nosniff',
  };
  if (range) headers['content-range'] = `bytes ${range.start}-${range.end}/${content.byteSize}`;
  return { status: range ? 206 : 200, range, headers };
}
