import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type {
  CreateInteropImportInput,
  InteropAttachmentCandidate,
  InteropFormat,
  InteropImportJobView,
  InteropRecordDecision,
  InteropRecordView,
  UpdateInteropRecordDecisionInput,
} from '../../contract.js';
import { WORK_TYPES } from '../../contract.js';
import { normalizeArxivId, normalizeDoi } from '../../ingest/identifiers.js';
import type { ResearchRepository } from '../../server/repository.js';
import type { ResearchService } from '../../server/service.js';
import type { InteropSourcePicker } from '../../server/file-picker.js';
import {
  InteropRepositoryConflictError,
  type CommitInteropRecordDraft,
  type InteropImportJobRecord,
  type InteropRecord,
  type InteropRepository,
  type ParsedInteropRecordDraft,
} from './repository.js';

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

type WorkerFactory = (workerData: Record<string, unknown>) => Worker;

interface WorkerBatchMessage {
  type: 'batch';
  totalCount: number;
  checkpointOrdinal: number;
  records: Array<Omit<ParsedInteropRecordDraft, 'id'>>;
}

type WorkerMessage =
  | WorkerBatchMessage
  | { type: 'completed'; totalCount: number }
  | { type: 'cancelled'; checkpointOrdinal: number }
  | { type: 'failed'; code: string; message: string };

export class InteropServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'InteropServiceError';
  }
}

export interface InteropImportServiceOptions {
  repository: InteropRepository;
  researchRepository: ResearchRepository;
  researchService: ResearchService;
  filePicker: InteropSourcePicker;
  createId?: () => string;
  clock?: () => Date;
  workerFactory?: WorkerFactory;
}

function inferFormat(path: string): InteropFormat | null {
  const extension = extname(path).toLocaleLowerCase();
  if (extension === '.bib' || extension === '.bibtex') return 'bibtex';
  if (extension === '.ris') return 'ris';
  if (extension === '.json') return 'csl-json';
  return null;
}

