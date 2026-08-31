import {
  RESEARCH_API_V1,
  readerManifestSchema,
  readerStateSchema,
  type ReaderManifest,
  type ReaderState,
  type SaveReaderStateInput,
} from '../contract.js';
import { ReaderError } from './errors.js';
import type { ReaderContentSource } from './content-source.js';
import type { ReaderRepository, ReaderStateRecord } from './repository.js';

function toState(record: ReaderStateRecord): ReaderState {
  return readerStateSchema.parse(record);
}

function defaultState(assetId: string): ReaderState {
  return {
    assetId,
    pageNumber: 1,
    pageOffsetRatio: 0,
    zoom: 1,
    rotation: 0,
    layout: 'continuous',
    lastContextId: null,
    revision: 0,
    createdAt: null,
    updatedAt: null,
  };
}

export class ResearchReaderService {
  constructor(
    private readonly repository: ReaderRepository,
    private readonly contentSource: ReaderContentSource,
  ) {}

  private async assertReadableAsset(assetId: string): Promise<void> {
    const asset = await this.repository.getReaderAsset(assetId);
    if (!asset) throw new ReaderError('READER_ASSET_NOT_FOUND', 'PDF 附件不存在', 404);
    if (asset.state !== 'active') {
      throw new ReaderError('READER_ASSET_RECYCLED', 'PDF 附件已进入回收站', 409);
    }
    if (asset.mimeType !== 'application/pdf') {
      throw new ReaderError('READER_NOT_PDF', '该附件不是 PDF', 415);
    }
  }

  async getManifest(assetId: string): Promise<ReaderManifest> {
    const [content, saved] = await Promise.all([
      this.contentSource.resolve(assetId),
      this.repository.getReaderState(assetId),
    ]);
    return readerManifestSchema.parse({
      assetId: content.assetId,
      contentHash: content.contentHash,
      byteSize: content.byteSize,
      mimeType: content.mimeType,
      displayName: content.displayName,
      editionId: content.editionId,
      contentUrl: RESEARCH_API_V1.assetContent(content.assetId),
      state: saved ? toState(saved) : defaultState(content.assetId),
    });
  }

  async getState(assetId: string): Promise<ReaderState> {
    await this.assertReadableAsset(assetId);
    const saved = await this.repository.getReaderState(assetId);
    return saved ? toState(saved) : defaultState(assetId);
  }

  async saveState(assetId: string, input: SaveReaderStateInput): Promise<ReaderState> {
    await this.assertReadableAsset(assetId);
    const result = await this.repository.saveReaderState({ assetId, ...input });
    if (result.kind === 'asset-not-found') {
      throw new ReaderError('READER_ASSET_NOT_FOUND', 'PDF 附件不存在', 404);
    }
    if (result.kind === 'conflict') {
      throw new ReaderError('READER_STATE_CONFLICT', '阅读位置已在其他窗口更新', 409, {
        current: result.current ? toState(result.current) : defaultState(assetId),
      });
    }
    return toState(result.state);
  }
}
