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

function seedSecondPaper(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  const secondHash = 'f'.repeat(64);
  const secondAnchor = {
    ...textAnchor,
    pageNumber: 7,
    assetHash: secondHash,
    editionId: 'edition-2',
  };
  sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort, status)
       VALUES ('work-2', 'article', 'Replication', 'replication', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES ('edition-2', 'work-2', 'journal', 'Replication edition')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type, state)
       VALUES ('asset-2', 'sha256', ?, 2048, 'application/pdf', 'active')`,
    )
    .run(secondHash);
  sqlite
    .prepare(
      `INSERT INTO research_asset_locations
       (id, asset_id, mode, original_path, resolved_path, state)
       VALUES ('location-2', 'asset-2', 'linked', '/private/replication.pdf',
               '/private/replication.pdf', 'available')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_attachments
       (id, edition_id, asset_id, role, display_name, status)
       VALUES ('attachment-2', 'edition-2', 'asset-2', 'primary-pdf', 'replication.pdf', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_annotations
       (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
        status, revision, created_at, updated_at)
       VALUES ('annotation-work-2', 'asset-2', 'edition-2', NULL, 'highlight', 7, ?, NULL,
               '#fde047', 'active', 1, ?, ?)`,
    )
    .run(JSON.stringify(secondAnchor), NOW, NOW);
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

  it('观点允许无证据，并独立维护支持、反驳、限定关系与 tombstone', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      fixture.sqlite
        .prepare(
          `INSERT INTO research_reading_contexts
           (id, name, normalized_name, status) VALUES ('context-claim', 'Synthesis', 'synthesis', 'active')`,
        )
        .run();
      for (const [id, page] of [
        ['annotation-2', 4],
        ['annotation-3', 5],
      ] as const) {
        fixture.sqlite
          .prepare(
            `INSERT INTO research_annotations
             (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
              status, revision, created_at, updated_at)
             VALUES (?, 'asset-1', 'edition-1', NULL, 'highlight', ?, ?, NULL,
                     '#fde047', 'active', 1, ?, ?)`,
          )
          .run(id, page, JSON.stringify({ ...textAnchor, pageNumber: page }), NOW, NOW);
      }
      const evidence = await Promise.all(
        ['annotation-1', 'annotation-2', 'annotation-3'].map((annotationId, index) =>
          fixture.service.createEvidence({
            contextId: null,
            annotationId,
            sourceKind: 'pdf',
            title: `Evidence ${index + 1}`,
            summary: `Evidence summary ${index + 1}`,
            notes: null,
          }),
        ),
      );

      const draft = await fixture.service.createClaim({
        contextId: 'context-claim',
        statement: '  The intervention has a durable effect.  ',
        rationale: null,
        status: 'draft',
      });
      expect(draft).toMatchObject({
        statement: 'The intervention has a durable effect.',
        status: 'draft',
        evidenceCount: 0,
      });
      const active = await fixture.service.updateClaim(draft.id, {
        status: 'active',
        expectedRevision: 1,
      });
      expect(active).toMatchObject({ status: 'active', evidenceCount: 0, revision: 2 });

      const relations = await Promise.all(
        (['supports', 'refutes', 'qualifies'] as const).map((relation, index) =>
          fixture.service.createClaimEvidence(draft.id, {
            evidenceId: evidence[index]!.id,
            relation,
            note: `${relation} note`,
          }),
        ),
      );
      expect(await fixture.service.listClaimEvidence(draft.id, false)).toMatchObject([
        { relation: 'qualifies' },
        { relation: 'refutes' },
        { relation: 'supports' },
      ]);
      expect(await fixture.service.getClaim(draft.id)).toMatchObject({ evidenceCount: 3 });
      const reusedClaim = await fixture.service.createClaim({
        contextId: null,
        statement: 'The first estimate remains useful in the general workspace.',
        rationale: null,
        status: 'draft',
      });
      await fixture.service.createClaimEvidence(reusedClaim.id, {
        evidenceId: evidence[0]!.id,
        relation: 'supports',
        note: null,
      });
      expect(await fixture.service.getClaim(reusedClaim.id)).toMatchObject({ evidenceCount: 1 });
      expect(await fixture.service.getEvidence(evidence[0]!.id)).toMatchObject({
        contextId: null,
        revision: 1,
      });

      const changed = await fixture.service.updateClaimEvidence(relations[0]!.id, {
        relation: 'qualifies',
        note: 'Limits the population.',
        expectedRevision: 1,
      });
      expect(changed).toMatchObject({ relation: 'qualifies', revision: 2 });
      await expect(
        fixture.service.updateClaimEvidence(relations[0]!.id, {
          note: 'Stale',
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({
        code: 'KNOWLEDGE_CONFLICT',
        details: { current: { revision: 2, note: 'Limits the population.' } },
      });

      const deletedRelation = await fixture.service.deleteClaimEvidence(relations[1]!.id, {
        expectedRevision: 1,
      });
      expect(deletedRelation.status).toBe('deleted');
      expect(await fixture.service.getClaim(draft.id)).toMatchObject({ evidenceCount: 2 });
      expect(await fixture.service.getEvidence(evidence[1]!.id)).toMatchObject({
        status: 'active',
      });
      await fixture.service.restoreClaimEvidence(relations[1]!.id, { expectedRevision: 2 });
      expect(await fixture.service.getClaim(draft.id)).toMatchObject({ evidenceCount: 3 });

      const note = await fixture.service.createNote({
        contextId: 'context-claim',
        title: 'Claim note',
        body: '',
      });
      await expect(
        fixture.service.createNoteLink(note.id, {
          target: { kind: 'claim', claimId: draft.id },
        }),
      ).resolves.toMatchObject({ target: { kind: 'claim', claimId: draft.id } });

      const deletedClaim = await fixture.service.deleteClaim(draft.id, { expectedRevision: 2 });
      expect(deletedClaim.status).toBe('deleted');
      expect(
        fixture.sqlite
          .prepare(
            `SELECT search.status FROM research_knowledge_search_fts fts
             JOIN research_knowledge_search search ON search.rowid = fts.rowid
             WHERE research_knowledge_search_fts MATCH 'durable' AND search.entity_id = ?`,
          )
          .get(draft.id),
      ).toEqual({ status: 'deleted' });
      const restoredClaim = await fixture.service.restoreClaim(draft.id, { expectedRevision: 3 });
      expect(restoredClaim).toMatchObject({ status: 'active', evidenceCount: 3, revision: 4 });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('混合矩阵归集跨论文候选，并以独立 revision 跟踪结构、单元格和复核基线', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      seedSecondPaper(fixture.sqlite);
      const firstEvidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'pdf',
        title: 'Original estimate',
        summary: 'The original estimate is positive.',
        notes: null,
      });
      const secondEvidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-work-2',
        sourceKind: 'pdf',
        title: 'Replication estimate',
        summary: 'The replication estimate is smaller.',
        notes: null,
      });
      const claim = await fixture.service.createClaim({
        contextId: null,
        statement: 'The effect replicates across samples.',
        rationale: null,
        status: 'active',
      });
      const firstRelation = await fixture.service.createClaimEvidence(claim.id, {
        evidenceId: firstEvidence.id,
        relation: 'supports',
        note: null,
      });
      await fixture.service.createClaimEvidence(claim.id, {
        evidenceId: secondEvidence.id,
        relation: 'qualifies',
        note: null,
      });

      const matrix = await fixture.service.createMatrix({
        contextId: null,
        title: 'Cross-paper comparison',
        description: 'Compare estimates and samples.',
      });
      const structured = await fixture.service.updateMatrixStructure(matrix.id, {
        expectedStructureRevision: 1,
        columns: [
          { workId: 'work-1', position: 0 },
          { workId: 'work-2', position: 1 },
        ],
        rows: [
          { kind: 'claim', claimId: claim.id, position: 0 },
          {
            kind: 'dimension',
            title: 'Sample',
            question: 'Who was included?',
            position: 1,
          },
        ],
      });
      expect(structured).toMatchObject({ structureRevision: 2, revision: 1 });
      expect(structured.columns.map((column) => column.workId)).toEqual(['work-1', 'work-2']);
      expect(structured.rows.map((row) => row.kind)).toEqual(['claim', 'dimension']);
      const firstColumn = structured.columns[0]!;
      const secondColumn = structured.columns[1]!;
      const claimRow = structured.rows[0]!;
      const dimensionRow = structured.rows[1]!;

      await expect(
        fixture.service.getMatrixCandidates(matrix.id, {
          rowId: claimRow.id,
          columnId: firstColumn.id,
        }),
      ).resolves.toMatchObject({
        candidates: [{ evidence: { id: firstEvidence.id }, selectedLinkId: null }],
      });
      await expect(
        fixture.service.getMatrixCandidates(matrix.id, {
          rowId: claimRow.id,
          columnId: secondColumn.id,
        }),
      ).resolves.toMatchObject({ candidates: [{ evidence: { id: secondEvidence.id } }] });
      await expect(
        fixture.service.getMatrixCandidates(matrix.id, {
          rowId: dimensionRow.id,
          columnId: firstColumn.id,
        }),
      ).resolves.toMatchObject({ candidates: [{ evidence: { id: firstEvidence.id } }] });

      const cell = await fixture.service.createMatrixCell(matrix.id, {
        rowId: claimRow.id,
        columnId: firstColumn.id,
        synthesis: 'The original paper supports the claim.',
      });
      expect(cell).toMatchObject({ revision: 1, reviewState: 'needs-review' });
      const selected = await fixture.service.createMatrixCellEvidence(cell.id, {
        evidenceId: firstEvidence.id,
      });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        selectedEvidenceCount: 1,
        reviewState: 'needs-review',
        revision: 1,
      });
      const reviewed = await fixture.service.reviewMatrixCell(cell.id, { expectedRevision: 1 });
      expect(reviewed).toMatchObject({ reviewState: 'current', revision: 2 });

      await fixture.service.updateEvidence(firstEvidence.id, {
        summary: 'The original estimate is positive and precisely estimated.',
        expectedRevision: 1,
      });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        reviewState: 'needs-review',
        revision: 2,
      });
      const reviewedEvidence = await fixture.service.reviewMatrixCell(cell.id, {
        expectedRevision: 2,
      });
      expect(reviewedEvidence).toMatchObject({ reviewState: 'current', revision: 3 });

      fixture.sqlite
        .prepare("UPDATE research_annotations SET revision = 2 WHERE id = 'annotation-1'")
        .run();
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        reviewState: 'needs-review',
      });
      const reviewedSource = await fixture.service.reviewMatrixCell(cell.id, {
        expectedRevision: 3,
      });
      expect(reviewedSource).toMatchObject({ reviewState: 'current', revision: 4 });
      fixture.sqlite
        .prepare("UPDATE research_annotations SET revision = 1 WHERE id = 'annotation-1'")
        .run();
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        reviewState: 'needs-review',
      });
      const restoredSource = await fixture.service.reviewMatrixCell(cell.id, {
        expectedRevision: 4,
      });
      expect(restoredSource).toMatchObject({ reviewState: 'current', revision: 5 });

      await fixture.service.updateClaim(claim.id, {
        rationale: 'The replication changes the estimated magnitude.',
        expectedRevision: 1,
      });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        reviewState: 'needs-review',
      });
      const reviewedClaim = await fixture.service.reviewMatrixCell(cell.id, {
        expectedRevision: 5,
      });
      expect(reviewedClaim).toMatchObject({ reviewState: 'current', revision: 6 });
      await fixture.service.updateClaimEvidence(firstRelation.id, {
        note: 'Main specification only',
        expectedRevision: 1,
      });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        reviewState: 'needs-review',
      });

      const reordered = await fixture.service.updateMatrixStructure(matrix.id, {
        expectedStructureRevision: 2,
        columns: [
          { id: secondColumn.id, workId: 'work-2', position: 0 },
          { id: firstColumn.id, workId: 'work-1', position: 1 },
        ],
        rows: [
          {
            id: dimensionRow.id,
            kind: 'dimension',
            title: 'Sample and setting',
            question: 'Who was included?',
            position: 0,
          },
          { id: claimRow.id, kind: 'claim', claimId: claim.id, position: 1 },
        ],
      });
      expect(reordered).toMatchObject({ structureRevision: 3, revision: 1 });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({ revision: 6 });
      const renamed = await fixture.service.updateMatrix(matrix.id, {
        title: 'Replication comparison',
        expectedRevision: 1,
      });
      expect(renamed).toMatchObject({ revision: 2, structureRevision: 3 });

      const removed = await fixture.service.deleteMatrixCellEvidence(selected.id, {
        expectedRevision: 1,
      });
      expect(removed.status).toBe('deleted');
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        selectedEvidenceCount: 0,
        revision: 6,
      });
      await fixture.service.restoreMatrixCellEvidence(selected.id, { expectedRevision: 2 });
      expect(await fixture.service.getMatrixCell(cell.id)).toMatchObject({
        selectedEvidenceCount: 1,
        revision: 6,
      });

      const reduced = await fixture.service.updateMatrixStructure(matrix.id, {
        expectedStructureRevision: 3,
        columns: [{ id: firstColumn.id, workId: 'work-1', position: 0 }],
        rows: [{ id: claimRow.id, kind: 'claim', claimId: claim.id, position: 0 }],
      });
      expect(reduced).toMatchObject({ structureRevision: 4, revision: 2 });
      const withDeletedStructure = await fixture.service.getMatrix(matrix.id, true);
      expect(withDeletedStructure.columns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: secondColumn.id, status: 'deleted' }),
          expect.objectContaining({ id: firstColumn.id, status: 'active' }),
        ]),
      );
      expect(withDeletedStructure.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: dimensionRow.id, status: 'deleted' }),
          expect.objectContaining({ id: claimRow.id, status: 'active' }),
        ]),
      );
      const restoredStructure = await fixture.service.updateMatrixStructure(matrix.id, {
        expectedStructureRevision: 4,
        columns: [
          { id: secondColumn.id, workId: 'work-2', position: 0 },
          { id: firstColumn.id, workId: 'work-1', position: 1 },
        ],
        rows: [
          {
            id: dimensionRow.id,
            kind: 'dimension',
            title: 'Sample and setting',
            question: 'Who was included?',
            position: 0,
          },
          { id: claimRow.id, kind: 'claim', claimId: claim.id, position: 1 },
        ],
      });
      expect(restoredStructure).toMatchObject({ structureRevision: 5, revision: 2 });

      const archived = await fixture.service.updateMatrix(matrix.id, {
        status: 'archived',
        expectedRevision: 2,
      });
      expect(archived).toMatchObject({ status: 'archived', revision: 3 });
      const unarchived = await fixture.service.updateMatrix(matrix.id, {
        status: 'active',
        expectedRevision: 3,
      });
      expect(unarchived).toMatchObject({ status: 'active', revision: 4 });
      const deletedMatrix = await fixture.service.deleteMatrix(matrix.id, { expectedRevision: 4 });
      expect(deletedMatrix).toMatchObject({ status: 'deleted', revision: 5 });
      const restoredMatrix = await fixture.service.restoreMatrix(matrix.id, {
        expectedRevision: 5,
      });
      expect(restoredMatrix).toMatchObject({ status: 'active', revision: 6 });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('写作板保留资源引用、稳定块 ID，并分离结构与文本 revision', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      const note = await fixture.service.createNote({
        contextId: null,
        title: 'Identification notes',
        body: 'Instrument assumptions.',
      });
      const evidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'pdf',
        title: 'First-stage evidence',
        summary: 'The instrument predicts treatment.',
        notes: null,
      });
      const claim = await fixture.service.createClaim({
        contextId: null,
        statement: 'The instrument identifies the causal effect.',
        rationale: null,
        status: 'active',
      });
      const matrix = await fixture.service.createMatrix({
        contextId: null,
        title: 'Identification comparison',
        description: null,
      });
      const document = await fixture.service.createWritingDocument({
        contextId: null,
        title: 'Causal identification draft',
      });

      const structured = await fixture.service.updateWritingStructure(document.id, {
        expectedStructureRevision: 1,
        sections: [
          {
            title: 'Introduction',
            position: 0,
            blocks: [
              { kind: 'text', text: 'Initial argument.', position: 0 },
              { kind: 'note', targetId: note.id, position: 1 },
              { kind: 'evidence', targetId: evidence.id, position: 2 },
              { kind: 'claim', targetId: claim.id, position: 3 },
              { kind: 'matrix', targetId: matrix.id, position: 4 },
            ],
          },
        ],
      });
      expect(structured).toMatchObject({ structureRevision: 2, revision: 1 });
      expect(structured.sections[0]?.blocks).toMatchObject([
        { kind: 'text', text: 'Initial argument.' },
        {
          kind: 'note',
          targetId: note.id,
          targetLabel: 'Identification notes',
          targetUrl: expect.stringContaining('sourceStatus=active'),
        },
        {
          kind: 'evidence',
          targetId: evidence.id,
          targetLabel: 'First-stage evidence',
          sourceState: 'current',
        },
        {
          kind: 'claim',
          targetId: claim.id,
          targetLabel: 'The instrument identifies the causal effect.',
          targetUrl: expect.stringContaining('claimStatus=active'),
        },
        { kind: 'matrix', targetId: matrix.id, targetLabel: 'Identification comparison' },
      ]);

      const section = structured.sections[0]!;
      const [textBlock, noteBlock, evidenceBlock, claimBlock, matrixBlock] = section.blocks;
      const edited = await fixture.service.updateWritingBlock(textBlock!.id, {
        text: 'Revised argument.',
        expectedRevision: textBlock!.revision,
      });
      expect(edited).toMatchObject({ text: 'Revised argument.', revision: 2 });
      const afterTextEdit = await fixture.service.getWritingDocument(document.id);
      expect(afterTextEdit.structureRevision).toBe(2);
      expect(
        afterTextEdit.sections
          .flatMap((item) => item.blocks)
          .find((block) => block.id === textBlock!.id),
      ).toMatchObject({ id: textBlock!.id, text: 'Revised argument.' });

      const moved = await fixture.service.updateWritingStructure(document.id, {
        expectedStructureRevision: 2,
        sections: [
          {
            id: section.id,
            title: 'Introduction',
            position: 0,
            blocks: [
              { id: noteBlock!.id, position: 0 },
              { id: evidenceBlock!.id, position: 1 },
              { id: claimBlock!.id, position: 2 },
              { id: matrixBlock!.id, position: 3 },
            ],
          },
          {
            title: 'Discussion',
            position: 1,
            blocks: [{ id: textBlock!.id, position: 0 }],
          },
        ],
      });
      const discussion = moved.sections[1]!;
      expect(discussion.blocks[0]).toMatchObject({
        id: textBlock!.id,
        text: 'Revised argument.',
        sectionId: discussion.id,
      });

      const withoutNote = await fixture.service.updateWritingStructure(document.id, {
        expectedStructureRevision: 3,
        sections: moved.sections.map((item) => ({
          id: item.id,
          title: item.title,
          position: item.position,
          blocks: item.blocks
            .filter((block) => block.id !== noteBlock!.id)
            .map((block, position) => ({ id: block.id, position })),
        })),
      });
      expect(withoutNote.structureRevision).toBe(4);
      const withDeleted = await fixture.service.getWritingDocument(document.id, true);
      expect(
        withDeleted.sections
          .flatMap((item) => item.blocks)
          .find((block) => block.id === noteBlock!.id),
      ).toMatchObject({ status: 'deleted', targetLabel: 'Identification notes' });

      const restored = await fixture.service.updateWritingStructure(document.id, {
        expectedStructureRevision: 4,
        sections: withoutNote.sections.map((item) => ({
          id: item.id,
          title: item.title,
          position: item.position,
          blocks:
            item.id === section.id
              ? [
                  { id: noteBlock!.id, position: 0 },
                  ...item.blocks.map((block, index) => ({ id: block.id, position: index + 1 })),
                ]
              : item.blocks.map((block, position) => ({ id: block.id, position })),
        })),
      });
      expect(
        restored.sections
          .flatMap((item) => item.blocks)
          .find((block) => block.id === noteBlock!.id),
      ).toMatchObject({ id: noteBlock!.id, status: 'active' });

      await fixture.service.deleteNote(note.id, { expectedRevision: note.revision });
      expect(
        (await fixture.service.getWritingDocument(document.id)).sections
          .flatMap((item) => item.blocks)
          .find((block) => block.id === noteBlock!.id),
      ).toMatchObject({
        targetState: 'deleted',
        targetLabel: 'Identification notes',
        targetUrl: expect.stringContaining('sourceStatus=deleted'),
      });
      fixture.sqlite
        .prepare("UPDATE research_asset_locations SET state = 'missing' WHERE id = 'location-1'")
        .run();
      expect(
        (await fixture.service.getWritingDocument(document.id)).sections
          .flatMap((item) => item.blocks)
          .find((block) => block.id === evidenceBlock!.id),
      ).toMatchObject({ targetState: 'unavailable', sourceState: 'source-unavailable' });

      const archived = await fixture.service.updateWritingDocument(document.id, {
        status: 'archived',
        expectedRevision: document.revision,
      });
      expect(archived).toMatchObject({ status: 'archived', revision: 2, structureRevision: 5 });
      const deleted = await fixture.service.deleteWritingDocument(document.id, {
        expectedRevision: archived.revision,
      });
      const restoredDocument = await fixture.service.restoreWritingDocument(document.id, {
        expectedRevision: deleted.revision,
      });
      expect(restoredDocument).toMatchObject({ status: 'archived', revision: 4 });
    } finally {
      fixture.sqlite.close();
    }
  });

  it('统一检索同步四类正文、结构化筛选、动态来源状态和稳定分页', async () => {
    const fixture = serviceFixture();
    try {
      seedPaper(fixture.sqlite);
      seedAnnotation(fixture.sqlite);
      const note = await fixture.service.createNote({
        contextId: null,
        title: 'Unifiedtoken methods note',
        body: 'Identification assumptions.',
      });
      const evidence = await fixture.service.createEvidence({
        contextId: null,
        annotationId: 'annotation-1',
        sourceKind: 'pdf',
        title: 'Instrument result',
        summary: 'Unifiedtoken evidence for the first stage.',
        notes: null,
      });
      const claim = await fixture.service.createClaim({
        contextId: null,
        statement: 'Unifiedtoken identifies treatment.',
        rationale: 'The exclusion restriction remains explicit.',
        status: 'active',
      });
      const document = await fixture.service.createWritingDocument({
        contextId: null,
        title: 'Identification draft',
      });
      await fixture.service.updateWritingStructure(document.id, {
        expectedStructureRevision: 1,
        sections: [
          {
            title: 'Argument',
            position: 0,
            blocks: [{ kind: 'text', text: 'Unifiedtoken synthesis paragraph.', position: 0 }],
          },
        ],
      });

      const first = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        entityTypes: ['note', 'evidence', 'claim', 'writing-document'],
        statuses: ['active', 'draft', 'archived'],
        cursor: null,
        limit: 2,
      });
      expect(first.results).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        entityTypes: ['note', 'evidence', 'claim', 'writing-document'],
        statuses: ['active', 'draft', 'archived'],
        cursor: first.nextCursor,
        limit: 2,
      });
      const allResults = [...first.results, ...second.results];
      expect(new Set(allResults.map((result) => result.entityId)).size).toBe(4);
      expect(allResults.map((result) => result.entityType).sort()).toEqual([
        'claim',
        'evidence',
        'note',
        'writing-document',
      ]);
      expect(allResults.find((result) => result.entityId === document.id)).toMatchObject({
        matchedFields: ['body'],
        targetUrl: expect.stringContaining(`document=${document.id}`),
      });

      const byWork = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        workId: 'work-1',
        entityTypes: ['note', 'evidence', 'claim', 'writing-document'],
        statuses: ['active'],
        cursor: null,
        limit: 30,
      });
      expect(byWork.results).toMatchObject([
        {
          entityId: evidence.id,
          entityType: 'evidence',
          sourceState: 'current',
          targetUrl: expect.stringContaining('/research/read/asset-1?'),
        },
      ]);

      fixture.sqlite
        .prepare("UPDATE research_asset_locations SET state = 'missing' WHERE id = 'location-1'")
        .run();
      const unavailable = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        entityTypes: ['evidence'],
        statuses: ['active'],
        sourceStates: ['source-unavailable'],
        cursor: null,
        limit: 30,
      });
      expect(unavailable.results).toMatchObject([
        { entityId: evidence.id, sourceState: 'source-unavailable' },
      ]);

      await fixture.service.deleteNote(note.id, { expectedRevision: note.revision });
      const deleted = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        entityTypes: ['note'],
        statuses: ['deleted'],
        cursor: null,
        limit: 30,
      });
      expect(deleted.results).toMatchObject([
        {
          entityId: note.id,
          status: 'deleted',
          targetUrl: expect.stringContaining('sourceStatus=deleted'),
        },
      ]);

      fixture.sqlite
        .prepare("DELETE FROM research_knowledge_search WHERE entity_type = 'claim'")
        .run();
      const rebuilt = await fixture.service.rebuildKnowledgeSearch();
      expect(rebuilt).toMatchObject({ notes: 1, evidence: 1, claims: 1, writingDocuments: 1 });
      expect(rebuilt.total).toBe(4);
      const rebuiltClaim = await fixture.service.searchKnowledge({
        query: 'unifiedtoken',
        entityTypes: ['claim'],
        statuses: ['active'],
        cursor: null,
        limit: 30,
      });
      expect(rebuiltClaim.results).toMatchObject([{ entityId: claim.id }]);
    } finally {
      fixture.sqlite.close();
    }
  });
});
