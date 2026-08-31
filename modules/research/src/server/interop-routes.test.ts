import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  interopImportJobViewSchema,
  interopImportRecordsPageSchema,
  interopExportJobViewSchema,
  interopExportPreviewSchema,
  citationRenderResultSchema,
  interopAdapterListSchema,
  interopAdapterNegotiationResultSchema,
} from '../contract.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { SqliteInteropRepository } from '../storage/sqlite-interop-repository.js';
import { SqliteResearchRepository } from '../storage/sqlite-repository.js';
import { createResearchServerModule } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function fixture(contents: string, extension = 'bib') {
  const root = await mkdtemp(join(tmpdir(), 'research-interop-routes-'));
  temporaryDirectories.push(root);
  const source = join(root, `library.${extension}`);
  const exportTarget = join(root, 'export.bib');
  await writeFile(source, contents, 'utf8');
  const { sqlite } = openTestDatabase();
  const repository = new SqliteResearchRepository(() => sqlite);
  const interopRepository = new SqliteInteropRepository(() => sqlite);
  const metadata = {
    resolve: async () => ({
      candidates: [],
      sources: [],
      diagnostics: [],
      disclosure: { services: [], sentFields: [], sendsPdf: false as const },
    }),
  } as unknown as MetadataCoordinator;
  const module = createResearchServerModule({
    repository,
    interopRepository,
    managedRoot: () => join(root, 'managed'),
    metadata,
    filePicker: { pick: async () => [] },
    interopFilePicker: { pickInteropSource: async () => source },
    interopOutputDialog: { saveInterop: async () => exportTarget },
  });
  const app = await buildApp({ getSqlite: () => sqlite, modules: [module] });
  return { app, sqlite, source, exportTarget };
}

async function waitForReview(app: Awaited<ReturnType<typeof buildApp>>, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopImport(id) });
    const job = interopImportJobViewSchema.parse(response.json());
    if (job.status === 'awaiting-review' || job.status === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('interop parse did not finish');
}

async function createAndParse(
  app: Awaited<ReturnType<typeof buildApp>>,
  source: string,
  requestId: string,
) {
  await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.interopImportPickSource,
    payload: { format: 'bibtex' },
  });
  const created = interopImportJobViewSchema.parse(
    (
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImports,
        payload: { requestId, sourcePath: source, displayName: 'library.bib', format: 'bibtex' },
      })
    ).json(),
  );
  await app.inject({ method: 'POST', url: RESEARCH_API_V1.interopImportParse(created.id) });
  const job = await waitForReview(app, created.id);
  const page = interopImportRecordsPageSchema.parse(
    (
      await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.interopImportRecords(created.id),
      })
    ).json(),
  );
  return { job, page };
}

async function waitForExport(app: Awaited<ReturnType<typeof buildApp>>, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopExport(id) });
    const job = interopExportJobViewSchema.parse(response.json());
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('interop export did not finish');
}

