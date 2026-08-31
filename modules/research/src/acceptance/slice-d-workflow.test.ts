import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  citationRenderResultSchema,
  interopAdapterListSchema,
  interopAdapterNegotiationResultSchema,
  interopExportJobViewSchema,
  interopExportPreviewSchema,
  interopImportJobViewSchema,
  interopImportRecordsPageSchema,
  writingDocumentDetailSchema,
  type InteropFormat,
} from '../contract.js';
import { canonicalResearchLibraryV3Schema } from '../interop/canonical.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { createResearchServerModule } from '../server/index.js';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-31T12:00:00.000Z';
const roots: string[] = [];
const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];

const sourceContents: Record<InteropFormat, string> = {
  bibtex: `@article{article-key,
  title={Interoperability Article},
  author={Smith, Jane},
  year={2026},
  journal={Journal of Tests},
  doi={10.1000/slice-d},
  keywords={interop, review},
  file={missing-paper.pdf},
  x-workbench={retain me}
}
@article{broken,title={Broken}
@techreport{report-key,title={Interoperability Report},year={2025},institution={Lab}}`,
  ris: `TY  - JOUR\r
ID  - ris-key\r
AU  - Doe, John\r
TI  - RIS Interoperability\r
PY  - 2024\r
XX  - retain-ris\r
ER  - \r
TY  - RPRT\r
TI  - Missing terminator\r
`,
  'csl-json': JSON.stringify([
    {
      id: 'csl-key',
      type: 'chapter',
      title: 'CSL Interoperability',
      author: [{ literal: 'Research Group' }],
      issued: { 'date-parts': [[2023]] },
      custom: { 'workbench:unknown': 'retain-csl' },
    },
    42,
  ]),
};

