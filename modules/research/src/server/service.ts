import { randomUUID } from 'node:crypto';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { conflict, invalid, notFound } from '@workbench/http-kit';
import {
  ATTACHMENT_ROLES,
  RESEARCH_ERROR_CODES,
  WORK_TYPES,
  researchSearchAstSchema,
  type AddLocalAttachmentInput,
  type BulkWorkActionInput,
  type ConfirmImportInput,
  type CreateSavedQueryInput,
  type CreateTagInput,
  type CreateManualWorkInput,
  type CreateWorkRelationInput,
  type ImportItemView,
  type ImportSessionView,
  type ManagedRootMigrationJob,
  type InspectImportInput,
  type MergeTagsInput,
  type MergeWorksInput,
  portableExportJobSchema,
  startPortableExportInputSchema,
  type PortableExportJob,
  type PortableExportPreviewInput,
  type StartPortableExportInput,
  type StartManagedRootMigrationInput,
  type ResearchErrorCode,
  type ResearchSearchAst,
  type StructuredSearchInput,
  type UpdateCollectionInput,
  type UpdateWorkMetadataInput,
  type UpdateTagInput,
  type WorkDetailView,
  type WorkView,
} from '../contract.js';
import {
  FileLifecycleError,
  ResearchContentStore,
  type QuarantinedManagedObject,
} from '../files/content-store.js';
import { buildLocalMetadata } from '../ingest/metadata.js';
import { normalizeArxivId, normalizeDoi } from '../ingest/identifiers.js';
import { PdfExtractionError, extractPdfMetadata } from '../ingest/pdf-extractor.js';
import { previewPortableExport, writePortableExport } from '../interop/portable-export.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import type { MetadataLookupResult, ProviderResult } from '../metadata/types.js';
import type { PdfFilePicker } from './file-picker.js';
import type {
  CollectionRecord,
  CommitImportResult,
  DeletionImpact,
  AttachmentDeletionImpact,
  ExportJobRecord,
  ImportItemRecord,
  ListWorksQuery,
  ManagedRootController,
  ManagedRootMigrationJobRecord,
  MetadataAssertionDraft,
  MergeRecord,
  ResearchRepository,
  TagSummaryRecord,
  WorkListRecord,
} from './repository.js';

interface StoredExternalCandidate {
  provider: 'crossref' | 'datacite' | 'arxiv' | 'openalex';
  matchKind: 'exact' | 'candidate';
  sourceLocator: string;
  title: string | null;
  authors: string[];
  year: number | null;
  type: (typeof WORK_TYPES)[number];
  publicationTitle: string | null;
  publisher: string | null;
  abstract: string | null;
  identifiers: Array<{ scheme: 'doi' | 'arxiv' | 'isbn' | 'issn' | 'pmid' | 'url'; value: string }>;
  sourceRecordId: string | null;
}

interface InspectionPayload {
  asset: {
    id: string;
    contentHash: string;
    byteSize: number;
    mimeType: string;
  } | null;
  localSuggestions: Array<{
    fieldName: string;
    value: unknown;
    sourceKind: 'embedded-pdf' | 'first-page' | 'filename';
    sourceRecordId: string | null;
  }>;
  identifiers: Array<{
    scheme: 'doi' | 'arxiv';
    value: string;
    normalizedValue: string;
    sourceKind: 'embedded-pdf' | 'first-page';
    sourceRecordId: string | null;
  }>;
  externalCandidates: StoredExternalCandidate[];
  exactAssetUsages: Array<{
    workId: string;
    editionId: string;
    attachmentId: string;
    role: (typeof ATTACHMENT_ROLES)[number];
  }>;
  identifierMatches: Array<{
    workId: string;
    editionId: string;
    scheme: 'doi' | 'arxiv' | 'isbn' | 'issn' | 'pmid' | 'url';
    value: string;
  }>;
  warnings: string[];
  disclosure: MetadataLookupResult['disclosure'];
  externalAttempted: boolean;
}

interface DeletionToken {
  workId: string;
  fingerprint: string;
  expiresAt: number;
}

interface AttachmentDeletionToken {
  attachmentId: string;
  fingerprint: string;
  expiresAt: number;
}

const MANAGED_UPLOAD_PREFIX = 'managed-upload:';

function safeDisplayName(fileName: string): string {
  return fileName.split(/[\\/]/).at(-1)?.trim() || 'uploaded.pdf';
}

export interface ResearchServiceDependencies {
  repository: ResearchRepository;
  contentStore: ResearchContentStore;
  metadata: MetadataCoordinator;
  filePicker: PdfFilePicker;
  managedRootController?: ManagedRootController;
  clock?: () => Date;
  createId?: () => string;
}

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isPathInside(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return (
    offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))
  );
}

