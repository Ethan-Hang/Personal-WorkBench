import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createDatabaseClient, runCoreMigrations, runMigrationsFrom } from '@workbench/data';
import { describe, expect, it } from 'vitest';
import { SqliteKnowledgeRepository } from './sqlite-knowledge-repository.js';

const fullScale = process.env.RUN_RESEARCH_KNOWLEDGE_SCALE === '1';
const NOW = '2026-08-30T12:30:00.000Z';
const scale = fullScale
  ? {
      works: 10_000,
      annotations: 50_000,
      evidence: 20_000,
      notes: 2_000,
      claims: 5_000,
      matrices: 100,
      matrixColumns: 200,
      matrixRows: 50,
      writingDocuments: 100,
    }
  : {
      works: 200,
      annotations: 1_000,
      evidence: 500,
      notes: 100,
      claims: 250,
      matrices: 10,
      matrixColumns: 50,
      matrixRows: 20,
      writingDocuments: 10,
    };

function p95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function id(prefix: string, index: number, width = 6): string {
  return `${prefix}-${index.toString().padStart(width, '0')}`;
}

describe('research knowledge scale', () => {
  it(`${fullScale ? '目标' : '代表'}规模检索、矩阵窗口和 revision 保持有界`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'research-knowledge-scale-'));
    const databasePath = join(root, 'research.db');
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('synchronous = NORMAL');
      sqlite.pragma('foreign_keys = ON');
      const database = createDatabaseClient(sqlite);
      runCoreMigrations(database);
      runMigrationsFrom(database, 'modules/research/migrations');

      const seedStarted = performance.now();
      sqlite.transaction(() => {
        const insertWork = sqlite.prepare(
          `INSERT INTO research_works (id, type, title, title_sort, status)
           VALUES (?, 'article', ?, ?, 'active')`,
        );
        const insertEdition = sqlite.prepare(
          `INSERT INTO research_editions (id, work_id, kind, title)
           VALUES (?, ?, 'journal', ?)`,
        );
        const insertAsset = sqlite.prepare(
          `INSERT INTO research_assets
           (id, hash_algorithm, content_hash, byte_size, mime_type, state)
           VALUES (?, 'sha256', ?, 4096, 'application/pdf', 'active')`,
        );
        const insertLocation = sqlite.prepare(
          `INSERT INTO research_asset_locations
           (id, asset_id, mode, original_path, resolved_path, state)
           VALUES (?, ?, 'linked', ?, ?, 'available')`,
        );
        const insertAttachment = sqlite.prepare(
          `INSERT INTO research_attachments
           (id, edition_id, asset_id, role, display_name, status)
           VALUES (?, ?, ?, 'primary-pdf', ?, 'active')`,
        );
        for (let index = 0; index < scale.works; index += 1) {
          const workId = id('work', index);
          const editionId = id('edition', index);
          const assetId = id('asset', index);
          const title = `Scale paper ${index}`;
          const hash = index.toString(16).padStart(64, '0');
          insertWork.run(workId, title, title.toLowerCase());
          insertEdition.run(editionId, workId, title);
          insertAsset.run(assetId, hash);
          insertLocation.run(
            id('location', index),
            assetId,
            `/generated/${assetId}.pdf`,
            `/generated/${assetId}.pdf`,
          );
          insertAttachment.run(id('attachment', index), editionId, assetId, `${assetId}.pdf`);
        }

        const insertAnnotation = sqlite.prepare(
          `INSERT INTO research_annotations
           (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
            status, revision, created_at, updated_at)
           VALUES (?, ?, ?, NULL, 'highlight', ?, ?, ?, '#facc15', 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.annotations; index += 1) {
          const workIndex = index % scale.works;
          const assetHash = workIndex.toString(16).padStart(64, '0');
          const pageNumber = (index % 20) + 1;
          const anchor = {
            pageNumber,
            pageSize: { width: 612, height: 792 },
            rect: { x: 20, y: 30, width: 180, height: 20 },
            quads: [],
            textQuote: {
              exact: `Common research source ${index}`,
              prefix: 'before',
              suffix: 'after',
              fingerprint: (index % 16).toString(16).repeat(64),
            },
            assetHash,
            editionId: id('edition', workIndex),
          };
          insertAnnotation.run(
            id('annotation', index),
            id('asset', workIndex),
            id('edition', workIndex),
            pageNumber,
            JSON.stringify(anchor),
            `Generated annotation ${index}`,
            NOW,
            NOW,
          );
        }

        const insertEvidence = sqlite.prepare(
          `INSERT INTO research_evidence
           (id, context_id, work_id, edition_id, asset_id, annotation_id,
            source_snapshot_json, source_kind, title, summary, notes, status, revision,
            created_at, updated_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, 'pdf', ?, ?, NULL, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.evidence; index += 1) {
          const workIndex = index % scale.works;
          const pageNumber = (index % 20) + 1;
          const assetHash = workIndex.toString(16).padStart(64, '0');
          const anchor = {
            pageNumber,
            pageSize: { width: 612, height: 792 },
            rect: { x: 20, y: 30, width: 180, height: 20 },
            quads: [],
            textQuote: {
              exact: `Common research source ${index}`,
              prefix: 'before',
              suffix: 'after',
              fingerprint: (index % 16).toString(16).repeat(64),
            },
            assetHash,
            editionId: id('edition', workIndex),
          };
          const snapshot = {
            workId: id('work', workIndex),
            editionId: id('edition', workIndex),
            assetId: id('asset', workIndex),
            annotationId: id('annotation', index),
            contextId: null,
            pageNumber,
            anchor,
            sourceKind: 'pdf',
            annotationRevision: 1,
            assetHash,
            workTitle: `Scale paper ${workIndex}`,
            editionTitle: `Scale paper ${workIndex}`,
            ocr: null,
            extractedAt: NOW,
          };
          insertEvidence.run(
            id('evidence', index),
            id('work', workIndex),
            id('edition', workIndex),
            id('asset', workIndex),
            id('annotation', index),
            JSON.stringify(snapshot),
            `Evidence ${index}`,
            `Common knowledge result cohort ${index % 100}`,
            NOW,
            NOW,
          );
        }

        const insertNote = sqlite.prepare(
          `INSERT INTO research_notes
           (id, context_id, title, body, status, revision, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.notes; index += 1) {
          insertNote.run(
            id('note', index),
            `Scale note ${index}`,
            `Common knowledge methods note ${index}`,
            NOW,
            NOW,
          );
        }

        const insertClaim = sqlite.prepare(
          `INSERT INTO research_claims
           (id, context_id, statement, rationale, status, revision, created_at, updated_at)
           VALUES (?, NULL, ?, ?, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.claims; index += 1) {
          insertClaim.run(
            id('claim', index),
            `Common knowledge claim ${index}`,
            `Generated rationale cohort ${index % 100}`,
            NOW,
            NOW,
          );
        }

        const insertMatrix = sqlite.prepare(
          `INSERT INTO research_matrices
           (id, context_id, title, description, status, structure_revision, revision,
            created_at, updated_at)
           VALUES (?, NULL, ?, NULL, 'active', 1, 1, ?, ?)`,
        );
        for (let index = 0; index < scale.matrices; index += 1) {
          insertMatrix.run(id('matrix', index), `Scale matrix ${index}`, NOW, NOW);
        }
        const insertColumn = sqlite.prepare(
          `INSERT INTO research_matrix_columns
           (id, matrix_id, work_id, position, status, revision, created_at, updated_at)
           VALUES (?, 'matrix-000000', ?, ?, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.matrixColumns; index += 1) {
          insertColumn.run(id('column', index), id('work', index), index, NOW, NOW);
        }
        const insertRow = sqlite.prepare(
          `INSERT INTO research_matrix_rows
           (id, matrix_id, kind, claim_id, title, question, position, status, revision,
            created_at, updated_at)
           VALUES (?, 'matrix-000000', 'dimension', NULL, ?, NULL, ?, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.matrixRows; index += 1) {
          insertRow.run(id('row', index), `Dimension ${index}`, index, NOW, NOW);
        }
        const insertCell = sqlite.prepare(
          `INSERT INTO research_matrix_cells
           (id, matrix_id, row_id, column_id, synthesis, status, revision, created_at, updated_at)
           VALUES (?, 'matrix-000000', ?, ?, ?, 'active', 1, ?, ?)`,
        );
        for (let rowIndex = 0; rowIndex < Math.min(20, scale.matrixRows); rowIndex += 1) {
          for (
            let columnIndex = 0;
            columnIndex < Math.min(12, scale.matrixColumns);
            columnIndex += 1
          ) {
            insertCell.run(
              `cell-${rowIndex}-${columnIndex}`,
              id('row', rowIndex),
              id('column', columnIndex),
              `Synthesis ${rowIndex}:${columnIndex}`,
              NOW,
              NOW,
            );
          }
        }

        const insertDocument = sqlite.prepare(
          `INSERT INTO research_writing_documents
           (id, context_id, title, status, structure_revision, revision, created_at, updated_at)
           VALUES (?, NULL, ?, 'active', 1, 1, ?, ?)`,
        );
        const insertSection = sqlite.prepare(
          `INSERT INTO research_writing_sections
           (id, document_id, title, position, status, revision, created_at, updated_at)
           VALUES (?, ?, 'Argument', 0, 'active', 1, ?, ?)`,
        );
        const insertBlock = sqlite.prepare(
          `INSERT INTO research_writing_blocks
           (id, document_id, section_id, kind, text_content, position, status, revision,
            created_at, updated_at)
           VALUES (?, ?, ?, 'text', ?, 0, 'active', 1, ?, ?)`,
        );
        for (let index = 0; index < scale.writingDocuments; index += 1) {
          const documentId = id('document', index);
          const sectionId = id('section', index);
          insertDocument.run(documentId, `Scale draft ${index}`, NOW, NOW);
          insertSection.run(sectionId, documentId, NOW, NOW);
          insertBlock.run(
            id('block', index),
            documentId,
            sectionId,
            `Common knowledge synthesis ${index}`,
            NOW,
            NOW,
          );
        }
      })();
      const seedMs = performance.now() - seedStarted;

      const repository = new SqliteKnowledgeRepository(
        () => sqlite,
        () => NOW,
      );
      const rebuildStarted = performance.now();
      const rebuilt = await repository.rebuildKnowledgeSearch();
      const rebuildMs = performance.now() - rebuildStarted;
      expect(rebuilt).toMatchObject({
        notes: scale.notes,
        evidence: scale.evidence,
        claims: scale.claims,
        writingDocuments: scale.writingDocuments,
      });

      const searchTimes: number[] = [];
      for (let sample = 0; sample < 12; sample += 1) {
        const started = performance.now();
        const page = await repository.searchKnowledge({
          query: 'common knowledge',
          entityTypes: ['note', 'evidence', 'claim', 'writing-document'],
          statuses: ['active'],
          limit: 30,
          maxResults: 500,
        });
        searchTimes.push(performance.now() - started);
        expect(page.items).toHaveLength(30);
      }

      const listStarted = performance.now();
      const list = await repository.listEvidence({ status: 'active', limit: 30 });
      const listMs = performance.now() - listStarted;
      expect(list.items).toHaveLength(30);

      const windowStarted = performance.now();
      const window = await repository.getMatrixCellWindow('matrix-000000', 0, 12, 0, 20);
      const windowMs = performance.now() - windowStarted;
      expect(window).toMatchObject({
        columnIds: expect.arrayContaining(['column-000000']),
        rowIds: expect.arrayContaining(['row-000000']),
      });
      expect(window?.cells.length).toBe(
        Math.min(12, scale.matrixColumns) * Math.min(20, scale.matrixRows),
      );

      const saveStarted = performance.now();
      const saved = await repository.updateMatrixCell('cell-0-0', {
        synthesis: 'Updated scale synthesis',
        expectedRevision: 1,
        revisionId: 'scale-cell-revision',
      });
      const saveMs = performance.now() - saveStarted;
      expect(saved).toMatchObject({ kind: 'saved', value: { revision: 2 } });
      expect(
        sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM research_knowledge_revisions
             WHERE entity_type = 'matrix-cell' AND entity_id = 'cell-0-0'`,
          )
          .get(),
      ).toEqual({ count: 1 });

      const integrityStarted = performance.now();
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      const integrityMs = performance.now() - integrityStarted;
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
      const databaseMiB = statSync(databasePath).size / 1024 / 1024;
      const rssMiB = process.memoryUsage().rss / 1024 / 1024;
      const observed = {
        mode: fullScale ? 'target' : 'representative',
        scale,
        seedMs: Number(seedMs.toFixed(2)),
        rebuildMs: Number(rebuildMs.toFixed(2)),
        searchP95Ms: Number(p95(searchTimes).toFixed(2)),
        listMs: Number(listMs.toFixed(2)),
        matrixWindowMs: Number(windowMs.toFixed(2)),
        cellSaveMs: Number(saveMs.toFixed(2)),
        integrityMs: Number(integrityMs.toFixed(2)),
        databaseMiB: Number(databaseMiB.toFixed(2)),
        rssMiB: Number(rssMiB.toFixed(2)),
      };
      console.log(JSON.stringify({ code: 'RESEARCH_KNOWLEDGE_SCALE_RESULT', ...observed }));

      expect(rebuildMs).toBeLessThan(fullScale ? 20_000 : 5_000);
      expect(p95(searchTimes)).toBeLessThan(fullScale ? 1_000 : 500);
      expect(listMs).toBeLessThan(500);
      expect(windowMs).toBeLessThan(500);
      expect(saveMs).toBeLessThan(500);
      expect(databaseMiB).toBeLessThan(fullScale ? 1_024 : 128);
      expect(rssMiB).toBeLessThan(2_048);
    } finally {
      sqlite.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