afterEach(async () => {
  for (const database of databases.splice(0)) {
    if (database.sqlite.open) database.sqlite.close();
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-slice-d-acceptance-'));
  roots.push(root);
  const sourcePaths = {
    bibtex: join(root, 'library.bib'),
    ris: join(root, 'library.ris'),
    'csl-json': join(root, 'library.json'),
  } satisfies Record<InteropFormat, string>;
  await Promise.all(
    (Object.keys(sourcePaths) as InteropFormat[]).map((format) =>
      writeFile(sourcePaths[format], sourceContents[format], 'utf8'),
    ),
  );
  const database = makeResearchDatabase(() => NOW);
  databases.push(database);
  let sequence = 0;
  const module = createResearchServerModule({
    repository: database.repo,
    knowledgeRepository: database.knowledgeRepo,
    interopRepository: database.interopRepo,
    managedRoot: () => join(root, 'managed'),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
    interopFilePicker: {
      pickInteropSource: async (options) => sourcePaths[options?.format ?? 'bibtex'],
    },
    interopOutputDialog: {
      saveInterop: async ({ format }) =>
        join(root, `export.${format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'json'}`),
    },
    createId: () => `slice-d-${++sequence}`,
    clock: () => new Date(NOW),
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { app, database, root, sourcePaths };
}

async function waitForImport(
  app: Awaited<ReturnType<typeof buildApp>>,
  id: string,
): Promise<ReturnType<typeof interopImportJobViewSchema.parse>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopImport(id) });
    const job = interopImportJobViewSchema.parse(response.json());
    if (['awaiting-review', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('slice D import did not settle');
}

async function importForReview(
  app: Awaited<ReturnType<typeof buildApp>>,
  format: InteropFormat,
  sourcePath: string,
) {
  const picked = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.interopImportPickSource,
    payload: { format },
  });
  expect(picked.statusCode, picked.body).toBe(200);
  expect(picked.json()).toMatchObject({ source: { path: sourcePath, inferredFormat: format } });
  const createdResponse = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.interopImports,
    payload: {
      requestId: `slice-d-${format}`,
      sourcePath,
      displayName: basename(sourcePath),
      format,
    },
  });
  expect(createdResponse.statusCode, createdResponse.body).toBe(201);
  const created = interopImportJobViewSchema.parse(createdResponse.json());
  const started = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.interopImportParse(created.id),
  });
  expect(started.statusCode, started.body).toBe(202);
  const job = await waitForImport(app, created.id);
  expect(job.status).toBe('awaiting-review');
  const records = interopImportRecordsPageSchema.parse(
    (
      await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.interopImportRecords(created.id)}?offset=0&limit=50`,
      })
    ).json(),
  );
  return { job, records };
}

async function waitForExport(app: Awaited<ReturnType<typeof buildApp>>, id: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopExport(id) });
    const job = interopExportJobViewSchema.parse(response.json());
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('slice D export did not settle');
}

describe('slice D bibliographic interoperability workflow', () => {
  it('贯通三格式审查、事务提交、冻结导出、引用、写作 intent、adapter 与 canonical v3', async () => {
    const { app, database, root, sourcePaths } = await fixture();
    try {
      // D-01/D-02/D-06/D-07: three real parsers retain valid, invalid, unknown and attachment data.
      const bibtex = await importForReview(app, 'bibtex', sourcePaths.bibtex);
      const ris = await importForReview(app, 'ris', sourcePaths.ris);
      const csl = await importForReview(app, 'csl-json', sourcePaths['csl-json']);
      expect(bibtex.records.items).toHaveLength(3);
      expect(ris.records.items).toHaveLength(2);
      expect(csl.records.items).toHaveLength(2);
      expect(
        [bibtex, ris, csl].every(({ records }) =>
          records.items.some((item) => item.status === 'invalid'),
        ),
      ).toBe(true);
      expect(bibtex.records.items[0]?.rawRecord).toContain('x-workbench');
      expect(ris.records.items[0]?.rawRecord).toContain('XX  - retain-ris');
      expect(csl.records.items[0]?.formatShadow).toMatchObject({
        value: { item: { custom: { 'workbench:unknown': 'retain-csl' } } },
      });
      expect(bibtex.records.items[0]?.formatShadow).toMatchObject({
        attachmentCandidates: [expect.objectContaining({ action: 'unconfirmed' })],
      });

      // D-03/D-04/D-05: reviewed decisions are record-scoped and the commit is transactional.
      for (const record of bibtex.records.items.filter((item) => item.status !== 'invalid')) {
        const candidates = (
          record.formatShadow as {
            attachmentCandidates?: Array<Record<string, unknown>>;
          }
        ).attachmentCandidates;
        const saved = await app.inject({
          method: 'PUT',
          url: RESEARCH_API_V1.interopImportRecordDecision(bibtex.job.id, record.id),
          payload: {
            expectedRevision: record.revision,
            decision: {
              action: 'accept',
              fieldSuggestions: [
                {
                  field: 'title',
                  currentValue: null,
                  sourceValue: record.mapped?.title ?? null,
                  selectedValue: record.mapped?.title ?? null,
                  selection: 'source',
                  userConfirmed: true,
                  conflict: false,
                },
              ],
              attachmentCandidates: (candidates ?? []).map((candidate) => ({
                ...candidate,
                action: 'ignore',
              })),
            },
          },
        });
        expect(saved.statusCode, saved.body).toBe(200);
      }
      const committedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportCommit(bibtex.job.id),
        payload: { expectedRevision: bibtex.job.revision },
      });
      expect(committedResponse.statusCode, committedResponse.body).toBe(200);
      expect(committedResponse.json()).toMatchObject({ created: 2, failed: 0 });
      expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_works').get()).toEqual(
        { count: 2 },
      );
      expect(database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_notes').get()).toEqual(
        { count: 0 },
      );
      expect(database.sqlite.pragma('foreign_key_check')).toEqual([]);

      const entities = database.sqlite
        .prepare(
          `SELECT record.committed_work_id AS work_id, record.committed_edition_id AS edition_id
           FROM research_interop_records record
           WHERE record.job_id = ? AND record.status = 'committed'
           ORDER BY record.ordinal`,
        )
        .all(bibtex.job.id) as Array<{ work_id: string; edition_id: string }>;
      const primary = entities[0]!;

      // D-11/D-13: user key and writing citation preserve stable Work/Edition identities.
      const keyResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopCitationKey(primary.work_id),
        payload: {
          editionId: primary.edition_id,
          preferredKey: 'Smith2026Interop',
          expectedRevision: 0,
        },
      });
      expect(keyResponse.statusCode, keyResponse.body).toBe(200);
      const writingResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.writingDocuments,
        payload: { title: 'Slice D synthesis' },
      });
      expect(writingResponse.statusCode, writingResponse.body).toBe(200);
      const writing = writingDocumentDetailSchema.parse(writingResponse.json());
      const structureResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.writingDocumentStructure(writing.id),
        payload: {
          expectedStructureRevision: writing.structureRevision,
          sections: [
            {
              title: 'Synthesis',
              position: 0,
              blocks: [
                {
                  kind: 'citation',
                  targetId: primary.work_id,
                  editionId: primary.edition_id,
                  locator: '12',
                  label: 'page',
                  prefix: 'see ',
                  suffix: null,
                  suppressAuthor: false,
                  position: 0,
                },
              ],
            },
          ],
        },
      });
      expect(structureResponse.statusCode, structureResponse.body).toBe(200);
      const structured = writingDocumentDetailSchema.parse(structureResponse.json());
      expect(structured.sections[0]?.blocks[0]).toMatchObject({
        kind: 'citation',
        targetId: primary.work_id,
        citation: { editionId: primary.edition_id, locator: '12' },
      });

      // D-08/D-09/D-10/D-12/D-14: freeze, write, reparse and render through formal HTTP routes.
      for (const format of ['bibtex', 'ris', 'csl-json'] as const) {
        const preview = interopExportPreviewSchema.parse(
          (
            await app.inject({
              method: 'POST',
              url: RESEARCH_API_V1.interopExportPreview,
              payload: {
                requestId: `slice-d-export-${format}`,
                format,
                scope: { kind: 'all-active' },
                editionPolicy: 'preferred',
              },
            })
          ).json(),
        );
        expect(preview).toMatchObject({ workCount: 2, recordCount: 2 });
        const picked = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.interopExportPickTarget,
          payload: { format },
        });
        const targetPath = (picked.json() as { path: string }).path;
        const started = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.interopExport(preview.jobId),
          payload: {
            previewToken: preview.previewToken,
            expectedRevision: preview.revision,
            targetPath,
            overwriteConfirmed: false,
          },
        });
        expect(started.statusCode, started.body).toBe(202);
        expect(await waitForExport(app, preview.jobId)).toMatchObject({
          status: 'completed',
          result: { recordCount: 2 },
        });
        expect((await readFile(targetPath, 'utf8')).length).toBeGreaterThan(20);
      }
      for (const style of ['apa', 'ieee', 'chicago-author-date'] as const) {
        const citation = citationRenderResultSchema.parse(
          (
            await app.inject({
              method: 'POST',
              url: RESEARCH_API_V1.interopCitationRender,
              payload: {
                style,
                mode: 'bibliography',
                items: entities.map((entity) => ({
                  workId: entity.work_id,
                  editionId: entity.edition_id,
                })),
              },
            })
          ).json(),
        );
        expect(citation).toMatchObject({ style, itemCount: 2 });
        expect(citation.text).toContain('Interoperability');
        expect(citation.html).not.toMatch(/<script|style=/i);
      }

      // D-15: capability negotiation never turns an unsupported capability into empty success.
      const adapters = interopAdapterListSchema.parse(
        (await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopAdapters })).json(),
      );
      expect(adapters.adapters.map((adapter) => adapter.id)).toEqual(['bibtex', 'ris', 'csl-json']);
      const unsupported = interopAdapterNegotiationResultSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopAdapterNegotiate,
            payload: {
              adapterId: 'bibtex',
              capability: 'annotations',
              operation: 'import',
              protocolVersion: '1.0.0',
            },
          })
        ).json(),
      );
      expect(unsupported).toMatchObject({
        supported: false,
        diagnostics: [{ code: 'capability-unsupported' }],
      });

      // D-16: canonical v3 carries true interop state, not local paths, jobs or previews.
      const canonical = canonicalResearchLibraryV3Schema.parse(
        await database.repo.exportCanonicalSnapshot(NOW),
      );
      expect(canonical.interop).toMatchObject({
        sources: expect.arrayContaining([
          expect.objectContaining({ format: 'bibtex' }),
          expect.objectContaining({ format: 'ris' }),
          expect.objectContaining({ format: 'csl-json' }),
        ]),
        citationKeyPreferences: [expect.objectContaining({ preferredKey: 'Smith2026Interop' })],
      });
      expect(canonical.interop.records).toHaveLength(7);
      expect(canonical.knowledge.writingBlocks).toContainEqual(
        expect.objectContaining({
          kind: 'citation',
          workId: primary.work_id,
          editionId: primary.edition_id,
        }),
      );
      const serialized = JSON.stringify(canonical);
      expect(serialized).toContain('x-workbench');
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain('previewToken');
      expect(serialized).not.toContain('research_interop_export_jobs');

      const restored = makeResearchDatabase(() => NOW);
      databases.push(restored);
      expect(await restored.repo.canonicalImportTargetIsEmpty()).toBe(true);
      const report = await restored.repo.importCanonicalSnapshot(canonical);
      expect(report.recordCount).toBeGreaterThan(7);
      expect(restored.sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(
        restored.sqlite
          .prepare('SELECT preferred_key FROM research_citation_key_preferences')
          .get(),
      ).toEqual({ preferred_key: 'Smith2026Interop' });
      expect(
        restored.sqlite
          .prepare('SELECT source_path FROM research_interop_sources ORDER BY id LIMIT 1')
          .get(),
      ).toMatchObject({ source_path: expect.stringMatching(/^canonical:\/\/restored\//) });
      expect(
        restored.sqlite
          .prepare(
            "SELECT citation_intent_json FROM research_writing_blocks WHERE kind = 'citation'",
          )
          .get(),
      ).toMatchObject({ citation_intent_json: expect.stringContaining('"locator":"12"') });
      expect(
        restored.sqlite.prepare('SELECT COUNT(*) AS count FROM research_interop_export_jobs').get(),
      ).toEqual({ count: 0 });

      // D-17 is the opt-in formal scale test; D-18 is the fresh-profile visual script.
      expect(await readFile(sourcePaths.bibtex, 'utf8')).toBe(sourceContents.bibtex);
      expect((await readdir(root)).every((name) => !/\.tmp-|\.bak-/.test(name))).toBe(true);
    } finally {
      await app.close();
    }
  }, 30_000);
});