function toManagedRootMigrationJob(record: ManagedRootMigrationJobRecord): ManagedRootMigrationJob {
  return {
    id: record.id,
    status: record.status,
    sourceRoot: record.sourceRoot,
    targetRoot: record.targetRoot,
    totalObjects: record.totalObjects,
    copiedObjects: record.copiedObjects,
    totalBytes: record.totalBytes,
    copiedBytes: record.copiedBytes,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

function normalizeTagName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function tagSimilarity(
  requested: string,
  candidate: string,
): { score: number; reason: 'exact-normalized' | 'prefix' | 'edit-distance' | 'token-overlap' } {
  if (requested === candidate) return { score: 1, reason: 'exact-normalized' };
  if (requested.startsWith(candidate) || candidate.startsWith(requested)) {
    return {
      score:
        0.8 +
        (0.15 * Math.min(requested.length, candidate.length)) /
          Math.max(requested.length, candidate.length),
      reason: 'prefix',
    };
  }
  const requestedTokens = new Set(requested.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const candidateTokens = new Set(candidate.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const intersection = [...requestedTokens].filter((token) => candidateTokens.has(token)).length;
  const union = new Set([...requestedTokens, ...candidateTokens]).size;
  const tokenScore = union === 0 ? 0 : intersection / union;
  const distanceScore =
    1 - editDistance(requested, candidate) / Math.max(requested.length, candidate.length, 1);
  return tokenScore > distanceScore
    ? { score: tokenScore, reason: 'token-overlap' }
    : { score: Math.max(0, distanceScore), reason: 'edit-distance' };
}

function normalizeIdentifierValue(scheme: string, value: string): string | null {
  if (scheme === 'doi') return normalizeDoi(value);
  if (scheme === 'arxiv') return normalizeArxivId(value);
  const normalized = value.trim().toLocaleLowerCase();
  return normalized || null;
}

function throwIfInspectionCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new FileLifecycleError('导入识别已取消', 'IMPORT_CANCELLED', 'inspect', false, 'ABORT_ERR');
}

function toImportView(record: ImportItemRecord): ImportItemView {
  const code = RESEARCH_ERROR_CODES.includes(record.errorCode as ResearchErrorCode)
    ? (record.errorCode as ResearchErrorCode)
    : 'FILE_IO';
  return {
    id: record.id,
    sessionId: record.sessionId,
    fileName: record.fileName,
    storageMode: record.storageMode,
    stage: record.stage,
    assetId: record.assetId,
    workId: record.workId,
    editionId: record.editionId,
    hasDecision: record.decisionJson !== null,
    error:
      record.errorCode === null
        ? null
        : {
            code,
            stage: record.stage,
            retryable: record.retryable,
            message: record.errorDetail ?? record.errorCode,
          },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toImportSessionView(record: {
  id: string;
  status: ImportSessionView['status'];
  items: ImportItemRecord[];
  createdAt: string;
  updatedAt: string;
}): ImportSessionView {
  return {
    id: record.id,
    status: record.status,
    items: record.items.map(toImportView),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parsePayload(item: ImportItemRecord): InspectionPayload {
  if (!item.candidateJson) throw conflict('导入条目尚未完成识别');
  try {
    const parsed = JSON.parse(item.candidateJson) as InspectionPayload;
    return {
      ...parsed,
      asset: parsed.asset ?? null,
      localSuggestions: parsed.localSuggestions.map((suggestion) => ({
        ...suggestion,
        sourceRecordId: suggestion.sourceRecordId ?? null,
      })),
      identifiers: parsed.identifiers.map((identifier) => ({
        ...identifier,
        sourceKind: identifier.sourceKind ?? 'first-page',
        sourceRecordId: identifier.sourceRecordId ?? null,
      })),
      externalAttempted: parsed.externalAttempted ?? parsed.disclosure.services.length > 0,
    };
  } catch {
    throw conflict('导入识别结果已损坏，请重新识别');
  }
}

function toWorkView(record: WorkListRecord): WorkView {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    abstract: record.abstract,
    year: record.year,
    status: record.status,
    preferredEditionId: record.preferredEditionId,
    authors: record.authors,
    attachmentCount: record.attachmentCount,
    collectionIds: record.collectionIds,
    storageModes: record.storageModes,
    fileStatus: record.fileStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    trashedAt: record.trashedAt,
    revision: record.revision,
    searchScore: record.searchScore,
    matchedFields: record.matchedFields,
  };
}

function toTagView(record: TagSummaryRecord) {
  return {
    id: record.id,
    name: record.name,
    aliases: record.aliases,
    color: record.color,
    description: record.description,
    usageCount: record.usageCount,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    trashedAt: record.trashedAt,
  };
}

function toMergeRecordView(record: MergeRecord) {
  return {
    id: record.id,
    entityType: record.entityType,
    survivorId: record.survivorId,
    mergedId: record.mergedId,
    status: record.status,
    createdAt: record.createdAt,
    revertedAt: record.revertedAt,
  };
}

function deletionFingerprint(impact: DeletionImpact): string {
  return JSON.stringify({
    workId: impact.workId,
    attachmentCount: impact.attachmentCount,
    linkedLocationCount: impact.linkedLocationCount,
    evidenceCount: impact.evidenceCount,
    removableManagedAssets: impact.removableManagedAssets,
  });
}

function attachmentDeletionFingerprint(impact: AttachmentDeletionImpact): string {
  return JSON.stringify({
    attachmentId: impact.attachmentId,
    assetId: impact.assetId,
    otherAttachmentCount: impact.otherAttachmentCount,
    linkedLocationCount: impact.linkedLocationCount,
    orphanedAssetId: impact.orphanedAssetId,
    evidenceCount: impact.evidenceCount,
    removableManagedAsset: impact.removableManagedAsset,
  });
}

interface StoredExportState {
  progress: PortableExportJob['progress'];
  report: PortableExportJob['report'];
}

function initialExportState(): StoredExportState {
  return {
    progress: {
      phase: 'snapshot',
      completedAssets: 0,
      totalAssets: 0,
      copiedBytes: 0,
      totalBytes: 0,
    },
    report: null,
  };
}

function toExportJobView(record: ExportJobRecord): PortableExportJob {
  const options = startPortableExportInputSchema.parse(JSON.parse(record.optionsJson));
  const state = record.manifestJson
    ? (JSON.parse(record.manifestJson) as StoredExportState)
    : initialExportState();
  return portableExportJobSchema.parse({
    id: record.id,
    status: record.status,
    options,
    targetPath: record.targetPath,
    progress: state.progress,
    report: state.report,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  });
}

export class ResearchService {
  private readonly repository: ResearchRepository;
  private readonly contentStore: ResearchContentStore;
  private readonly metadata: MetadataCoordinator;
  private readonly filePicker: PdfFilePicker;
  private readonly managedRootController: ManagedRootController | null;
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly deletionTokens = new Map<string, DeletionToken>();
  private readonly attachmentDeletionTokens = new Map<string, AttachmentDeletionToken>();
  private readonly inspectionJobs = new Map<
    string,
    { controller: AbortController; promise: Promise<unknown> }
  >();
  private readonly exportJobs = new Map<string, AbortController>();
  private readonly managedRootMigrationJobs = new Map<
    string,
    { controller: AbortController; promise: Promise<void> }
  >();
  private managedRootMigrationActive = false;
  private activeManagedStorageOperations = 0;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(dependencies: ResearchServiceDependencies) {
    this.repository = dependencies.repository;
    this.contentStore = dependencies.contentStore;
    this.metadata = dependencies.metadata;
    this.filePicker = dependencies.filePicker;
    this.managedRootController = dependencies.managedRootController ?? null;
    this.clock = dependencies.clock ?? (() => new Date());
    this.createId = dependencies.createId ?? randomUUID;
  }

  private instant(): string {
    return this.clock().toISOString();
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async withManagedStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.managedRootMigrationActive) {
      throw conflict('托管附件库正在迁移，请等待完成或取消后重试');
    }
    this.activeManagedStorageOperations += 1;
    try {
      return await operation();
    } finally {
      this.activeManagedStorageOperations -= 1;
    }
  }

  async pickFiles(initialDir?: string, multiple = false) {
    const paths = await this.filePicker.pick({ initialDir, multiple });
    return { paths, cancelled: paths.length === 0 };
  }

  private async createImportSession(input: {
    files: Array<{ path: string; storageMode: 'managed' | 'linked'; fileName?: string }>;
    requestId: string;
  }) {
    return this.repository.createImportSession({
      id: this.createId(),
      requestId: input.requestId,
      items: input.files.map((file) => ({
        id: this.createId(),
        fileName: file.fileName ?? basename(file.path),
        sourcePath: file.path,
        storageMode: file.storageMode,
      })),
    });
  }

  async prepareImport(input: {
    files: Array<{ path: string; storageMode: 'managed' | 'linked'; fileName?: string }>;
    requestId: string;
  }) {
    return toImportSessionView(await this.createImportSession(input));
  }

  async prepareManagedUpload(
    chunks: AsyncIterable<Uint8Array>,
    fileName: string,
    requestId: string,
  ) {
    return this.withManagedStorageOperation(async () => {
      const staged = await this.contentStore.stageManagedUpload(chunks);
      try {
        const sourcePath = `${MANAGED_UPLOAD_PREFIX}${staged.path}`;
        const session = await this.createImportSession({
          files: [
            {
              path: sourcePath,
              storageMode: 'managed',
              fileName: safeDisplayName(fileName),
            },
          ],
          requestId,
        });
        if (!session.items.some((item) => item.sourcePath === sourcePath)) {
          await this.contentStore.discardStagedUpload(staged.path);
        }
        return toImportSessionView(session);
      } catch (error) {
        await this.contentStore.discardStagedUpload(staged.path);
        throw error;
      }
    });
  }

  async getImportSession(id: string): Promise<ImportSessionView> {
    const session = await this.repository.getImportSession(id);
    if (!session) throw notFound('导入会话不存在');
    return toImportSessionView(session);
  }

  async listImportSessions(status: ImportSessionView['status'] | undefined, limit: number) {
    const sessions = await this.repository.listImportSessions(status, limit);
    return { sessions: sessions.map(toImportSessionView) };
  }

  private async persistSources(sources: ProviderResult[]): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const source of sources) {
      const id = this.createId();
      await this.repository.recordSource({
        id,
        provider: source.provider,
        sourceLocator: source.sourceLocator,
        rawFormat: source.rawFormat,
        rawPayload: source.rawPayload,
        parserVersion: 'research-metadata-v1',
        observedAt: this.instant(),
      });
      ids.set(`${source.provider}\0${source.sourceLocator}`, id);
    }
    return ids;
  }

  private async addExternalMetadata(
    payload: InspectionPayload,
    forceRefresh: boolean,
  ): Promise<InspectionPayload> {
    const doi = payload.identifiers.find((identifier) => identifier.scheme === 'doi');
    const arxiv = payload.identifiers.find((identifier) => identifier.scheme === 'arxiv');
    const title = payload.localSuggestions.find((suggestion) => suggestion.fieldName === 'title');
    const authors = payload.localSuggestions.find(
      (suggestion) => suggestion.fieldName === 'authors',
    );
    const external = await this.metadata.resolve({
      doi: doi?.normalizedValue,
      arxivId: arxiv?.normalizedValue,
      ...(!doi && !arxiv && typeof title?.value === 'string'
        ? {
            fallback: {
              title: title.value,
              ...(Array.isArray(authors?.value) && typeof authors.value[0] === 'string'
                ? { author: authors.value[0] }
                : {}),
            },
          }
        : {}),
      forceRefresh,
    });
    const sourceIds = await this.persistSources(external.sources);
    const externalCandidates = external.candidates.map((candidate): StoredExternalCandidate => ({
      provider: candidate.provider,
      matchKind: candidate.matchKind,
      sourceLocator: candidate.sourceLocator,
      title: candidate.title,
      authors: candidate.authors,
      year: candidate.year,
      type: candidate.type,
      publicationTitle: candidate.publicationTitle,
      publisher: candidate.publisher,
      abstract: candidate.abstract,
      identifiers: candidate.identifiers,
      sourceRecordId:
        sourceIds.get(`${candidate.provider}\0${candidate.sourceLocator}`) ??
        [...sourceIds.entries()].find(([key]) => key.startsWith(`${candidate.provider}\0`))?.[1] ??
        null,
    }));
    return {
      ...payload,
      externalCandidates,
      warnings: [
        ...new Set([
          ...payload.warnings,
          ...external.diagnostics
            .filter((diagnostic) => diagnostic.status === 'transient-failure')
            .map((diagnostic) => `${diagnostic.provider}: ${diagnostic.message ?? '查询失败'}`),
        ]),
      ],
      disclosure: external.disclosure,
      externalAttempted: true,
    };
  }

  private async addExternalMetadataSafely(
    payload: InspectionPayload,
    forceRefresh: boolean,
  ): Promise<InspectionPayload> {
    try {
      return await this.addExternalMetadata(payload, forceRefresh);
    } catch (error) {
      return {
        ...payload,
        warnings: [
          ...new Set([
            ...payload.warnings,
            `外部元数据查询失败：${error instanceof Error ? error.message : String(error)}`,
          ]),
        ],
        externalAttempted: true,
      };
    }
  }

  private async inspectItem(
    item: ImportItemRecord,
    input: InspectImportInput,
    signal?: AbortSignal,
  ): Promise<InspectionPayload> {
    throwIfInspectionCancelled(signal);
    if (item.candidateJson) {
      const existing = parsePayload(item);
      if (!input.allowExternal || (existing.externalAttempted && !input.forceRefresh)) {
        return existing;
      }
      const refreshed = await this.addExternalMetadataSafely(existing, input.forceRefresh);
      throwIfInspectionCancelled(signal);
      await this.repository.updateImportItem(item.id, {
        stage: 'awaiting-confirmation',
        candidateJson: JSON.stringify(refreshed),
        errorCode: null,
        errorDetail: null,
        retryable: false,
      });
      return refreshed;
    }
    await this.repository.updateImportItem(item.id, {
      stage: 'hashing',
      errorCode: null,
      errorDetail: null,
      retryable: false,
    });
    try {
      const stagedUploadPath = item.sourcePath.startsWith(MANAGED_UPLOAD_PREFIX)
        ? item.sourcePath.slice(MANAGED_UPLOAD_PREFIX.length)
        : null;
      const sourcePath = stagedUploadPath ?? item.sourcePath;
      const asset =
        item.storageMode === 'managed'
          ? await this.withManagedStorageOperation(async () => {
              const stored = await this.contentStore
                .ingestManaged(sourcePath, { signal })
                .finally(() =>
                  stagedUploadPath
                    ? this.contentStore.discardStagedUpload(stagedUploadPath)
                    : undefined,
                );
              return this.repository.storeAsset(
                {
                  id: this.createId(),
                  contentHash: stored.contentHash,
                  byteSize: stored.byteSize,
                  mimeType: stored.mimeType,
                },
                {
                  id: this.createId(),
                  mode: 'managed',
                  originalPath: stored.originalPath,
                  resolvedPath: stored.objectPath,
                  objectKey: stored.objectKey,
                  state: 'available',
                  deviceId: stored.sourceIdentity.deviceId,
                  fileId: stored.sourceIdentity.fileId,
                  observedSize: stored.byteSize,
                  observedMtimeMs: stored.sourceIdentity.mtimeMs,
                  lastCheckedAt: this.instant(),
                },
              );
            })
          : await (async () => {
              const stored = await this.contentStore.inspectLinked(sourcePath, { signal });
              return this.repository.storeAsset(
                {
                  id: this.createId(),
                  contentHash: stored.contentHash,
                  byteSize: stored.byteSize,
                  mimeType: stored.mimeType,
                },
                {
                  id: this.createId(),
                  mode: 'linked',
                  originalPath: stored.originalPath,
                  resolvedPath: stored.resolvedPath,
                  objectKey: null,
                  state: 'available',
                  deviceId: stored.sourceIdentity.deviceId,
                  fileId: stored.sourceIdentity.fileId,
                  observedSize: stored.byteSize,
                  observedMtimeMs: stored.sourceIdentity.mtimeMs,
                  lastCheckedAt: this.instant(),
                },
              );
            })();
      await this.repository.updateImportItem(item.id, {
        stage: item.storageMode === 'managed' ? 'object-ready' : 'linked-verified',
        assetId: asset.asset.id,
      });

      const parsePath = asset.location.resolvedPath;
      let extraction = null;
      let extractionWarning: string | undefined;
      try {
        extraction = await extractPdfMetadata(parsePath, { signal });
      } catch (error) {
        if (error instanceof PdfExtractionError && error.code === 'IMPORT_CANCELLED') throw error;
        if (error instanceof PdfExtractionError) extractionWarning = error.message;
        else throw error;
      }
      const local = buildLocalMetadata(item.fileName, extraction, extractionWarning);
      const localSourceId = this.createId();
      await this.repository.recordSource({
        id: localSourceId,
        provider: 'local-pdf',
        sourceLocator: `asset:${asset.asset.id}`,
        rawFormat: 'json',
        rawPayload: JSON.stringify({ fileName: item.fileName, extraction, extractionWarning }),
        parserVersion: 'pdfjs-dist@6.2.108/local-v1',
        observedAt: this.instant(),
      });
      const exactAssetUsages = await this.repository.findAssetUsages(asset.asset.id);
      const identifierMatches = (
        await Promise.all(
          local.identifiers.map((identifier) =>
            this.repository.findIdentifierMatches(identifier.scheme, identifier.normalizedValue),
          ),
        )
      )
        .flat()
        .map((match) => ({
          workId: match.workId,
          editionId: match.editionId,
          scheme: match.identifier.scheme,
          value: match.identifier.value,
        }))
        .filter(
          (match, index, values) =>
            values.findIndex(
              (value) =>
                value.workId === match.workId &&
                value.editionId === match.editionId &&
                value.scheme === match.scheme &&
                value.value === match.value,
            ) === index,
        );

      let payload: InspectionPayload = {
        asset: {
          id: asset.asset.id,
          contentHash: asset.asset.contentHash,
          byteSize: asset.asset.byteSize,
          mimeType: asset.asset.mimeType,
        },
        localSuggestions: local.suggestions.map((suggestion) => ({
          ...suggestion,
          sourceRecordId: localSourceId,
        })),
        identifiers: local.identifiers.map(({ scheme, value, normalizedValue, sourceKind }) => ({
          scheme,
          value,
          normalizedValue,
          sourceKind,
          sourceRecordId: localSourceId,
        })),
        externalCandidates: [],
        exactAssetUsages,
        identifierMatches,
        warnings: [...local.warnings],
        disclosure: { services: [], sentFields: [], sendsPdf: false },
        externalAttempted: false,
      };
      if (input.allowExternal) {
        payload = await this.addExternalMetadataSafely(payload, input.forceRefresh);
      }
      throwIfInspectionCancelled(signal);
      await this.repository.updateImportItem(item.id, {
        stage: 'awaiting-confirmation',
        assetId: asset.asset.id,
        candidateJson: JSON.stringify(payload),
      });
      return payload;
    } catch (error) {
      const known = error instanceof FileLifecycleError ? error : null;
      const cancelled =
        (error instanceof PdfExtractionError && error.code === 'IMPORT_CANCELLED') ||
        known?.code === 'IMPORT_CANCELLED';
      await this.repository.updateImportItem(item.id, {
        stage: cancelled ? 'cancelled' : 'failed',
        errorCode: known?.code ?? (cancelled ? 'IMPORT_CANCELLED' : 'FILE_IO'),
        errorDetail: error instanceof Error ? error.message : String(error),
        retryable: cancelled ? false : (known?.retryable ?? true),
      });
      throw error;
    }
  }

  private failedInspectionPayload(item: ImportItemRecord): InspectionPayload {
    return {
      asset: null,
      localSuggestions: [],
      identifiers: [],
      externalCandidates: [],
      exactAssetUsages: [],
      identifierMatches: [],
      warnings: [item.errorDetail ?? '导入尚未完成识别'],
      disclosure: { services: [], sentFields: [], sendsPdf: false },
      externalAttempted: false,
    };
  }

  async getImportInspection(sessionId: string) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    const results = session.items.map((item) => {
      if (!item.candidateJson) return { item, payload: this.failedInspectionPayload(item) };
      try {
        return { item, payload: parsePayload(item) };
      } catch (error) {
        return {
          item,
          payload: {
            ...this.failedInspectionPayload(item),
            warnings: [error instanceof Error ? error.message : String(error)],
          },
        };
      }
    });
    const services = new Set<MetadataLookupResult['disclosure']['services'][number]>();
    const sentFields = new Set<MetadataLookupResult['disclosure']['sentFields'][number]>();
    let externalEnabled = false;
    for (const result of results) {
      result.payload.disclosure.services.forEach((value) => services.add(value));
      result.payload.disclosure.sentFields.forEach((value) => sentFields.add(value));
      externalEnabled ||= result.payload.externalAttempted;
    }
    const batchItemsByAsset = new Map<string, string[]>();
    for (const { item, payload } of results) {
      const assetId = payload.asset?.id ?? item.assetId;
      if (!assetId) continue;
      const group = batchItemsByAsset.get(assetId) ?? [];
      group.push(item.id);
      batchItemsByAsset.set(assetId, group);
    }
    return {
      sessionId,
      status: session.status,
      items: results.map(({ item, payload }) => ({
        item: toImportView(item),
        ...payload,
        batchDuplicateItemIds: (
          batchItemsByAsset.get(payload.asset?.id ?? item.assetId ?? '') ?? []
        ).filter((itemId) => itemId !== item.id),
      })),
      disclosure: {
        externalEnabled,
        services: [...services],
        sentFields: [...sentFields],
        sendsPdf: false as const,
      },
    };
  }

  private async runImportInspection(
    sessionId: string,
    input: InspectImportInput,
    signal?: AbortSignal,
  ) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    for (const original of session.items) {
      if (signal?.aborted) break;
      if (original.stage === 'available' || original.stage === 'cancelled') continue;
      try {
        await this.inspectItem(original, input, signal);
      } catch {
        // 单条失败留在导入箱，继续处理同批其他条目。
      }
    }
    const current = await this.repository.getImportSession(sessionId);
    if (current && current.status !== 'cancelled') {
      await this.repository.setImportSessionStatus(sessionId, 'awaiting-confirmation');
    }
    return this.getImportInspection(sessionId);
  }

  async inspectImport(sessionId: string, input: InspectImportInput) {
    if (this.inspectionJobs.has(sessionId)) throw conflict('该导入批次正在识别');
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    if (session.status === 'cancelled' || session.status === 'completed') {
      throw conflict('该导入批次已经结束');
    }
    await this.repository.setImportSessionStatus(sessionId, 'inspecting');
    return this.runImportInspection(sessionId, input);
  }

  async startImportInspection(sessionId: string, input: InspectImportInput) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    if (this.inspectionJobs.has(sessionId)) return toImportSessionView(session);
    if (session.status === 'cancelled' || session.status === 'completed') {
      throw conflict('该导入批次已经结束');
    }
    await this.repository.setImportSessionStatus(sessionId, 'inspecting');
    const controller = new AbortController();
    const promise = this.runImportInspection(sessionId, input, controller.signal).finally(() => {
      this.inspectionJobs.delete(sessionId);
    });
    this.inspectionJobs.set(sessionId, { controller, promise });
    void promise.catch(async () => {
      const current = await this.repository.getImportSession(sessionId);
      if (current?.status !== 'cancelled') {
        await this.repository.setImportSessionStatus(sessionId, 'failed');
      }
    });
    return this.getImportSession(sessionId);
  }

  async retryImportItem(sessionId: string, itemId: string, input: InspectImportInput) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    const item = session.items.find((value) => value.id === itemId);
    if (!item) throw notFound('导入条目不存在');
    if (item.stage !== 'failed' || !item.retryable) throw conflict('该导入条目不能重试');
    const reset = await this.repository.updateImportItem(item.id, {
      stage: 'selected',
      errorCode: null,
      errorDetail: null,
      retryable: false,
      candidateJson: null,
    });
    if (!reset) throw notFound('导入条目不存在');
    await this.inspectItem(reset, input);
    await this.repository.setImportSessionStatus(sessionId, 'awaiting-confirmation');
    return this.getImportInspection(sessionId);
  }

  async cancelImportSession(sessionId: string) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    if (session.status === 'completed') throw conflict('已完成的导入批次不能取消');
    if (session.status === 'cancelled') return toImportSessionView(session);
    this.inspectionJobs.get(sessionId)?.controller.abort();
    for (const item of session.items) {
      if (!item.sourcePath.startsWith(MANAGED_UPLOAD_PREFIX)) continue;
      await this.contentStore
        .discardStagedUpload(item.sourcePath.slice(MANAGED_UPLOAD_PREFIX.length))
        .catch(() => undefined);
    }
    const cancelled = await this.repository.cancelImportSession(sessionId);
    if (!cancelled) throw notFound('导入会话不存在');
    return toImportSessionView(cancelled);
  }

  async saveImportDecision(sessionId: string, itemId: string, input: ConfirmImportInput) {
    if (input.itemId !== itemId) throw invalid('条目 ID 与决定不一致');
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    const item = session.items.find((value) => value.id === itemId);
    if (!item) throw notFound('导入条目不存在');
    if (item.stage !== 'awaiting-confirmation') throw conflict('该条目尚不能保存决定');
    await this.repository.updateImportItem(itemId, {
      decisionJson: JSON.stringify({ state: 'pending', input }),
      errorCode: null,
      errorDetail: null,
      retryable: false,
    });
    return this.getImportSession(sessionId);
  }

  async commitImportSession(sessionId: string) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    if (session.status === 'cancelled') throw conflict('该导入批次已经取消');
    if (session.status === 'inspecting' || this.inspectionJobs.has(sessionId)) {
      throw conflict('导入识别仍在进行');
    }
    await this.repository.setImportSessionStatus(sessionId, 'committing');
    const results: Array<{
      itemId: string;
      status: 'committed' | 'discarded' | 'failed';
      workId: string | null;
      message: string | null;
    }> = [];
    for (const item of session.items) {
      if (!item.decisionJson || item.stage !== 'awaiting-confirmation') continue;
      try {
        const saved = JSON.parse(item.decisionJson) as {
          state?: unknown;
          input?: ConfirmImportInput;
        };
        if (saved.state !== 'pending' || !saved.input) throw new Error('保存的决定无效');
        const committed = await this.confirmImport(sessionId, saved.input);
        if ('discarded' in committed) {
          results.push({ itemId: item.id, status: 'discarded', workId: null, message: null });
        } else if ('deferred' in committed) {
          continue;
        } else {
          results.push({
            itemId: item.id,
            status: 'committed',
            workId: committed.workId,
            message: null,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.repository.updateImportItem(item.id, {
          stage: 'awaiting-confirmation',
          errorCode: 'CONFLICT',
          errorDetail: message,
          retryable: true,
        });
        results.push({ itemId: item.id, status: 'failed', workId: null, message });
      }
    }
    const current = await this.repository.getImportSession(sessionId);
    if (!current) throw notFound('导入会话不存在');
    const complete = current.items.every(
      (item) => item.stage === 'available' || item.stage === 'cancelled',
    );
    await this.repository.setImportSessionStatus(
      sessionId,
      complete ? 'completed' : 'awaiting-confirmation',
    );
    return { session: await this.getImportSession(sessionId), results };
  }

  async confirmImport(
    sessionId: string,
    input: ConfirmImportInput,
  ): Promise<CommitImportResult | { deferred: true } | { discarded: true }> {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    const item = session.items.find((value) => value.id === input.itemId);
    if (!item) throw notFound('导入条目不存在');
    await this.assertManualCollections(input.collectionIds);
    if (input.duplicateDecision === 'defer') return { deferred: true };
    if (input.duplicateDecision === 'discard') {
      await this.repository.updateImportItem(item.id, { stage: 'cancelled' });
      const current = await this.repository.getImportSession(sessionId);
      if (
        current?.items.every(
          (currentItem) => currentItem.stage === 'available' || currentItem.stage === 'cancelled',
        )
      ) {
        await this.repository.setImportSessionStatus(sessionId, 'completed');
      }
      return { discarded: true };
    }
    if (!item.assetId) throw conflict('文件尚未完成安全存储');
    const payload = parsePayload(item);
    if (input.duplicateDecision === 'existing-edition' && !input.targetEditionId) {
      throw invalid('选择现有版本时必须提供 targetEditionId');
    }
    if (input.duplicateDecision === 'new-edition' && !input.targetWorkId) {
      throw invalid('创建新版本时必须提供 targetWorkId');
    }

    const titleField = input.fields.title;
    const title = typeof titleField?.value === 'string' ? titleField.value.trim() : '';
    const typeValue = input.fields.type?.value;
    const type = WORK_TYPES.includes(typeValue as (typeof WORK_TYPES)[number])
      ? (typeValue as (typeof WORK_TYPES)[number])
      : 'unknown';
    const yearValue = input.fields.year?.value;
    const year = typeof yearValue === 'number' && Number.isInteger(yearValue) ? yearValue : null;
    const authorsValue = input.fields.authors?.value;
    const authors = Array.isArray(authorsValue)
      ? authorsValue.filter(
          (value): value is string => typeof value === 'string' && value.trim() !== '',
        )
      : [];
    let workId: string;
    let editionId: string;
    if (input.duplicateDecision === 'existing-edition') {
      const existingEdition = await this.repository.getEdition(input.targetEditionId!);
      if (!existingEdition) throw notFound('目标版本不存在');
      if (input.targetWorkId && input.targetWorkId !== existingEdition.workId) {
        throw invalid('目标作品与目标版本不匹配');
      }
      workId = existingEdition.workId;
      editionId = existingEdition.id;
    } else if (input.duplicateDecision === 'new-edition') {
      if (!(await this.repository.getWork(input.targetWorkId!))) throw notFound('目标作品不存在');
      workId = input.targetWorkId!;
      editionId = this.createId();
    } else {
      workId = this.createId();
      editionId = this.createId();
    }
    const assertions: Array<Omit<MetadataAssertionDraft, 'entityId'>> = Object.entries(
      input.fields,
    ).map(([fieldName, field]) => ({
      id: this.createId(),
      entityType: ['publicationTitle', 'publisher', 'publishedDate'].includes(fieldName)
        ? 'edition'
        : 'work',
      fieldName,
      value: field.value,
      normalizedValue: typeof field.value === 'string' ? field.value.trim().toLowerCase() : null,
      sourceKind: field.sourceKind,
      sourceRecordId: field.sourceRecordId ?? null,
      observedAt: this.instant(),
      isUserConfirmed: true,
    }));
    const identifiers = new Map<
      string,
      {
        scheme: 'doi' | 'arxiv';
        value: string;
        normalizedValue: string;
        sourceRecordId: string | null;
      }
    >();
    for (const identifier of payload.identifiers) {
      identifiers.set(`${identifier.scheme}:${identifier.normalizedValue}`, identifier);
    }
    const selectedSourceIds = new Set(
      Object.values(input.fields)
        .map((field) => field.sourceRecordId)
        .filter((value): value is string => typeof value === 'string'),
    );
    for (const candidate of payload.externalCandidates) {
      if (!candidate.sourceRecordId || !selectedSourceIds.has(candidate.sourceRecordId)) continue;
      for (const identifier of candidate.identifiers) {
        const normalizedValue =
          identifier.scheme === 'doi'
            ? normalizeDoi(identifier.value)
            : identifier.scheme === 'arxiv'
              ? normalizeArxivId(identifier.value)
              : identifier.value.trim().toLowerCase();
        if (!normalizedValue) continue;
        if (identifier.scheme === 'doi' || identifier.scheme === 'arxiv') {
          identifiers.set(`${identifier.scheme}:${normalizedValue}`, {
            scheme: identifier.scheme,
            value: identifier.value,
            normalizedValue,
            sourceRecordId: candidate.sourceRecordId,
          });
        }
      }
    }

    return this.repository.commitImport({
      importItemId: item.id,
      work:
        input.duplicateDecision === 'new-work'
          ? {
              kind: 'new',
              value: { id: workId, type, title, titleSort: normalizeTitle(title), year },
            }
          : { kind: 'existing', id: workId },
      edition:
        input.duplicateDecision === 'existing-edition'
          ? { kind: 'existing', id: editionId }
          : {
              kind: 'new',
              value: {
                id: editionId,
                kind: type === 'preprint' ? 'preprint' : 'unknown',
                title,
                publicationTitle:
                  typeof input.fields.publicationTitle?.value === 'string'
                    ? input.fields.publicationTitle.value
                    : null,
                publisher:
                  typeof input.fields.publisher?.value === 'string'
                    ? input.fields.publisher.value
                    : null,
              },
            },
      attachment: {
        id: this.createId(),
        assetId: item.assetId,
        role: input.attachmentRole ?? 'primary-pdf',
        displayName: item.fileName,
      },
      contributors: authors.map((displayName, sequence) => ({
        id: this.createId(),
        displayName,
        sequence,
      })),
      identifiers: [...identifiers.values()].map((identifier) => ({
        id: this.createId(),
        entityType: 'edition',
        scheme: identifier.scheme,
        value: identifier.value,
        normalizedValue: identifier.normalizedValue,
        sourceRecordId: identifier.sourceRecordId,
      })),
      assertions,
      collections: input.collectionIds.map((collectionId) => ({
        entryId: this.createId(),
        collectionId,
      })),
      decisionJson: JSON.stringify({
        decision: input.duplicateDecision,
        requestId: input.requestId,
      }),
    });
  }

  private searchQuery(
    ast: ResearchSearchAst,
    cursor: string | null,
    limit: number,
  ): ListWorksQuery {
    return {
      status: 'active',
      systemView: 'all',
      query: ast.text || undefined,
      collectionIds: ast.filters.collectionIds,
      tagIds: ast.filters.tagIds,
      types: ast.filters.types,
      yearFrom: ast.filters.yearFrom,
      yearTo: ast.filters.yearTo,
      attachmentRoles: ast.filters.attachmentRoles,
      storageModes: ast.filters.storageModes,
      fileStatuses: ast.filters.fileStatuses,
      maintenance: ast.filters.maintenance,
      relatedWorkId: ast.filters.relatedWorkId,
      sort: ast.sort,
      cursor,
      limit,
    };
  }

  async listWorks(query: Parameters<ResearchRepository['listWorks']>[0]) {
    let repositoryQuery = query;
    if (query.collectionId) {
      const collection = await this.repository.getCollection(query.collectionId);
      if (collection?.kind === 'smart') {
        let raw: unknown;
        try {
          raw = collection.queryJson ? JSON.parse(collection.queryJson) : null;
        } catch {
          throw conflict('保存查询内容已损坏');
        }
        const parsed = researchSearchAstSchema.safeParse(raw);
        if (!parsed.success) throw conflict('保存查询版本不受支持，无法作为普通目录执行');
        repositoryQuery = this.searchQuery(
          {
            ...parsed.data,
            text: query.query ?? parsed.data.text,
          },
          query.cursor ?? null,
          query.limit,
        );
      }
    }
    const page = await this.repository.listWorks(repositoryQuery);
    return { works: page.works.map(toWorkView), nextCursor: page.nextCursor };
  }

  async structuredSearch(input: StructuredSearchInput) {
    const page = await this.repository.listWorks(
      this.searchQuery(input.ast, input.cursor, input.limit),
    );
    return { works: page.works.map(toWorkView), nextCursor: page.nextCursor };
  }

  async rebuildSearchIndex() {
    return { indexedWorks: await this.repository.rebuildSearchIndex() };
  }

  async getWork(id: string): Promise<WorkDetailView> {
    const listed = await this.repository.getWorkListRecord(id);
    if (!listed) throw notFound('作品不存在');
    const editions = await this.repository.listEditions(id);
    const sourceRecordIds = new Set<string>();
    const editionViews = await Promise.all(
      editions.map(async (edition) => {
        const [contributors, identifiers, attachments] = await Promise.all([
          this.repository.listContributors(edition.id),
          this.repository.listIdentifiers('edition', edition.id),
          this.repository.listAttachments(edition.id),
        ]);
        const attachmentViews = await Promise.all(
          attachments.map(async (attachment) => {
            const asset = await this.repository.getAsset(attachment.assetId);
            if (!asset) throw conflict('附件引用的 Asset 不存在');
            const locations = await this.repository.listLocationsForAsset(asset.id);
            return {
              id: attachment.id,
              editionId: edition.id,
              assetId: asset.id,
              role: attachment.role,
              displayName: attachment.displayName,
              status: attachment.status,
              asset: {
                id: asset.id,
                algorithm: 'sha256' as const,
                contentHash: asset.contentHash,
                byteSize: asset.byteSize,
                mimeType: asset.mimeType,
                state: asset.state,
                locations: locations.map((location) => ({
                  id: location.id,
                  assetId: asset.id,
                  mode: location.mode,
                  originalPath: location.originalPath,
                  resolvedPath: location.resolvedPath,
                  objectKey: location.objectKey,
                  state: location.state,
                  errorCode: location.errorCode,
                  lastCheckedAt: location.lastCheckedAt,
                })),
              },
            };
          }),
        );
        for (const identifier of identifiers) {
          if (identifier.sourceRecordId) sourceRecordIds.add(identifier.sourceRecordId);
        }
        return {
          id: edition.id,
          workId: id,
          kind: edition.kind,
          title: edition.title,
          publicationTitle: edition.publicationTitle,
          publisher: edition.publisher,
          publishedDate: edition.publishedDate,
          revision: edition.revision,
          contributors: contributors.map((contributor) => ({
            id: contributor.id,
            role: contributor.role,
            displayName: contributor.displayName,
            givenName: contributor.givenName,
            familyName: contributor.familyName,
            orcid: contributor.orcid,
            sequence: contributor.sequence,
          })),
          identifiers: identifiers.map((identifier) => ({
            scheme: identifier.scheme,
            value: identifier.value,
          })),
          attachments: attachmentViews,
        };
      }),
    );
    const assertions = [
      ...(await this.repository.listAssertions('work', id)),
      ...(
        await Promise.all(
          editions.map((edition) => this.repository.listAssertions('edition', edition.id)),
        )
      ).flat(),
    ];
    for (const assertion of assertions) {
      if (assertion.sourceRecordId) sourceRecordIds.add(assertion.sourceRecordId);
    }
    const [relationRecords, tagRecords, sources, externalMappings] = await Promise.all([
      this.repository.listWorkRelations(id),
      this.repository.listTagsForWork(id),
      this.repository.listSourceRecords([...sourceRecordIds]),
      this.repository.listExternalSourceMaps(
        id,
        editions.map((edition) => edition.id),
      ),
    ]);
    const relations = await Promise.all(
      relationRecords.map(async (relation) => {
        const direction = relation.sourceWorkId === id ? 'outgoing' : 'incoming';
        const counterpartId =
          direction === 'outgoing' ? relation.targetWorkId : relation.sourceWorkId;
        const counterpart = await this.repository.getWork(counterpartId);
        if (!counterpart) throw conflict('作品关系引用的作品不存在');
        return {
          id: relation.id,
          kind: relation.kind,
          direction,
          sourceWorkId: relation.sourceWorkId,
          targetWorkId: relation.targetWorkId,
          counterpart: {
            id: counterpart.id,
            title: counterpart.title,
            status: counterpart.status,
          },
          note: relation.note,
          createdAt: relation.createdAt,
        } as const;
      }),
    );
    return {
      work: toWorkView(listed),
      editions: editionViews,
      assertions: assertions.map((assertion) => ({
        id: assertion.id,
        entityType: assertion.entityType,
        entityId: assertion.entityId,
        fieldName: assertion.fieldName,
        value: assertion.value,
        sourceKind: assertion.sourceKind,
        sourceRecordId: assertion.sourceRecordId,
        observedAt: assertion.observedAt,
        isUserConfirmed: assertion.isUserConfirmed,
        isSelected: assertion.isSelected,
      })),
      sources: sources.map((source) => ({
        id: source.id,
        provider: source.provider,
        sourceLocator: source.sourceLocator,
        rawFormat: source.rawFormat,
        rawPayload: source.rawPayload,
        parserVersion: source.parserVersion,
        observedAt: source.observedAt,
        createdAt: source.createdAt,
      })),
      externalMappings: externalMappings.map((mapping) => ({
        id: mapping.id,
        provider: mapping.provider,
        externalId: mapping.externalId,
        entityType: mapping.entityType,
        entityId: mapping.entityId,
        lastFetchedAt: mapping.lastFetchedAt,
        cacheStatus: mapping.cacheStatus,
        cacheExpiresAt: mapping.cacheExpiresAt,
      })),
      relations,
      tags: tagRecords.map(toTagView),
    };
  }

  async updateWorkMetadata(id: string, input: UpdateWorkMetadataInput): Promise<WorkDetailView> {
    const work = await this.repository.getWork(id);
    if (!work) throw notFound('作品不存在');
    if (work.status !== 'active') throw conflict('只能编辑活动作品的元数据');
    if (work.revision !== input.expectedWorkRevision) {
      throw conflict('作品已经被其他操作修改，请刷新后重试');
    }
    let edition = null;
    if (input.edition) {
      edition = await this.repository.getEdition(input.edition.id);
      if (!edition || edition.workId !== id) throw notFound('版本不存在');
      if (edition.revision !== input.edition.expectedRevision) {
        throw conflict('版本已经被其他操作修改，请刷新后重试');
      }
    }

    const observedAt = this.instant();
    const assertion = (
      entityType: 'work' | 'edition',
      entityId: string,
      fieldName: string,
      value: unknown,
    ): MetadataAssertionDraft => ({
      id: this.createId(),
      entityType,
      entityId,
      fieldName,
      value,
      normalizedValue: typeof value === 'string' ? value.trim().toLocaleLowerCase() : null,
      sourceKind: 'user',
      sourceRecordId: null,
      observedAt,
      isUserConfirmed: true,
    });
    const assertions: MetadataAssertionDraft[] = [];
    for (const [fieldName, value] of Object.entries(input.work ?? {})) {
      assertions.push(assertion('work', id, fieldName, value));
    }
    for (const [fieldName, value] of Object.entries(input.edition ?? {})) {
      if (fieldName === 'id' || fieldName === 'expectedRevision') continue;
      assertions.push(assertion('edition', input.edition!.id, fieldName, value));
    }
    const updated = await this.repository.updateWorkMetadata({
      workId: id,
      expectedWorkRevision: input.expectedWorkRevision,
      ...(input.work
        ? {
            work: {
              ...input.work,
              ...(input.work.title !== undefined
                ? { titleSort: normalizeTitle(input.work.title) }
                : {}),
            },
          }
        : {}),
      ...(input.edition
        ? {
            edition: (() => {
              const { authors, ...fields } = input.edition;
              return {
                ...fields,
                ...(authors !== undefined
                  ? {
                      authors: authors.map((displayName, sequence) => ({
                        id: this.createId(),
                        displayName,
                        role: 'author',
                        sequence,
                      })),
                    }
                  : {}),
              };
            })(),
          }
        : {}),
      assertions,
    });
    if (!updated) throw conflict('元数据已经变化，请刷新后重试');
    return this.getWork(id);
  }

  async createManualWork(input: CreateManualWorkInput): Promise<WorkDetailView> {
    await this.assertManualCollections(input.collectionIds);
    const workId = this.createId();
    const editionId = this.createId();
    const observedAt = this.instant();
    const identifiers = input.identifiers.flatMap((identifier) => {
      const normalizedValue = normalizeIdentifierValue(identifier.scheme, identifier.value);
      return normalizedValue
        ? [
            {
              id: this.createId(),
              entityType: 'edition' as const,
              scheme: identifier.scheme,
              value: identifier.value,
              normalizedValue,
              sourceRecordId: null,
            },
          ]
        : [];
    });
    const assertion = (
      entityType: 'work' | 'edition',
      fieldName: string,
      value: unknown,
    ): Omit<MetadataAssertionDraft, 'entityId'> => ({
      id: this.createId(),
      entityType,
      fieldName,
      value,
      normalizedValue: typeof value === 'string' ? value.trim().toLocaleLowerCase() : null,
      sourceKind: 'user',
      sourceRecordId: null,
      observedAt,
      isUserConfirmed: true,
    });
    await this.repository.createManualWork({
      work: {
        id: workId,
        type: input.type,
        title: input.title,
        titleSort: normalizeTitle(input.title),
        year: input.year,
      },
      edition: {
        id: editionId,
        kind: input.editionKind,
        title: input.title,
        publicationTitle: input.publicationTitle,
        publisher: input.publisher,
      },
      contributors: input.authors.map((displayName, sequence) => ({
        id: this.createId(),
        displayName,
        sequence,
      })),
      identifiers,
      assertions: [
        assertion('work', 'title', input.title),
        assertion('work', 'type', input.type),
        ...(input.year === null ? [] : [assertion('work', 'year', input.year)]),
        ...(input.authors.length === 0 ? [] : [assertion('work', 'authors', input.authors)]),
        ...(input.publicationTitle === null
          ? []
          : [assertion('edition', 'publicationTitle', input.publicationTitle)]),
        ...(input.publisher === null ? [] : [assertion('edition', 'publisher', input.publisher)]),
      ],
      collections: input.collectionIds.map((collectionId) => ({
        entryId: this.createId(),
        collectionId,
      })),
    });
    return this.getWork(workId);
  }

  async addLocalAttachment(
    editionId: string,
    input: AddLocalAttachmentInput,
  ): Promise<WorkDetailView> {
    const operation = async () => {
      const edition = await this.repository.getEdition(editionId);
      if (!edition) throw notFound('版本不存在');
      const stored =
        input.storageMode === 'managed'
          ? input.mimeType === 'application/pdf'
            ? await this.contentStore.ingestManaged(input.path)
            : await this.contentStore.ingestManagedFile(input.path, input.mimeType)
          : input.mimeType === 'application/pdf'
            ? await this.contentStore.inspectLinked(input.path)
            : await this.contentStore.inspectLinkedFile(input.path, input.mimeType);
      const location =
        'objectPath' in stored
          ? { resolvedPath: stored.objectPath, objectKey: stored.objectKey }
          : { resolvedPath: stored.resolvedPath, objectKey: null };
      const persisted = await this.repository.storeAsset(
        {
          id: this.createId(),
          contentHash: stored.contentHash,
          byteSize: stored.byteSize,
          mimeType: stored.mimeType,
        },
        {
          id: this.createId(),
          mode: input.storageMode,
          originalPath: stored.originalPath,
          resolvedPath: location.resolvedPath,
          objectKey: location.objectKey,
          state: 'available',
          deviceId: stored.sourceIdentity.deviceId,
          fileId: stored.sourceIdentity.fileId,
          observedSize: stored.byteSize,
          observedMtimeMs: stored.sourceIdentity.mtimeMs,
          lastCheckedAt: this.instant(),
        },
      );
      await this.repository.addAttachment({
        id: this.createId(),
        editionId,
        assetId: persisted.asset.id,
        role: input.role,
        displayName: input.displayName ?? basename(input.path),
      });
      return this.getWork(edition.workId);
    };
    return input.storageMode === 'managed'
      ? this.withManagedStorageOperation(operation)
      : operation();
  }

  async listCollections() {
    const collections = await this.repository.listCollections();
    return { collections: collections.map(this.collectionView) };
  }

  private collectionView(collection: CollectionRecord) {
    let queryAst: ResearchSearchAst | null = null;
    if (collection.kind === 'smart') {
      let raw: unknown;
      try {
        raw = collection.queryJson ? JSON.parse(collection.queryJson) : null;
      } catch {
        throw conflict('保存查询内容已损坏');
      }
      const parsed = researchSearchAstSchema.safeParse(raw);
      if (!parsed.success) throw conflict('保存查询版本不受支持');
      queryAst = parsed.data;
    }
    return {
      id: collection.id,
      parentId: collection.parentId,
      name: collection.name,
      sortOrder: collection.sortOrder,
      kind: collection.kind,
      queryAst,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  async createCollection(input: { name: string; parentId?: string | null }) {
    const siblings = await this.repository.listCollections();
    const parentId = input.parentId ?? null;
    if (parentId && !siblings.some((value) => value.id === parentId)) {
      throw notFound('父目录不存在');
    }
    const normalizedName = input.name.trim().toLocaleLowerCase();
    if (
      siblings.some(
        (value) => value.parentId === parentId && value.normalizedName === normalizedName,
      )
    ) {
      throw conflict('同一目录下已有同名目录');
    }
    const created = await this.repository.createCollection({
      id: this.createId(),
      parentId,
      name: input.name.trim(),
      normalizedName,
      sortOrder: siblings.filter((value) => value.parentId === parentId).length,
    });
    return this.collectionView(created);
  }

  async createSavedQuery(input: CreateSavedQueryInput) {
    const collections = await this.repository.listCollections();
    if (input.parentId && !collections.some((collection) => collection.id === input.parentId)) {
      throw notFound('父目录不存在');
    }
    const normalizedName = input.name.trim().toLocaleLowerCase();
    if (
      collections.some(
        (collection) =>
          collection.parentId === input.parentId && collection.normalizedName === normalizedName,
      )
    ) {
      throw conflict('同一目录下已有同名目录或保存查询');
    }
    const created = await this.repository.createCollection({
      id: this.createId(),
      parentId: input.parentId,
      name: input.name.trim(),
      normalizedName,
      sortOrder: collections.filter((collection) => collection.parentId === input.parentId).length,
      kind: 'smart',
      queryJson: JSON.stringify(input.ast),
    });
    return this.collectionView(created);
  }

  async runSavedQuery(id: string, cursor: string | null, limit: number) {
    const collection = await this.repository.getCollection(id);
    if (!collection || collection.kind !== 'smart') throw notFound('保存查询不存在');
    let raw: unknown;
    try {
      raw = collection.queryJson ? JSON.parse(collection.queryJson) : null;
    } catch {
      throw conflict('保存查询内容已损坏');
    }
    const parsed = researchSearchAstSchema.safeParse(raw);
    if (!parsed.success) throw conflict('保存查询版本不受支持');
    return this.structuredSearch({ ast: parsed.data, cursor, limit });
  }

  async updateCollection(id: string, input: UpdateCollectionInput) {
    const collections = await this.repository.listCollections();
    const current = collections.find((collection) => collection.id === id);
    if (!current) throw notFound('目录不存在');
    const parentId = input.parentId === undefined ? current.parentId : input.parentId;
    if (parentId === id) throw invalid('目录不能成为自己的父目录');
    if (parentId && !collections.some((collection) => collection.id === parentId)) {
      throw notFound('父目录不存在');
    }
    let ancestor = parentId;
    while (ancestor) {
      if (ancestor === id) throw invalid('不能把目录移动到自己的子目录中');
      ancestor = collections.find((collection) => collection.id === ancestor)?.parentId ?? null;
    }
    const name = (input.name ?? current.name).trim();
    const normalizedName = name.toLocaleLowerCase();
    if (
      collections.some(
        (collection) =>
          collection.id !== id &&
          collection.parentId === parentId &&
          collection.normalizedName === normalizedName,
      )
    ) {
      throw conflict('目标目录下已有同名目录');
    }
    const siblings = collections
      .filter((collection) => collection.parentId === parentId && collection.id !== id)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    const sortOrder = Math.min(input.sortOrder ?? siblings.length, siblings.length);
    const orderedSiblingIds = siblings.map((collection) => collection.id);
    orderedSiblingIds.splice(sortOrder, 0, id);
    const updated = await this.repository.moveCollection({
      id,
      parentId,
      name,
      normalizedName,
      orderedSiblingIds,
    });
    if (!updated) throw notFound('目录不存在');
    return this.collectionView(updated);
  }

  async collectionDeletionPreview(id: string) {
    const impact = await this.repository.getCollectionDeletionImpact(id);
    if (!impact) throw notFound('目录不存在');
    return {
      id: impact.collection.id,
      name: impact.collection.name,
      parentId: impact.collection.parentId,
      childCount: impact.childCount,
      directWorkCount: impact.directWorkCount,
      parentStrategyTargetId: impact.collection.parentId,
      parentStrategyNameConflicts: impact.parentStrategyNameConflicts,
      unclassifiedStrategyNameConflicts: impact.unclassifiedStrategyNameConflicts,
    };
  }

  async deleteCollection(id: string, strategy: 'parent' | 'unclassified') {
    const impact = await this.repository.getCollectionDeletionImpact(id);
    if (!impact) throw notFound('目录不存在');
    const conflicts =
      strategy === 'parent'
        ? impact.parentStrategyNameConflicts
        : impact.unclassifiedStrategyNameConflicts;
    if (conflicts.length > 0) {
      throw conflict(`移动后会出现同名目录：${conflicts.join('、')}`);
    }
    if (!(await this.repository.deleteCollection(id, strategy))) throw notFound('目录不存在');
    return { deleted: true as const, strategy };
  }

  async setWorkCollections(workId: string, collectionIds: string[]) {
    if (!(await this.repository.getWork(workId))) throw notFound('作品不存在');
    await this.assertManualCollections(collectionIds);
    await this.repository.setWorkCollections(
      workId,
      [...new Set(collectionIds)].map((collectionId) => ({
        entryId: this.createId(),
        collectionId,
      })),
    );
    return this.getWork(workId);
  }

  private async assertManualCollections(collectionIds: string[]) {
    const uniqueIds = [...new Set(collectionIds)];
    const collections = await Promise.all(uniqueIds.map((id) => this.repository.getCollection(id)));
    if (collections.some((collection) => !collection)) throw notFound('所选目录不存在');
    if (collections.some((collection) => collection?.kind !== 'manual')) {
      throw invalid('保存查询是智能目录，不能写入显式目录归属');
    }
  }

  async addWorkRelation(sourceWorkId: string, input: CreateWorkRelationInput) {
    if (sourceWorkId === input.targetWorkId) throw invalid('作品不能关联自己');
    const [source, target] = await Promise.all([
      this.repository.getWork(sourceWorkId),
      this.repository.getWork(input.targetWorkId),
    ]);
    if (!source || !target) throw notFound('关联作品不存在');
    await this.repository.upsertWorkRelation({
      id: this.createId(),
      sourceWorkId,
      targetWorkId: input.targetWorkId,
      kind: input.kind,
      note: input.note,
    });
    return this.getWork(sourceWorkId);
  }

  async deleteWorkRelation(id: string) {
    if (!(await this.repository.deleteWorkRelation(id))) throw notFound('作品关系不存在');
  }

  private async assertTagNamesAvailable(names: string[], excludedTagId?: string) {
    const normalized = names.map(normalizeTagName);
    if (normalized.some((name) => !name)) throw invalid('标签名称不能为空');
    if (new Set(normalized).size !== normalized.length) throw invalid('标签名称和别名不能重复');
    const tags = await this.repository.listTags('all');
    const occupied = new Map<string, string>();
    for (const tag of tags) {
      if (tag.id === excludedTagId) continue;
      occupied.set(normalizeTagName(tag.name), tag.name);
      for (const alias of tag.aliases) occupied.set(normalizeTagName(alias), alias);
    }
    const collision = normalized.find((name) => occupied.has(name));
    if (collision) throw conflict(`标签名称或别名“${occupied.get(collision)}”已经存在`);
  }

  async listTags(
    status: 'active' | 'trashed' | 'all',
    query: string | undefined,
    sort: 'usage' | 'name' | 'recent',
  ) {
    const normalizedQuery = query ? normalizeTagName(query) : '';
    const tags = (await this.repository.listTags(status)).filter(
      (tag) =>
        !normalizedQuery ||
        [tag.name, ...tag.aliases].some((name) => normalizeTagName(name).includes(normalizedQuery)),
    );
    tags.sort((left, right) => {
      if (sort === 'name')
        return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
      if (sort === 'recent') {
        return (
          (right.lastUsedAt ?? right.updatedAt).localeCompare(left.lastUsedAt ?? left.updatedAt) ||
          left.id.localeCompare(right.id)
        );
      }
      return right.usageCount - left.usageCount || left.name.localeCompare(right.name);
    });
    return { tags: tags.map(toTagView) };
  }

  async createTag(input: CreateTagInput) {
    await this.assertTagNamesAvailable([input.name, ...input.aliases]);
    return toTagView(
      await this.repository.createTag({
        id: this.createId(),
        name: input.name.trim(),
        normalizedName: normalizeTagName(input.name),
        color: input.color,
        description: input.description,
        aliases: input.aliases.map((name) => ({
          id: this.createId(),
          name: name.trim(),
          normalizedName: normalizeTagName(name),
        })),
      }),
    );
  }

  async updateTag(id: string, input: UpdateTagInput) {
    const current = await this.repository.getTag(id);
    if (!current) throw notFound('标签不存在');
    const name = input.name ?? current.name;
    const aliases = input.aliases ?? current.aliases;
    await this.assertTagNamesAvailable([name, ...aliases], id);
    const updated = await this.repository.updateTag({
      id,
      name: name.trim(),
      normalizedName: normalizeTagName(name),
      color: input.color === undefined ? current.color : input.color,
      description: input.description === undefined ? current.description : input.description,
      aliases: aliases.map((alias) => ({
        id: this.createId(),
        name: alias.trim(),
        normalizedName: normalizeTagName(alias),
      })),
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    if (!updated) throw conflict('标签已被其他操作修改，请刷新后重试');
    return toTagView(updated);
  }

  async setWorkTags(workId: string, tagIds: string[]) {
    const work = await this.repository.getWork(workId);
    if (!work) throw notFound('作品不存在');
    if (work.status !== 'active') throw conflict('只能修改活动作品的标签');
    const uniqueIds = [...new Set(tagIds)];
    const tags = await Promise.all(uniqueIds.map((id) => this.repository.getTag(id)));
    if (tags.some((tag) => !tag || tag.trashedAt)) throw notFound('所选标签不存在或已回收');
    await this.repository.setWorkTags(
      workId,
      uniqueIds.map((tagId) => ({ id: this.createId(), tagId })),
    );
    return this.getWork(workId);
  }

  async findTagCandidates(name: string, limit: number) {
    const requested = normalizeTagName(name);
    const candidates = (await this.repository.listTags('active'))
      .map((tag) => {
        const matches = [tag.name, ...tag.aliases].map((matchedName) => ({
          matchedName,
          ...tagSimilarity(requested, normalizeTagName(matchedName)),
        }));
        const best = matches.sort((left, right) => right.score - left.score)[0]!;
        return { tag: toTagView(tag), ...best };
      })
      .filter((candidate) => candidate.score >= 0.45)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.tag.usageCount - left.tag.usageCount ||
          left.tag.name.localeCompare(right.tag.name),
      )
      .slice(0, limit);
    return { candidates };
  }

  async tagDeletionPreview(id: string) {
    const tag = await this.repository.getTag(id);
    if (!tag) throw notFound('标签不存在');
    return {
      tagId: tag.id,
      name: tag.name,
      usageCount: tag.usageCount,
      aliasCount: tag.aliases.length,
    };
  }

  async trashTag(id: string, expectedUpdatedAt: string) {
    const tag = await this.repository.getTag(id);
    if (!tag) throw notFound('标签不存在');
    if (!(await this.repository.trashTag(id, expectedUpdatedAt))) {
      throw conflict('标签已被其他操作修改，请刷新后重试');
    }
    return toTagView((await this.repository.getTag(id))!);
  }

  async restoreTag(id: string) {
    if (!(await this.repository.restoreTag(id))) throw notFound('可恢复的标签不存在');
    return toTagView((await this.repository.getTag(id))!);
  }

  async permanentlyDeleteTag(id: string) {
    const tag = await this.repository.getTag(id);
    if (!tag) throw notFound('标签不存在');
    if (!tag.trashedAt) throw conflict('标签需先移入回收站');
    if (!(await this.repository.deleteTagPermanently(id))) throw conflict('标签永久删除失败');
    return { deleted: true as const };
  }

  async mergeTags(input: MergeTagsInput) {
    const record = await this.repository.mergeTags({
      id: this.createId(),
      survivorId: input.survivorId,
      mergedId: input.mergedId,
      expectedSurvivorUpdatedAt: input.expectedSurvivorUpdatedAt,
      expectedMergedUpdatedAt: input.expectedMergedUpdatedAt,
      mergedNameAliasId: this.createId(),
    });
    if (!record) throw conflict('标签已变化或不能合并，请刷新后重试');
    return toMergeRecordView(record);
  }

  async previewWorkMerge(survivorId: string, mergedWorkId: string) {
    if (survivorId === mergedWorkId) throw invalid('作品不能与自己合并');
    const [survivor, merged, survivorEditions, mergedEditions] = await Promise.all([
      this.repository.getWork(survivorId),
      this.repository.getWork(mergedWorkId),
      this.repository.listEditions(survivorId),
      this.repository.listEditions(mergedWorkId),
    ]);
    if (!survivor || !merged) throw notFound('待合并作品不存在');
    if (survivor.status !== 'active' || merged.status !== 'active') {
      throw conflict('只能合并活动作品');
    }
    const fields = (work: typeof survivor) => ({
      title: work.title,
      type: work.type,
      abstract: work.abstract,
      year: work.year,
    });
    return {
      survivor: {
        id: survivor.id,
        revision: survivor.revision,
        fields: fields(survivor),
        editionIds: survivorEditions.map((edition) => edition.id),
      },
      merged: {
        id: merged.id,
        revision: merged.revision,
        fields: fields(merged),
        editionIds: mergedEditions.map((edition) => edition.id),
      },
    };
  }

  async mergeWorks(survivorId: string, input: MergeWorksInput) {
    const preview = await this.previewWorkMerge(survivorId, input.mergedWorkId);
    const requiredEditions = [...preview.merged.editionIds].sort();
    const requestedEditions = [...new Set(input.editionIdsToMove)].sort();
    if (JSON.stringify(requiredEditions) !== JSON.stringify(requestedEditions)) {
      throw invalid('合并时必须明确转移被合并作品的全部 Edition');
    }
    const resultingEditionIds = new Set([
      ...preview.survivor.editionIds,
      ...preview.merged.editionIds,
    ]);
    if (input.preferredEditionId && !resultingEditionIds.has(input.preferredEditionId)) {
      throw invalid('首选 Edition 不属于合并后的作品');
    }
    const selected = <Key extends keyof MergeWorksInput['fieldChoices']>(key: Key) => {
      const side = input.fieldChoices[key];
      return preview[side].fields[key];
    };
    const title = selected('title');
    const record = await this.repository.mergeWorks({
      id: this.createId(),
      survivorId,
      mergedId: input.mergedWorkId,
      expectedSurvivorRevision: input.expectedSurvivorRevision,
      expectedMergedRevision: input.expectedMergedRevision,
      selectedFields: {
        title,
        titleSort: normalizeTitle(title),
        type: selected('type'),
        abstract: selected('abstract'),
        year: selected('year'),
      },
      fieldSources: input.fieldChoices,
      editionIdsToMove: requestedEditions,
      preferredEditionId: input.preferredEditionId,
    });
    if (!record) throw conflict('作品已变化或不能合并，请刷新预览后重试');
    return toMergeRecordView(record);
  }

  async undoMerge(id: string) {
    const record = await this.repository.getMergeRecord(id);
    if (!record) throw notFound('合并记录不存在');
    if (record.status === 'reverted') throw conflict('该合并已经撤销');
    const reverted = await this.repository.revertMerge(id);
    if (!reverted) throw conflict('合并后数据已有变化，不能覆盖后续修改');
    return toMergeRecordView(reverted);
  }

  async previewBulkWorkAction(input: BulkWorkActionInput) {
    const items = await Promise.all(
      input.workIds.map(async (workId) => {
        const detail = await this.getWork(workId);
        return {
          workId,
          title: detail.work.title,
          currentStatus: detail.work.status,
          attachmentCount: detail.work.attachmentCount,
          missingLocationCount: detail.editions
            .flatMap((edition) => edition.attachments)
            .flatMap((attachment) => attachment.asset.locations)
            .filter((location) => location.state === 'missing' || location.state === 'changed')
            .length,
        };
      }),
    );
    return { action: input.action, items };
  }

  async applyBulkWorkAction(input: BulkWorkActionInput) {
    return this.exclusive(async () => {
      if ('collectionIds' in input) {
        const collections = await this.repository.listCollections();
        if (
          input.collectionIds.some(
            (id) => !collections.some((value) => value.id === id && value.kind === 'manual'),
          )
        ) {
          throw notFound('批量操作包含不存在的普通目录');
        }
      }
      if ('tagIds' in input) {
        const tags = await Promise.all(input.tagIds.map((id) => this.repository.getTag(id)));
        if (tags.some((tag) => !tag || tag.trashedAt)) {
          throw notFound('批量操作包含不存在或已回收的标签');
        }
      }
      const results: Array<{
        workId: string;
        status: 'succeeded' | 'skipped' | 'failed';
        message: string | null;
      }> = [];
      for (const workId of input.workIds) {
        try {
          const work = await this.repository.getWorkListRecord(workId);
          if (!work) {
            results.push({ workId, status: 'failed', message: '作品不存在' });
            continue;
          }
          if (input.action === 'trash') {
            const changed = await this.repository.trashWork(workId, this.instant());
            results.push({
              workId,
              status: changed ? 'succeeded' : 'skipped',
              message: changed ? null : '作品不在可回收状态',
            });
          } else if (input.action === 'restore') {
            const changed = await this.repository.restoreWork(workId, this.instant());
            let message: string | null = changed ? null : '作品不在可恢复状态';
            if (changed) {
              const restored = await this.getWork(workId);
              const missing = restored.editions
                .flatMap((edition) => edition.attachments)
                .flatMap((attachment) => attachment.asset.locations)
                .filter(
                  (location) => location.state === 'missing' || location.state === 'changed',
                ).length;
              if (missing > 0) message = `作品已恢复，仍有 ${missing} 个缺失或变化的位置`;
            }
            results.push({
              workId,
              status: changed ? 'succeeded' : 'skipped',
              message,
            });
          } else if ('collectionIds' in input) {
            const selected = new Set(work.collectionIds);
            for (const collectionId of input.collectionIds) {
              if (input.action === 'add-to-collections') selected.add(collectionId);
              else selected.delete(collectionId);
            }
            await this.repository.setWorkCollections(
              workId,
              [...selected].map((collectionId) => ({
                entryId: this.createId(),
                collectionId,
              })),
            );
            results.push({ workId, status: 'succeeded', message: null });
          } else {
            const selected = new Set(
              (await this.repository.listTagsForWork(workId)).map((tag) => tag.id),
            );
            for (const tagId of input.tagIds) {
              if (input.action === 'add-tags') selected.add(tagId);
              else selected.delete(tagId);
            }
            await this.repository.setWorkTags(
              workId,
              [...selected].map((tagId) => ({ id: this.createId(), tagId })),
            );
            results.push({ workId, status: 'succeeded', message: null });
          }
        } catch (error) {
          results.push({
            workId,
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { action: input.action, results };
    });
  }

  async checkLocation(id: string) {
    const location = await this.repository.getLocation(id);
    if (!location) throw notFound('文件位置不存在');
    const asset = await this.repository.getAsset(location.assetId);
    if (!asset) throw conflict('文件位置引用的 Asset 不存在');
    const audit =
      location.mode === 'managed'
        ? await this.contentStore.auditManaged(
            location.objectKey!,
            asset.contentHash,
            asset.byteSize,
          )
        : await this.contentStore.auditLinked(
            location.originalPath,
            asset.contentHash,
            asset.byteSize,
          );
    const updated = await this.repository.updateLocationState(
      id,
      audit.state,
      this.instant(),
      audit.errorCode,
    );
    return { location: updated, audit };
  }

  async relinkLocation(id: string, path: string) {
    const location = await this.repository.getLocation(id);
    if (!location) throw notFound('文件位置不存在');
    if (location.mode !== 'linked') throw invalid('托管位置不能重新定位为外部路径');
    const asset = await this.repository.getAsset(location.assetId);
    if (!asset) throw conflict('文件位置引用的 Asset 不存在');
    const inspected = await this.contentStore.relinkFile(path, asset.contentHash, asset.mimeType);
    if (inspected.matchesExpectedAsset) {
      const updated = await this.repository.relinkLocation(
        id,
        inspected.originalPath,
        inspected.resolvedPath,
        {
          deviceId: inspected.sourceIdentity.deviceId,
          fileId: inspected.sourceIdentity.fileId,
          size: inspected.sourceIdentity.size,
          mtimeMs: inspected.sourceIdentity.mtimeMs,
        },
        this.instant(),
      );
      return { kind: 'restored' as const, location: updated };
    }
    const candidate = await this.repository.storeAsset(
      {
        id: this.createId(),
        contentHash: inspected.contentHash,
        byteSize: inspected.byteSize,
        mimeType: inspected.mimeType,
      },
      {
        id: this.createId(),
        mode: 'linked',
        originalPath: inspected.originalPath,
        resolvedPath: inspected.resolvedPath,
        objectKey: null,
        state: 'available',
        deviceId: inspected.sourceIdentity.deviceId,
        fileId: inspected.sourceIdentity.fileId,
        observedSize: inspected.sourceIdentity.size,
        observedMtimeMs: inspected.sourceIdentity.mtimeMs,
        lastCheckedAt: this.instant(),
      },
    );
    return {
      kind: 'replacement-candidate' as const,
      expectedAssetId: asset.id,
      candidateAssetId: candidate.asset.id,
    };
  }

  async recycleAttachment(id: string) {
    if (!(await this.repository.recycleAttachment(id, this.instant()))) {
      throw notFound('可移除的附件不存在');
    }
  }

  async restoreAttachment(id: string) {
    if (!(await this.repository.restoreAttachment(id))) throw notFound('可恢复的附件不存在');
  }

  async attachmentDeletionPreview(id: string) {
    const impact = await this.repository.getAttachmentDeletionImpact(id);
    if (!impact) throw notFound('附件不存在');
    const token = this.createId();
    this.attachmentDeletionTokens.set(token, {
      attachmentId: id,
      fingerprint: attachmentDeletionFingerprint(impact),
      expiresAt: this.clock().getTime() + 5 * 60 * 1_000,
    });
    return {
      attachmentId: id,
      assetId: impact.assetId,
      displayName: impact.displayName,
      otherAttachmentCount: impact.otherAttachmentCount,
      managedObjectCount: impact.removableManagedAsset ? 1 : 0,
      linkedLocationCount: impact.linkedLocationCount,
      evidenceCount: impact.evidenceCount,
      confirmationToken: token,
    };
  }

  async permanentlyDeleteAttachment(id: string, confirmationToken: string) {
    return this.exclusive(async () => {
      const token = this.attachmentDeletionTokens.get(confirmationToken);
      this.attachmentDeletionTokens.delete(confirmationToken);
      if (!token || token.attachmentId !== id || token.expiresAt < this.clock().getTime()) {
        throw conflict('附件永久删除确认已失效，请重新查看影响');
      }
      const impact = await this.repository.getAttachmentDeletionImpact(id);
      if (!impact || attachmentDeletionFingerprint(impact) !== token.fingerprint) {
        throw conflict('附件引用已经变化，请重新查看影响');
      }
      if (impact.evidenceCount > 0) {
        throw conflict('附件仍被研究证据引用，请先删除或重新绑定相关证据');
      }
      let quarantined: QuarantinedManagedObject | null = null;
      try {
        if (impact.removableManagedAsset) {
          quarantined = await this.contentStore.quarantineManagedObject(
            impact.removableManagedAsset.objectKey,
            impact.removableManagedAsset.contentHash,
            impact.removableManagedAsset.byteSize,
          );
        }
        const deleted = await this.repository.permanentlyDeleteAttachment(
          id,
          impact.orphanedAssetId,
        );
        if (!deleted) throw conflict('附件引用已经变化，永久删除未完成');
      } catch (error) {
        if (quarantined) await this.contentStore.restoreQuarantinedObject(quarantined);
        throw error;
      }
      let cleanupPending = false;
      if (quarantined) {
        try {
          await this.contentStore.finalizeQuarantinedObject(quarantined);
        } catch {
          cleanupPending = true;
        }
      }
      return {
        deleted: true,
        assetDeleted: impact.orphanedAssetId !== null,
        linkedSourcesDeleted: false,
        cleanupPending,
      };
    });
  }

  async trashWork(id: string) {
    if (!(await this.repository.trashWork(id, this.instant())))
      throw notFound('可回收的作品不存在');
  }

  async restoreWork(id: string) {
    if (!(await this.repository.restoreWork(id, this.instant())))
      throw notFound('可恢复的作品不存在');
    const detail = await this.getWork(id);
    return {
      work: detail,
      missingLocations: detail.editions
        .flatMap((edition) => edition.attachments)
        .flatMap((attachment) => attachment.asset.locations)
        .filter((location) => location.state === 'missing' || location.state === 'changed'),
    };
  }

  async deletionPreview(id: string) {
    const impact = await this.repository.getDeletionImpact(id);
    if (!impact) throw notFound('作品不存在');
    const token = this.createId();
    this.deletionTokens.set(token, {
      workId: id,
      fingerprint: deletionFingerprint(impact),
      expiresAt: this.clock().getTime() + 5 * 60 * 1_000,
    });
    return {
      workId: id,
      attachmentCount: impact.attachmentCount,
      managedObjectCount: impact.managedObjectCount,
      linkedLocationCount: impact.linkedLocationCount,
      evidenceCount: impact.evidenceCount,
      confirmationToken: token,
    };
  }

  async permanentlyDelete(id: string, confirmationToken: string) {
    return this.exclusive(async () => {
      const token = this.deletionTokens.get(confirmationToken);
      this.deletionTokens.delete(confirmationToken);
      if (!token || token.workId !== id || token.expiresAt < this.clock().getTime()) {
        throw conflict('永久删除确认已失效，请重新查看影响');
      }
      const impact = await this.repository.getDeletionImpact(id);
      if (!impact || deletionFingerprint(impact) !== token.fingerprint) {
        throw conflict('引用关系已经变化，请重新查看影响');
      }
      if (impact.evidenceCount > 0) {
        throw conflict('作品仍被研究证据引用，请先删除或重新绑定相关证据');
      }
      const work = await this.repository.getWork(id);
      if (work?.status !== 'trashed') throw conflict('作品必须先进入回收站');
      const quarantined: QuarantinedManagedObject[] = [];
      try {
        for (const object of impact.removableManagedAssets) {
          const staged = await this.contentStore.quarantineManagedObject(
            object.objectKey,
            object.contentHash,
            object.byteSize,
          );
          if (staged) quarantined.push(staged);
        }
        const deleted = await this.repository.permanentlyDeleteWork(
          id,
          impact.removableManagedAssets.map((object) => object.assetId),
        );
        if (!deleted) throw conflict('引用关系已经变化，永久删除未完成');
      } catch (error) {
        let restoreFailure: unknown = null;
        for (const object of [...quarantined].reverse()) {
          try {
            await this.contentStore.restoreQuarantinedObject(object);
          } catch (restoreError) {
            restoreFailure ??= restoreError;
          }
        }
        if (restoreFailure) throw restoreFailure;
        throw error;
      }
      let cleanupPending = 0;
      for (const object of quarantined) {
        try {
          await this.contentStore.finalizeQuarantinedObject(object);
        } catch {
          cleanupPending += 1;
        }
      }
      return { deleted: true, linkedSourcesDeleted: false, cleanupPending };
    });
  }

  private requireManagedRootController(): ManagedRootController {
    if (!this.managedRootController) throw conflict('当前服务未配置可迁移的托管附件库');
    return this.managedRootController;
  }

  async getManagedStorageStatus() {
    const activeRoot = this.managedRootController
      ? this.managedRootController.current()
      : await this.contentStore.resolvedRoot();
    let latest = await this.repository.getLatestManagedRootMigrationJob();
    if (latest?.status === 'running' && !this.managedRootMigrationJobs.has(latest.id)) {
      latest = await this.repository.updateManagedRootMigrationJob(latest.id, {
        status: 'interrupted',
        errorCode: 'ROOT_MIGRATION_INTERRUPTED',
      });
    }
    return {
      activeRoot,
      latestMigration: latest ? toManagedRootMigrationJob(latest) : null,
    };
  }

  private launchManagedRootMigration(record: ManagedRootMigrationJobRecord): void {
    const controller = new AbortController();
    const promise = this.runManagedRootMigration(record, controller)
      .catch(() => undefined)
      .finally(() => {
        this.managedRootMigrationJobs.delete(record.id);
        this.managedRootMigrationActive = false;
      });
    this.managedRootMigrationJobs.set(record.id, { controller, promise });
  }

  private async runManagedRootMigration(
    record: ManagedRootMigrationJobRecord,
    controller: AbortController,
  ): Promise<void> {
    const rootController = this.requireManagedRootController();
    try {
      const activeRoot = resolve(rootController.current());
      if (activeRoot === resolve(record.targetRoot)) {
        await this.repository.updateManagedRootMigrationJob(record.id, {
          status: 'completed',
          copiedObjects: record.totalObjects,
          copiedBytes: record.totalBytes,
          errorCode: null,
          completedAt: this.instant(),
        });
        return;
      }
      if (activeRoot !== resolve(record.sourceRoot)) {
        throw new Error('托管根已经变化，不能从旧任务继续切换');
      }

      const sourceStore = new ResearchContentStore(() => record.sourceRoot);
      const targetStore = new ResearchContentStore(() => record.targetRoot);
      const objects = await sourceStore.listManagedObjects();
      const totalBytes = objects.reduce((sum, object) => sum + object.byteSize, 0);
      await this.repository.updateManagedRootMigrationJob(record.id, {
        totalObjects: objects.length,
        totalBytes,
        copiedObjects: 0,
        copiedBytes: 0,
        errorCode: null,
      });
      let copiedObjects = 0;
      let copiedBytes = 0;
      for (const object of objects) {
        controller.signal.throwIfAborted();
        const copied = await targetStore.ingestManagedFile(
          object.objectPath,
          'application/octet-stream',
          { signal: controller.signal },
        );
        if (copied.contentHash !== object.contentHash || copied.byteSize !== object.byteSize) {
          if (!copied.reusedObject) {
            await targetStore.removeManagedObject(
              copied.objectKey,
              copied.contentHash,
              copied.byteSize,
            );
          }
          throw new Error(`对象校验失败：${object.objectKey}`);
        }
        copiedObjects += 1;
        copiedBytes += object.byteSize;
        await this.repository.updateManagedRootMigrationJob(record.id, {
          copiedObjects,
          copiedBytes,
        });
      }
      const finalObjects = await sourceStore.listManagedObjects();
      const fingerprint = (values: typeof objects) =>
        JSON.stringify(
          values.map((object) => [object.objectKey, object.contentHash, object.byteSize]),
        );
      if (fingerprint(finalObjects) !== fingerprint(objects)) {
        throw new Error('迁移期间托管对象集合发生变化，请重试');
      }
      controller.signal.throwIfAborted();
      if (!(await rootController.switchRoot(record.sourceRoot, record.targetRoot))) {
        throw new Error('切换前托管根已经变化');
      }
      await this.repository.updateManagedRootMigrationJob(record.id, {
        status: 'completed',
        copiedObjects,
        copiedBytes,
        errorCode: null,
        completedAt: this.instant(),
      });
    } catch (cause) {
      const cancelled = controller.signal.aborted;
      await this.repository.updateManagedRootMigrationJob(record.id, {
        status: cancelled ? 'cancelled' : 'failed',
        errorCode: cancelled
          ? 'ROOT_MIGRATION_CANCELLED'
          : `ROOT_MIGRATION_FAILED:${cause instanceof Error ? cause.message : String(cause)}`,
        completedAt: this.instant(),
      });
    }
  }

  async startManagedRootMigration(input: StartManagedRootMigrationInput) {
    const rootController = this.requireManagedRootController();
    if (!isAbsolute(input.targetRoot)) throw invalid('托管根必须使用绝对路径');
    const sourceRoot = resolve(rootController.current());
    const targetRoot = resolve(input.targetRoot);
    if (sourceRoot === targetRoot) throw conflict('目标路径已经是当前托管根');
    if (isPathInside(sourceRoot, targetRoot) || isPathInside(targetRoot, sourceRoot)) {
      throw invalid('新旧托管根不能互相包含');
    }
    if (this.activeManagedStorageOperations > 0) {
      throw conflict('仍有托管文件操作正在运行，请稍后重试');
    }
    if (this.managedRootMigrationActive) throw conflict('已有托管库迁移正在运行');
    this.managedRootMigrationActive = true;
    try {
      const sourceStore = new ResearchContentStore(() => sourceRoot);
      const targetStore = new ResearchContentStore(() => targetRoot);
      const [sourceActual, targetActual] = await Promise.all([
        sourceStore.resolvedRoot(),
        targetStore.resolvedRoot(),
      ]);
      if (isPathInside(sourceActual, targetActual) || isPathInside(targetActual, sourceActual)) {
        throw invalid('新旧托管根解析后不能互相包含');
      }
      const latest = await this.repository.getLatestManagedRootMigrationJob();
      if (latest?.status === 'running' && this.managedRootMigrationJobs.has(latest.id)) {
        throw conflict('已有托管库迁移正在运行');
      }
      if (latest?.status === 'running') {
        await this.repository.updateManagedRootMigrationJob(latest.id, {
          status: 'interrupted',
          errorCode: 'ROOT_MIGRATION_INTERRUPTED',
        });
      }
      const objects = await sourceStore.listManagedObjects();
      const created = await this.repository.createManagedRootMigrationJob({
        id: this.createId(),
        sourceRoot,
        targetRoot: targetActual,
        totalObjects: objects.length,
        totalBytes: objects.reduce((sum, object) => sum + object.byteSize, 0),
      });
      const running = await this.repository.updateManagedRootMigrationJob(created.id, {
        status: 'running',
      });
      if (!running) throw notFound('托管库迁移任务不存在');
      this.launchManagedRootMigration(running);
      return toManagedRootMigrationJob(running);
    } catch (cause) {
      this.managedRootMigrationActive = false;
      throw cause;
    }
  }

  async getManagedRootMigration(id: string) {
    let record = await this.repository.getManagedRootMigrationJob(id);
    if (!record) throw notFound('托管库迁移任务不存在');
    if (record.status === 'running' && !this.managedRootMigrationJobs.has(id)) {
      record = await this.repository.updateManagedRootMigrationJob(id, {
        status: 'interrupted',
        errorCode: 'ROOT_MIGRATION_INTERRUPTED',
      });
      if (!record) throw notFound('托管库迁移任务不存在');
    }
    return toManagedRootMigrationJob(record);
  }

  async cancelManagedRootMigration(id: string) {
    const record = await this.repository.getManagedRootMigrationJob(id);
    if (!record) throw notFound('托管库迁移任务不存在');
    if (record.status !== 'running') throw conflict('该托管库迁移当前不能取消');
    const active = this.managedRootMigrationJobs.get(id);
    active?.controller.abort();
    const cancelled = await this.repository.updateManagedRootMigrationJob(id, {
      status: 'cancelled',
      errorCode: 'ROOT_MIGRATION_CANCELLED',
      completedAt: this.instant(),
    });
    if (!cancelled) throw notFound('托管库迁移任务不存在');
    await active?.promise;
    return this.getManagedRootMigration(id);
  }

  async retryManagedRootMigration(id: string) {
    const record = await this.repository.getManagedRootMigrationJob(id);
    if (!record) throw notFound('托管库迁移任务不存在');
    if (!['cancelled', 'failed', 'interrupted'].includes(record.status)) {
      throw conflict('该托管库迁移当前不能重试');
    }
    if (this.activeManagedStorageOperations > 0) {
      throw conflict('仍有托管文件操作正在运行，请稍后重试');
    }
    if (this.managedRootMigrationActive) throw conflict('已有托管库迁移正在运行');
    this.managedRootMigrationActive = true;
    try {
      const running = await this.repository.updateManagedRootMigrationJob(id, {
        status: 'running',
        copiedObjects: 0,
        copiedBytes: 0,
        errorCode: null,
        completedAt: null,
      });
      if (!running) throw notFound('托管库迁移任务不存在');
      this.launchManagedRootMigration(running);
      return toManagedRootMigrationJob(running);
    } catch (cause) {
      this.managedRootMigrationActive = false;
      throw cause;
    }
  }

  async previewPortableExport(input: PortableExportPreviewInput) {
    const exportedAt = this.instant();
    const canonical = await this.repository.exportCanonicalSnapshot(exportedAt);
    return previewPortableExport(
      canonical,
      {
        includeManagedFiles: input.includeManagedFiles,
        includeLinkedFiles: input.includeLinkedFiles,
      },
      input.targetPath,
    );
  }

  async startPortableExport(input: StartPortableExportInput): Promise<PortableExportJob> {
    const parsed = startPortableExportInputSchema.parse(input);
    const exportedAt = this.instant();
    const canonical = await this.repository.exportCanonicalSnapshot(exportedAt);
    const preview = await previewPortableExport(canonical, parsed, parsed.targetPath);
    if (preview.targetExists) throw conflict('导出目标已经存在，请选择新的目录');

    const id = this.createId();
    const initial = initialExportState();
    await this.repository.createExportJob({
      id,
      optionsJson: JSON.stringify(parsed),
      targetPath: preview.targetPath!,
      manifestJson: JSON.stringify(initial),
    });
    const running = await this.repository.updateExportJob(id, { status: 'running' });
    if (!running) throw notFound('导出任务不存在');

    const controller = new AbortController();
    this.exportJobs.set(id, controller);
    void writePortableExport({
      jobId: id,
      targetPath: parsed.targetPath,
      canonical,
      options: parsed,
      signal: controller.signal,
      completedAt: () => this.instant(),
      onProgress: async (progress) => {
        await this.repository.updateExportJob(id, {
          manifestJson: JSON.stringify({ progress, report: null } satisfies StoredExportState),
        });
      },
    })
      .then(async (report) => {
        await this.repository.updateExportJob(id, {
          status: 'completed',
          manifestJson: JSON.stringify({
            progress: {
              phase: 'done',
              completedAssets: preview.selectedAssetCount,
              totalAssets: preview.selectedAssetCount,
              copiedBytes: report.copiedBytes,
              totalBytes: preview.estimatedBytes,
            },
            report,
          } satisfies StoredExportState),
          errorCode: null,
          completedAt: this.instant(),
        });
      })
      .catch(async (cause: unknown) => {
        const cancelled = controller.signal.aborted;
        await this.repository.updateExportJob(id, {
          status: cancelled ? 'cancelled' : 'failed',
          errorCode: cancelled
            ? 'EXPORT_CANCELLED'
            : cause instanceof Error
              ? `EXPORT_FAILED:${cause.message}`
              : 'EXPORT_FAILED',
          completedAt: this.instant(),
        });
      })
      .finally(() => {
        this.exportJobs.delete(id);
      });
    return toExportJobView(running);
  }

  async getPortableExport(id: string): Promise<PortableExportJob> {
    const record = await this.repository.getExportJob(id);
    if (!record) throw notFound('导出任务不存在');
    return toExportJobView(record);
  }

  async cancelPortableExport(id: string): Promise<PortableExportJob> {
    const record = await this.repository.getExportJob(id);
    if (!record) throw notFound('导出任务不存在');
    if (
      record.status === 'completed' ||
      record.status === 'failed' ||
      record.status === 'cancelled'
    ) {
      return toExportJobView(record);
    }
    this.exportJobs.get(id)?.abort();
    const cancelled = await this.repository.updateExportJob(id, {
      status: 'cancelled',
      errorCode: 'EXPORT_CANCELLED',
      completedAt: this.instant(),
    });
    if (!cancelled) throw notFound('导出任务不存在');
    return toExportJobView(cancelled);
  }

  async reconcile() {
    const locations = await this.repository.listLocationsForAudit();
    const counts = { available: 0, missing: 0, changed: 0 };
    for (const { asset, location } of locations) {
      const audit =
        location.mode === 'managed'
          ? await this.contentStore.auditManaged(
              location.objectKey!,
              asset.contentHash,
              asset.byteSize,
            )
          : await this.contentStore.auditLinked(
              location.originalPath,
              asset.contentHash,
              asset.byteSize,
            );
      counts[audit.state] += 1;
      if (location.state !== audit.state || location.errorCode !== audit.errorCode) {
        await this.repository.updateLocationState(
          location.id,
          audit.state,
          this.instant(),
          audit.errorCode,
        );
      }
    }
    const knownManagedKeys = new Set(
      locations
        .map(({ location }) => (location.mode === 'managed' ? location.objectKey : null))
        .filter((value): value is string => value !== null),
    );
    let registeredOrphans = 0;
    let corruptObjects = 0;
    for (const object of await this.contentStore.listManagedObjects()) {
      if (knownManagedKeys.has(object.objectKey)) continue;
      const audit = await this.contentStore.auditManaged(
        object.objectKey,
        object.contentHash,
        object.byteSize,
      );
      if (audit.state !== 'available') {
        corruptObjects += 1;
        continue;
      }
      await this.repository.storeAsset(
        {
          id: this.createId(),
          contentHash: object.contentHash,
          byteSize: object.byteSize,
          mimeType: 'application/pdf',
        },
        {
          id: this.createId(),
          mode: 'managed',
          originalPath: object.objectPath,
          resolvedPath: object.objectPath,
          objectKey: object.objectKey,
          state: 'available',
          observedSize: object.byteSize,
          observedMtimeMs: object.mtimeMs,
          lastCheckedAt: this.instant(),
        },
      );
      registeredOrphans += 1;
    }
    const staleBefore = new Date(this.clock().getTime() - 24 * 60 * 60 * 1_000);
    const removedStagingFiles = await this.contentStore.removeStaleStagingFiles(staleBefore);
    return {
      counts,
      registeredOrphans,
      corruptObjects,
      removedStagingFiles,
      stagingFiles: await this.contentStore.listStagingFiles(),
    };
  }
}
