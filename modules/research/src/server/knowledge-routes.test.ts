import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { RESEARCH_API_V1, evidenceDetailSchema, researchNoteSchema } from '../contract.js';
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
    createId: () => `route-knowledge-${++sequence}`,
    clock: () => new Date(NOW),
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app };
}

describe('research knowledge routes', () => {
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
});
