import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { runMigrationsFrom } from '@workbench/data';
import {
  RESEARCH_API_V1,
  annotationSchema,
  claimEvidenceSchema,
  claimSchema,
  evidenceDetailSchema,
  evidenceRebindPreviewSchema,
  knowledgeRevisionSchema,
  matrixCellEvidenceSchema,
  matrixCellSchema,
  matrixCellWindowSchema,
  matrixDetailSchema,
  noteLinkSchema,
  researchNoteSchema,
  type AnnotationAnchor,
} from '../contract.js';
import { createResearchServerModule } from '../server/index.js';
import { makeResearchDatabase } from '../testing/harness.js';

const NOW = '2026-08-30T12:00:00.000Z';
const HASH = 'a'.repeat(64);
const roots: Array<ReturnType<typeof makeResearchDatabase>> = [];

function textAnchor(pageNumber: number, exact: string): AnnotationAnchor {
  return {
    pageNumber,
    pageSize: { width: 612, height: 792 },
    rect: { x: 72, y: 680, width: 260, height: 22 },
    quads: [{ x1: 72, y1: 702, x2: 332, y2: 702, x3: 72, y3: 680, x4: 332, y4: 680 }],
    textQuote: {
      exact,
      prefix: 'before ',
      suffix: ' after',
      fingerprint: 'b'.repeat(64),
    },
    assetHash: HASH,
    editionId: 'edition-1',
  };
}

function areaAnchor(pageNumber: number): AnnotationAnchor {
  return {
    ...textAnchor(pageNumber, ''),
    rect: { x: 280, y: 420, width: 220, height: 160 },
    quads: [],
    textQuote: null,
  };
}

