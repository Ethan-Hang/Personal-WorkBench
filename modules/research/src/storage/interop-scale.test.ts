import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import type { InteropFormat } from '../contract.js';
import { ResearchCitationService } from '../interop/citation/service.js';
import { generateCitationKeys, writeInteropRecords } from '../interop/export/model.js';
import type { InteropRepository } from '../interop/records/repository.js';
import { parseBibtexRecords } from '../interop/records/bibtex-parser.js';
import { parseCslJsonRecords } from '../interop/records/csl-json-parser.js';
import { mapInteropRecord } from '../interop/records/mapper.js';
import { parseRisRecords } from '../interop/records/ris-parser.js';
import { SqliteInteropRepository } from './sqlite-interop-repository.js';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-31T09:00:00.000Z';
const TARGET_COUNT = 10_000;
const TARGET_BYTES = 50 * 1024 * 1024;
const MAX_STAGE_MS = 120_000;
const MAX_RSS_MIB = 2_048;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createDraft(id: string, requestId = `request-${id}`) {
  return {
    id,
    requestId,
    source: {
      id: `source-${id}`,
      format: 'bibtex' as const,
      displayName: 'library.bib',
      sourcePath: '/tmp/library.bib',
      contentHash: hash(`source-${id}`),
      byteSize: 1_024,
      encoding: 'utf-8' as const,
      parserName: '@retorquere/bibtex-parser',
      parserVersion: '10.0.1',
    },
  };
}

function parsedRecord(index: number) {
  const rawRecord = `@article{shared-key, title={Paper ${index}}}`;
  return {
    id: `record-${index}`,
    ordinal: index,
    sourceKey: 'shared-key',
    rawHash: hash(rawRecord),
    rawRecord,
    summary: `Paper ${index}`,
    formatShadow: { fields: { custom: `unknown-${index}` } },
    mapped: {
      type: 'article' as const,
      sourceType: 'article',
      title: `Paper ${index}`,
      abstract: null,
      issued: { year: 2026, month: null, day: null, literal: '2026' },
      publicationTitle: null,
      publisher: null,
      volume: null,
      issue: null,
      pages: null,
      contributors: [],
      identifiers: [],
      tagSuggestions: [],
    },
    diagnostics: [],
    status: 'valid' as const,
  };
}

function paddingPlan(baseBytes: number, count = TARGET_COUNT): (index: number) => string {
  const remaining = TARGET_BYTES - baseBytes;
  if (remaining < 0) throw new Error('formal scale fixture exceeds target before padding');
  const shared = Math.floor(remaining / count);
  const remainder = remaining % count;
  return (index) => 'x'.repeat(shared + (index < remainder ? 1 : 0));
}

function bibtexCorpus(): string {
  const build = (padding: (index: number) => string) =>
    Array.from(
      { length: TARGET_COUNT },
      (_, index) => `@article{scale-${index},
  title = {Scale${index} Interoperability Study},
  author = {Smith, Jane and Doe, John},
  year = {${2000 + (index % 25)}},
  journal = {Journal ${index % 10}},
  doi = {10.1234/scale.${index}},
  abstract = {${padding(index)}},
  x-workbench = {retain-${index}}
}`,
    ).join('\n\n');
  const base = build(() => '');
  return build(paddingPlan(Buffer.byteLength(base)));
}

function risCorpus(): string {
  const build = (padding: (index: number) => string) =>
    Array.from(
      { length: TARGET_COUNT },
      (_, index) => `TY  - JOUR\r
ID  - scale-${index}\r
AU  - Smith, Jane\r
AU  - Doe, John\r
TI  - Scale${index} Interoperability Study\r
T2  - Journal ${index % 10}\r
PY  - ${2000 + (index % 25)}\r
DO  - 10.1234/scale.${index}\r
N2  - ${padding(index)}\r
XX  - retain-${index}\r
ER  - \r
`,
    ).join('');
  const base = build(() => '');
  return build(paddingPlan(Buffer.byteLength(base)));
}

function cslJsonCorpus(): string {
  const build = (padding: (index: number) => string) =>
    JSON.stringify(
      Array.from({ length: TARGET_COUNT }, (_, index) => ({
        id: `scale-${index}`,
        type: 'article-journal',
        title: `Scale${index} Interoperability Study`,
        author: [
          { family: 'Smith', given: 'Jane' },
          { family: 'Doe', given: 'John' },
        ],
        issued: { 'date-parts': [[2000 + (index % 25)]] },
        'container-title': `Journal ${index % 10}`,
        DOI: `10.1234/scale.${index}`,
        abstract: padding(index),
        custom: { 'workbench:unknown': `retain-${index}` },
      })),
    );
  const base = build(() => '');
  return build(paddingPlan(Buffer.byteLength(base)));
}