function parserIdentity(format: InteropFormat): { name: string; version: string } {
  if (format === 'bibtex') {
    return {
      name: '@retorquere/bibtex-parser + @citation-js/plugin-bibtex',
      version: '10.0.1 + 0.8.2',
    };
  }
  if (format === 'ris') return { name: '@citation-js/plugin-ris', version: '0.8.2' };
  return { name: '@citation-js/core', version: '0.8.2' };
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function toJobView(job: InteropImportJobRecord): InteropImportJobView {
  return {
    id: job.id,
    requestId: job.requestId,
    source: job.source,
    status: job.status,
    summary: job.counts,
    checkpointOrdinal: job.checkpointOrdinal,
    errorCode: job.errorCode as InteropImportJobView['errorCode'],
    errorDetail: job.errorDetail,
    revision: job.revision,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

function toRecordView(record: InteropRecord): InteropRecordView {
  return {
    id: record.id,
    sourceId: record.sourceId,
    ordinal: record.ordinal,
    sourceKey: record.sourceKey,
    rawHash: record.rawHash,
    rawRecord: record.rawRecord,
    summary: record.summary,
    formatShadow: record.formatShadow,
    mapped: record.mapped,
    diagnostics: record.diagnostics,
    decision: record.decision,
    status: record.status,
    revision: record.revision,
    committedWorkId: record.committedWorkId,
    committedEditionId: record.committedEditionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizedIdentifier(scheme: string, value: string): string | null {
  if (scheme === 'doi') return normalizeDoi(value);
  if (scheme === 'arxiv') return normalizeArxivId(value);
  const normalized = value.trim().toLocaleLowerCase().replace(/[ -]/g, '');
  return normalized || null;
}

function titleSort(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function editionKind(type: string) {
  if (type === 'article') return 'journal';
  if (type === 'conference-paper') return 'conference';
  if (type === 'preprint') return 'preprint';
  if (type === 'thesis') return 'thesis';
  if (type === 'report' || type === 'standard') return 'report';
  return 'other';
}

function publishedDate(record: InteropRecord): string | null {
  const issued = record.mapped?.issued;
  if (!issued?.year) return issued?.literal ?? null;
  const parts = [String(issued.year)];
  if (issued.month) parts.push(String(issued.month).padStart(2, '0'));
  if (issued.day) parts.push(String(issued.day).padStart(2, '0'));
  return parts.join('-');
}

function displayName(person: NonNullable<InteropRecord['mapped']>['contributors'][number]): string {
  if (person.literal) return person.literal;
  return [person.given, person.family].filter(Boolean).join(' ') || 'Unknown contributor';
}

function shadowAttachmentCandidates(record: InteropRecord): InteropAttachmentCandidate[] {
  const shadow = record.formatShadow;
  if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return [];
  const candidates = (shadow as { attachmentCandidates?: unknown }).attachmentCandidates;
  return Array.isArray(candidates) ? (candidates as InteropAttachmentCandidate[]) : [];
}

function resolveAttachmentPath(sourcePath: string, candidate: InteropAttachmentCandidate): string {
  if (candidate.resolvedPath) return candidate.resolvedPath;
  let value = candidate.sourceValue.trim();
  const bibMatch = /^:?(.*?):(?:application\/[^:]+)?$/.exec(value);
  if (bibMatch?.[1] && /:\w/.test(value)) value = bibMatch[1];
  if (/^file:\/\//i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch {
      value = value.replace(/^file:\/\//i, '');
    }
  }
  return isAbsolute(value) ? value : resolve(dirname(sourcePath), value);
}

export class ResearchInteropImportService {
  private readonly repository: InteropRepository;
  private readonly researchRepository: ResearchRepository;
  private readonly researchService: ResearchService;
  private readonly filePicker: InteropSourcePicker;
  private readonly createId: () => string;
  private readonly clock: () => Date;
  private readonly workerFactory: WorkerFactory;
  private readonly selectedPaths = new Set<string>();
  private readonly workers = new Map<string, Worker>();

  constructor(options: InteropImportServiceOptions) {
    this.repository = options.repository;
    this.researchRepository = options.researchRepository;
    this.researchService = options.researchService;
    this.filePicker = options.filePicker;
    this.createId = options.createId ?? randomUUID;
    this.clock = options.clock ?? (() => new Date());
    this.workerFactory =
      options.workerFactory ??
      ((workerData) =>
        new Worker(new URL('./worker.mjs', import.meta.url), {
          workerData,
        }));
  }

  async pickSource(format?: InteropFormat) {
    const path = await this.filePicker.pickInteropSource({ format });
    if (!path) return { source: null, cancelled: true };
    const inferredFormat = inferFormat(path);
    if (!inferredFormat) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
        '请选择 .bib、.bibtex、.ris 或 .json 文件',
        400,
      );
    }
    if (format && inferredFormat !== format) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
        '所选文件扩展名与指定格式不一致',
        400,
      );
    }
    const file = await stat(path);
    if (!file.isFile() || file.size > MAX_SOURCE_BYTES) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_INVALID_RECORD',
        `来源文件必须是普通文件且不超过 ${MAX_SOURCE_BYTES} 字节`,
        400,
      );
    }
    const absolute = resolve(path);
    this.selectedPaths.add(absolute);
    return {
      source: {
        path: absolute,
        displayName: basename(absolute),
        byteSize: file.size,
        inferredFormat,
      },
      cancelled: false,
    };
  }

  async createImport(input: CreateInteropImportInput): Promise<InteropImportJobView> {
    const sourcePath = resolve(input.sourcePath);
    if (!this.selectedPaths.has(sourcePath)) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_JOB_STATE_CONFLICT',
        '请先通过文件选择器选择来源文件',
        409,
      );
    }
    const inferred = inferFormat(sourcePath);
    if (inferred !== input.format) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_UNSUPPORTED_FORMAT',
        '来源文件与声明格式不一致',
        400,
      );
    }
    const file = await stat(sourcePath);
    if (!file.isFile() || file.size > MAX_SOURCE_BYTES) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_INVALID_RECORD',
        '来源文件不存在或超过 50 MiB',
        400,
      );
    }
    const parser = parserIdentity(input.format);
    const job = this.repository.createOrGetImport({
      id: this.createId(),
      requestId: input.requestId,
      source: {
        id: this.createId(),
        format: input.format,
        displayName: basename(sourcePath),
        sourcePath,
        contentHash: await fileHash(sourcePath),
        byteSize: file.size,
        encoding: 'utf-8',
        parserName: parser.name,
        parserVersion: parser.version,
      },
    });
    return toJobView(job);
  }

  getImport(id: string): InteropImportJobView {
    const job = this.repository.getImport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导入任务不存在', 404);
    return toJobView(job);
  }

  listRecords(
    id: string,
    query: { offset: number; limit: number; status?: InteropRecord['status'] },
  ) {
    this.getImport(id);
    const page = this.repository.listRecords(id, query);
    return { ...page, items: page.items.map(toRecordView) };
  }

  startParse(id: string): InteropImportJobView {
    if (this.workers.has(id)) return this.getImport(id);
    const job = this.repository.getImport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导入任务不存在', 404);
    if (!['draft', 'interrupted', 'failed'].includes(job.status)) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_JOB_STATE_CONFLICT',
        '当前任务状态不能开始解析',
      );
    }
    const parsing = this.repository.updateImport(job.id, job.revision, {
      status: 'parsing',
      cancelRequested: false,
      errorCode: null,
      errorDetail: null,
      completedAt: null,
    });
    const worker = this.workerFactory({
      sourcePath: parsing.source.sourcePath,
      format: parsing.source.format,
      maxBytes: MAX_SOURCE_BYTES,
      maxRecords: 100_000,
      maxRecordBytes: 2_000_000,
      batchSize: 200,
    });
    this.workers.set(id, worker);
    let finished = false;
    let chain = Promise.resolve();
    worker.on('message', (message: WorkerMessage) => {
      chain = chain
        .then(async () => {
          await this.handleWorkerMessage(id, message);
          if (message.type !== 'batch') finished = true;
        })
        .catch((error: unknown) => this.failRunningJob(id, error));
    });
    worker.once('error', (error) => {
      void this.failRunningJob(id, error);
    });
    worker.once('exit', () => {
      void chain.finally(() => {
        this.workers.delete(id);
        if (!finished) this.interruptRunningJob(id);
      });
    });
    return toJobView(parsing);
  }

  async saveDecision(id: string, input: UpdateInteropRecordDecisionInput) {
    const record = this.repository.getRecord(id);
    if (!record)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导入记录不存在', 404);
    this.validateAttachmentDecision(record, input.decision);
    try {
      return toRecordView(this.repository.saveDecision(id, input.expectedRevision, input.decision));
    } catch (error) {
      if (error instanceof InteropRepositoryConflictError) {
        throw new InteropServiceError(
          'RESEARCH_INTEROP_REVISION_CONFLICT',
          '记录已变化，请刷新后重试',
        );
      }
      throw error;
    }
  }

  async cancel(id: string): Promise<InteropImportJobView> {
    const job = this.repository.getImport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导入任务不存在', 404);
    const requested = this.repository.requestCancel(id, job.revision);
    const worker = this.workers.get(id);
    if (worker) {
      await worker.terminate();
      this.workers.delete(id);
    }
    const current = this.repository.getImport(id)!;
    if (!['completed', 'cancelled', 'failed'].includes(current.status)) {
      return toJobView(
        this.repository.updateImport(id, current.revision, {
          status: 'cancelled',
          completedAt: this.clock().toISOString(),
        }),
      );
    }
    return toJobView(requested);
  }

  async commit(id: string, expectedRevision: number) {
    const job = this.repository.getImport(id);
    if (!job)
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '导入任务不存在', 404);
    if (job.status !== 'awaiting-review' || job.revision !== expectedRevision) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_REVISION_CONFLICT',
        '任务已变化，请刷新后重试',
      );
    }
    const undecided = ['valid', 'needs-review'] as const;
    for (const status of undecided) {
      if (this.repository.listRecords(id, { offset: 0, limit: 1, status }).total > 0) {
        throw new InteropServiceError(
          'RESEARCH_INTEROP_JOB_STATE_CONFLICT',
          '仍有未决定的有效记录，请先接受或跳过',
        );
      }
    }
    const accepted: InteropRecord[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = this.repository.listRecords(id, { offset, limit: 200, status: 'accepted' });
      accepted.push(...page.items);
      if (page.nextOffset === null) break;
    }
    const drafts = accepted.map((record) => this.commitDraft(job, record));
    const result = this.repository.commitRecords(id, expectedRevision, drafts);
    const attachmentResults: Array<{
      recordId: string;
      candidateId: string;
      status: 'ignored' | 'attached' | 'failed';
      error: string | null;
    }> = [];
    for (const record of accepted) {
      const decision = record.decision!;
      const editionId =
        drafts.find((draft) => draft.recordId === record.id)?.edition?.id ??
        drafts.find((draft) => draft.recordId === record.id)?.existingEditionId;
      for (const candidate of decision.attachmentCandidates) {
        if (candidate.action === 'ignore') {
          attachmentResults.push({
            recordId: record.id,
            candidateId: candidate.id,
            status: 'ignored',
            error: null,
          });
          continue;
        }
        if (candidate.action === 'unconfirmed') {
          attachmentResults.push({
            recordId: record.id,
            candidateId: candidate.id,
            status: 'failed',
            error: '附件尚未确认',
          });
          continue;
        }
        if (!editionId) {
          attachmentResults.push({
            recordId: record.id,
            candidateId: candidate.id,
            status: 'failed',
            error: '没有可绑定的 Edition',
          });
          continue;
        }
        try {
          const path = resolveAttachmentPath(job.source.sourcePath, candidate);
          await this.researchService.addLocalAttachment(editionId, {
            path,
            storageMode: candidate.action,
            role: 'other',
            displayName: candidate.displayName,
            mimeType: candidate.mimeType ?? 'application/octet-stream',
          });
          attachmentResults.push({
            recordId: record.id,
            candidateId: candidate.id,
            status: 'attached',
            error: null,
          });
        } catch (error) {
          attachmentResults.push({
            recordId: record.id,
            candidateId: candidate.id,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return { ...result, attachments: attachmentResults };
  }

  recoverInterrupted(): number {
    return this.repository.reconcileInterrupted();
  }

  async shutdown(): Promise<void> {
    const workers = [...this.workers.values()];
    this.workers.clear();
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  private async handleWorkerMessage(id: string, message: WorkerMessage): Promise<void> {
    const current = this.repository.getImport(id);
    if (!current || current.status !== 'parsing') return;
    if (message.type === 'batch') {
      const records = await Promise.all(
        message.records.map(async (record) =>
          this.addDuplicateDiagnostics(
            current,
            await this.hydrateAttachmentCandidates(current, record),
          ),
        ),
      );
      this.repository.appendParsedBatch({
        jobId: id,
        sourceId: current.source.id,
        expectedJobRevision: current.revision,
        totalCount: message.totalCount,
        checkpointOrdinal: message.checkpointOrdinal,
        records: records.map((record) => ({
          ...record,
          id: `${id}:record:${record.ordinal}`,
        })),
      });
      return;
    }
    if (message.type === 'completed') {
      this.repository.updateImport(id, current.revision, {
        status: 'awaiting-review',
        totalCount: message.totalCount,
        processedCount: message.totalCount,
        checkpointOrdinal: message.totalCount,
      });
      return;
    }
    if (message.type === 'cancelled') {
      this.repository.updateImport(id, current.revision, {
        status: 'cancelled',
        checkpointOrdinal: message.checkpointOrdinal,
        completedAt: this.clock().toISOString(),
      });
      return;
    }
    this.repository.updateImport(id, current.revision, {
      status: 'failed',
      errorCode: message.code,
      errorDetail: message.message,
      completedAt: this.clock().toISOString(),
    });
  }

  private async addDuplicateDiagnostics(
    job: InteropImportJobRecord,
    record: Omit<ParsedInteropRecordDraft, 'id'>,
  ): Promise<Omit<ParsedInteropRecordDraft, 'id'>> {
    const matches = new Map<string, { workId: string; editionId: string }>();
    if (record.mapped) {
      for (const identifier of record.mapped.identifiers) {
        const normalized = normalizedIdentifier(identifier.scheme, identifier.value);
        if (!normalized) continue;
        const found = await this.researchRepository.findIdentifierMatches(
          identifier.scheme,
          normalized,
        );
        for (const match of found) {
          matches.set(`${match.workId}:${match.editionId}`, {
            workId: match.workId,
            editionId: match.editionId,
          });
        }
      }
    }
    const sourceKeyMatches = record.sourceKey
      ? this.repository.findSourceKeyMatches(job.source.format, record.sourceKey, job.source.id)
      : [];
    for (const match of sourceKeyMatches) {
      if (match.workId && match.editionId) {
        matches.set(`${match.workId}:${match.editionId}`, {
          workId: match.workId,
          editionId: match.editionId,
        });
      }
    }
    const sameContent = sourceKeyMatches.some((match) => match.rawHash === record.rawHash);
    const changedContent = sourceKeyMatches.some((match) => match.rawHash !== record.rawHash);
    if (matches.size === 0 && !sameContent && !changedContent) return record;
    const diagnostics = [...record.diagnostics];
    if (sameContent) {
      diagnostics.push({
        code: 'source-content-match',
        severity: 'info',
        message: `来源局部 key ${record.sourceKey} 的相同内容已经处理过`,
        field: 'sourceKey',
        path: null,
        line: null,
        recoverable: true,
      });
    }
    if (changedContent) {
      diagnostics.push({
        code: 'source-key-conflict',
        severity: 'warning',
        message: `来源局部 key ${record.sourceKey} 曾对应不同内容`,
        field: 'sourceKey',
        path: null,
        line: null,
        recoverable: true,
      });
    }
    if (matches.size > 0) {
      diagnostics.push({
        code: 'duplicate-candidate',
        severity: 'warning',
        message: `标识符或来源 key 匹配到 ${matches.size} 个现有版本`,
        field: 'identifiers',
        path: null,
        line: null,
        recoverable: true,
      });
    }
    return {
      ...record,
      formatShadow:
        record.formatShadow &&
        typeof record.formatShadow === 'object' &&
        !Array.isArray(record.formatShadow)
          ? {
              ...(record.formatShadow as Record<string, unknown>),
              duplicateCandidates: [...matches.values()],
              sourceKeyMatches: sourceKeyMatches.map((match) => ({
                recordId: match.recordId,
                sameContent: match.rawHash === record.rawHash,
                workId: match.workId,
                editionId: match.editionId,
              })),
            }
          : record.formatShadow,
      status: record.status === 'invalid' ? 'invalid' : 'needs-review',
      diagnostics,
    };
  }

  private async hydrateAttachmentCandidates(
    job: InteropImportJobRecord,
    record: Omit<ParsedInteropRecordDraft, 'id'>,
  ): Promise<Omit<ParsedInteropRecordDraft, 'id'>> {
    const shadow = record.formatShadow;
    if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return record;
    const candidates = (shadow as { attachmentCandidates?: unknown }).attachmentCandidates;
    if (!Array.isArray(candidates)) return record;
    const hydrated = await Promise.all(
      (candidates as InteropAttachmentCandidate[]).map(async (candidate) => {
        const resolvedPath = resolveAttachmentPath(job.source.sourcePath, candidate);
        let exists = false;
        try {
          exists = (await stat(resolvedPath)).isFile();
        } catch {
          exists = false;
        }
        return { ...candidate, resolvedPath, exists };
      }),
    );
    return {
      ...record,
      formatShadow: { ...(shadow as Record<string, unknown>), attachmentCandidates: hydrated },
    };
  }

  private validateAttachmentDecision(record: InteropRecord, decision: InteropRecordDecision) {
    const sourceCandidates = shadowAttachmentCandidates(record);
    if (decision.action === 'skip') return;
    const decisions = new Map(
      decision.attachmentCandidates.map((candidate) => [candidate.id, candidate]),
    );
    if (
      sourceCandidates.some((candidate) => {
        const selected = decisions.get(candidate.id);
        return !selected || selected.action === 'unconfirmed';
      })
    ) {
      throw new InteropServiceError(
        'RESEARCH_INTEROP_ATTACHMENT_UNCONFIRMED',
        '请先确认每个附件候选是忽略、托管还是链接',
      );
    }
  }

  private commitDraft(
    job: InteropImportJobRecord,
    record: InteropRecord,
  ): CommitInteropRecordDraft {
    if (!record.mapped || !record.decision) {
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '已接受记录缺少映射或决定');
    }
    const decision = record.decision;
    const action =
      decision.action === 'accept'
        ? 'created'
        : decision.action === 'match-existing'
          ? 'matched'
          : decision.action === 'create-new-edition'
            ? 'new-edition'
            : 'suggestions-only';
    if (action !== 'created' && !decision.workId) {
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '该决定需要现有 Work');
    }
    const createsEdition = action === 'created' || action === 'new-edition';
    const workId = action === 'created' ? this.createId() : decision.workId!;
    const editionId = createsEdition ? this.createId() : decision.editionId;
    if (action === 'matched' && !editionId) {
      throw new InteropServiceError('RESEARCH_INTEROP_INVALID_RECORD', '匹配决定需要现有 Edition');
    }
    const sourceRecordId = this.createId();
    const observedAt = this.clock().toISOString();
    const mapped = record.mapped;
    const chosen = (field: string, fallback: unknown): unknown =>
      decision.fieldSuggestions.find((suggestion) => suggestion.field === field)?.selectedValue ??
      fallback;
    const selectedType = chosen('type', mapped.type);
    const selectedTitle = chosen('title', mapped.title);
    const selectedAbstract = chosen('abstract', mapped.abstract);
    const selectedYear = chosen('year', mapped.issued?.year ?? null);
    const finalType =
      typeof selectedType === 'string' &&
      WORK_TYPES.includes(selectedType as (typeof WORK_TYPES)[number])
        ? (selectedType as (typeof WORK_TYPES)[number])
        : mapped.type;
    const finalTitle =
      typeof selectedTitle === 'string' && selectedTitle.trim()
        ? selectedTitle.trim()
        : mapped.title || 'Untitled';
    const finalAbstract =
      selectedAbstract === null || typeof selectedAbstract === 'string'
        ? selectedAbstract
        : mapped.abstract;
    const finalYear =
      typeof selectedYear === 'number' && Number.isInteger(selectedYear) ? selectedYear : null;
    const selectedPublicationTitle = chosen('publicationTitle', mapped.publicationTitle);
    const selectedPublisher = chosen('publisher', mapped.publisher);
    const selectedPublishedDate = chosen('publishedDate', publishedDate(record));
    const selectedVolume = chosen('volume', mapped.volume);
    const selectedIssue = chosen('issue', mapped.issue);
    const selectedPages = chosen('pages', mapped.pages);
    const nullableString = (value: unknown, fallback: string | null): string | null =>
      value === null || typeof value === 'string' ? value : fallback;
    const work =
      action === 'created'
        ? {
            id: workId,
            type: finalType,
            title: finalTitle,
            titleSort: titleSort(finalTitle),
            abstract: finalAbstract,
            year: finalYear,
          }
        : null;
    const edition = createsEdition
      ? {
          id: editionId!,
          workId,
          kind: editionKind(finalType),
          title: finalTitle,
          publicationTitle: nullableString(selectedPublicationTitle, mapped.publicationTitle),
          publisher: nullableString(selectedPublisher, mapped.publisher),
          publishedDate: nullableString(selectedPublishedDate, publishedDate(record)),
          volume: nullableString(selectedVolume, mapped.volume),
          issue: nullableString(selectedIssue, mapped.issue),
          pages: nullableString(selectedPages, mapped.pages),
        }
      : null;
    const assertion = (
      entityType: 'work' | 'edition',
      entityId: string,
      fieldName: string,
      value: unknown,
      select: boolean,
    ) => ({
      id: this.createId(),
      entityType,
      entityId,
      fieldName,
      value,
      normalizedValue: typeof value === 'string' ? value.trim().toLocaleLowerCase() : null,
      select,
    });
    const selectWork = action === 'created';
    const selectEdition = createsEdition;
    const assertions = [
      assertion('work', workId, 'type', finalType, selectWork),
      assertion('work', workId, 'title', finalTitle, selectWork),
      ...(finalAbstract === null
        ? []
        : [assertion('work', workId, 'abstract', finalAbstract, selectWork)]),
      ...(finalYear === null ? [] : [assertion('work', workId, 'year', finalYear, selectWork)]),
      ...(editionId
        ? [
            assertion('edition', editionId, 'kind', editionKind(finalType), selectEdition),
            assertion('edition', editionId, 'title', finalTitle, selectEdition),
            ...(nullableString(selectedPublicationTitle, mapped.publicationTitle) === null
              ? []
              : [
                  assertion(
                    'edition',
                    editionId,
                    'publicationTitle',
                    nullableString(selectedPublicationTitle, mapped.publicationTitle),
                    selectEdition,
                  ),
                ]),
          ]
        : []),
    ];
    return {
      recordId: record.id,
      expectedRevision: record.revision,
      action,
      sourceRecord: {
        id: sourceRecordId,
        provider: `interop:${job.source.format}`,
        sourceLocator: record.sourceKey,
        rawFormat: job.source.format,
        rawPayload: record.rawRecord,
        parserVersion: job.source.parserVersion,
        observedAt,
      },
      work,
      edition,
      existingWorkId: action === 'created' ? null : workId,
      existingEditionId: createsEdition ? null : editionId,
      contributors:
        editionId && createsEdition
          ? mapped.contributors.map((person, sequence) => ({
              id: this.createId(),
              editionId,
              role: 'author',
              displayName: displayName(person),
              givenName: person.given,
              familyName: person.family,
              sequence,
            }))
          : [],
      identifiers:
        editionId && createsEdition
          ? mapped.identifiers.flatMap((identifier) => {
              const normalizedValue = normalizedIdentifier(identifier.scheme, identifier.value);
              return normalizedValue
                ? [
                    {
                      id: this.createId(),
                      entityType: 'edition' as const,
                      entityId: editionId,
                      scheme: identifier.scheme,
                      value: identifier.value,
                      normalizedValue,
                    },
                  ]
                : [];
            })
          : [],
      assertions,
    };
  }

  private async failRunningJob(id: string, error: unknown): Promise<void> {
    const current = this.repository.getImport(id);
    if (!current || current.status !== 'parsing') return;
    this.repository.updateImport(id, current.revision, {
      status: 'failed',
      errorCode: 'RESEARCH_INTEROP_INVALID_RECORD',
      errorDetail: error instanceof Error ? error.message : String(error),
      completedAt: this.clock().toISOString(),
    });
  }

  private interruptRunningJob(id: string) {
    const current = this.repository.getImport(id);
    if (!current || current.status !== 'parsing') return;
    this.repository.updateImport(id, current.revision, { status: 'interrupted' });
  }
}