function seedPaper(database: ReturnType<typeof makeResearchDatabase>) {
  database.sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort, status)
       VALUES ('work-1', 'article', 'Evidence Workflow', 'evidence workflow', 'active')`,
    )
    .run();
  database.sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES ('edition-1', 'work-1', 'journal', 'Evidence Workflow, journal edition')`,
    )
    .run();
  database.sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type, state)
       VALUES ('asset-1', 'sha256', ?, 2048, 'application/pdf', 'active')`,
    )
    .run(HASH);
  database.sqlite
    .prepare(
      `INSERT INTO research_asset_locations
       (id, asset_id, mode, original_path, resolved_path, state, last_checked_at)
       VALUES ('location-1', 'asset-1', 'linked', '/private/source.pdf',
               '/private/source.pdf', 'available', ?)`,
    )
    .run(NOW);
  database.sqlite
    .prepare(
      `INSERT INTO research_attachments
       (id, edition_id, asset_id, role, display_name, status)
       VALUES ('attachment-1', 'edition-1', 'asset-1', 'primary-pdf', 'source.pdf', 'active')`,
    )
    .run();
}

function makeApp(database: ReturnType<typeof makeResearchDatabase>) {
  let sequence = 0;
  const module = createResearchServerModule({
    repository: database.repo,
    knowledgeRepository: database.knowledgeRepo,
    managedRoot: () => '/tmp/research-slice-c',
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
    createId: () => `slice-c-${++sequence}`,
    clock: () => new Date(NOW),
  });
  return buildApp({ getSqlite: () => database.sqlite, modules: [module] });
}

async function createContext(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
  const response = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.readingContexts,
    payload: { name, description: null, color: null },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as { id: string };
}

async function createAnnotation(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: {
    contextId: string | null;
    kind: 'highlight' | 'area';
    anchor: AnnotationAnchor;
    body?: string | null;
  },
) {
  const response = await app.inject({
    method: 'POST',
    url: RESEARCH_API_V1.assetAnnotations('asset-1'),
    payload: { ...input, body: input.body ?? null, color: '#facc15' },
  });
  expect(response.statusCode, response.body).toBe(200);
  return annotationSchema.parse(response.json());
}

async function evidenceDetail(app: Awaited<ReturnType<typeof buildApp>>, id: string) {
  const response = await app.inject({
    method: 'GET',
    url: RESEARCH_API_V1.evidenceItem(id),
  });
  expect(response.statusCode, response.body).toBe(200);
  return evidenceDetailSchema.parse(response.json());
}

afterEach(async () => {
  for (const database of roots.splice(0)) database.sqlite.close();
});

describe('slice C source and evidence workflow', () => {
  it('贯通直接提炼、OCR、跨上下文关系、来源状态和显式重新绑定', async () => {
    const database = makeResearchDatabase(() => NOW);
    roots.push(database);
    seedPaper(database);
    const app = await makeApp(database);
    try {
      const [contextA, contextB] = await Promise.all([
        createContext(app, 'Literature review'),
        createContext(app, 'Methods review'),
      ]);

      const directText = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'direct',
          contextId: null,
          assetId: 'asset-1',
          editionId: 'edition-1',
          kind: 'highlight',
          anchor: textAnchor(2, 'direct text evidence'),
          body: null,
          color: '#facc15',
          sourceKind: 'pdf',
          title: 'Direct text',
          summary: 'Direct text evidence',
          notes: null,
        },
      });
      expect(directText.statusCode, directText.body).toBe(200);
      const textEvidence = evidenceDetailSchema.parse(directText.json());
      expect(textEvidence).toMatchObject({
        contextId: null,
        sourceState: 'current',
        sourceSnapshot: {
          workId: 'work-1',
          editionId: 'edition-1',
          assetId: 'asset-1',
          pageNumber: 2,
          contextId: null,
          assetHash: HASH,
          annotationRevision: 1,
        },
      });
      expect(textEvidence.sourceLink.readerUrl).toContain(
        `annotation=${encodeURIComponent(textEvidence.annotationId)}`,
      );
      expect(JSON.stringify(textEvidence)).not.toContain('/private/source.pdf');

      const rejectedArea = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'direct',
          contextId: null,
          assetId: 'asset-1',
          editionId: 'edition-1',
          kind: 'area',
          anchor: areaAnchor(3),
          body: null,
          color: '#7c3aed',
          sourceKind: 'pdf',
          title: 'Figure region',
          summary: '',
          notes: null,
        },
      });
      expect(rejectedArea.statusCode).toBe(400);
      expect(rejectedArea.json()).toMatchObject({ code: 'KNOWLEDGE_INVALID' });

      const acceptedArea = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'direct',
          contextId: null,
          assetId: 'asset-1',
          editionId: 'edition-1',
          kind: 'area',
          anchor: areaAnchor(3),
          body: null,
          color: '#7c3aed',
          sourceKind: 'pdf',
          title: 'Figure region',
          summary: 'The figure reports a monotonic relationship.',
          notes: null,
        },
      });
      expect(acceptedArea.statusCode, acceptedArea.body).toBe(200);
      const areaEvidence = evidenceDetailSchema.parse(acceptedArea.json());
      expect(areaEvidence.sourceSnapshot.anchor).toMatchObject({
        pageNumber: 3,
        rect: { x: 280, y: 420, width: 220, height: 160 },
        textQuote: null,
      });

      const ocrAnnotation = await createAnnotation(app, {
        contextId: null,
        kind: 'highlight',
        anchor: textAnchor(4, 'OCR-derived evidence'),
      });
      database.sqlite
        .prepare(
          `INSERT INTO research_ocr_page_cache
           (asset_id, asset_hash, page_number, languages_key, engine, engine_version,
            language_pack_version, text_content, position_json, created_at, updated_at)
           VALUES ('asset-1', ?, 4, 'eng', 'tesseract', '7.0.0', 'packs-2026.08',
                   'OCR-derived evidence', NULL, ?, ?)`,
        )
        .run(HASH, NOW, NOW);
      const ocrResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'annotation',
          contextId: null,
          annotationId: ocrAnnotation.id,
          sourceKind: 'ocr',
          title: 'OCR excerpt',
          summary: 'OCR-derived evidence',
          notes: null,
        },
      });
      expect(ocrResponse.statusCode, ocrResponse.body).toBe(200);
      const ocrEvidence = evidenceDetailSchema.parse(ocrResponse.json());
      expect(ocrEvidence.sourceSnapshot.ocr).toEqual({
        engine: 'tesseract',
        engineVersion: '7.0.0',
        languagePackVersion: 'packs-2026.08',
        languagesKey: 'eng',
      });

      const notes = [];
      for (const [contextId, title] of [
        [contextA.id, 'Literature note'],
        [contextB.id, 'Methods note'],
      ] as const) {
        const noteResponse = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.notes,
          payload: { contextId, title, body: '' },
        });
        const note = researchNoteSchema.parse(noteResponse.json());
        notes.push(note);
        const linkResponse = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.noteLinks(note.id),
          payload: { target: { kind: 'evidence', evidenceId: textEvidence.id } },
        });
        expect(noteLinkSchema.parse(linkResponse.json()).target).toEqual({
          kind: 'evidence',
          evidenceId: textEvidence.id,
        });
      }
      expect(
        database.sqlite
          .prepare('SELECT COUNT(*) AS count FROM research_evidence WHERE id = ?')
          .get(textEvidence.id),
      ).toEqual({ count: 1 });
      expect(
        database.sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM research_note_links
             WHERE evidence_id = ? AND status = 'active'`,
          )
          .get(textEvidence.id),
      ).toEqual({ count: 2 });

      const revisedAnnotation = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.annotation(textEvidence.annotationId),
        payload: { body: 'human revision', expectedRevision: 1 },
      });
      expect(revisedAnnotation.statusCode, revisedAnnotation.body).toBe(200);
      expect((await evidenceDetail(app, textEvidence.id)).sourceState).toBe('annotation-revised');
      expect((await evidenceDetail(app, textEvidence.id)).sourceSnapshot.annotationRevision).toBe(
        1,
      );

      const deletedAnnotation = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.annotation(textEvidence.annotationId),
        payload: { expectedRevision: 2 },
      });
      expect(deletedAnnotation.statusCode, deletedAnnotation.body).toBe(200);
      expect((await evidenceDetail(app, textEvidence.id)).sourceState).toBe('annotation-deleted');

      database.sqlite
        .prepare(`UPDATE research_assets SET content_hash = ? WHERE id = 'asset-1'`)
        .run('c'.repeat(64));
      expect((await evidenceDetail(app, textEvidence.id)).sourceState).toBe('asset-mismatch');
      database.sqlite
        .prepare(`UPDATE research_asset_locations SET state = 'missing' WHERE id = 'location-1'`)
        .run();
      expect((await evidenceDetail(app, textEvidence.id)).sourceState).toBe('source-unavailable');

      database.sqlite
        .prepare(`UPDATE research_assets SET content_hash = ? WHERE id = 'asset-1'`)
        .run(HASH);
      database.sqlite
        .prepare(`UPDATE research_asset_locations SET state = 'available' WHERE id = 'location-1'`)
        .run();
      const replacement = await createAnnotation(app, {
        contextId: null,
        kind: 'highlight',
        anchor: textAnchor(5, 'replacement source position'),
      });
      const previewResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidenceRebind(textEvidence.id),
        payload: { mode: 'preview', annotationId: replacement.id, sourceKind: 'pdf' },
      });
      expect(previewResponse.statusCode, previewResponse.body).toBe(200);
      const preview = evidenceRebindPreviewSchema.parse(previewResponse.json());
      expect(preview.differences.map((difference) => difference.field)).toEqual(
        expect.arrayContaining(['annotation', 'page', 'text']),
      );
      const reboundResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidenceRebind(textEvidence.id),
        payload: {
          mode: 'confirm',
          annotationId: replacement.id,
          sourceKind: 'pdf',
          expectedRevision: preview.expectedRevision,
          targetAnnotationRevision: preview.targetAnnotationRevision,
        },
      });
      expect(reboundResponse.statusCode, reboundResponse.body).toBe(200);
      const rebound = evidenceDetailSchema.parse(reboundResponse.json());
      expect(rebound).toMatchObject({
        annotationId: replacement.id,
        revision: 2,
        sourceSnapshot: { pageNumber: 5, annotationRevision: 1 },
      });
      const revisionResponse = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.evidenceRevisions(textEvidence.id),
      });
      const revisions = knowledgeRevisionSchema.array().parse(revisionResponse.json());
      expect(revisions[0]).toMatchObject({ reason: 'rebind', revision: 1 });
      expect(revisions[0]?.snapshot).toMatchObject({
        sourceSnapshot: { pageNumber: 2, annotationRevision: 1 },
      });

      database.sqlite
        .prepare(
          `UPDATE research_ocr_page_cache
           SET engine_version = '7.1.0', updated_at = ?
           WHERE asset_id = 'asset-1' AND page_number = 4`,
        )
        .run('2026-08-30T12:01:00.000Z');
      expect((await evidenceDetail(app, ocrEvidence.id)).sourceState).toBe('annotation-revised');

      runMigrationsFrom(database.db, 'modules/research/migrations');
      expect(database.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(database.sqlite.prepare('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      });
      database.sqlite
        .prepare(
          `INSERT INTO research_knowledge_search_fts(research_knowledge_search_fts)
           VALUES ('rebuild')`,
        )
        .run();
      const searchCount = database.sqlite
        .prepare('SELECT COUNT(*) AS count FROM research_knowledge_search')
        .get() as { count: number };
      const ftsCount = database.sqlite
        .prepare('SELECT COUNT(*) AS count FROM research_knowledge_search_fts')
        .get() as { count: number };
      expect(ftsCount.count).toBe(searchCount.count);
      expect(notes).toHaveLength(2);
      expect(areaEvidence.sourceSnapshot.sourceKind).toBe('pdf');
    } finally {
      await app.close();
    }
  });

  it('贯通无证据观点、三类关系、跨论文矩阵和来源变更复核', async () => {
    const database = makeResearchDatabase(() => NOW);
    roots.push(database);
    seedPaper(database);
    database.sqlite
      .prepare(
        `INSERT INTO research_works (id, type, title, title_sort, status)
         VALUES ('work-2', 'article', 'Counter Evidence', 'counter evidence', 'active')`,
      )
      .run();
    database.sqlite
      .prepare(
        `INSERT INTO research_editions (id, work_id, kind, title)
         VALUES ('edition-2', 'work-2', 'journal', 'Counter Evidence, journal edition')`,
      )
      .run();
    database.sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state)
         VALUES ('asset-2', 'sha256', ?, 4096, 'application/pdf', 'active')`,
      )
      .run('d'.repeat(64));
    database.sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, state, last_checked_at)
         VALUES ('location-2', 'asset-2', 'linked', '/private/counter.pdf',
                 '/private/counter.pdf', 'available', ?)`,
      )
      .run(NOW);
    database.sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status)
         VALUES ('attachment-2', 'edition-2', 'asset-2', 'primary-pdf', 'counter.pdf', 'active')`,
      )
      .run();
    const app = await makeApp(database);
    try {
      const firstAnnotation = await createAnnotation(app, {
        contextId: null,
        kind: 'highlight',
        anchor: textAnchor(1, 'supporting result'),
      });
      const secondAnchor = {
        ...textAnchor(2, 'contradictory result'),
        assetHash: 'd'.repeat(64),
        editionId: 'edition-2',
      };
      const secondAnnotationResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-2'),
        payload: {
          contextId: null,
          kind: 'highlight',
          anchor: secondAnchor,
          body: null,
          color: '#60a5fa',
        },
      });
      expect(secondAnnotationResponse.statusCode, secondAnnotationResponse.body).toBe(200);
      const secondAnnotation = annotationSchema.parse(secondAnnotationResponse.json());

      const createEvidence = async (annotationId: string, summary: string) => {
        const response = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.evidence,
          payload: {
            mode: 'annotation',
            contextId: null,
            annotationId,
            sourceKind: 'pdf',
            title: null,
            summary,
            notes: null,
          },
        });
        expect(response.statusCode, response.body).toBe(200);
        return evidenceDetailSchema.parse(response.json());
      };
      const supportingEvidence = await createEvidence(firstAnnotation.id, 'Supports the result.');
      const counterEvidence = await createEvidence(secondAnnotation.id, 'Limits the result.');

      const claimResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.claims,
        payload: { statement: 'The effect generalizes across samples.', status: 'active' },
      });
      expect(claimResponse.statusCode, claimResponse.body).toBe(200);
      const emptyClaim = claimSchema.parse(claimResponse.json());
      expect(emptyClaim.evidenceCount).toBe(0);

      const relations = [];
      for (const [evidenceId, relation] of [
        [supportingEvidence.id, 'supports'],
        [counterEvidence.id, 'refutes'],
      ] as const) {
        const response = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.claimEvidence(emptyClaim.id),
          payload: { evidenceId, relation },
        });
        expect(response.statusCode, response.body).toBe(200);
        relations.push(claimEvidenceSchema.parse(response.json()));
      }
      const relationUpdate = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.claimEvidenceItem(relations[1]!.id),
        payload: { relation: 'qualifies', expectedRevision: 1 },
      });
      expect(relationUpdate.statusCode, relationUpdate.body).toBe(200);
      expect(relationUpdate.json()).toMatchObject({ relation: 'qualifies', revision: 2 });

      const matrixResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.matrices,
        payload: { title: 'Generalization comparison', description: 'Two-paper synthesis' },
      });
      const matrix = matrixDetailSchema.parse(matrixResponse.json());
      const structureResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.matrixStructure(matrix.id),
        payload: {
          expectedStructureRevision: matrix.structureRevision,
          columns: [
            { workId: 'work-1', position: 0 },
            { workId: 'work-2', position: 1 },
          ],
          rows: [
            { kind: 'claim', claimId: emptyClaim.id, position: 0 },
            { kind: 'dimension', title: 'Sample', position: 1 },
          ],
        },
      });
      expect(structureResponse.statusCode, structureResponse.body).toBe(200);
      const structured = matrixDetailSchema.parse(structureResponse.json());
      const claimRow = structured.rows[0]!;
      const firstColumn = structured.columns[0]!;
      const secondColumn = structured.columns[1]!;

      const createdCells = [];
      for (const [column, evidence, synthesis] of [
        [firstColumn, supportingEvidence, 'The first paper supports generalization.'],
        [secondColumn, counterEvidence, 'The second paper narrows the claim.'],
      ] as const) {
        const cellResponse = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.matrixCells(matrix.id),
          payload: { rowId: claimRow.id, columnId: column.id, synthesis },
        });
        expect(cellResponse.statusCode, cellResponse.body).toBe(200);
        const cell = matrixCellSchema.parse(cellResponse.json());
        const linkResponse = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.matrixCellEvidence(cell.id),
          payload: { evidenceId: evidence.id },
        });
        expect(linkResponse.statusCode, linkResponse.body).toBe(200);
        matrixCellEvidenceSchema.parse(linkResponse.json());
        const reviewResponse = await app.inject({
          method: 'POST',
          url: RESEARCH_API_V1.matrixCellReview(cell.id),
          payload: { expectedRevision: cell.revision },
        });
        expect(reviewResponse.statusCode, reviewResponse.body).toBe(200);
        createdCells.push(matrixCellSchema.parse(reviewResponse.json()));
      }

      const firstWindowResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.matrixCells(matrix.id)}?columnOffset=0&columnLimit=1`,
      });
      const firstWindow = matrixCellWindowSchema.parse(firstWindowResponse.json());
      expect(firstWindow.columnIds).toEqual([firstColumn.id]);
      expect(firstWindow.rowIds).toEqual(structured.rows.map((row) => row.id));
      expect(firstWindow.cells).toMatchObject([
        { id: createdCells[0]!.id, reviewState: 'current', selectedEvidenceCount: 1 },
      ]);
      const secondWindowResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.matrixCells(matrix.id)}?columnOffset=1&columnLimit=1`,
      });
      expect(matrixCellWindowSchema.parse(secondWindowResponse.json()).columnIds).toEqual([
        secondColumn.id,
      ]);

      const reviseSourceResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.annotation(firstAnnotation.id),
        payload: { body: 'source changed after synthesis', expectedRevision: 1 },
      });
      expect(reviseSourceResponse.statusCode, reviseSourceResponse.body).toBe(200);
      const staleWindowResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.matrixCells(matrix.id)}?columnOffset=0&columnLimit=1`,
      });
      expect(matrixCellWindowSchema.parse(staleWindowResponse.json()).cells[0]).toMatchObject({
        id: createdCells[0]!.id,
        reviewState: 'needs-review',
      });

      const unlinkResponse = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.claimEvidenceItem(relations[0]!.id),
        payload: { expectedRevision: 1 },
      });
      expect(unlinkResponse.statusCode, unlinkResponse.body).toBe(200);
      expect(unlinkResponse.json()).toMatchObject({ status: 'deleted' });
      expect((await evidenceDetail(app, supportingEvidence.id)).status).toBe('active');
      expect(
        database.sqlite
          .prepare('SELECT status FROM research_claims WHERE id = ?')
          .get(emptyClaim.id),
      ).toEqual({ status: 'active' });
    } finally {
      await app.close();
    }
  });
});