function parseCorpus(format: InteropFormat, input: string) {
  if (format === 'bibtex') return parseBibtexRecords(input);
  if (format === 'ris') return parseRisRecords(input);
  return parseCslJsonRecords(input);
}

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

function rssMiB(): number {
  return Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2));
}

async function cancellationCheckpoint(sourcePath: string): Promise<number> {
  const worker = new Worker(new URL('../interop/records/worker.mjs', import.meta.url), {
    workerData: {
      sourcePath,
      format: 'bibtex',
      maxBytes: TARGET_BYTES,
      maxRecords: TARGET_COUNT,
      batchSize: 200,
    },
  });
  return new Promise<number>((resolve, reject) => {
    let requested = false;
    worker.on('message', (message: { type?: string; checkpointOrdinal?: number }) => {
      if (message.type === 'batch' && !requested) {
        requested = true;
        worker.postMessage({ type: 'cancel' });
      } else if (message.type === 'cancelled') {
        resolve(message.checkpointOrdinal ?? 0);
      } else if (message.type === 'failed') {
        reject(new Error('formal scale cancellation worker failed'));
      }
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`formal scale cancellation worker exited ${code}`));
      else if (!requested) reject(new Error('formal scale cancellation worker produced no batch'));
    });
  });
}

describe('SqliteInteropRepository', () => {
  it('支持 10,000 条记录、重复 source key 和末页分页', () => {
    const { interopRepo, sqlite } = makeResearchDatabase(() => NOW);
    const created = interopRepo.createOrGetImport(createDraft('job-scale'));
    const parsing = interopRepo.updateImport(created.id, created.revision, {
      status: 'parsing',
      totalCount: 10_000,
    });
    const records = Array.from({ length: 10_000 }, (_, index) => parsedRecord(index));
    const parsed = interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 10_000,
      checkpointOrdinal: 10_000,
      records,
    });

    expect(parsed.counts.processed).toBe(10_000);
    expect(parsed.counts.valid).toBe(10_000);
    const page = interopRepo.listRecords(parsed.id, { offset: 9_950, limit: 50 });
    expect(page.items).toHaveLength(50);
    expect(page.items[0]?.ordinal).toBe(9_950);
    expect(page.nextOffset).toBeNull();
    expect(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM research_interop_records
           WHERE source_id = ? AND source_key = 'shared-key'`,
        )
        .get(parsed.source.id),
    ).toEqual({ count: 10_000 });
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('request id 幂等且 revision 冲突不会覆盖决定', () => {
    const { interopRepo } = makeResearchDatabase(() => NOW);
    const first = interopRepo.createOrGetImport(createDraft('job-idempotent', 'same-request'));
    const second = interopRepo.createOrGetImport(createDraft('job-ignored', 'same-request'));
    expect(second.id).toBe(first.id);

    const parsing = interopRepo.updateImport(first.id, first.revision, {
      status: 'parsing',
      totalCount: 1,
    });
    interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 1,
      checkpointOrdinal: 1,
      records: [parsedRecord(0)],
    });
    const record = interopRepo.getRecord('record-0');
    expect(record).not.toBeNull();
    const decision = {
      action: 'accept' as const,
      workId: null,
      editionId: null,
      fieldSuggestions: [],
      attachmentCandidates: [],
    };
    interopRepo.saveDecision('record-0', record!.revision, decision);
    expect(() => interopRepo.saveDecision('record-0', record!.revision, decision)).toThrow(
      /revision conflict/,
    );
  });

  it('每次操作读取当前 sqlite，账号切换后不会沿用旧库', () => {
    const first = makeResearchDatabase(() => NOW);
    const second = makeResearchDatabase(() => NOW);
    let active = first.sqlite;
    const repo = new SqliteInteropRepository(
      () => active,
      () => NOW,
    );
    repo.createOrGetImport(createDraft('job-account'));
    expect(repo.getImport('job-account')).not.toBeNull();

    active = second.sqlite;
    expect(repo.getImport('job-account')).toBeNull();
    repo.createOrGetImport(createDraft('job-second-account'));
    expect(first.interopRepo.getImport('job-second-account')).toBeNull();
    expect(second.interopRepo.getImport('job-second-account')).not.toBeNull();
  });

  it('中断恢复保留完整 checkpoint，等待审查时可直接取消', () => {
    const { interopRepo } = makeResearchDatabase(() => NOW);
    const created = interopRepo.createOrGetImport(createDraft('job-recovery'));
    const parsing = interopRepo.updateImport(created.id, created.revision, {
      status: 'parsing',
      totalCount: 2,
    });
    const checkpoint = interopRepo.appendParsedBatch({
      jobId: parsing.id,
      sourceId: parsing.source.id,
      expectedJobRevision: parsing.revision,
      totalCount: 2,
      checkpointOrdinal: 1,
      records: [parsedRecord(0)],
    });

    expect(interopRepo.reconcileInterrupted()).toBe(1);
    const interrupted = interopRepo.getImport(created.id)!;
    expect(interrupted).toMatchObject({
      status: 'interrupted',
      checkpointOrdinal: checkpoint.checkpointOrdinal,
    });
    expect(interrupted.counts.processed).toBe(1);

    const reviewing = interopRepo.updateImport(interrupted.id, interrupted.revision, {
      status: 'awaiting-review',
    });
    const cancelled = interopRepo.requestCancel(reviewing.id, reviewing.revision);
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelRequested: true,
      checkpointOrdinal: 1,
    });
  });

  it('导出范围排除回收站，preferred/all 版本策略和 key revision 可重复验证', () => {
    const { interopRepo, sqlite } = makeResearchDatabase(() => NOW);
    for (const [id, status] of [
      ['work-a', 'active'],
      ['work-b', 'active'],
      ['work-trash', 'trashed'],
    ] as const) {
      sqlite
        .prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, status, revision, created_at, updated_at)
           VALUES (?, 'article', ?, ?, ?, 1, ?, ?)`,
        )
        .run(id, id, id, status, NOW, NOW);
      for (const suffix of ['1', '2']) {
        sqlite
          .prepare(
            `INSERT INTO research_editions
             (id, work_id, kind, title, revision, created_at, updated_at)
             VALUES (?, ?, 'journal', ?, 1, ?, ?)`,
          )
          .run(`${id}-edition-${suffix}`, id, `${id}-${suffix}`, NOW, NOW);
      }
      sqlite
        .prepare('UPDATE research_works SET preferred_edition_id = ? WHERE id = ?')
        .run(`${id}-edition-2`, id);
    }
    sqlite
      .prepare(
        `INSERT INTO research_collections
         (id, parent_id, name, normalized_name, kind, sort_order, created_at, updated_at)
         VALUES ('collection-a', NULL, 'A', 'a', 'manual', 0, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_collection_entries (id, collection_id, work_id, created_at)
         VALUES ('collection-entry-a', 'collection-a', 'work-a', ?)`,
      )
      .run(NOW);

    expect(interopRepo.projectExportRecords({ kind: 'all-active' }, 'preferred')).toHaveLength(2);
    expect(interopRepo.projectExportRecords({ kind: 'all-active' }, 'all')).toHaveLength(4);
    expect(
      interopRepo.projectExportRecords(
        { kind: 'collection', collectionId: 'collection-a' },
        'preferred',
      ),
    ).toMatchObject([{ work: { id: 'work-a' }, edition: { id: 'work-a-edition-2' } }]);
    expect(
      interopRepo.projectExportRecords(
        { kind: 'selection', workIds: ['work-a', 'work-trash'] },
        'preferred',
      ),
    ).toMatchObject([{ work: { id: 'work-a' } }]);

    const saved = interopRepo.saveCitationKeyPreference({
      id: 'key-a',
      workId: 'work-a',
      editionId: null,
      preferredKey: 'Smith2026',
      expectedRevision: 0,
    });
    expect(saved).toMatchObject({ preferredKey: 'Smith2026', revision: 1, source: 'user' });
    expect(() =>
      interopRepo.saveCitationKeyPreference({
        id: 'key-a-stale',
        workId: 'work-a',
        editionId: null,
        preferredKey: 'Changed',
        expectedRevision: 0,
      }),
    ).toThrow(/revision conflict/);
  });

  const formalScale = process.env.RUN_RESEARCH_INTEROP_SCALE === '1' ? it : it.skip;
  formalScale(
    '正式实现完成三格式 10,000 条 / 50 MiB 全阶段规模验证',
    async () => {
      const database = makeResearchDatabase(() => NOW);
      const temporaryRoot = await mkdtemp(join(tmpdir(), 'research-interop-formal-scale-'));
      const metrics: {
        target: { records: number; bytesPerFormat: number };
        formats: Array<{
          format: InteropFormat;
          inputBytes: number;
          parseMs: number;
          mappingMs: number;
        }>;
        sqliteCheckpointMs: number;
        previewMs: number;
        exportMs: Record<InteropFormat, number>;
        cslMs: number;
        cancellationMs: number;
        cancellationCheckpoint: number;
        cleanupMs: number;
        maxObservedRssMiB: number;
      } = {
        target: { records: TARGET_COUNT, bytesPerFormat: TARGET_BYTES },
        formats: [],
        sqliteCheckpointMs: 0,
        previewMs: 0,
        exportMs: { bibtex: 0, ris: 0, 'csl-json': 0 },
        cslMs: 0,
        cancellationMs: 0,
        cancellationCheckpoint: 0,
        cleanupMs: 0,
        maxObservedRssMiB: rssMiB(),
      };
      const sampleMemory = () => {
        metrics.maxObservedRssMiB = Math.max(metrics.maxObservedRssMiB, rssMiB());
      };

      try {
        for (const format of ['bibtex', 'ris', 'csl-json'] as const) {
          const input =
            format === 'bibtex' ? bibtexCorpus() : format === 'ris' ? risCorpus() : cslJsonCorpus();
          expect(Buffer.byteLength(input)).toBe(TARGET_BYTES);
          if (format === 'bibtex') {
            await writeFile(join(temporaryRoot, 'cancel-scale.bib'), input, 'utf8');
          }

          const parseStartedAt = performance.now();
          const parsed = parseCorpus(format, input);
          const parseMs = elapsed(parseStartedAt);
          expect(parsed).toHaveLength(TARGET_COUNT);
          expect(parseMs).toBeLessThan(MAX_STAGE_MS);
          sampleMemory();

          const mappingStartedAt = performance.now();
          const mapped = parsed.map((record) => mapInteropRecord(record));
          const mappingMs = elapsed(mappingStartedAt);
          expect(mapped.every((record) => record.mapped?.title.startsWith('Scale'))).toBe(true);
          expect(mappingMs).toBeLessThan(MAX_STAGE_MS);
          sampleMemory();

          metrics.formats.push({
            format,
            inputBytes: Buffer.byteLength(input),
            parseMs,
            mappingMs,
          });

          if (format === 'bibtex') {
            const created = database.interopRepo.createOrGetImport({
              id: 'formal-scale-job',
              requestId: 'formal-scale-request',
              source: {
                id: 'formal-scale-source',
                format,
                displayName: 'formal-scale.bib',
                sourcePath: join(temporaryRoot, 'cancel-scale.bib'),
                contentHash: hash(input),
                byteSize: TARGET_BYTES,
                encoding: 'utf-8',
                parserName: '@retorquere/bibtex-parser + @citation-js/plugin-bibtex',
                parserVersion: '10.0.1 + 0.8.2',
              },
            });
            const parsing = database.interopRepo.updateImport(created.id, created.revision, {
              status: 'parsing',
              totalCount: TARGET_COUNT,
            });
            const sqliteStartedAt = performance.now();
            const checkpoint = database.interopRepo.appendParsedBatch({
              jobId: parsing.id,
              sourceId: parsing.source.id,
              expectedJobRevision: parsing.revision,
              totalCount: TARGET_COUNT,
              checkpointOrdinal: TARGET_COUNT,
              records: parsed.map((record, index) => ({
                id: `formal-record-${index}`,
                ordinal: record.ordinal,
                sourceKey: record.sourceKey,
                rawHash: record.rawHash,
                rawRecord: record.rawRecord,
                summary: mapped[index]!.mapped?.title ?? `Record ${index + 1}`,
                formatShadow: {
                  value: record.formatShadow,
                  attachmentCandidates: record.attachmentCandidates,
                },
                mapped: mapped[index]!.mapped,
                diagnostics: mapped[index]!.diagnostics,
                status: mapped[index]!.status,
              })),
            });
            metrics.sqliteCheckpointMs = elapsed(sqliteStartedAt);
            expect(checkpoint.checkpointOrdinal).toBe(TARGET_COUNT);
            expect(metrics.sqliteCheckpointMs).toBeLessThan(MAX_STAGE_MS);
            expect(database.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
            sampleMemory();
          }
          (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
        }

        const seedStartedAt = performance.now();
        const insertWork = database.sqlite.prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, abstract, year, status, preferred_edition_id,
            revision, created_at, updated_at)
           VALUES (?, 'article', ?, ?, NULL, ?, 'active', ?, 1, ?, ?)`,
        );
        const insertEdition = database.sqlite.prepare(
          `INSERT INTO research_editions
           (id, work_id, kind, title, publication_title, published_date, revision,
            created_at, updated_at)
           VALUES (?, ?, 'journal', ?, 'Scale Journal', ?, 1, ?, ?)`,
        );
        database.sqlite.transaction(() => {
          for (let index = 0; index < TARGET_COUNT; index += 1) {
            const workId = `scale-work-${index}`;
            const editionId = `scale-edition-${index}`;
            const title = `Scale${index} Interoperability Study`;
            const year = 2000 + (index % 25);
            insertWork.run(workId, title, title.toLocaleLowerCase(), year, editionId, NOW, NOW);
            insertEdition.run(editionId, workId, title, String(year), NOW, NOW);
          }
        })();
        expect(elapsed(seedStartedAt)).toBeLessThan(MAX_STAGE_MS);

        const previewStartedAt = performance.now();
        const projected = database.interopRepo.projectExportRecords(
          { kind: 'all-active' },
          'preferred',
        );
        const keys = generateCitationKeys(projected, new Map());
        const keyed = projected.map((record) => ({
          ...record,
          citationKey: keys.get(`${record.work.id}:${record.edition?.id ?? ''}`)!,
        }));
        metrics.previewMs = elapsed(previewStartedAt);
        expect(keyed).toHaveLength(TARGET_COUNT);
        expect(new Set(keyed.map((record) => record.citationKey)).size).toBe(TARGET_COUNT);
        expect(metrics.previewMs).toBeLessThan(MAX_STAGE_MS);
        sampleMemory();

        for (const format of ['bibtex', 'ris', 'csl-json'] as const) {
          const exportStartedAt = performance.now();
          const output = writeInteropRecords(format, keyed);
          metrics.exportMs[format] = elapsed(exportStartedAt);
          expect(parseCorpus(format, output.content)).toHaveLength(TARGET_COUNT);
          expect(metrics.exportMs[format]).toBeLessThan(MAX_STAGE_MS);
          sampleMemory();
        }

        const citationStartedAt = performance.now();
        const citation = await new ResearchCitationService({
          projectExportRecords: () => projected,
        } as unknown as InteropRepository).render({
          style: 'apa',
          locale: 'en-US',
          mode: 'bibliography',
          items: projected.map((record) => ({
            workId: record.work.id,
            editionId: record.edition?.id ?? null,
            locator: null,
            label: null,
            prefix: null,
            suffix: null,
            suppressAuthor: false,
          })),
        });
        metrics.cslMs = elapsed(citationStartedAt);
        expect(citation.itemCount).toBe(TARGET_COUNT);
        expect(citation.text).toContain('Scale0 Interoperability Study');
        expect(metrics.cslMs).toBeLessThan(MAX_STAGE_MS);
        sampleMemory();

        const cancellationStartedAt = performance.now();
        metrics.cancellationCheckpoint = await cancellationCheckpoint(
          join(temporaryRoot, 'cancel-scale.bib'),
        );
        metrics.cancellationMs = elapsed(cancellationStartedAt);
        expect(metrics.cancellationCheckpoint).toBeGreaterThan(0);
        expect(metrics.cancellationCheckpoint).toBeLessThan(TARGET_COUNT);
        expect(metrics.cancellationMs).toBeLessThan(MAX_STAGE_MS);
        sampleMemory();

        expect(metrics.maxObservedRssMiB).toBeLessThanOrEqual(MAX_RSS_MIB);
      } finally {
        database.sqlite.close();
        const cleanupStartedAt = performance.now();
        await rm(temporaryRoot, { recursive: true, force: true });
        metrics.cleanupMs = elapsed(cleanupStartedAt);
        await expect(access(temporaryRoot)).rejects.toThrow();
      }
      const metricsPath = process.env.RESEARCH_INTEROP_SCALE_METRICS;
      if (metricsPath) {
        await mkdir(dirname(metricsPath), { recursive: true });
        await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
      }
      console.log(`RESEARCH_INTEROP_SCALE_METRICS ${JSON.stringify(metrics)}`);
    },
    600_000,
  );
});
