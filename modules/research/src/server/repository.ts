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
  SystemView,
  WorkRelationKind,
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
  authors: string[];
  attachmentCount: number;
  collectionIds: string[];
  storageModes: StorageMode[];
  fileStatus: 'none' | 'available' | 'missing' | 'changed' | 'recycled' | 'mixed';
}

export interface WorkPage {
  works: WorkListRecord[];
  nextCursor: string | null;
}

export interface ListWorksQuery {
  status: WorkStatus;
  systemView?: SystemView;
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

export interface ContributorRecord {
  id: string;
  editionId: string;
  role: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  orcid: string | null;
  sequence: number;
}

export interface ContributorDraft {
  id: string;
  displayName: string;
  role?: string;
  givenName?: string | null;
  familyName?: string | null;
  orcid?: string | null;
  sequence: number;
}

export interface IdentifierDraft {
  id: string;
  entityType: 'work' | 'edition';
  scheme: IdentifierScheme;
  value: string;
  normalizedValue: string;
  sourceRecordId?: string | null;
}

export interface IdentifierRecord extends IdentifierDraft {
  entityId: string;
  createdAt: string;
}

export interface IdentifierMatch {
  workId: string;
  editionId: string;
  identifier: IdentifierRecord;
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

export interface AssetUsage {
  workId: string;
  editionId: string;
  attachmentId: string;
  role: AttachmentRole;
}

export interface LocationAuditRecord {
  asset: AssetRecord;
  location: AssetLocationRecord;
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

export interface CollectionMoveDraft {
  id: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  orderedSiblingIds: string[];
}

export interface CollectionDeletionImpact {
  collection: CollectionRecord;
  childCount: number;
  directWorkCount: number;
  parentStrategyNameConflicts: string[];
  unclassifiedStrategyNameConflicts: string[];
}

export interface WorkRelationRecord {
  id: string;
  sourceWorkId: string;
  targetWorkId: string;
  kind: WorkRelationKind;
  note: string | null;
  createdAt: string;
}

export interface WorkRelationDraft {
  id: string;
  sourceWorkId: string;
  targetWorkId: string;
  kind: WorkRelationKind;
  note: string | null;
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

export interface MetadataCacheRecord {
  id: string;
  provider: string;
  lookupKey: string;
  status: 'success' | 'not-found' | 'transient-failure';
  value: unknown | null;
  sourceRecordId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetadataCacheDraft {
  id: string;
  provider: string;
  lookupKey: string;
  status: MetadataCacheRecord['status'];
  value: unknown | null;
  sourceRecordId?: string | null;
  expiresAt: string;
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
  contributors: ContributorDraft[];
  assertions: Array<Omit<MetadataAssertionDraft, 'entityId'>>;
  collections: Array<{ entryId: string; collectionId: string }>;
  decisionJson: string;
}

export interface DeletionImpact {
  workId: string;
  attachmentCount: number;
  managedObjectCount: number;
  linkedLocationCount: number;
  removableManagedAssets: Array<{
    assetId: string;
    objectKey: string;
    contentHash: string;
    byteSize: number;
  }>;
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

export interface ManualWorkDraft {
  work: WorkDraft;
  edition: EditionDraft;
  contributors: ContributorDraft[];
  identifiers: IdentifierDraft[];
  assertions: Array<Omit<MetadataAssertionDraft, 'entityId'>>;
  collections: Array<{ entryId: string; collectionId: string }>;
}

export interface ManualWorkResult {
  workId: string;
  editionId: string;
}

export interface AttachmentDraft {
  id: string;
  editionId: string;
  assetId: string;
  role: AttachmentRole;
  displayName: string;
}

export interface ResearchRepository {
  createImportSession(draft: ImportSessionDraft): Promise<ImportSessionRecord>;
  getImportSession(id: string): Promise<ImportSessionRecord | null>;
  getImportSessionByRequestId(requestId: string): Promise<ImportSessionRecord | null>;
  listImportSessions(
    status: ImportSessionStatus | undefined,
    limit: number,
  ): Promise<ImportSessionRecord[]>;
  updateImportItem(id: string, changes: ImportItemChanges): Promise<ImportItemRecord | null>;
  setImportSessionStatus(id: string, status: ImportSessionStatus): Promise<boolean>;
  cancelImportSession(id: string): Promise<ImportSessionRecord | null>;

