import type {
  AssetState,
  AttachmentRole,
  AttachmentStatus,
  EditionKind,
  IdentifierScheme,
  ImportItemStage,
  ImportSessionStatus,
  LocationState,
  ManagedRootMigrationStatus,
  MaintenanceFilter,
  MetadataSourceKind,
  SearchSort,
  StorageMode,
  SystemView,
  WorkRelationKind,
  WorkStatus,
  WorkType,
  WorkMergeMatrixImpact,
} from '../contract.js';
import type { CanonicalResearchLibrary } from '../interop/canonical.js';

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
  searchScore: number | null;
  matchedFields: Array<'title' | 'abstract' | 'authors' | 'publication' | 'identifiers'>;
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
  collectionIds?: string[];
  tagIds?: string[];
  types?: WorkType[];
  yearFrom?: number | null;
  yearTo?: number | null;
  attachmentRoles?: AttachmentRole[];
  storageModes?: StorageMode[];
  fileStatuses?: WorkListRecord['fileStatus'][];
  maintenance?: MaintenanceFilter[];
  relatedWorkId?: string | null;
  sort?: SearchSort;
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
  kind?: 'manual' | 'smart';
  queryJson?: string | null;
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

export interface TagRecord {
  id: string;
  name: string;
  normalizedName: string;
  color: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface TagSummaryRecord extends TagRecord {
  aliases: string[];
  usageCount: number;
  lastUsedAt: string | null;
}

export interface TagDraft {
  id: string;
  name: string;
  normalizedName: string;
  color: string | null;
  description: string | null;
  aliases: Array<{ id: string; name: string; normalizedName: string }>;
}

export interface TagUpdateDraft extends TagDraft {
  expectedUpdatedAt: string;
}

export interface MergeRecord {
  id: string;
  entityType: 'work' | 'tag';
  survivorId: string;
  mergedId: string;
  snapshotJson: string;
  status: 'merged' | 'reverted';
  createdAt: string;
  revertedAt: string | null;
}

export interface TagMergeDraft {
  id: string;
  survivorId: string;
  mergedId: string;
  expectedSurvivorUpdatedAt: string;
  expectedMergedUpdatedAt: string;
  mergedNameAliasId: string;
}

export interface WorkMergeDraft {
  id: string;
  survivorId: string;
  mergedId: string;
  expectedSurvivorRevision: number;
  expectedMergedRevision: number;
  selectedFields: {
    title: string;
    titleSort: string;
    type: WorkType;
    abstract: string | null;
    year: number | null;
  };
  fieldSources: {
    title: 'survivor' | 'merged';
    type: 'survivor' | 'merged';
    abstract: 'survivor' | 'merged';
    year: 'survivor' | 'merged';
  };
  editionIdsToMove: string[];
  preferredEditionId: string | null;
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

export interface ExternalSourceMapRecord {
  id: string;
  provider: string;
  externalId: string;
  entityType: 'work' | 'edition';
  entityId: string;
  lastFetchedAt: string | null;
  cacheStatus: 'fresh' | 'not-found' | 'transient-failure';
  cacheExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  evidenceCount: number;
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

export interface WorkMetadataUpdateDraft {
  workId: string;
  expectedWorkRevision: number;
  work?: {
    title?: string;
    titleSort?: string;
    type?: WorkType;
    abstract?: string | null;
    year?: number | null;
  };
  edition?: {
    id: string;
    expectedRevision: number;
    title?: string;
    publicationTitle?: string | null;
    publisher?: string | null;
    publishedDate?: string | null;
    authors?: ContributorDraft[];
  };
  assertions: MetadataAssertionDraft[];
}

export interface AttachmentDeletionImpact {
  attachmentId: string;
  assetId: string;
  displayName: string;
  otherAttachmentCount: number;
  linkedLocationCount: number;
  evidenceCount: number;
  orphanedAssetId: string | null;
  removableManagedAsset: {
    assetId: string;
    objectKey: string;
    contentHash: string;
    byteSize: number;
  } | null;
}

export interface ExportJobRecord {
  id: string;
  status: 'draft' | 'running' | 'completed' | 'cancelled' | 'failed';
  optionsJson: string;
  targetPath: string | null;
  manifestJson: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ManagedRootMigrationJobRecord {
  id: string;
  status: ManagedRootMigrationStatus;
  sourceRoot: string;
  targetRoot: string;
  totalObjects: number;
  copiedObjects: number;
  totalBytes: number;
  copiedBytes: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type ManagedRootMigrationJobDraft = Pick<
  ManagedRootMigrationJobRecord,
  'id' | 'sourceRoot' | 'targetRoot' | 'totalObjects' | 'totalBytes'
>;

export type ManagedRootMigrationJobChanges = Partial<
  Pick<
    ManagedRootMigrationJobRecord,
    | 'status'
    | 'totalObjects'
    | 'copiedObjects'
    | 'totalBytes'
    | 'copiedBytes'
    | 'errorCode'
    | 'completedAt'
  >
>;

export interface ManagedRootController {
  current(): string;
  switchRoot(sourceRoot: string, targetRoot: string): Promise<boolean>;
}

export interface ExportJobDraft {
  id: string;
  optionsJson: string;
  targetPath: string;
  manifestJson: string;
}

export interface ExportJobChanges {
  status?: ExportJobRecord['status'];
  manifestJson?: string;
  errorCode?: string | null;
  completedAt?: string | null;
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
  listSourceRecords(ids: string[]): Promise<SourceRecord[]>;
  listExternalSourceMaps(workId: string, editionIds: string[]): Promise<ExternalSourceMapRecord[]>;
  getMetadataCache(
    provider: string,
    lookupKey: string,
    at: string,
  ): Promise<MetadataCacheRecord | null>;
  putMetadataCache(draft: MetadataCacheDraft): Promise<MetadataCacheRecord>;

  commitImport(draft: CommitImportDraft): Promise<CommitImportResult>;
  createManualWork(draft: ManualWorkDraft): Promise<ManualWorkResult>;
  updateWorkMetadata(draft: WorkMetadataUpdateDraft): Promise<boolean>;
  addAttachment(draft: AttachmentDraft): Promise<AttachmentRecord>;
  getWork(id: string): Promise<WorkRecord | null>;
  getWorkListRecord(id: string): Promise<WorkListRecord | null>;
  listWorks(query: ListWorksQuery): Promise<WorkPage>;
  rebuildSearchIndex(): Promise<number>;
  getEdition(id: string): Promise<EditionRecord | null>;
  listEditions(workId: string): Promise<EditionRecord[]>;
  listContributors(editionId: string): Promise<ContributorRecord[]>;
  listIdentifiers(entityType: 'work' | 'edition', entityId: string): Promise<IdentifierRecord[]>;
  listAttachments(editionId: string): Promise<AttachmentRecord[]>;
  recycleAttachment(id: string, at: string): Promise<boolean>;
  restoreAttachment(id: string): Promise<boolean>;
  getAttachmentDeletionImpact(id: string): Promise<AttachmentDeletionImpact | null>;
  permanentlyDeleteAttachment(id: string, removableAssetId: string | null): Promise<boolean>;
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
  listTags(status: 'active' | 'trashed' | 'all'): Promise<TagSummaryRecord[]>;
  getTag(id: string): Promise<TagSummaryRecord | null>;
  createTag(draft: TagDraft): Promise<TagSummaryRecord>;
  updateTag(draft: TagUpdateDraft): Promise<TagSummaryRecord | null>;
  setWorkTags(workId: string, entries: Array<{ id: string; tagId: string }>): Promise<void>;
  listTagsForWork(workId: string): Promise<TagSummaryRecord[]>;
  trashTag(id: string, expectedUpdatedAt: string): Promise<boolean>;
  restoreTag(id: string): Promise<boolean>;
  deleteTagPermanently(id: string): Promise<boolean>;
  mergeTags(draft: TagMergeDraft): Promise<MergeRecord | null>;
  getWorkMergeMatrixImpact(survivorId: string, mergedId: string): Promise<WorkMergeMatrixImpact>;
  mergeWorks(draft: WorkMergeDraft): Promise<MergeRecord | null>;
  getMergeRecord(id: string): Promise<MergeRecord | null>;
  revertMerge(id: string): Promise<MergeRecord | null>;

  exportCanonicalSnapshot(exportedAt: string): Promise<CanonicalResearchLibrary>;
  createExportJob(draft: ExportJobDraft): Promise<ExportJobRecord>;
  getExportJob(id: string): Promise<ExportJobRecord | null>;
  updateExportJob(id: string, changes: ExportJobChanges): Promise<ExportJobRecord | null>;
  createManagedRootMigrationJob(
    draft: ManagedRootMigrationJobDraft,
  ): Promise<ManagedRootMigrationJobRecord>;
  getManagedRootMigrationJob(id: string): Promise<ManagedRootMigrationJobRecord | null>;
  getLatestManagedRootMigrationJob(): Promise<ManagedRootMigrationJobRecord | null>;
  updateManagedRootMigrationJob(
    id: string,
    changes: ManagedRootMigrationJobChanges,
  ): Promise<ManagedRootMigrationJobRecord | null>;
}
