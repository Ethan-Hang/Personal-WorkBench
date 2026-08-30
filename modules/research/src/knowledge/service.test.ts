import { describe, expect, it } from 'vitest';
import type { AnnotationAnchor } from '../contract.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { ResearchKnowledgeService } from './service.js';

const NOW = '2026-08-30T09:30:00.000Z';
const HASH = 'c'.repeat(64);

const textAnchor: AnnotationAnchor = {
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

function seedPaper(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort, status)
       VALUES ('work-1', 'article', 'Identification', 'identification', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES ('edition-1', 'work-1', 'journal', 'Identification, journal edition')`,
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
}

function seedAnnotation(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  sqlite
    .prepare(
      `INSERT INTO research_annotations
       (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
        status, revision, created_at, updated_at)
       VALUES ('annotation-1', 'asset-1', 'edition-1', NULL, 'highlight', 3, ?, NULL,
               '#fde047', 'active', 1, ?, ?)`,
    )
    .run(JSON.stringify(textAnchor), NOW, NOW);
}

function serviceFixture() {
  const database = makeResearchDatabase(() => NOW);
  let sequence = 0;
  const service = new ResearchKnowledgeService(database.knowledgeRepo, {
    createId: () => `knowledge-${++sequence}`,
    now: () => new Date(NOW),
  });
  return { ...database, service };
}

describe('ResearchKnowledgeService', () => {
  it('完成笔记更新、资源链接、删除恢复和 revision 历史', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      const note = await fixture.service.createNote({
        contextId: null,
        title: '  Identification notes  ',
        body: 'Initial',
      });
      expect(note).toMatchObject({ title: 'Identification notes', revision: 1 });
      const updated = await fixture.service.updateNote(note.id, {
        body: 'Revised',
        expectedRevision: 1,
      });
      expect(updated).toMatchObject({ body: 'Revised', revision: 2 });

      const link = await fixture.service.createNoteLink(note.id, {
        target: { kind: 'work', workId: 'work-1' },
      });
      expect(await fixture.service.listNoteLinks(note.id, false)).toEqual([link]);

      const deleted = await fixture.service.deleteNote(note.id, { expectedRevision: 2 });
      expect(deleted).toMatchObject({ status: 'deleted', revision: 3 });
      const restored = await fixture.service.restoreNote(note.id, { expectedRevision: 3 });
      expect(restored).toMatchObject({ status: 'active', revision: 4 });
      expect(await fixture.service.listRevisions('note', note.id)).toMatchObject([
        { revision: 3, reason: 'restore' },
        { revision: 2, reason: 'delete' },
        { revision: 1, reason: 'update' },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });

  it('从现有批注生成服务器来源快照和不含磁盘路径的阅读器回跳', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      const evidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'pdf',
        title: 'Instrument',
        summary: 'The instrument identifies the effect.',
        notes: null,
      });
      expect(evidence).toMatchObject({
        workId: 'work-1',
        sourceSnapshot: {
          assetHash: HASH,
          annotationRevision: 1,
          workTitle: 'Identification',
          ocr: null,
        },
        sourceLink: {
          pageNumber: 3,
          contextId: null,
          sourceState: 'current',
        },
      });
      expect(evidence.sourceLink.readerUrl).toContain(
        '/research/read/asset-1?page=3&context=general&annotation=annotation-1',
      );
      expect(JSON.stringify(evidence)).not.toContain('/private/paper.pdf');
    } finally {
      fixture.sqlite.close();
    }
  });

  it('直接提炼原子创建批注与证据，非文本来源必须有说明', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      const areaAnchor: AnnotationAnchor = {
        ...textAnchor,
        rect: { x: 40, y: 50, width: 220, height: 140 },
        quads: [],
        textQuote: null,
      };
      await expect(
        fixture.service.createDirectEvidence({
          contextId: null,
          assetId: 'asset-1',
          editionId: 'edition-1',
          kind: 'area',
          anchor: areaAnchor,
          body: null,
          color: null,
          sourceKind: 'pdf',
          title: 'Figure',
          summary: '',
          notes: null,
        }),
      ).rejects.toMatchObject({ code: 'KNOWLEDGE_INVALID', status: 400 });

      const evidence = await fixture.service.createDirectEvidence({
        contextId: null,
        assetId: 'asset-1',
        editionId: 'edition-1',
        kind: 'area',
        anchor: areaAnchor,
        body: null,
        color: '#38bdf8',
        sourceKind: 'pdf',
        title: 'Figure 2',
        summary: 'Figure 2 shows the first-stage relationship.',
        notes: null,
      });
      expect(evidence).toMatchObject({ sourceState: 'current', annotationId: 'knowledge-1' });
      expect(
        fixture.sqlite
          .prepare('SELECT COUNT(*) AS count FROM research_annotations WHERE id = ?')
          .get(evidence.annotationId),
      ).toEqual({ count: 1 });
      expect(
        fixture.sqlite
          .prepare('SELECT COUNT(*) AS count FROM research_evidence WHERE id = ?')
          .get(evidence.id),
      ).toEqual({ count: 1 });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('OCR 证据记录实际页面缓存版本，没有缓存时明确拒绝', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      await expect(
        fixture.service.createEvidence({
          contextId: null,
          annotationId: 'annotation-1',
          sourceKind: 'ocr',
          title: null,
          summary: 'OCR quote',
          notes: null,
        }),
      ).rejects.toMatchObject({
        code: 'KNOWLEDGE_SOURCE_NOT_FOUND',
      });

      fixture.sqlite
        .prepare(
          `INSERT INTO research_ocr_page_cache
           (asset_id, asset_hash, page_number, languages_key, engine, engine_version,
            language_pack_version, text_content, position_json, created_at, updated_at)
           VALUES ('asset-1', ?, 3, 'eng', 'tesseract', '7.0.0', '2026.08',
                   'instrumental variable', NULL, ?, ?)`,
        )
        .run(HASH, NOW, NOW);
      const evidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'ocr',
        title: null,
        summary: 'OCR quote',
        notes: null,
      });
      expect(evidence.sourceSnapshot.ocr).toEqual({
        engine: 'tesseract',
        engineVersion: '7.0.0',
        languagePackVersion: '2026.08',
        languagesKey: 'eng',
      });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('重新绑定先展示来源差异，并同时校验证据和目标批注 revision', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      const created = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'pdf',
        title: null,
        summary: 'Rebindable evidence',
        notes: null,
      });
      const nextAnchor = { ...textAnchor, pageNumber: 6 };
      fixture.sqlite
        .prepare(
          `INSERT INTO research_annotations
           (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
            status, revision, created_at, updated_at)
           VALUES ('annotation-2', 'asset-1', 'edition-1', NULL, 'highlight', 6, ?, NULL,
                   '#fde047', 'active', 1, ?, ?)`,
        )
        .run(JSON.stringify(nextAnchor), NOW, NOW);

      const preview = await fixture.service.previewEvidenceRebind(created.id, {
        annotationId: 'annotation-2',
        sourceKind: 'pdf',
      });
      expect(preview).toMatchObject({
        expectedRevision: 1,
        targetAnnotationRevision: 1,
        oldSource: { annotationId: 'annotation-1', pageNumber: 3 },
        newSource: { annotationId: 'annotation-2', pageNumber: 6 },
      });
      expect(preview.differences.map((difference) => difference.field)).toEqual([
        'annotation',
        'page',
      ]);

      fixture.sqlite
        .prepare("UPDATE research_annotations SET revision = 2 WHERE id = 'annotation-2'")
        .run();
      await expect(
        fixture.service.confirmEvidenceRebind(created.id, {
          annotationId: 'annotation-2',
          sourceKind: 'pdf',
          expectedRevision: 1,
          targetAnnotationRevision: 1,
        }),
      ).rejects.toMatchObject({ code: 'KNOWLEDGE_CONFLICT', status: 409 });
      fixture.sqlite
        .prepare("UPDATE research_annotations SET revision = 1 WHERE id = 'annotation-2'")
        .run();
      const rebound = await fixture.service.confirmEvidenceRebind(created.id, {
        annotationId: 'annotation-2',
        sourceKind: 'pdf',
        expectedRevision: 1,
        targetAnnotationRevision: 1,
      });
      expect(rebound).toMatchObject({ annotationId: 'annotation-2', revision: 2 });
      expect(await fixture.service.listRevisions('evidence', created.id)).toMatchObject([
        {
          revision: 1,
          reason: 'rebind',
          snapshot: { sourceSnapshot: { annotationId: 'annotation-1' } },
        },
      ]);
    } finally {
      fixture.sqlite.close();
    }
  });
});