  findAssetByHash(contentHash: string): Promise<AssetRecord | null>;
  getAsset(id: string): Promise<AssetRecord | null>;
  findAssetUsages(assetId: string): Promise<AssetUsage[]>;
  findIdentifierMatches(
    scheme: IdentifierScheme,
    normalizedValue: string,
  ): Promise<IdentifierMatch[]>;
  storeAsset(asset: AssetDraft, location: AssetLocationDraft): Promise<StoredAsset>;
  getLocation(id: string): Promise<AssetLocationRecord | null>;
  listLocationsForAsset(assetId: string): Promise<AssetLocationRecord[]>;
  listLocationsForAudit(): Promise<LocationAuditRecord[]>;
  updateLocationState(
    id: string,
    state: LocationState,
    checkedAt: string,
    errorCode: string | null,
  ): Promise<AssetLocationRecord | null>;
  relinkLocation(
    id: string,
    originalPath: string,
    resolvedPath: string,
    identity: { deviceId: string; fileId: string; size: number; mtimeMs: number },
    checkedAt: string,
  ): Promise<AssetLocationRecord | null>;

  recordSource(draft: SourceRecordDraft): Promise<SourceRecord>;
  recordAssertion(draft: MetadataAssertionDraft, select: boolean): Promise<MetadataAssertionRecord>;
  listAssertions(
    entityType: 'work' | 'edition',
    entityId: string,
  ): Promise<MetadataAssertionRecord[]>;
  getMetadataCache(
    provider: string,
    lookupKey: string,
    at: string,
  ): Promise<MetadataCacheRecord | null>;
  putMetadataCache(draft: MetadataCacheDraft): Promise<MetadataCacheRecord>;

  commitImport(draft: CommitImportDraft): Promise<CommitImportResult>;
  createManualWork(draft: ManualWorkDraft): Promise<ManualWorkResult>;
  addAttachment(draft: AttachmentDraft): Promise<AttachmentRecord>;
  getWork(id: string): Promise<WorkRecord | null>;
  getWorkListRecord(id: string): Promise<WorkListRecord | null>;
  listWorks(query: ListWorksQuery): Promise<WorkPage>;
  getEdition(id: string): Promise<EditionRecord | null>;
  listEditions(workId: string): Promise<EditionRecord[]>;
  listContributors(editionId: string): Promise<ContributorRecord[]>;
  listIdentifiers(entityType: 'work' | 'edition', entityId: string): Promise<IdentifierRecord[]>;
  listAttachments(editionId: string): Promise<AttachmentRecord[]>;
  recycleAttachment(id: string, at: string): Promise<boolean>;
  trashWork(id: string, at: string): Promise<boolean>;
  restoreWork(id: string, at: string): Promise<boolean>;
  getDeletionImpact(workId: string): Promise<DeletionImpact | null>;
  permanentlyDeleteWork(workId: string, removableAssetIds: string[]): Promise<boolean>;

  createCollection(draft: CollectionDraft): Promise<CollectionRecord>;
  listCollections(): Promise<CollectionRecord[]>;
  getCollection(id: string): Promise<CollectionRecord | null>;
  moveCollection(draft: CollectionMoveDraft): Promise<CollectionRecord | null>;
  getCollectionDeletionImpact(id: string): Promise<CollectionDeletionImpact | null>;
  deleteCollection(id: string, strategy: 'parent' | 'unclassified'): Promise<boolean>;
  setWorkCollections(
    workId: string,
    entries: Array<{ entryId: string; collectionId: string }>,
  ): Promise<void>;
  upsertWorkRelation(draft: WorkRelationDraft): Promise<WorkRelationRecord>;
  listWorkRelations(workId: string): Promise<WorkRelationRecord[]>;
  deleteWorkRelation(id: string): Promise<boolean>;
}
