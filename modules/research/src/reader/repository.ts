import type { AttachmentRole, ReaderLayout, ReaderRotation } from '../contract.js';

export interface ReaderAssetLocationRecord {
  id: string;
  mode: 'managed' | 'linked';
  originalPath: string;
  resolvedPath: string;
  objectKey: string | null;
  state: 'pending' | 'available' | 'missing' | 'changed' | 'recycled' | 'error';
  errorCode: string | null;
  updatedAt: string;
}

export interface ReaderAssetAttachmentRecord {
  id: string;
  editionId: string;
  role: AttachmentRole;
  displayName: string;
}

export interface ReaderAssetRecord {
  id: string;
  contentHash: string;
  byteSize: number;
  mimeType: string;
  state: 'active' | 'recycled';
  updatedAt: string;
  locations: ReaderAssetLocationRecord[];
  attachments: ReaderAssetAttachmentRecord[];
}

export interface ReaderStateRecord {
  assetId: string;
  pageNumber: number;
  pageOffsetRatio: number;
  zoom: number;
  rotation: ReaderRotation;
  layout: ReaderLayout;
  lastContextId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveReaderStateDraft {
  assetId: string;
  pageNumber: number;
  pageOffsetRatio: number;
  zoom: number;
  rotation: ReaderRotation;
  layout: ReaderLayout;
  lastContextId: string | null;
  expectedRevision: number;
}

export type SaveReaderStateResult =
  | { kind: 'saved'; state: ReaderStateRecord }
  | { kind: 'conflict'; current: ReaderStateRecord | null }
  | { kind: 'asset-not-found' };

export interface ReaderRepository {
  getReaderAsset(assetId: string): Promise<ReaderAssetRecord | null>;
  getReaderState(assetId: string): Promise<ReaderStateRecord | null>;
  saveReaderState(draft: SaveReaderStateDraft): Promise<SaveReaderStateResult>;
}
