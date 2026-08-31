import { describe, expect, it } from 'vitest';
import { parseByteRange, planReaderResponse } from './range-response.js';
import type { ResolvedReaderContent } from './content-source.js';

const content: ResolvedReaderContent = {
  assetId: 'asset-1',
  contentHash: 'a'.repeat(64),
  byteSize: 100,
  mimeType: 'application/pdf',
  displayName: 'paper.pdf',
  editionId: null,
  etag: `"sha256-${'a'.repeat(64)}"`,
  open: () => {
    throw new Error('not used');
  },
};

describe('reader byte ranges', () => {
  it('支持完整、开区间、闭区间和后缀范围', () => {
    expect(parseByteRange(undefined, 100)).toEqual({ kind: 'full' });
    expect(parseByteRange('bytes=10-', 100)).toEqual({
      kind: 'partial',
      range: { start: 10, end: 99 },
    });
    expect(parseByteRange('bytes=10-19', 100)).toEqual({
      kind: 'partial',
      range: { start: 10, end: 19 },
    });
    expect(parseByteRange('bytes=-8', 100)).toEqual({
      kind: 'partial',
      range: { start: 92, end: 99 },
    });
  });

  it('拒绝多区间、越界、反向和空范围', () => {
    for (const header of ['bytes=0-1,4-5', 'bytes=100-', 'bytes=9-2', 'bytes=-0', 'items=0-1']) {
      expect(parseByteRange(header, 100)).toEqual({ kind: 'invalid' });
    }
  });

  it('为完整和局部响应生成固定缓存与内容头', () => {
    expect(planReaderResponse(content, undefined)).toMatchObject({
      status: 200,
      range: undefined,
      headers: { 'content-length': '100', 'accept-ranges': 'bytes' },
    });
    expect(planReaderResponse(content, 'bytes=10-19')).toMatchObject({
      status: 206,
      range: { start: 10, end: 19 },
      headers: {
        'content-length': '10',
        'content-range': 'bytes 10-19/100',
        etag: content.etag,
      },
    });
  });
});
