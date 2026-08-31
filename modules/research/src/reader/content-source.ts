import { createReadStream, type ReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ReaderRepository } from './repository.js';
import { ReaderError } from './errors.js';

export interface ReaderContentRange {
  start: number;
  end: number;
}

export interface ResolvedReaderContent {
  assetId: string;
  contentHash: string;
  byteSize: number;
  mimeType: 'application/pdf';
  displayName: string;
  editionId: string | null;
  etag: string;
  open(range?: ReaderContentRange): ReadStream;
}

function isInside(root: string, target: string): boolean {
  const offset = relative(root, target);
  return (
    offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))
  );
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export class ReaderContentSource {
  private streamCount = 0;

  constructor(
    private readonly repository: ReaderRepository,
    private readonly managedRoot: () => string,
  ) {}

  get activeStreams(): number {
    return this.streamCount;
  }

  async resolve(assetId: string): Promise<ResolvedReaderContent> {
    const asset = await this.repository.getReaderAsset(assetId);
    if (!asset) {
      throw new ReaderError('READER_ASSET_NOT_FOUND', 'PDF 附件不存在', 404);
    }
    if (asset.state !== 'active') {
      throw new ReaderError('READER_ASSET_RECYCLED', 'PDF 附件已进入回收站', 409);
    }
    if (asset.mimeType !== 'application/pdf') {
      throw new ReaderError('READER_NOT_PDF', '该附件不是 PDF', 415);
    }

    let changed = false;
    for (const location of asset.locations) {
      if (location.state !== 'available') {
        if (location.state === 'changed') changed = true;
        continue;
      }
      try {
        let filePath: string;
        if (location.mode === 'managed') {
          if (!location.objectKey) continue;
          const requestedRoot = resolve(this.managedRoot());
          const requestedTarget = resolve(requestedRoot, ...location.objectKey.split('/'));
          if (!isInside(requestedRoot, requestedTarget)) continue;
          const [root, target] = await Promise.all([
            realpath(requestedRoot),
            realpath(requestedTarget),
          ]);
          if (!isInside(root, target)) continue;
          filePath = target;
        } else {
          filePath = await realpath(location.resolvedPath);
        }
        const identity = await stat(filePath);
        if (!identity.isFile() || Number(identity.size) !== asset.byteSize) {
          changed = true;
          continue;
        }
        const attachment = asset.attachments[0] ?? null;
        return {
          assetId: asset.id,
          contentHash: asset.contentHash,
          byteSize: asset.byteSize,
          mimeType: 'application/pdf',
          displayName: attachment?.displayName ?? 'document.pdf',
          editionId: attachment?.editionId ?? null,
          etag: `"sha256-${asset.contentHash}"`,
          open: (range) => this.open(filePath, range),
        };
      } catch (error) {
        if (codeOf(error) === 'ENOENT') continue;
        if (codeOf(error) === 'EACCES' || codeOf(error) === 'EPERM') continue;
        throw new ReaderError('READER_ASSET_UNAVAILABLE', '无法读取 PDF 附件', 409, undefined, {
          cause: error,
        });
      }
    }

    throw new ReaderError(
      'READER_ASSET_UNAVAILABLE',
      changed ? 'PDF 文件内容已经变化，请先检查或重新定位' : 'PDF 文件当前不可用',
      409,
    );
  }

  private open(filePath: string, range?: ReaderContentRange): ReadStream {
    const stream = createReadStream(filePath, range ? { start: range.start, end: range.end } : {});
    this.streamCount += 1;
    let counted = true;
    stream.once('close', () => {
      if (!counted) return;
      counted = false;
      this.streamCount -= 1;
    });
    return stream;
  }
}
