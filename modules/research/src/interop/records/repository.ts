import type {
  InteropDiagnostic,
  InteropFormat,
  InteropImportJobStatus,
  InteropMappedRecord,
  InteropRecordDecision,
  InteropRecordStatus,
} from '../../contract.js';
import type { InteropExportRepository } from '../export/repository.js';

export interface InteropSourceRecord {
  id: string;
  format: InteropFormat;
  displayName: string;
  sourcePath: string;
  contentHash: string;
  byteSize: number;
  encoding: 'utf-8';
  parserName: string;
  parserVersion: string;
  createdAt: string;
}

export interface InteropImportCounts {
  total: number;
  processed: number;
  valid: number;
  invalid: number;
  needsReview: number;
  accepted: number;
  skipped: number;
  committed: number;
  failed: number;
  attachments: number;
}

export interface InteropImportJobRecord {
  id: string;
  requestId: string;
  source: InteropSourceRecord;
  status: InteropImportJobStatus;
  counts: InteropImportCounts;
  checkpointOrdinal: number;
  cancelRequested: boolean;
  errorCode: string | null;
  errorDetail: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface InteropRecord {
  id: string;
  sourceId: string;
  jobId: string;
  ordinal: number;
  sourceKey: string | null;
  rawHash: string;
  rawRecord: string;
  summary: string;
  formatShadow: unknown;
  mapped: InteropMappedRecord | null;
  diagnostics: InteropDiagnostic[];
  decision: InteropRecordDecision | null;
  status: InteropRecordStatus;
  revision: number;
  committedSourceRecordId: string | null;
  committedWorkId: string | null;
  committedEditionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InteropRecordPage {
  items: InteropRecord[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
}

export interface InteropSourceKeyMatch {
  recordId: string;
  rawHash: string;
  workId: string | null;
  editionId: string | null;
}

export interface CreateInteropImportDraft {
  id: string;
  requestId: string;
  source: Omit<InteropSourceRecord, 'createdAt'>;
}

export interface ParsedInteropRecordDraft {
  id: string;
  ordinal: number;
  sourceKey: string | null;
  rawHash: string;
  rawRecord: string;
  summary: string;
  formatShadow: unknown;
  mapped: InteropMappedRecord | null;
  diagnostics: InteropDiagnostic[];
  status: Extract<InteropRecordStatus, 'valid' | 'invalid' | 'needs-review'>;
}

export interface InteropJobChanges {
  status?: InteropImportJobStatus;
  totalCount?: number;
  processedCount?: number;
  checkpointOrdinal?: number;
  cancelRequested?: boolean;
  errorCode?: string | null;
  errorDetail?: string | null;
  completedAt?: string | null;
}

export interface AppendInteropBatchDraft {
  jobId: string;
  sourceId: string;
  expectedJobRevision: number;
  totalCount: number;
  checkpointOrdinal: number;
  records: ParsedInteropRecordDraft[];
}

export interface ListInteropRecordsQuery {
  offset: number;
  limit: number;
  status?: InteropRecordStatus;
}

export interface CommitInteropRecordDraft {
  recordId: string;
  expectedRevision: number;
  action: 'created' | 'new-edition' | 'matched' | 'suggestions-only';
  sourceRecord: {
    id: string;
    provider: string;
    sourceLocator: string | null;
    rawFormat: string;
    rawPayload: string;
    parserVersion: string;
    observedAt: string;
  };
  work: {
    id: string;
    type: string;
    title: string;
    titleSort: string;
    abstract: string | null;
    year: number | null;
  } | null;
  edition: {
    id: string;
    workId: string;
    kind: string;
    title: string;
    publicationTitle: string | null;
    publisher: string | null;
    publishedDate: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
  } | null;
  existingWorkId: string | null;
  existingEditionId: string | null;
  contributors: Array<{
    id: string;
    editionId: string;
    role: string;
    displayName: string;
    givenName: string | null;
    familyName: string | null;
    sequence: number;
  }>;
  identifiers: Array<{
    id: string;
    entityType: 'work' | 'edition';
    entityId: string;
    scheme: string;
    value: string;
    normalizedValue: string;
  }>;
  assertions: Array<{
    id: string;
    entityType: 'work' | 'edition';
    entityId: string;
    fieldName: string;
    value: unknown;
    normalizedValue: string | null;
    select: boolean;
  }>;
}

export interface CommitInteropImportResult {
  created: number;
  newEdition: number;
  matched: number;
  suggestionsOnly: number;
  skipped: number;
  failed: number;
}

export interface InteropRepository extends InteropExportRepository {
  createOrGetImport(draft: CreateInteropImportDraft): InteropImportJobRecord;
  getImport(id: string): InteropImportJobRecord | null;
  updateImport(
    id: string,
    expectedRevision: number,
    changes: InteropJobChanges,
  ): InteropImportJobRecord;
  appendParsedBatch(draft: AppendInteropBatchDraft): InteropImportJobRecord;
  listRecords(jobId: string, query: ListInteropRecordsQuery): InteropRecordPage;
  getRecord(id: string): InteropRecord | null;
  findSourceKeyMatches(
    format: InteropFormat,
    sourceKey: string,
    excludeSourceId: string,
  ): InteropSourceKeyMatch[];
  saveDecision(
    id: string,
    expectedRevision: number,
    decision: InteropRecordDecision,
  ): InteropRecord;
  requestCancel(id: string, expectedRevision: number): InteropImportJobRecord;
  reconcileInterrupted(): number;
  commitRecords(
    jobId: string,
    expectedJobRevision: number,
    drafts: CommitInteropRecordDraft[],
  ): CommitInteropImportResult;
}

export class InteropRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteropRepositoryConflictError';
  }
}
