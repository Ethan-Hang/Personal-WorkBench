import type {
  AssetState,
  AttachmentRole,
  AttachmentStatus,
  EditionKind,
  IdentifierScheme,
  ImportItemStage,
  ImportSessionStatus,
  LocationState,
  MetadataSourceKind,
  StorageMode,
  WorkStatus,
  WorkType,
} from '../contract.js';

export interface WorkRecord {
  id: string;
  type: WorkType;
  title: string;
  titleSort: string;
  abstract: string | null;
  year: number | null;
  preferredEditionId: string | null;
  status: WorkStatus;
  redirectToWorkId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface WorkDraft {
  id: string;
  type: WorkType;
  title: string;
  titleSort: string;
  abstract?: string | null;
  year?: number | null;
  preferredEditionId?: string | null;
}

export interface WorkListRecord extends WorkRecord {
  attachmentCount: number;
  collectionIds: string[];
  fileStatus: 'none' | 'available' | 'missing' | 'changed' | 'recycled' | 'mixed';
}

export interface WorkPage {
  works: WorkListRecord[];
  nextCursor: string | null;
}

export interface ListWorksQuery {
  status: WorkStatus;
  collectionId?: string;
  fileStatus?: WorkListRecord['fileStatus'];
  query?: string;
  cursor?: string | null;
  limit: number;
}

export interface EditionRecord {
  id: string;
  workId: string;
  kind: EditionKind;
  title: string;
  publicationTitle: string | null;
  publisher: string | null;
  publishedDate: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface EditionDraft {
  id: string;
  kind: EditionKind;
  title: string;
  publicationTitle?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
}

export interface IdentifierDraft {
  id: string;
  entityType: 'work' | 'edition';
  scheme: IdentifierScheme;
  value: string;
  normalizedValue: string;
  sourceRecordId?: string | null;
}

export interface AssetRecord {
  id: string;
  hashAlgorithm: 'sha256';
  contentHash: string;
  byteSize: number;
  mimeType: string;
  state: AssetState;
  createdAt: string;
  updatedAt: string;
  recycledAt: string | null;
}

export interface AssetDraft {
  id: string;
  contentHash: string;
  byteSize: number;
  mimeType: string;
}

export interface AssetLocationRecord {
  id: string;
  assetId: string;
  mode: StorageMode;
  originalPath: string;
  resolvedPath: string;
  objectKey: string | null;
  state: LocationState;
  deviceId: string | null;
  fileId: string | null;
  observedSize: number | null;
  observedMtimeMs: number | null;
  errorCode: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recycledAt: string | null;
}

export interface AssetLocationDraft {
  id: string;
  mode: StorageMode;
  originalPath: string;
  resolvedPath: string;
  objectKey: string | null;
  state: LocationState;
  deviceId?: string | null;
  fileId?: string | null;
  observedSize?: number | null;
  observedMtimeMs?: number | null;
  errorCode?: string | null;
  lastCheckedAt?: string | null;
}

export interface StoredAsset {
  asset: AssetRecord;
  location: AssetLocationRecord;
  reusedAsset: boolean;
  reusedLocation: boolean;
}

export interface AttachmentRecord {
  id: string;
  editionId: string;
  assetId: string;
  role: AttachmentRole;
  displayName: string;
  status: AttachmentStatus;
  createdAt: string;
  recycledAt: string | null;
}

export interface CollectionRecord {
  id: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  kind: 'manual' | 'smart' | 'system';
  queryJson: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface CollectionDraft {
  id: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  sortOrder: number;
}

export interface SourceRecord {
  id: string;
  provider: string;
  sourceLocator: string | null;
  rawFormat: string;
  rawPayload: string;
  parserVersion: string;
  observedAt: string;
  createdAt: string;
}

export type SourceRecordDraft = Omit<SourceRecord, 'createdAt'>;

export interface MetadataAssertionRecord {
  id: string;
  entityType: 'work' | 'edition';
  entityId: string;
  fieldName: string;
  value: unknown;
  normalizedValue: string | null;
  sourceKind: MetadataSourceKind;
  sourceRecordId: string | null;
  observedAt: string;
  isUserConfirmed: boolean;
  isSelected: boolean;
  createdAt: string;
}

export interface MetadataAssertionDraft {
  id: string;
  entityType: 'work' | 'edition';
  entityId: string;
  fieldName: string;
  value: unknown;
  normalizedValue?: string | null;
  sourceKind: MetadataSourceKind;
  sourceRecordId?: string | null;
  observedAt: string;
  isUserConfirmed?: boolean;
}

export interface ImportItemRecord {
  id: string;
  sessionId: string;
  fileName: string;
  sourcePath: string;
  storageMode: StorageMode;
  stage: ImportItemStage;
  assetId: string | null;
  workId: string | null;
  editionId: string | null;
  tempPath: string | null;
  candidateJson: string | null;
  decisionJson: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportSessionRecord {
  id: string;
  requestId: string;
  status: ImportSessionStatus;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  items: ImportItemRecord[];
}

export interface ImportSessionDraft {
  id: string;
  requestId: string;
  items: Array<{
    id: string;
    fileName: string;
    sourcePath: string;
    storageMode: StorageMode;
  }>;
}

export interface ImportItemChanges {
  stage?: ImportItemStage;
  assetId?: string | null;
  workId?: string | null;
  editionId?: string | null;
  tempPath?: string | null;
  candidateJson?: string | null;
  decisionJson?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  retryable?: boolean;
}

export interface CommitImportDraft {
  importItemId: string;
  work: { kind: 'new'; value: WorkDraft } | { kind: 'existing'; id: string };
  edition: { kind: 'new'; value: EditionDraft } | { kind: 'existing'; id: string };
  attachment: {
    id: string;
    assetId: string;
    role: AttachmentRole;
    displayName: string;
  };
  identifiers: IdentifierDraft[];
  assertions: Array<Omit<MetadataAssertionDraft, 'entityId'>>;
  collections: Array<{ entryId: string; collectionId: string }>;
  decisionJson: string;
}

export interface CommitImportResult {
  workId: string;
  editionId: string;
  attachmentId: string;
  assetId: string;
  reusedWork: boolean;
  reusedEdition: boolean;
  reusedAttachment: boolean;
}

export interface ResearchRepository {
  createImportSession(draft: ImportSessionDraft): Promise<ImportSessionRecord>;
  getImportSession(id: string): Promise<ImportSessionRecord | null>;
  getImportSessionByRequestId(requestId: string): Promise<ImportSessionRecord | null>;
  updateImportItem(id: string, changes: ImportItemChanges): Promise<ImportItemRecord | null>;
  setImportSessionStatus(id: string, status: ImportSessionStatus): Promise<boolean>;

