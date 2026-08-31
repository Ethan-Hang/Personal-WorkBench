import type Database from 'better-sqlite3';
import {
  interopDiagnosticSchema,
  interopExportScopeSchema,
  interopFrozenEntitySchema,
  interopLossItemSchema,
  interopMappedRecordSchema,
  interopRecordDecisionSchema,
  type InteropFormat,
  type InteropImportJobStatus,
  type InteropRecordStatus,
} from '../contract.js';
import type {
  CitationKeyPreferenceRecord,
  CreateInteropExportPreviewDraft,
  InteropExportChanges,
  InteropExportJobRecord,
} from '../interop/export/repository.js';
import type { ExportRecordProjection } from '../interop/export/model.js';
import {
  InteropRepositoryConflictError,
  type AppendInteropBatchDraft,
  type CommitInteropImportResult,
  type CommitInteropRecordDraft,
  type CreateInteropImportDraft,
  type InteropImportCounts,
  type InteropImportJobRecord,
  type InteropJobChanges,
  type InteropRecord,
  type InteropRecordPage,
  type InteropRepository,
  type InteropSourceKeyMatch,
  type InteropSourceRecord,
  type ListInteropRecordsQuery,
} from '../interop/records/repository.js';

type Row = Record<string, unknown>;

function isoNow(): string {
  return new Date().toISOString();
}

function requiredText(row: Row, key: string): string {
  return row[key] as string;
}

function nullableText(row: Row, key: string): string | null {
  return (row[key] as string | null | undefined) ?? null;
}