describe('research interop HTTP API', () => {
  it('公开稳定 adapter registry，并让未实现能力明确返回 unsupported', async () => {
    const { app, sqlite } = await fixture('@article{a, title={A}}');
    try {
      const listed = interopAdapterListSchema.parse(
        (await app.inject({ method: 'GET', url: RESEARCH_API_V1.interopAdapters })).json(),
      );
      expect(listed.adapters.map((adapter) => adapter.id)).toEqual(['bibtex', 'ris', 'csl-json']);

      const negotiated = interopAdapterNegotiationResultSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopAdapterNegotiate,
            payload: {
              adapterId: 'bibtex',
              capability: 'records',
              operation: 'export',
              protocolVersion: '1.0.0',
            },
          })
        ).json(),
      );
      expect(negotiated).toMatchObject({ supported: true, adapterId: 'bibtex' });

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
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('完成选择、解析、分页审查、决定和事务提交', async () => {
    const { app, sqlite, source } = await fixture(`@article{smith2026,
  title = {Research Interop},
  author = {Smith, Jane},
  year = {2026},
  journal = {Journal of Tests},
  doi = {10.1000/interop}
}`);
    try {
      const pickedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportPickSource,
        payload: { format: 'bibtex' },
      });
      expect(pickedResponse.statusCode).toBe(200);
      expect(pickedResponse.json()).toMatchObject({
        source: { path: source, inferredFormat: 'bibtex' },
        cancelled: false,
      });

      const createdResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImports,
        payload: {
          requestId: 'route-interop',
          sourcePath: source,
          displayName: 'library.bib',
          format: 'bibtex',
        },
      });
      expect(createdResponse.statusCode).toBe(201);
      const created = interopImportJobViewSchema.parse(createdResponse.json());

      const parseResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportParse(created.id),
      });
      expect(parseResponse.statusCode).toBe(202);
      const review = await waitForReview(app, created.id);
      expect(review).toMatchObject({
        status: 'awaiting-review',
        summary: { total: 1, processed: 1, valid: 1 },
      });

      const pageResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.interopImportRecords(created.id)}?offset=0&limit=50`,
      });
      const page = interopImportRecordsPageSchema.parse(pageResponse.json());
      expect(page.items[0]).toMatchObject({
        sourceKey: 'smith2026',
        mapped: {
          title: 'Research Interop',
          identifiers: [{ scheme: 'doi', value: '10.1000/interop' }],
        },
      });

      const decisionResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(created.id, page.items[0]!.id),
        payload: {
          expectedRevision: page.items[0]!.revision,
          decision: {
            action: 'accept',
            fieldSuggestions: [
              {
                field: 'title',
                currentValue: null,
                sourceValue: 'Research Interop',
                selectedValue: 'Reviewed Interop',
                selection: 'custom',
                userConfirmed: true,
                conflict: true,
              },
            ],
          },
        },
      });
      expect(decisionResponse.statusCode).toBe(200);

      const commitResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportCommit(created.id),
        payload: { expectedRevision: review.revision },
      });
      expect(commitResponse.statusCode).toBe(200);
      expect(commitResponse.json()).toMatchObject({ created: 1, failed: 0, attachments: [] });
      expect(
        sqlite
          .prepare(
            `SELECT w.title, e.publication_title, c.display_name, i.normalized_value
             FROM research_works w
             JOIN research_editions e ON e.work_id = w.id
             JOIN research_contributors c ON c.edition_id = e.id
             JOIN research_identifiers i ON i.entity_id = e.id
             WHERE w.title = 'Reviewed Interop'`,
          )
          .get(),
      ).toEqual({
        title: 'Reviewed Interop',
        publication_title: 'Journal of Tests',
        display_name: 'Jane Smith',
        normalized_value: '10.1000/interop',
      });
      expect(
        sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM research_metadata_assertions WHERE is_selected = 1`,
          )
          .get(),
      ).toEqual({ count: 6 });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('未确认附件和过期 revision 返回稳定冲突', async () => {
    const { app, sqlite, source } = await fixture(
      '@article{file2026,title={With File},file={paper.pdf}}',
    );
    try {
      await app.inject({ method: 'POST', url: RESEARCH_API_V1.interopImportPickSource });
      const created = interopImportJobViewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopImports,
            payload: {
              requestId: 'attachment-conflict',
              sourcePath: source,
              displayName: 'library.bib',
              format: 'bibtex',
            },
          })
        ).json(),
      );
      await app.inject({ method: 'POST', url: RESEARCH_API_V1.interopImportParse(created.id) });
      await waitForReview(app, created.id);
      const page = interopImportRecordsPageSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: RESEARCH_API_V1.interopImportRecords(created.id),
          })
        ).json(),
      );
      const rejected = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(created.id, page.items[0]!.id),
        payload: { expectedRevision: page.items[0]!.revision, decision: { action: 'accept' } },
      });
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json()).toMatchObject({
        code: 'RESEARCH_INTEROP_ATTACHMENT_UNCONFIRMED',
      });

      const accepted = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(created.id, page.items[0]!.id),
        payload: {
          expectedRevision: page.items[0]!.revision,
          decision: {
            action: 'accept',
            attachmentCandidates: [
              {
                id: (
                  page.items[0]!.formatShadow as {
                    attachmentCandidates: Array<{ id: string }>;
                  }
                ).attachmentCandidates[0]!.id,
                sourceValue: 'paper.pdf',
                resolvedPath: null,
                displayName: 'paper.pdf',
                mimeType: 'application/pdf',
                exists: null,
                action: 'ignore',
              },
            ],
          },
        },
      });
      expect(accepted.statusCode).toBe(200);
      const stale = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(created.id, page.items[0]!.id),
        payload: {
          expectedRevision: page.items[0]!.revision,
          decision: { action: 'skip' },
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: 'RESEARCH_INTEROP_REVISION_CONFLICT' });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('再次导入按来源 key 区分相同内容和变化内容', async () => {
    const contents = '@article{stable-key,title={Stable Source}}';
    const { app, sqlite, source } = await fixture(contents);
    try {
      const first = await createAndParse(app, source, 'source-key-first');
      await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(first.job.id, first.page.items[0]!.id),
        payload: {
          expectedRevision: first.page.items[0]!.revision,
          decision: { action: 'accept' },
        },
      });
      const committed = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportCommit(first.job.id),
        payload: { expectedRevision: first.job.revision },
      });
      expect(committed.statusCode).toBe(200);

      const same = await createAndParse(app, source, 'source-key-same');
      expect(same.page.items[0]!.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'source-content-match' }),
      );
      expect(same.page.items[0]!.status).toBe('needs-review');

      await writeFile(source, '@article{stable-key,title={Changed Source}}', 'utf8');
      const changed = await createAndParse(app, source, 'source-key-changed');
      expect(changed.page.items[0]!.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'source-key-conflict' }),
      );
      expect(changed.page.items[0]!.formatShadow).toMatchObject({
        sourceKeyMatches: [expect.objectContaining({ sameContent: false })],
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('匹配现有版本时保留人工确认标题并把来源值作为未选建议', async () => {
    const { app, sqlite, source } = await fixture(
      '@article{manual-protection,title={Imported Title},doi={10.1000/manual}}',
    );
    const now = '2026-08-31T09:00:00.000Z';
    sqlite
      .prepare(
        `INSERT INTO research_works
         (id, type, title, title_sort, preferred_edition_id, created_at, updated_at)
         VALUES ('manual-work', 'article', '人工确认标题', '人工确认标题', 'manual-edition', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO research_editions
         (id, work_id, kind, title, created_at, updated_at)
         VALUES ('manual-edition', 'manual-work', 'journal', '人工确认标题', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO research_identifiers
         (id, entity_type, entity_id, scheme, value, normalized_value, created_at)
         VALUES ('manual-doi', 'edition', 'manual-edition', 'doi', '10.1000/manual',
                 '10.1000/manual', ?)`,
      )
      .run(now);
    sqlite
      .prepare(
        `INSERT INTO research_metadata_assertions
         (id, entity_type, entity_id, field_name, value_json, normalized_value, source_kind,
          observed_at, is_user_confirmed, is_selected, created_at)
         VALUES ('manual-title', 'work', 'manual-work', 'title', ?, '人工确认标题', 'user',
                 ?, 1, 1, ?)`,
      )
      .run(JSON.stringify('人工确认标题'), now, now);
    try {
      const review = await createAndParse(app, source, 'manual-protection');
      expect(review.page.items[0]!.formatShadow).toMatchObject({
        duplicateCandidates: [{ workId: 'manual-work', editionId: 'manual-edition' }],
      });
      const saved = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(review.job.id, review.page.items[0]!.id),
        payload: {
          expectedRevision: review.page.items[0]!.revision,
          decision: {
            action: 'match-existing',
            workId: 'manual-work',
            editionId: 'manual-edition',
            fieldSuggestions: [
              {
                field: 'title',
                currentValue: '人工确认标题',
                sourceValue: 'Imported Title',
                selectedValue: '人工确认标题',
                selection: 'current',
                userConfirmed: true,
                conflict: true,
              },
            ],
          },
        },
      });
      expect(saved.statusCode).toBe(200);
      const committed = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportCommit(review.job.id),
        payload: { expectedRevision: review.job.revision },
      });
      expect(committed.statusCode).toBe(200);
      expect(
        sqlite.prepare("SELECT title FROM research_works WHERE id = 'manual-work'").get(),
      ).toEqual({ title: '人工确认标题' });
      const titleAssertions = sqlite
        .prepare(
          `SELECT id, is_user_confirmed, is_selected
           FROM research_metadata_assertions
           WHERE entity_type = 'work' AND entity_id = 'manual-work' AND field_name = 'title'`,
        )
        .all() as Array<{ id: string; is_user_confirmed: number; is_selected: number }>;
      expect(titleAssertions).toHaveLength(2);
      expect(titleAssertions).toContainEqual({
        id: 'manual-title',
        is_user_confirmed: 1,
        is_selected: 1,
      });
      expect(titleAssertions).toContainEqual(
        expect.objectContaining({ is_user_confirmed: 0, is_selected: 0 }),
      );
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('冻结选择后安全导出，字段修改保留未知影子且过期预览被拒绝', async () => {
    const { app, sqlite, source, exportTarget } = await fixture(
      '@article{export-key,title={Original Title},year={2026},x-workbench={retain me}}',
    );
    try {
      const imported = await createAndParse(app, source, 'export-source');
      await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.interopImportRecordDecision(
          imported.job.id,
          imported.page.items[0]!.id,
        ),
        payload: {
          expectedRevision: imported.page.items[0]!.revision,
          decision: { action: 'accept' },
        },
      });
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopImportCommit(imported.job.id),
        payload: { expectedRevision: imported.job.revision },
      });
      const entity = sqlite
        .prepare(
          `SELECT committed_work_id AS work_id, committed_edition_id AS edition_id
           FROM research_interop_records WHERE job_id = ?`,
        )
        .get(imported.job.id) as { work_id: string; edition_id: string };
      sqlite
        .prepare(
          `UPDATE research_works SET title = 'Revised Title', title_sort = 'revised title',
           revision = revision + 1 WHERE id = ?`,
        )
        .run(entity.work_id);

      const preview = interopExportPreviewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopExportPreview,
            payload: {
              requestId: 'export-preview',
              format: 'bibtex',
              scope: { kind: 'selection', workIds: [entity.work_id] },
              editionPolicy: 'preferred',
            },
          })
        ).json(),
      );
      expect(preview).toMatchObject({ workCount: 1, recordCount: 1 });
      expect(preview.losses).toContainEqual(expect.objectContaining({ status: 'normalized' }));
      const picked = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopExportPickTarget,
        payload: { format: 'bibtex' },
      });
      expect(picked.json()).toEqual({ path: exportTarget, cancelled: false });
      const started = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopExport(preview.jobId),
        payload: {
          previewToken: preview.previewToken,
          expectedRevision: preview.revision,
          targetPath: exportTarget,
          overwriteConfirmed: false,
        },
      });
      expect(started.statusCode).toBe(202);
      expect(await waitForExport(app, preview.jobId)).toMatchObject({
        status: 'completed',
        result: { recordCount: 1, overwritten: false },
      });
      const output = await readFile(exportTarget, 'utf8');
      expect(output).toContain('Revised Title');
      expect(output).toContain('x-workbench');

      const citation = citationRenderResultSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopCitationRender,
            payload: {
              style: 'apa',
              mode: 'citation',
              items: [{ workId: entity.work_id, editionId: entity.edition_id }],
            },
          })
        ).json(),
      );
      expect(citation).toMatchObject({ itemCount: 1, workIds: [entity.work_id] });
      expect(citation.text).toContain('2026');

      const stale = interopExportPreviewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.interopExportPreview,
            payload: {
              requestId: 'export-stale',
              format: 'bibtex',
              scope: { kind: 'selection', workIds: [entity.work_id] },
            },
          })
        ).json(),
      );
      sqlite
        .prepare('UPDATE research_works SET revision = revision + 1 WHERE id = ?')
        .run(entity.work_id);
      const rejected = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.interopExport(stale.jobId),
        payload: {
          previewToken: stale.previewToken,
          expectedRevision: stale.revision,
          targetPath: exportTarget,
          overwriteConfirmed: true,
        },
      });
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json()).toMatchObject({ code: 'RESEARCH_INTEROP_REVISION_CONFLICT' });
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
