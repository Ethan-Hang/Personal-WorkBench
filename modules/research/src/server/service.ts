import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { conflict, invalid, notFound } from '@workbench/http-kit';
import {
  ATTACHMENT_ROLES,
  RESEARCH_ERROR_CODES,
  WORK_TYPES,
  type ConfirmImportInput,
  type ImportItemView,
  type ImportSessionView,
  type InspectImportInput,
  type ResearchErrorCode,
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
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import type { MetadataLookupResult, ProviderResult } from '../metadata/types.js';
import type { PdfFilePicker } from './file-picker.js';
import type {
  CollectionRecord,
  CommitImportResult,
  DeletionImpact,
  ImportItemRecord,
  MetadataAssertionDraft,
  ResearchRepository,
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

export interface ResearchServiceDependencies {
  repository: ResearchRepository;
  contentStore: ResearchContentStore;
  metadata: MetadataCoordinator;
  filePicker: PdfFilePicker;
  clock?: () => Date;
  createId?: () => string;
}

function normalizeTitle(value: string): string {
  return value.trim().toLocaleLowerCase();
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
    year: record.year,
    status: record.status,
    preferredEditionId: record.preferredEditionId,
    attachmentCount: record.attachmentCount,
    collectionIds: record.collectionIds,
    fileStatus: record.fileStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    trashedAt: record.trashedAt,
  };
}

function deletionFingerprint(impact: DeletionImpact): string {
  return JSON.stringify({
    workId: impact.workId,
    attachmentCount: impact.attachmentCount,
    linkedLocationCount: impact.linkedLocationCount,
    removableManagedAssets: impact.removableManagedAssets,
  });
}

export class ResearchService {
  private readonly repository: ResearchRepository;
  private readonly contentStore: ResearchContentStore;
  private readonly metadata: MetadataCoordinator;
  private readonly filePicker: PdfFilePicker;
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly deletionTokens = new Map<string, DeletionToken>();
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(dependencies: ResearchServiceDependencies) {
    this.repository = dependencies.repository;
    this.contentStore = dependencies.contentStore;
    this.metadata = dependencies.metadata;
    this.filePicker = dependencies.filePicker;
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

  async pickFiles(initialDir?: string, multiple = false) {
    const paths = await this.filePicker.pick({ initialDir, multiple });
    return { paths, cancelled: paths.length === 0 };
  }

  async prepareImport(input: {
    files: Array<{ path: string; storageMode: 'managed' | 'linked'; fileName?: string }>;
    requestId: string;
  }) {
    const session = await this.repository.createImportSession({
      id: this.createId(),
      requestId: input.requestId,
      items: input.files.map((file) => ({
        id: this.createId(),
        fileName: file.fileName ?? basename(file.path),
        sourcePath: file.path,
        storageMode: file.storageMode,
      })),
    });
    return toImportSessionView(session);
  }

  async getImportSession(id: string): Promise<ImportSessionView> {
    const session = await this.repository.getImportSession(id);
    if (!session) throw notFound('导入会话不存在');
    return toImportSessionView(session);
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
  ): Promise<InspectionPayload> {
    if (item.candidateJson) {
      const existing = parsePayload(item);
      if (!input.allowExternal || (existing.externalAttempted && !input.forceRefresh)) {
        return existing;
      }
      const refreshed = await this.addExternalMetadataSafely(existing, input.forceRefresh);
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
      const asset =
        item.storageMode === 'managed'
          ? await (async () => {
              const stored = await this.contentStore.ingestManaged(item.sourcePath);
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
            })()
          : await (async () => {
              const stored = await this.contentStore.inspectLinked(item.sourcePath);
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
        extraction = await extractPdfMetadata(parsePath);
      } catch (error) {
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
      await this.repository.updateImportItem(item.id, {
        stage: 'awaiting-confirmation',
        assetId: asset.asset.id,
        candidateJson: JSON.stringify(payload),
      });
      return payload;
    } catch (error) {
      const known = error instanceof FileLifecycleError ? error : null;
      await this.repository.updateImportItem(item.id, {
        stage: 'failed',
        errorCode: known?.code ?? 'FILE_IO',
        errorDetail: error instanceof Error ? error.message : String(error),
        retryable: known?.retryable ?? true,
      });
      throw error;
    }
  }

  async inspectImport(sessionId: string, input: InspectImportInput) {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    await this.repository.setImportSessionStatus(sessionId, 'inspecting');
    const results: Array<{ item: ImportItemRecord; payload: InspectionPayload }> = [];
    for (const original of session.items) {
      try {
        const payload = await this.inspectItem(original, input);
        const item = (await this.repository.getImportSession(sessionId))?.items.find(
          (value) => value.id === original.id,
        );
        if (item) results.push({ item, payload });
      } catch {
        const item = (await this.repository.getImportSession(sessionId))?.items.find(
          (value) => value.id === original.id,
        );
        if (item) {
          results.push({
            item,
            payload: {
              localSuggestions: [],
              identifiers: [],
              externalCandidates: [],
              exactAssetUsages: [],
              identifierMatches: [],
              warnings: [item.errorDetail ?? '导入失败'],
              disclosure: { services: [], sentFields: [], sendsPdf: false },
              externalAttempted: false,
            },
          });
        }
      }
    }
    await this.repository.setImportSessionStatus(sessionId, 'awaiting-confirmation');
    const services = new Set<MetadataLookupResult['disclosure']['services'][number]>();
    const sentFields = new Set<MetadataLookupResult['disclosure']['sentFields'][number]>();
    for (const result of results) {
      result.payload.disclosure.services.forEach((value) => services.add(value));
      result.payload.disclosure.sentFields.forEach((value) => sentFields.add(value));
    }
    return {
      sessionId,
      status: 'awaiting-confirmation' as const,
      items: results.map(({ item, payload }) => ({ item: toImportView(item), ...payload })),
      disclosure: {
        externalEnabled: input.allowExternal,
        services: [...services],
        sentFields: [...sentFields],
        sendsPdf: false as const,
      },
    };
  }

  async confirmImport(
    sessionId: string,
    input: ConfirmImportInput,
  ): Promise<CommitImportResult | { deferred: true } | { discarded: true }> {
    const session = await this.repository.getImportSession(sessionId);
    if (!session) throw notFound('导入会话不存在');
    const item = session.items.find((value) => value.id === input.itemId);
    if (!item) throw notFound('导入条目不存在');
    if (input.duplicateDecision === 'defer') return { deferred: true };
    if (input.duplicateDecision === 'discard') {
      await this.repository.updateImportItem(item.id, { stage: 'cancelled' });
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
        role: 'primary-pdf',
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

  async listWorks(query: Parameters<ResearchRepository['listWorks']>[0]) {
    const page = await this.repository.listWorks(query);
    return { works: page.works.map(toWorkView), nextCursor: page.nextCursor };
  }

  async getWork(id: string): Promise<WorkDetailView> {
    const listed = await this.repository.getWorkListRecord(id);
    if (!listed) throw notFound('作品不存在');
    const editions = await this.repository.listEditions(id);
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
        return {
          id: edition.id,
          workId: id,
          kind: edition.kind,
          title: edition.title,
          publicationTitle: edition.publicationTitle,
          publishedDate: edition.publishedDate,
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
    };
  }

  async listCollections() {
    const collections = await this.repository.listCollections();
    return { collections: collections.map(this.collectionView) };
  }

  private collectionView(collection: CollectionRecord) {
    return {
      id: collection.id,
      parentId: collection.parentId,
      name: collection.name,
      sortOrder: collection.sortOrder,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  async createCollection(input: { name: string; parentId?: string | null }) {
    const siblings = await this.repository.listCollections();
    const parentId = input.parentId ?? null;
    if (siblings.some((value) => value.parentId === parentId && value.name === input.name.trim())) {
      throw conflict('同一目录下已有同名目录');
    }
    const created = await this.repository.createCollection({
      id: this.createId(),
      parentId,
      name: input.name.trim(),
      normalizedName: input.name.trim().toLocaleLowerCase(),
      sortOrder: siblings.filter((value) => value.parentId === parentId).length,
    });
    return this.collectionView(created);
  }

  async setWorkCollections(workId: string, collectionIds: string[]) {
    if (!(await this.repository.getWork(workId))) throw notFound('作品不存在');
    await this.repository.setWorkCollections(
      workId,
      [...new Set(collectionIds)].map((collectionId) => ({
        entryId: this.createId(),
        collectionId,
      })),
    );
    return this.getWork(workId);
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
    const inspected = await this.contentStore.relink(path, asset.contentHash);
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
        for (const object of quarantined.reverse()) {
          await this.contentStore.restoreQuarantinedObject(object);
        }
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