function integer(row: Row, key: string): number {
  return row[key] as number;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function sourceFromRow(row: Row): InteropSourceRecord {
  return {
    id: requiredText(row, 'source_id'),
    format: requiredText(row, 'source_format') as InteropFormat,
    displayName: requiredText(row, 'source_display_name'),
    sourcePath: requiredText(row, 'source_path'),
    contentHash: requiredText(row, 'source_content_hash'),
    byteSize: integer(row, 'source_byte_size'),
    encoding: 'utf-8',
    parserName: requiredText(row, 'source_parser_name'),
    parserVersion: requiredText(row, 'source_parser_version'),
    createdAt: requiredText(row, 'source_created_at'),
  };
}

function countsFromRow(row: Row): InteropImportCounts {
  return {
    total: integer(row, 'total_count'),
    processed: integer(row, 'processed_count'),
    valid: integer(row, 'valid_count'),
    invalid: integer(row, 'invalid_count'),
    needsReview: integer(row, 'needs_review_count'),
    accepted: integer(row, 'accepted_count'),
    skipped: integer(row, 'skipped_count'),
    committed: integer(row, 'committed_count'),
    failed: integer(row, 'failed_count'),
    attachments: integer(row, 'attachment_count'),
  };
}

function jobFromRow(row: Row): InteropImportJobRecord {
  return {
    id: requiredText(row, 'job_id'),
    requestId: requiredText(row, 'request_id'),
    source: sourceFromRow(row),
    status: requiredText(row, 'job_status') as InteropImportJobStatus,
    counts: countsFromRow(row),
    checkpointOrdinal: integer(row, 'checkpoint_ordinal'),
    cancelRequested: integer(row, 'cancel_requested') === 1,
    errorCode: nullableText(row, 'error_code'),
    errorDetail: nullableText(row, 'error_detail'),
    revision: integer(row, 'job_revision'),
    createdAt: requiredText(row, 'job_created_at'),
    updatedAt: requiredText(row, 'job_updated_at'),
    completedAt: nullableText(row, 'completed_at'),
  };
}

function recordFromRow(row: Row): InteropRecord {
  const mapped = nullableText(row, 'mapped_json');
  const decision = nullableText(row, 'decision_json');
  return {
    id: requiredText(row, 'id'),
    sourceId: requiredText(row, 'source_id'),
    jobId: requiredText(row, 'job_id'),
    ordinal: integer(row, 'ordinal'),
    sourceKey: nullableText(row, 'source_key'),
    rawHash: requiredText(row, 'raw_hash'),
    rawRecord: requiredText(row, 'raw_record'),
    summary: requiredText(row, 'summary'),
    formatShadow: parseJson(requiredText(row, 'format_shadow_json')),
    mapped: mapped === null ? null : interopMappedRecordSchema.parse(parseJson(mapped)),
    diagnostics: interopDiagnosticSchema
      .array()
      .parse(parseJson(requiredText(row, 'diagnostics_json'))),
    decision: decision === null ? null : interopRecordDecisionSchema.parse(parseJson(decision)),
    status: requiredText(row, 'status') as InteropRecordStatus,
    revision: integer(row, 'revision'),
    committedSourceRecordId: nullableText(row, 'committed_source_record_id'),
    committedWorkId: nullableText(row, 'committed_work_id'),
    committedEditionId: nullableText(row, 'committed_edition_id'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
  };
}

function exportJobFromRow(row: Row): InteropExportJobRecord {
  const result = nullableText(row, 'result_json');
  return {
    id: requiredText(row, 'id'),
    requestId: requiredText(row, 'request_id'),
    status: requiredText(row, 'status') as InteropExportJobRecord['status'],
    format: requiredText(row, 'format') as InteropFormat,
    scope: interopExportScopeSchema.parse(parseJson(requiredText(row, 'scope_json'))),
    editionPolicy: requiredText(row, 'edition_policy') as 'preferred' | 'all',
    frozenEntities: interopFrozenEntitySchema
      .array()
      .parse(parseJson(requiredText(row, 'frozen_entities_json'))),
    previewToken: nullableText(row, 'preview_token'),
    targetPath: nullableText(row, 'target_path'),
    losses: interopLossItemSchema
      .array()
      .parse(parseJson(nullableText(row, 'loss_report_json') ?? '[]')),
    result:
      result === null ? null : (parseJson(result) as NonNullable<InteropExportJobRecord['result']>),
    errorCode: nullableText(row, 'error_code'),
    revision: integer(row, 'revision'),
    createdAt: requiredText(row, 'created_at'),
    updatedAt: requiredText(row, 'updated_at'),
    completedAt: nullableText(row, 'completed_at'),
  };
}

const JOB_SELECT = `
  SELECT
    job.id AS job_id,
    job.request_id,
    job.status AS job_status,
    job.total_count,
    job.processed_count,
    job.checkpoint_ordinal,
    job.cancel_requested,
    job.error_code,
    job.error_detail,
    job.revision AS job_revision,
    job.created_at AS job_created_at,
    job.updated_at AS job_updated_at,
    job.completed_at,
    source.id AS source_id,
    source.format AS source_format,
    source.display_name AS source_display_name,
    source.source_path,
    source.content_hash AS source_content_hash,
    source.byte_size AS source_byte_size,
    source.parser_name AS source_parser_name,
    source.parser_version AS source_parser_version,
    source.created_at AS source_created_at,
    COALESCE(SUM(CASE WHEN record.status = 'valid' THEN 1 ELSE 0 END), 0) AS valid_count,
    COALESCE(SUM(CASE WHEN record.status = 'invalid' THEN 1 ELSE 0 END), 0) AS invalid_count,
    COALESCE(SUM(CASE WHEN record.status = 'needs-review' THEN 1 ELSE 0 END), 0) AS needs_review_count,
    COALESCE(SUM(CASE WHEN record.status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted_count,
    COALESCE(SUM(CASE WHEN record.status = 'skipped' THEN 1 ELSE 0 END), 0) AS skipped_count,
    COALESCE(SUM(CASE WHEN record.status = 'committed' THEN 1 ELSE 0 END), 0) AS committed_count,
    COALESCE(SUM(CASE WHEN record.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
    COALESCE(SUM(json_array_length(json_extract(record.decision_json, '$.attachmentCandidates'))), 0) AS attachment_count
  FROM research_interop_import_jobs job
  JOIN research_interop_sources source ON source.id = job.source_id
  LEFT JOIN research_interop_records record ON record.job_id = job.id
`;

export class SqliteInteropRepository implements InteropRepository {
  constructor(
    private readonly getSqlite: () => Database.Database,
    private readonly clock: () => string = isoNow,
  ) {}

  private sqlite(): Database.Database {
    return this.getSqlite();
  }

  createOrGetImport(draft: CreateInteropImportDraft): InteropImportJobRecord {
    const sqlite = this.sqlite();
    const existing = sqlite
      .prepare(`${JOB_SELECT} WHERE job.request_id = ? GROUP BY job.id`)
      .get(draft.requestId) as Row | undefined;
    if (existing) return jobFromRow(existing);

    const now = this.clock();
    sqlite.transaction(() => {
      sqlite
        .prepare(
          `INSERT INTO research_interop_sources
           (id, format, display_name, source_path, content_hash, byte_size, encoding,
            parser_name, parser_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'utf-8', ?, ?, ?)`,
        )
        .run(
          draft.source.id,
          draft.source.format,
          draft.source.displayName,
          draft.source.sourcePath,
          draft.source.contentHash,
          draft.source.byteSize,
          draft.source.parserName,
          draft.source.parserVersion,
          now,
        );
      sqlite
        .prepare(
          `INSERT INTO research_interop_import_jobs
           (id, source_id, request_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 'draft', ?, ?)`,
        )
        .run(draft.id, draft.source.id, draft.requestId, now, now);
    })();
    return this.requireImport(draft.id);
  }

  getImport(id: string): InteropImportJobRecord | null {
    const row = this.sqlite().prepare(`${JOB_SELECT} WHERE job.id = ? GROUP BY job.id`).get(id) as
      Row | undefined;
    return row ? jobFromRow(row) : null;
  }

  updateImport(
    id: string,
    expectedRevision: number,
    changes: InteropJobChanges,
  ): InteropImportJobRecord {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const fields: Array<[keyof InteropJobChanges, string]> = [
      ['status', 'status'],
      ['totalCount', 'total_count'],
      ['processedCount', 'processed_count'],
      ['checkpointOrdinal', 'checkpoint_ordinal'],
      ['cancelRequested', 'cancel_requested'],
      ['errorCode', 'error_code'],
      ['errorDetail', 'error_detail'],
      ['completedAt', 'completed_at'],
    ];
    for (const [property, column] of fields) {
      if (Object.hasOwn(changes, property)) {
        assignments.push(`${column} = ?`);
        const value = changes[property];
        values.push(typeof value === 'boolean' ? Number(value) : value);
      }
    }
    if (assignments.length === 0) return this.requireImport(id);
    assignments.push('revision = revision + 1', 'updated_at = ?');
    values.push(this.clock(), id, expectedRevision);
    const result = this.sqlite()
      .prepare(
        `UPDATE research_interop_import_jobs
         SET ${assignments.join(', ')}
         WHERE id = ? AND revision = ?`,
      )
      .run(...values);
    if (result.changes !== 1) throw new InteropRepositoryConflictError('import revision conflict');
    return this.requireImport(id);
  }

  appendParsedBatch(draft: AppendInteropBatchDraft): InteropImportJobRecord {
    const sqlite = this.sqlite();
    sqlite.transaction(() => {
      const job = sqlite
        .prepare(
          `SELECT source_id, revision, status, cancel_requested
           FROM research_interop_import_jobs WHERE id = ?`,
        )
        .get(draft.jobId) as
        | { source_id: string; revision: number; status: string; cancel_requested: number }
        | undefined;
      if (
        !job ||
        job.source_id !== draft.sourceId ||
        job.revision !== draft.expectedJobRevision ||
        job.status !== 'parsing'
      ) {
        throw new InteropRepositoryConflictError('import is not at the expected parse checkpoint');
      }
      if (job.cancel_requested === 1) {
        throw new InteropRepositoryConflictError('import cancellation was requested');
      }

      const lookup = sqlite.prepare(
        `SELECT raw_hash FROM research_interop_records WHERE source_id = ? AND ordinal = ?`,
      );
      const insert = sqlite.prepare(
        `INSERT INTO research_interop_records
         (id, source_id, job_id, ordinal, source_key, raw_hash, raw_record, summary,
          format_shadow_json, mapped_json, diagnostics_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const now = this.clock();
      for (const record of draft.records) {
        const existing = lookup.get(draft.sourceId, record.ordinal) as
          { raw_hash: string } | undefined;
        if (existing) {
          if (existing.raw_hash !== record.rawHash) {
            throw new InteropRepositoryConflictError('parse resume produced a different record');
          }
          continue;
        }
        insert.run(
          record.id,
          draft.sourceId,
          draft.jobId,
          record.ordinal,
          record.sourceKey,
          record.rawHash,
          record.rawRecord,
          record.summary,
          JSON.stringify(record.formatShadow),
          record.mapped === null ? null : JSON.stringify(record.mapped),
          JSON.stringify(record.diagnostics),
          record.status,
          now,
          now,
        );
      }
      const count = sqlite
        .prepare('SELECT COUNT(*) AS count FROM research_interop_records WHERE job_id = ?')
        .get(draft.jobId) as { count: number };
      const updated = sqlite
        .prepare(
          `UPDATE research_interop_import_jobs
           SET total_count = ?, processed_count = ?, checkpoint_ordinal = ?,
               revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          draft.totalCount,
          count.count,
          draft.checkpointOrdinal,
          now,
          draft.jobId,
          draft.expectedJobRevision,
        );
      if (updated.changes !== 1) {
        throw new InteropRepositoryConflictError('import revision conflict');
      }
    })();
    return this.requireImport(draft.jobId);
  }

  listRecords(jobId: string, query: ListInteropRecordsQuery): InteropRecordPage {
    const sqlite = this.sqlite();
    const where = query.status ? 'job_id = ? AND status = ?' : 'job_id = ?';
    const parameters = query.status ? [jobId, query.status] : [jobId];
    const total = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM research_interop_records WHERE ${where}`)
      .get(...parameters) as { count: number };
    const rows = sqlite
      .prepare(
        `SELECT * FROM research_interop_records
         WHERE ${where}
         ORDER BY ordinal
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, query.limit, query.offset) as Row[];
    const nextOffset = query.offset + rows.length;
    return {
      items: rows.map(recordFromRow),
      total: total.count,
      offset: query.offset,
      limit: query.limit,
      nextOffset: nextOffset < total.count ? nextOffset : null,
    };
  }

  getRecord(id: string): InteropRecord | null {
    const row = this.sqlite()
      .prepare('SELECT * FROM research_interop_records WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? recordFromRow(row) : null;
  }

  findSourceKeyMatches(
    format: InteropFormat,
    sourceKey: string,
    excludeSourceId: string,
  ): InteropSourceKeyMatch[] {
    return this.sqlite()
      .prepare(
        `SELECT record.id AS record_id, record.raw_hash,
                record.committed_work_id AS work_id,
                record.committed_edition_id AS edition_id
         FROM research_interop_records record
         JOIN research_interop_sources source ON source.id = record.source_id
         WHERE source.format = ? AND record.source_key = ? AND record.source_id <> ?
           AND record.status = 'committed'
         ORDER BY record.updated_at DESC, record.id`,
      )
      .all(format, sourceKey, excludeSourceId)
      .map((row) => {
        const value = row as Row;
        return {
          recordId: requiredText(value, 'record_id'),
          rawHash: requiredText(value, 'raw_hash'),
          workId: nullableText(value, 'work_id'),
          editionId: nullableText(value, 'edition_id'),
        };
      });
  }

  saveDecision(
    id: string,
    expectedRevision: number,
    decision: Parameters<InteropRepository['saveDecision']>[2],
  ): InteropRecord {
    const status = decision.action === 'skip' ? 'skipped' : 'accepted';
    const result = this.sqlite()
      .prepare(
        `UPDATE research_interop_records
         SET decision_json = ?, status = ?, revision = revision + 1, updated_at = ?
         WHERE id = ? AND revision = ? AND status IN ('valid', 'needs-review', 'accepted', 'skipped')`,
      )
      .run(JSON.stringify(decision), status, this.clock(), id, expectedRevision);
    if (result.changes !== 1) throw new InteropRepositoryConflictError('record revision conflict');
    return this.requireRecord(id);
  }

  requestCancel(id: string, expectedRevision: number): InteropImportJobRecord {
    const job = this.requireImport(id);
    const terminal = ['completed', 'cancelled', 'failed'].includes(job.status);
    if (terminal) return job;
    const immediate = job.status === 'draft' || job.status === 'awaiting-review';
    return this.updateImport(id, expectedRevision, {
      cancelRequested: true,
      ...(immediate ? { status: 'cancelled' as const, completedAt: this.clock() } : {}),
    });
  }

  reconcileInterrupted(): number {
    const result = this.sqlite()
      .prepare(
        `UPDATE research_interop_import_jobs
         SET status = 'interrupted', revision = revision + 1, updated_at = ?
         WHERE status IN ('parsing', 'committing')`,
      )
      .run(this.clock());
    return result.changes;
  }

  projectExportRecords(
    scope: Parameters<InteropRepository['projectExportRecords']>[0],
    editionPolicy: 'preferred' | 'all',
  ): Array<Omit<ExportRecordProjection, 'citationKey'>> {
    const sqlite = this.sqlite();
    const workRows = sqlite
      .prepare("SELECT * FROM research_works WHERE status = 'active' ORDER BY id")
      .all() as Row[];
    let allowed: Set<string> | null = null;
    if (scope.kind === 'selection' || scope.kind === 'filter') {
      allowed = new Set(scope.workIds);
    } else if (scope.kind === 'collection') {
      allowed = new Set(
        (
          sqlite
            .prepare('SELECT work_id FROM research_collection_entries WHERE collection_id = ?')
            .all(scope.collectionId) as Array<{ work_id: string }>
        ).map((row) => row.work_id),
      );
    }
    const works = allowed
      ? workRows.filter((row) => allowed!.has(requiredText(row, 'id')))
      : workRows;
    const workIds = new Set(works.map((row) => requiredText(row, 'id')));

    const editionsByWork = new Map<string, Row[]>();
    for (const row of sqlite
      .prepare(
        `SELECT edition.* FROM research_editions edition
         JOIN research_works work ON work.id = edition.work_id
         WHERE work.status = 'active'
         ORDER BY edition.work_id, edition.created_at, edition.id`,
      )
      .all() as Row[]) {
      const workId = requiredText(row, 'work_id');
      if (!workIds.has(workId)) continue;
      const values = editionsByWork.get(workId) ?? [];
      values.push(row);
      editionsByWork.set(workId, values);
    }

    const contributors = new Map<string, ExportRecordProjection['contributors']>();
    for (const row of sqlite
      .prepare(
        `SELECT contributor.* FROM research_contributors contributor
         JOIN research_editions edition ON edition.id = contributor.edition_id
         JOIN research_works work ON work.id = edition.work_id
         WHERE work.status = 'active' AND contributor.role = 'author'
         ORDER BY contributor.edition_id, contributor.sequence, contributor.id`,
      )
      .all() as Row[]) {
      const editionId = requiredText(row, 'edition_id');
      const values = contributors.get(editionId) ?? [];
      values.push({
        displayName: requiredText(row, 'display_name'),
        givenName: nullableText(row, 'given_name'),
        familyName: nullableText(row, 'family_name'),
        sequence: integer(row, 'sequence'),
      });
      contributors.set(editionId, values);
    }

    const identifiers = new Map<string, ExportRecordProjection['identifiers']>();
    for (const row of sqlite
      .prepare(
        `SELECT identifier.* FROM research_identifiers identifier
         WHERE identifier.entity_type IN ('work', 'edition')
         ORDER BY identifier.entity_type, identifier.entity_id, identifier.scheme, identifier.id`,
      )
      .all() as Row[]) {
      const entityId = requiredText(row, 'entity_id');
      const scheme = requiredText(
        row,
        'scheme',
      ) as ExportRecordProjection['identifiers'][number]['scheme'];
      if (!['doi', 'arxiv', 'isbn', 'issn', 'pmid', 'url'].includes(scheme)) continue;
      const values = identifiers.get(entityId) ?? [];
      values.push({ scheme, value: requiredText(row, 'value') });
      identifiers.set(entityId, values);
    }

    const attachmentCounts = new Map<string, number>();
    for (const row of sqlite
      .prepare(
        `SELECT edition_id, COUNT(*) AS count FROM research_attachments
         WHERE status = 'active' GROUP BY edition_id`,
      )
      .all() as Array<{ edition_id: string; count: number }>) {
      attachmentCounts.set(row.edition_id, row.count);
    }

    const sources = new Map<string, NonNullable<ExportRecordProjection['source']>>();
    for (const row of sqlite
      .prepare(
        `SELECT entity.work_id, entity.edition_id, record.source_key, record.raw_record,
                record.format_shadow_json, record.mapped_json, source.format
         FROM research_interop_record_entities entity
         JOIN research_interop_records record ON record.id = entity.record_id
         JOIN research_interop_sources source ON source.id = record.source_id
         JOIN research_works work ON work.id = entity.work_id
         WHERE entity.is_current = 1 AND record.status = 'committed' AND work.status = 'active'
         ORDER BY entity.created_at DESC, entity.id DESC`,
      )
      .all() as Row[]) {
      const key = `${requiredText(row, 'work_id')}:${nullableText(row, 'edition_id') ?? ''}`;
      if (sources.has(key)) continue;
      const mapped = nullableText(row, 'mapped_json');
      sources.set(key, {
        format: requiredText(row, 'format') as InteropFormat,
        sourceKey: nullableText(row, 'source_key'),
        rawRecord: requiredText(row, 'raw_record'),
        formatShadow: parseJson(requiredText(row, 'format_shadow_json')),
        mapped: mapped ? interopMappedRecordSchema.parse(parseJson(mapped)) : null,
      });
    }

    const result: Array<Omit<ExportRecordProjection, 'citationKey'>> = [];
    for (const work of works) {
      const workId = requiredText(work, 'id');
      const editions = editionsByWork.get(workId) ?? [];
      const preferredId = nullableText(work, 'preferred_edition_id');
      const selectedEditions =
        editionPolicy === 'all'
          ? editions
          : preferredId
            ? editions.filter((edition) => requiredText(edition, 'id') === preferredId).slice(0, 1)
            : editions.slice(0, 1);
      const targets = selectedEditions.length > 0 ? selectedEditions : [null];
      for (const edition of targets) {
        const editionId = edition ? requiredText(edition, 'id') : null;
        result.push({
          work: {
            id: workId,
            revision: integer(work, 'revision'),
            type: requiredText(work, 'type') as ExportRecordProjection['work']['type'],
            title: requiredText(work, 'title'),
            abstract: nullableText(work, 'abstract'),
            year: (work.year as number | null | undefined) ?? null,
          },
          edition: edition
            ? {
                id: editionId!,
                revision: integer(edition, 'revision'),
                kind: requiredText(edition, 'kind'),
                title: requiredText(edition, 'title'),
                publicationTitle: nullableText(edition, 'publication_title'),
                publisher: nullableText(edition, 'publisher'),
                publishedDate: nullableText(edition, 'published_date'),
                volume: nullableText(edition, 'volume'),
                issue: nullableText(edition, 'issue'),
                pages: nullableText(edition, 'pages'),
              }
            : null,
          contributors: editionId ? (contributors.get(editionId) ?? []) : [],
          identifiers: [
            ...(identifiers.get(workId) ?? []),
            ...(editionId ? (identifiers.get(editionId) ?? []) : []),
          ],
          attachmentCount: editionId ? (attachmentCounts.get(editionId) ?? 0) : 0,
          source: sources.get(`${workId}:${editionId ?? ''}`) ?? sources.get(`${workId}:`) ?? null,
        });
      }
    }
    return result;
  }

  listCitationKeyPreferences(workIds: string[]): CitationKeyPreferenceRecord[] {
    const allowed = new Set(workIds);
    return (
      this.sqlite()
        .prepare('SELECT * FROM research_citation_key_preferences ORDER BY work_id, edition_id')
        .all() as Row[]
    )
      .filter((row) => allowed.has(requiredText(row, 'work_id')))
      .map((row) => ({
        workId: requiredText(row, 'work_id'),
        editionId: nullableText(row, 'edition_id'),
        preferredKey: requiredText(row, 'preferred_key'),
        source: requiredText(row, 'source') as CitationKeyPreferenceRecord['source'],
        revision: integer(row, 'revision'),
      }));
  }

  saveCitationKeyPreference(input: {
    id: string;
    workId: string;
    editionId: string | null;
    preferredKey: string;
    expectedRevision: number;
  }): CitationKeyPreferenceRecord {
    const sqlite = this.sqlite();
    const target = sqlite.prepare('SELECT 1 FROM research_works WHERE id = ?').get(input.workId);
    const editionMatches =
      input.editionId === null ||
      sqlite
        .prepare('SELECT 1 FROM research_editions WHERE id = ? AND work_id = ?')
        .get(input.editionId, input.workId);
    if (!target || !editionMatches) {
      throw new InteropRepositoryConflictError('citation key target does not exist');
    }
    const existing = sqlite
      .prepare(
        `SELECT * FROM research_citation_key_preferences
         WHERE work_id = ? AND ifnull(edition_id, '') = ifnull(?, '')`,
      )
      .get(input.workId, input.editionId) as Row | undefined;
    if (!existing) {
      if (input.expectedRevision !== 0)
        throw new InteropRepositoryConflictError('citation key revision conflict');
      sqlite
        .prepare(
          `INSERT INTO research_citation_key_preferences
           (id, work_id, edition_id, preferred_key, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'user', ?, ?)`,
        )
        .run(
          input.id,
          input.workId,
          input.editionId,
          input.preferredKey,
          this.clock(),
          this.clock(),
        );
    } else {
      const result = sqlite
        .prepare(
          `UPDATE research_citation_key_preferences
           SET preferred_key = ?, source = 'user', revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          input.preferredKey,
          this.clock(),
          requiredText(existing, 'id'),
          input.expectedRevision,
        );
      if (result.changes !== 1)
        throw new InteropRepositoryConflictError('citation key revision conflict');
    }
    const row = sqlite
      .prepare(
        `SELECT * FROM research_citation_key_preferences
         WHERE work_id = ? AND ifnull(edition_id, '') = ifnull(?, '')`,
      )
      .get(input.workId, input.editionId) as Row;
    return {
      workId: requiredText(row, 'work_id'),
      editionId: nullableText(row, 'edition_id'),
      preferredKey: requiredText(row, 'preferred_key'),
      source: requiredText(row, 'source') as CitationKeyPreferenceRecord['source'],
      revision: integer(row, 'revision'),
    };
  }

  createOrGetExportPreview(draft: CreateInteropExportPreviewDraft): InteropExportJobRecord {
    const sqlite = this.sqlite();
    const existing = sqlite
      .prepare('SELECT * FROM research_interop_export_jobs WHERE request_id = ?')
      .get(draft.requestId) as Row | undefined;
    if (existing) return exportJobFromRow(existing);
    const now = this.clock();
    sqlite
      .prepare(
        `INSERT INTO research_interop_export_jobs
         (id, request_id, status, format, scope_json, edition_policy, frozen_entities_json,
          preview_token, loss_report_json, created_at, updated_at)
         VALUES (?, ?, 'previewed', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.requestId,
        draft.format,
        JSON.stringify(draft.scope),
        draft.editionPolicy,
        JSON.stringify(draft.frozenEntities),
        draft.previewToken,
        JSON.stringify(draft.losses),
        now,
        now,
      );
    return this.getExport(draft.id)!;
  }

  getExport(id: string): InteropExportJobRecord | null {
    const row = this.sqlite()
      .prepare('SELECT * FROM research_interop_export_jobs WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? exportJobFromRow(row) : null;
  }

  updateExport(
    id: string,
    expectedRevision: number,
    changes: InteropExportChanges,
  ): InteropExportJobRecord {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const scalar: Array<[keyof InteropExportChanges, string]> = [
      ['status', 'status'],
      ['targetPath', 'target_path'],
      ['errorCode', 'error_code'],
      ['completedAt', 'completed_at'],
    ];
    for (const [field, column] of scalar) {
      if (Object.hasOwn(changes, field)) {
        assignments.push(`${column} = ?`);
        values.push(changes[field]);
      }
    }
    if (Object.hasOwn(changes, 'losses')) {
      assignments.push('loss_report_json = ?');
      values.push(JSON.stringify(changes.losses));
    }
    if (Object.hasOwn(changes, 'result')) {
      assignments.push('result_json = ?');
      values.push(changes.result === null ? null : JSON.stringify(changes.result));
    }
    if (assignments.length === 0) return this.getExport(id)!;
    assignments.push('revision = revision + 1', 'updated_at = ?');
    values.push(this.clock(), id, expectedRevision);
    const result = this.sqlite()
      .prepare(
        `UPDATE research_interop_export_jobs SET ${assignments.join(', ')}
         WHERE id = ? AND revision = ?`,
      )
      .run(...values);
    if (result.changes !== 1) throw new InteropRepositoryConflictError('export revision conflict');
    return this.getExport(id)!;
  }

  frozenEntitiesCurrent(
    entities: Parameters<InteropRepository['frozenEntitiesCurrent']>[0],
  ): boolean {
    const sqlite = this.sqlite();
    const workRevisions = new Map(
      (
        sqlite.prepare('SELECT id, revision FROM research_works').all() as Array<{
          id: string;
          revision: number;
        }>
      ).map((row) => [row.id, row.revision]),
    );
    const editionRevisions = new Map(
      (
        sqlite.prepare('SELECT id, revision FROM research_editions').all() as Array<{
          id: string;
          revision: number;
        }>
      ).map((row) => [row.id, row.revision]),
    );
    return entities.every(
      (entity) =>
        workRevisions.get(entity.workId) === entity.workRevision &&
        (entity.editionId === null ||
          editionRevisions.get(entity.editionId) === entity.editionRevision),
    );
  }

  commitRecords(
    jobId: string,
    expectedJobRevision: number,
    drafts: CommitInteropRecordDraft[],
  ): CommitInteropImportResult {
    const sqlite = this.sqlite();
    return sqlite.transaction(() => {
      const job = sqlite
        .prepare('SELECT status, revision FROM research_interop_import_jobs WHERE id = ?')
        .get(jobId) as { status: string; revision: number } | undefined;
      if (!job || job.status !== 'awaiting-review' || job.revision !== expectedJobRevision) {
        throw new InteropRepositoryConflictError('import is not ready to commit');
      }

      const result: CommitInteropImportResult = {
        created: 0,
        newEdition: 0,
        matched: 0,
        suggestionsOnly: 0,
        skipped: 0,
        failed: 0,
      };
      const now = this.clock();
      for (const draft of drafts) {
        const record = sqlite
          .prepare(
            `SELECT status, revision FROM research_interop_records
             WHERE id = ? AND job_id = ?`,
          )
          .get(draft.recordId, jobId) as { status: string; revision: number } | undefined;
        if (!record || record.status !== 'accepted' || record.revision !== draft.expectedRevision) {
          throw new InteropRepositoryConflictError('accepted record changed before commit');
        }
        sqlite
          .prepare(
            `INSERT INTO research_source_records
             (id, provider, source_locator, raw_format, raw_payload, parser_version, observed_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            draft.sourceRecord.id,
            draft.sourceRecord.provider,
            draft.sourceRecord.sourceLocator,
            draft.sourceRecord.rawFormat,
            draft.sourceRecord.rawPayload,
            draft.sourceRecord.parserVersion,
            draft.sourceRecord.observedAt,
            now,
          );
        if (draft.work) {
          sqlite
            .prepare(
              `INSERT INTO research_works
               (id, type, title, title_sort, abstract, year, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              draft.work.id,
              draft.work.type,
              draft.work.title,
              draft.work.titleSort,
              draft.work.abstract,
              draft.work.year,
              now,
              now,
            );
        }
        if (draft.edition) {
          sqlite
            .prepare(
              `INSERT INTO research_editions
               (id, work_id, kind, title, publication_title, publisher, published_date,
                volume, issue, pages, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              draft.edition.id,
              draft.edition.workId,
              draft.edition.kind,
              draft.edition.title,
              draft.edition.publicationTitle,
              draft.edition.publisher,
              draft.edition.publishedDate,
              draft.edition.volume,
              draft.edition.issue,
              draft.edition.pages,
              now,
              now,
            );
          if (draft.work) {
            sqlite
              .prepare(
                `UPDATE research_works SET preferred_edition_id = ?, updated_at = ? WHERE id = ?`,
              )
              .run(draft.edition.id, now, draft.work.id);
          }
        }
        for (const contributor of draft.contributors) {
          sqlite
            .prepare(
              `INSERT INTO research_contributors
               (id, edition_id, role, display_name, given_name, family_name, sequence)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              contributor.id,
              contributor.editionId,
              contributor.role,
              contributor.displayName,
              contributor.givenName,
              contributor.familyName,
              contributor.sequence,
            );
        }
        for (const identifier of draft.identifiers) {
          sqlite
            .prepare(
              `INSERT INTO research_identifiers
               (id, entity_type, entity_id, scheme, value, normalized_value, source_record_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              identifier.id,
              identifier.entityType,
              identifier.entityId,
              identifier.scheme,
              identifier.value,
              identifier.normalizedValue,
              draft.sourceRecord.id,
              now,
            );
        }
        for (const assertion of draft.assertions) {
          sqlite
            .prepare(
              `INSERT INTO research_metadata_assertions
               (id, entity_type, entity_id, field_name, value_json, normalized_value,
                source_kind, source_record_id, observed_at, is_user_confirmed, is_selected, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'external', ?, ?, 0, ?, ?)`,
            )
            .run(
              assertion.id,
              assertion.entityType,
              assertion.entityId,
              assertion.fieldName,
              JSON.stringify(assertion.value),
              assertion.normalizedValue,
              draft.sourceRecord.id,
              draft.sourceRecord.observedAt,
              Number(assertion.select),
              now,
            );
        }
        const workId = draft.work?.id ?? draft.edition?.workId ?? draft.existingWorkId;
        const editionId = draft.edition?.id ?? draft.existingEditionId;
        sqlite
          .prepare(
            `UPDATE research_interop_record_entities SET is_current = 0
             WHERE record_id = ? AND is_current = 1`,
          )
          .run(draft.recordId);
        sqlite
          .prepare(
            `INSERT INTO research_interop_record_entities
             (id, record_id, work_id, edition_id, action, is_current, created_at)
             VALUES (?, ?, ?, ?, ?, 1, ?)`,
          )
          .run(
            `${draft.recordId}:entity:${draft.expectedRevision}`,
            draft.recordId,
            workId,
            editionId,
            draft.action,
            now,
          );
        sqlite
          .prepare(
            `UPDATE research_interop_records
             SET status = 'committed', committed_source_record_id = ?, committed_work_id = ?,
                 committed_edition_id = ?, revision = revision + 1, updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            draft.sourceRecord.id,
            workId,
            editionId,
            now,
            draft.recordId,
            draft.expectedRevision,
          );
        if (draft.action === 'created') result.created += 1;
        else if (draft.action === 'new-edition') result.newEdition += 1;
        else if (draft.action === 'matched') result.matched += 1;
        else result.suggestionsOnly += 1;
      }
      result.skipped = (
        sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM research_interop_records
             WHERE job_id = ? AND status = 'skipped'`,
          )
          .get(jobId) as { count: number }
      ).count;
      sqlite
        .prepare(
          `UPDATE research_interop_import_jobs
           SET status = 'completed', processed_count = total_count,
               revision = revision + 1, updated_at = ?, completed_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(now, now, jobId, expectedJobRevision);
      return result;
    })();
  }

  private requireImport(id: string): InteropImportJobRecord {
    const job = this.getImport(id);
    if (!job) throw new Error(`interop import not found: ${id}`);
    return job;
  }

  private requireRecord(id: string): InteropRecord {
    const record = this.getRecord(id);
    if (!record) throw new Error(`interop record not found: ${id}`);
    return record;
  }
}
