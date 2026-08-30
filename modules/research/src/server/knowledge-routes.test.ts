import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  claimEvidenceSchema,
  claimSchema,
  evidenceDetailSchema,
  knowledgeExportPreviewSchema,
  knowledgeExportReportSchema,
  knowledgeSearchRebuildResponseSchema,
  knowledgeSearchResponseSchema,
  matrixCellEvidenceSchema,
  matrixCellSchema,
  matrixCellWindowSchema,
  matrixDetailSchema,
  researchNoteSchema,
  writingBlockSchema,
  writingDocumentDetailSchema,
} from '../contract.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];
const NOW = '2026-08-30T10:00:00.000Z';
const HASH = 'e'.repeat(64);
const anchor = {
  pageNumber: 5,
  pageSize: { width: 612, height: 792 },
  rect: { x: 30, y: 40, width: 160, height: 18 },
  quads: [{ x1: 30, y1: 58, x2: 190, y2: 58, x3: 30, y3: 40, x4: 190, y4: 40 }],
  textQuote: {
    exact: 'robustness result',
    prefix: 'the ',
    suffix: ' remains',
    fingerprint: 'f'.repeat(64),
  },
  assetHash: HASH,
  editionId: 'edition-1',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function seedPaper(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort, status)
       VALUES ('work-1', 'article', 'Robustness', 'robustness', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES ('edition-1', 'work-1', 'journal', 'Robustness edition')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type, state)
       VALUES ('asset-1', 'sha256', ?, 1200, 'application/pdf', 'active')`,
    )
    .run(HASH);
  sqlite
    .prepare(
      `INSERT INTO research_asset_locations
       (id, asset_id, mode, original_path, resolved_path, state)
       VALUES ('location-1', 'asset-1', 'linked', '/secret/robustness.pdf',
               '/secret/robustness.pdf', 'available')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_attachments
       (id, edition_id, asset_id, role, display_name, status)
       VALUES ('attachment-1', 'edition-1', 'asset-1', 'primary-pdf', 'robustness.pdf', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_annotations
       (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
        status, revision, created_at, updated_at)
       VALUES ('annotation-1', 'asset-1', 'edition-1', NULL, 'highlight', 5, ?, NULL,
               '#fde047', 'active', 1, ?, ?)`,
    )
    .run(JSON.stringify(anchor), NOW, NOW);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-knowledge-routes-'));
  roots.push(root);
  const database = makeResearchDatabase(() => NOW);
  seedPaper(database.sqlite);
  let sequence = 0;
  const module = createResearchServerModule({
    repository: database.repo,
    knowledgeRepository: database.knowledgeRepo,
    managedRoot: () => join(root, 'managed'),
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
    documentDialog: {
      saveDocument: async () => join(root, 'knowledge-export.md'),
      pickDocument: async () => null,
    },
    createId: () => `route-knowledge-${++sequence}`,
    clock: () => new Date(NOW),
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, root, app };
}

describe('research knowledge routes', () => {
  it('研究内容导出 API 先预览、使用系统目标选择器，再安全写入文件', async () => {
    const { app, sqlite, root } = await fixture();
    try {
      sqlite
        .prepare(
          `INSERT INTO research_writing_documents
           (id, context_id, title, status, structure_revision, revision, created_at, updated_at)
           VALUES ('writing-export', NULL, 'Route draft', 'active', 1, 1, ?, ?)`,
        )
        .run(NOW, NOW);
      sqlite
        .prepare(
          `INSERT INTO research_writing_sections
           (id, document_id, title, position, status, revision, created_at, updated_at)
           VALUES ('section-export', 'writing-export', 'Argument', 0, 'active', 1, ?, ?)`,
        )
        .run(NOW, NOW);
      sqlite
        .prepare(
          `INSERT INTO research_writing_blocks
           (id, document_id, section_id, kind, text_content, position, status, revision,
            created_at, updated_at)
           VALUES ('block-export', 'writing-export', 'section-export', 'text', 'Route body', 0,
                   'active', 1, ?, ?)`,
        )
        .run(NOW, NOW);
      const targetPath = join(root, 'knowledge-export.md');
      const selection = {
        objectType: 'writing-document',
        objectId: 'writing-export',
        format: 'markdown',
      } as const;
      const picked = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.knowledgeExportPickTarget,
        payload: { format: 'markdown', suggestedName: 'Route draft.md' },
      });
      expect(picked.statusCode).toBe(200);
      expect(picked.json()).toEqual({ path: targetPath, cancelled: false });

      const preview = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.knowledgeExportPreview,
        payload: { ...selection, targetPath },
      });
      expect(preview.statusCode).toBe(200);
      expect(knowledgeExportPreviewSchema.parse(preview.json())).toMatchObject({
        targetExists: false,
        objectCount: 3,
      });
      const exported = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.knowledgeExports,
        payload: { ...selection, targetPath, overwriteConfirmed: false },
      });
      expect(exported.statusCode).toBe(200);
      expect(knowledgeExportReportSchema.parse(exported.json())).toMatchObject({
        outputValidated: true,
        targetPath,
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('笔记 API 支持通用层、稳定分页和 revision 冲突响应', async () => {
    const { app, sqlite } = await fixture();
    try {
      const createdResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.notes,
        payload: { title: 'Robustness notes', body: 'Initial' },
      });
      expect(createdResponse.statusCode).toBe(200);
      const note = researchNoteSchema.parse(createdResponse.json());
      expect(note.contextId).toBeNull();

      const listed = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.notes}?contextId=general&limit=1`,
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject({ notes: [{ id: note.id }], nextCursor: null });

      const updated = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.note(note.id),
        payload: { body: 'Updated', expectedRevision: 1 },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ revision: 2, body: 'Updated' });

      const conflict = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.note(note.id),
        payload: { body: 'Stale', expectedRevision: 1 },
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        code: 'KNOWLEDGE_CONFLICT',
        details: { current: { revision: 2, body: 'Updated' } },
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('证据 API 生成服务器快照并只返回稳定阅读器回跳', async () => {
    const { app, sqlite } = await fixture();
    try {
      const response = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'annotation',
          contextId: null,
          annotationId: 'annotation-1',
          sourceKind: 'pdf',
          title: 'Robustness evidence',
          summary: 'The result remains robust.',
          notes: null,
        },
      });
      expect(response.statusCode).toBe(200);
      const evidence = evidenceDetailSchema.parse(response.json());
      expect(evidence.sourceSnapshot).toMatchObject({
        workId: 'work-1',
        assetHash: HASH,
        annotationRevision: 1,
      });
      expect(evidence.sourceLink.readerUrl).toContain(
        '/research/read/asset-1?page=5&context=general&annotation=annotation-1',
      );
      expect(response.body).not.toContain('/secret/robustness.pdf');

      const detail = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.evidenceItem(evidence.id),
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ id: evidence.id, sourceState: 'current' });

      const filtered = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.evidence}?contextId=general&sourceState=current`,
      });
      expect(filtered.statusCode).toBe(200);
      expect(filtered.json()).toMatchObject({ evidence: [{ id: evidence.id }] });

      const nextAnchor = { ...anchor, pageNumber: 8 };
      sqlite
        .prepare(
          `INSERT INTO research_annotations
           (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
            status, revision, created_at, updated_at)
           VALUES ('annotation-2', 'asset-1', 'edition-1', NULL, 'highlight', 8, ?, NULL,
                   '#fde047', 'active', 1, ?, ?)`,
        )
        .run(JSON.stringify(nextAnchor), NOW, NOW);
      const preview = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidenceRebind(evidence.id),
        payload: { mode: 'preview', annotationId: 'annotation-2', sourceKind: 'pdf' },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        expectedRevision: 1,
        targetAnnotationRevision: 1,
        newSource: { annotationId: 'annotation-2', pageNumber: 8 },
      });
      const rebound = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidenceRebind(evidence.id),
        payload: {
          mode: 'confirm',
          annotationId: 'annotation-2',
          sourceKind: 'pdf',
          expectedRevision: 1,
          targetAnnotationRevision: 1,
        },
      });
      expect(rebound.statusCode).toBe(200);
      expect(rebound.json()).toMatchObject({ annotationId: 'annotation-2', revision: 2 });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('直接区域证据缺少说明时返回稳定输入错误', async () => {
    const { app, sqlite } = await fixture();
    try {
      const response = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'direct',
          contextId: null,
          assetId: 'asset-1',
          editionId: 'edition-1',
          kind: 'area',
          anchor: { ...anchor, textQuote: null, quads: [] },
          sourceKind: 'pdf',
          title: 'Figure',
          summary: '',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'KNOWLEDGE_INVALID' });
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM research_annotations WHERE id <> 'annotation-1'")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('观点 API 覆盖无证据状态、关系编辑、解除和恢复', async () => {
    const { app, sqlite } = await fixture();
    try {
      const evidenceResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.evidence,
        payload: {
          mode: 'annotation',
          annotationId: 'annotation-1',
          sourceKind: 'pdf',
          summary: 'Robust evidence.',
        },
      });
      const evidence = evidenceDetailSchema.parse(evidenceResponse.json());
      const claimResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.claims,
        payload: {
          statement: 'The result is robust across specifications.',
          status: 'active',
        },
      });
      expect(claimResponse.statusCode).toBe(200);
      const claim = claimSchema.parse(claimResponse.json());
      expect(claim.evidenceCount).toBe(0);

      const relationResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.claimEvidence(claim.id),
        payload: { evidenceId: evidence.id, relation: 'supports', note: 'Primary result' },
      });
      expect(relationResponse.statusCode).toBe(200);
      const relation = claimEvidenceSchema.parse(relationResponse.json());
      expect(relation.relation).toBe('supports');

      const changedResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.claimEvidenceItem(relation.id),
        payload: { relation: 'qualifies', note: 'Only in the main sample', expectedRevision: 1 },
      });
      expect(changedResponse.statusCode).toBe(200);
      expect(changedResponse.json()).toMatchObject({ relation: 'qualifies', revision: 2 });

      const conflictResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.claimEvidenceItem(relation.id),
        payload: { note: 'Stale', expectedRevision: 1 },
      });
      expect(conflictResponse.statusCode).toBe(409);
      expect(conflictResponse.json()).toMatchObject({
        code: 'KNOWLEDGE_CONFLICT',
        details: { current: { revision: 2, note: 'Only in the main sample' } },
      });

      const deletedResponse = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.claimEvidenceItem(relation.id),
        payload: { expectedRevision: 2 },
      });
      expect(deletedResponse.json()).toMatchObject({ status: 'deleted', revision: 3 });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: RESEARCH_API_V1.claim(claim.id),
          })
        ).json(),
      ).toMatchObject({ evidenceCount: 0 });

      const restoredResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.claimEvidenceRestore(relation.id),
        payload: { expectedRevision: 3 },
      });
      expect(restoredResponse.json()).toMatchObject({ status: 'active', revision: 4 });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${RESEARCH_API_V1.claimEvidence(claim.id)}?includeDeleted=true`,
          })
        ).json(),
      ).toMatchObject([{ id: relation.id, status: 'active' }]);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('矩阵 API 分离结构与单元格 revision，并返回可选择的候选证据', async () => {
    const { app, sqlite } = await fixture();
    try {
      const evidence = evidenceDetailSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.evidence,
            payload: {
              mode: 'annotation',
              annotationId: 'annotation-1',
              sourceKind: 'pdf',
              summary: 'Robust evidence.',
            },
          })
        ).json(),
      );
      const claim = claimSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.claims,
            payload: { statement: 'The result is robust.', status: 'active' },
          })
        ).json(),
      );
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.claimEvidence(claim.id),
        payload: { evidenceId: evidence.id, relation: 'supports' },
      });
      const matrix = matrixDetailSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.matrices,
            payload: { title: 'Robustness matrix' },
          })
        ).json(),
      );
      const structureResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.matrixStructure(matrix.id),
        payload: {
          expectedStructureRevision: 1,
          columns: [{ workId: 'work-1', position: 0 }],
          rows: [
            { kind: 'claim', claimId: claim.id, position: 0 },
            { kind: 'dimension', title: 'Sample', position: 1 },
          ],
        },
      });
      expect(structureResponse.statusCode).toBe(200);
      const structured = matrixDetailSchema.parse(structureResponse.json());
      expect(structured).toMatchObject({ revision: 1, structureRevision: 2 });

      const claimRow = structured.rows[0]!;
      const column = structured.columns[0]!;
      const candidatesResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.matrixCandidates(matrix.id)}?rowId=${claimRow.id}&columnId=${column.id}`,
      });
      expect(candidatesResponse.statusCode).toBe(200);
      expect(candidatesResponse.json()).toMatchObject({
        candidates: [{ evidence: { id: evidence.id }, selectedLinkId: null }],
      });

      const cell = matrixCellSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.matrixCells(matrix.id),
            payload: {
              rowId: claimRow.id,
              columnId: column.id,
              synthesis: 'The paper supports the claim.',
            },
          })
        ).json(),
      );
      const linkResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.matrixCellEvidence(cell.id),
        payload: { evidenceId: evidence.id },
      });
      expect(linkResponse.statusCode).toBe(200);
      const link = matrixCellEvidenceSchema.parse(linkResponse.json());
      const reviewedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.matrixCellReview(cell.id),
        payload: { expectedRevision: 1 },
      });
      expect(reviewedResponse.statusCode).toBe(200);
      expect(reviewedResponse.json()).toMatchObject({ reviewState: 'current', revision: 2 });
      const windowResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.matrixCells(matrix.id)}?columnOffset=0&columnLimit=1`,
      });
      expect(windowResponse.statusCode, windowResponse.body).toBe(200);
      expect(matrixCellWindowSchema.parse(windowResponse.json())).toMatchObject({
        matrixId: matrix.id,
        columnIds: [column.id],
        rowIds: structured.rows.map((row) => row.id),
        cells: [{ id: cell.id, reviewState: 'current' }],
      });

      const staleResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.matrixCell(cell.id),
        payload: { synthesis: 'Stale', expectedRevision: 1 },
      });
      expect(staleResponse.statusCode).toBe(409);
      expect(staleResponse.json()).toMatchObject({
        details: { current: { revision: 2, synthesis: 'The paper supports the claim.' } },
      });
      const deleteLinkResponse = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.matrixCellEvidenceItem(link.id),
        payload: { expectedRevision: 1 },
      });
      expect(deleteLinkResponse.json()).toMatchObject({ status: 'deleted', revision: 2 });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('写作板 API 分离文档、结构和文本变更，并支持安全移除与恢复', async () => {
    const { app, sqlite } = await fixture();
    try {
      const note = researchNoteSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.notes,
            payload: { title: 'Robustness notes', body: 'Source notes.' },
          })
        ).json(),
      );
      const createdResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.writingDocuments,
        payload: { title: 'Robustness draft' },
      });
      expect(createdResponse.statusCode).toBe(200);
      const document = writingDocumentDetailSchema.parse(createdResponse.json());
      expect(document).toMatchObject({ contextId: null, structureRevision: 1, sections: [] });

      const structuredResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.writingDocumentStructure(document.id),
        payload: {
          expectedStructureRevision: 1,
          sections: [
            {
              title: 'Results',
              position: 0,
              blocks: [
                { kind: 'text', text: 'The result remains robust.', position: 0 },
                { kind: 'note', targetId: note.id, position: 1 },
              ],
            },
          ],
        },
      });
      expect(structuredResponse.statusCode, structuredResponse.body).toBe(200);
      const structured = writingDocumentDetailSchema.parse(structuredResponse.json());
      const textBlock = writingBlockSchema.parse(structured.sections[0]?.blocks[0]);
      const noteBlock = writingBlockSchema.parse(structured.sections[0]?.blocks[1]);
      expect(structured).toMatchObject({ revision: 1, structureRevision: 2 });
      expect(noteBlock).toMatchObject({
        kind: 'note',
        targetLabel: 'Robustness notes',
        targetState: 'current',
      });

      const editedResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.writingBlock(textBlock.id),
        payload: { text: 'The result is robust in every specification.', expectedRevision: 1 },
      });
      expect(editedResponse.statusCode).toBe(200);
      expect(editedResponse.json()).toMatchObject({ revision: 2 });
      const staleResponse = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.writingBlock(textBlock.id),
        payload: { text: 'Stale edit', expectedRevision: 1 },
      });
      expect(staleResponse.statusCode).toBe(409);
      expect(staleResponse.json()).toMatchObject({
        code: 'KNOWLEDGE_CONFLICT',
        details: { current: { revision: 2 } },
      });

      const removedResponse = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.writingDocumentStructure(document.id),
        payload: {
          expectedStructureRevision: 2,
          sections: [
            {
              id: structured.sections[0]!.id,
              title: 'Results',
              position: 0,
              blocks: [{ id: textBlock.id, position: 0 }],
            },
          ],
        },
      });
      expect(removedResponse.statusCode).toBe(200);
      const deletedStructureResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.writingDocument(document.id)}?includeDeletedStructure=true`,
      });
      expect(deletedStructureResponse.statusCode).toBe(200);
      expect(
        writingDocumentDetailSchema
          .parse(deletedStructureResponse.json())
          .sections.flatMap((section) => section.blocks)
          .find((block) => block.id === noteBlock.id),
      ).toMatchObject({ status: 'deleted', targetLabel: 'Robustness notes' });

      const listedResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.writingDocuments}?contextId=general`,
      });
      expect(listedResponse.statusCode).toBe(200);
      expect(listedResponse.json()).toMatchObject({ documents: [{ id: document.id }] });
      const deletedResponse = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.writingDocument(document.id),
        payload: { expectedRevision: 1 },
      });
      expect(deletedResponse.json()).toMatchObject({ status: 'deleted', revision: 2 });
      const restoredResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.writingDocumentRestore(document.id),
        payload: { expectedRevision: 2 },
      });
      expect(restoredResponse.json()).toMatchObject({ status: 'active', revision: 3 });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('统一检索 API 解析结构化筛选并可重建派生索引', async () => {
    const { app, sqlite } = await fixture();
    try {
      const note = researchNoteSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.notes,
            payload: { title: 'Searchroute methods', body: 'Robust identification.' },
          })
        ).json(),
      );
      const response = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.knowledgeSearch}?query=searchroute&contextId=general&entityTypes=note&statuses=active&limit=10`,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(knowledgeSearchResponseSchema.parse(response.json())).toMatchObject({
        results: [
          {
            entityId: note.id,
            entityType: 'note',
            contextId: null,
            matchedFields: ['title'],
          },
        ],
        nextCursor: null,
        maxResults: 500,
      });

      const invalid = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.knowledgeSearch}?query=searchroute&entityTypes=matrix`,
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: 'KNOWLEDGE_INVALID' });

      sqlite.prepare('DELETE FROM research_knowledge_search').run();
      const rebuild = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.knowledgeSearchRebuild,
      });
      expect(rebuild.statusCode, rebuild.body).toBe(200);
      expect(knowledgeSearchRebuildResponseSchema.parse(rebuild.json())).toMatchObject({
        notes: 1,
        total: 1,
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
