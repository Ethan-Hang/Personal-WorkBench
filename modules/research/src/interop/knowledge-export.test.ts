import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationAnchor } from '../contract.js';
import { ResearchKnowledgeService } from '../knowledge/service.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { previewKnowledgeExport, writeKnowledgeExport } from './knowledge-export.js';

const NOW = '2026-08-30T17:00:00.000Z';
const HASH = 'c'.repeat(64);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function seedPaper(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  const anchor: AnnotationAnchor = {
    pageNumber: 3,
    pageSize: { width: 612, height: 792 },
    rect: { x: 20, y: 30, width: 180, height: 22 },
    quads: [{ x1: 20, y1: 52, x2: 200, y2: 52, x3: 20, y3: 30, x4: 200, y4: 30 }],
    textQuote: {
      exact: 'instrumental variable',
      prefix: 'an ',
      suffix: ' identifies',
      fingerprint: 'd'.repeat(64),
    },
    assetHash: HASH,
    editionId: 'edition-1',
  };
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO research_works (id, type, title, title_sort, status)
         VALUES ('work-1', 'article', 'Identification', 'identification', 'active')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_editions (id, work_id, kind, title)
         VALUES ('edition-1', 'work-1', 'journal', 'Identification edition')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state)
         VALUES ('asset-1', 'sha256', ?, 1024, 'application/pdf', 'active')`,
      )
      .run(HASH);
    sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, state)
         VALUES ('location-1', 'asset-1', 'linked', '/private/paper.pdf',
                 '/private/paper.pdf', 'available')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status)
         VALUES ('attachment-1', 'edition-1', 'asset-1', 'primary-pdf', 'paper.pdf', 'active')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_annotations
         (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
          status, revision, created_at, updated_at)
         VALUES ('annotation-1', 'asset-1', 'edition-1', NULL, 'highlight', 3, ?, NULL,
                 '#fde047', 'active', 1, ?, ?)`,
      )
      .run(JSON.stringify(anchor), NOW, NOW);
  })();
}

async function fixture() {
  const database = makeResearchDatabase(() => NOW);
  let sequence = 0;
  const service = new ResearchKnowledgeService(database.knowledgeRepo, {
    createId: () => `export-${++sequence}`,
    now: () => new Date(NOW),
  });
  seedPaper(database.sqlite);
  const evidence = await service.createEvidence({
    contextId: null,
    annotationId: 'annotation-1',
    sourceKind: 'pdf',
    title: 'First-stage evidence',
    summary: 'The instrument predicts treatment.',
    notes: null,
  });
  const matrix = await service.createMatrix({
    contextId: null,
    title: 'Identification comparison',
    description: 'Compare the available evidence.',
  });
  const structuredMatrix = await service.updateMatrixStructure(matrix.id, {
    expectedStructureRevision: 1,
    columns: [{ workId: 'work-1', position: 0 }],
    rows: [{ kind: 'dimension', title: 'First stage', question: 'Is it strong?', position: 0 }],
  });
  const cell = await service.createMatrixCell(matrix.id, {
    rowId: structuredMatrix.rows[0]!.id,
    columnId: structuredMatrix.columns[0]!.id,
    synthesis: 'The reported first stage is strong.',
  });
  await service.createMatrixCellEvidence(cell.id, { evidenceId: evidence.id });
  const document = await service.createWritingDocument({
    contextId: null,
    title: 'Causal identification draft',
  });
  await service.updateWritingStructure(document.id, {
    expectedStructureRevision: 1,
    sections: [
      {
        title: 'Argument',
        position: 0,
        blocks: [
          { kind: 'text', text: 'The design uses an instrument.', position: 0 },
          { kind: 'evidence', targetId: evidence.id, position: 1 },
          { kind: 'matrix', targetId: matrix.id, position: 2 },
        ],
      },
    ],
  });
  return { ...database, service, evidence, matrix, document };
}