  findAssetByHash(contentHash: string): Promise<AssetRecord | null>;
  storeAsset(asset: AssetDraft, location: AssetLocationDraft): Promise<StoredAsset>;
  getLocation(id: string): Promise<AssetLocationRecord | null>;
  updateLocationState(
    id: string,
    state: LocationState,
    checkedAt: string,
    errorCode: string | null,
  ): Promise<AssetLocationRecord | null>;

  recordSource(draft: SourceRecordDraft): Promise<SourceRecord>;
  recordAssertion(draft: MetadataAssertionDraft, select: boolean): Promise<MetadataAssertionRecord>;
  listAssertions(
    entityType: 'work' | 'edition',
    entityId: string,
  ): Promise<MetadataAssertionRecord[]>;

  commitImport(draft: CommitImportDraft): Promise<CommitImportResult>;
  getWork(id: string): Promise<WorkRecord | null>;
  listWorks(query: ListWorksQuery): Promise<WorkPage>;
  listEditions(workId: string): Promise<EditionRecord[]>;
  listAttachments(editionId: string): Promise<AttachmentRecord[]>;

  createCollection(draft: CollectionDraft): Promise<CollectionRecord>;
  listCollections(): Promise<CollectionRecord[]>;
  setWorkCollections(
    workId: string,
    entries: Array<{ entryId: string; collectionId: string }>,
  ): Promise<void>;
}