describe('knowledge export', () => {
  it('确定性导出矩阵 Markdown/CSV，并保留来源页码、内部链接和稳定 ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-knowledge-export-'));
    roots.push(root);
    const data = await fixture();
    try {
      const markdownPath = join(root, 'matrix.md');
      const selection = {
        objectType: 'matrix' as const,
        objectId: data.matrix.id,
        format: 'markdown' as const,
      };
      const preview = await previewKnowledgeExport(data.knowledgeRepo, selection, markdownPath);
      expect(preview).toMatchObject({
        fileExtension: '.md',
        referenceCount: 1,
        sourceIssueCount: 0,
        targetExists: false,
      });
      const first = await writeKnowledgeExport({
        repository: data.knowledgeRepo,
        selection,
        targetPath: markdownPath,
        overwriteConfirmed: false,
        completedAt: () => NOW,
      });
      const markdown = await readFile(markdownPath, 'utf8');
      expect(markdown).toContain('# Identification comparison');
      expect(markdown).toContain('p. 3');
      expect(markdown).toContain(`/research/read/asset-1?`);
      expect(markdown).toContain(`research:evidence:${data.evidence.id}`);
      expect(first).toMatchObject({ outputValidated: true, overwritten: false });
      await expect(
        writeKnowledgeExport({
          repository: data.knowledgeRepo,
          selection,
          targetPath: markdownPath,
          overwriteConfirmed: false,
          completedAt: () => NOW,
        }),
      ).rejects.toThrow('需要确认覆盖');
      const overwritten = await writeKnowledgeExport({
        repository: data.knowledgeRepo,
        selection,
        targetPath: markdownPath,
        overwriteConfirmed: true,
        completedAt: () => NOW,
      });
      expect(overwritten).toMatchObject({ overwritten: true, sha256: first.sha256 });

      const csvPath = join(root, 'matrix.csv');
      await writeKnowledgeExport({
        repository: data.knowledgeRepo,
        selection: { ...selection, format: 'csv' },
        targetPath: csvPath,
        overwriteConfirmed: false,
        completedAt: () => NOW,
      });
      const csv = await readFile(csvPath, 'utf8');
      expect(csv).toContain('"比较项","Identification"');
      expect(csv).toContain(`research:evidence:${data.evidence.id}`);
      expect(await readdir(root)).toEqual(['matrix.csv', 'matrix.md']);
    } finally {
      data.sqlite.close();
    }
  });

  it('写作板仅导出 Markdown，显式覆盖并在取消时清理临时文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-writing-export-'));
    roots.push(root);
    const data = await fixture();
    try {
      const selection = {
        objectType: 'writing-document' as const,
        objectId: data.document.id,
        format: 'markdown' as const,
      };
      const targetPath = join(root, 'draft.md');
      await writeFile(targetPath, 'keep this file');
      const controller = new AbortController();
      controller.abort();
      await expect(
        writeKnowledgeExport({
          repository: data.knowledgeRepo,
          selection,
          targetPath,
          overwriteConfirmed: true,
          completedAt: () => NOW,
          signal: controller.signal,
        }),
      ).rejects.toThrow('取消');
      expect(await readFile(targetPath, 'utf8')).toBe('keep this file');
      expect(await readdir(root)).toEqual(['draft.md']);
      await expect(
        previewKnowledgeExport(data.knowledgeRepo, selection, join(root, 'draft.pdf')),
      ).rejects.toThrow('.md');
      await expect(
        previewKnowledgeExport(data.knowledgeRepo, {
          ...selection,
          format: 'csv',
        }),
      ).rejects.toThrow('只支持 Markdown');

      const report = await writeKnowledgeExport({
        repository: data.knowledgeRepo,
        selection,
        targetPath,
        overwriteConfirmed: true,
        completedAt: () => NOW,
      });
      const markdown = await readFile(targetPath, 'utf8');
      expect(markdown).toContain(`research:writing-document:${data.document.id}`);
      expect(markdown).toContain(`research:evidence:${data.evidence.id}`);
      expect(markdown).toContain(`research:matrix:${data.matrix.id}`);
      expect(report).toMatchObject({ referenceCount: 2, overwritten: true });
    } finally {
      data.sqlite.close();
    }
  });
});
