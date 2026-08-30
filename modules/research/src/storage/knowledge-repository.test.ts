import { describe, expect, it } from 'vitest';
import type { AnnotationAnchor, EvidenceSourceSnapshot } from '../contract.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { SqliteKnowledgeRepository } from './sqlite-knowledge-repository.js';

const instant = '2026-08-30T08:00:00.000Z';
const assetHash = 'a'.repeat(64);

const anchor: AnnotationAnchor = {
  pageNumber: 2,
  pageSize: { width: 612, height: 792 },
  rect: { x: 10, y: 20, width: 120, height: 18 },
  quads: [],
  textQuote: {
    exact: 'causal evidence',
    prefix: 'before',
    suffix: 'after',
    fingerprint: 'b'.repeat(64),
  },
  assetHash,
  editionId: 'edition-1',
};

function seedPaper(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  sqlite
    .prepare(
      `INSERT INTO research_works (id, type, title, title_sort, status)
       VALUES ('work-1', 'article', 'Causal Paper', 'causal paper', 'active')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_editions (id, work_id, kind, title)
       VALUES ('edition-1', 'work-1', 'journal', 'Causal Paper')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type, state)
       VALUES ('asset-1', 'sha256', ?, 42, 'application/pdf', 'active')`,
    )
    .run(assetHash);
  sqlite
    .prepare(
      `INSERT INTO research_asset_locations
       (id, asset_id, mode, original_path, resolved_path, state)
       VALUES ('location-1', 'asset-1', 'linked', '/papers/causal.pdf',
               '/papers/causal.pdf', 'available')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO research_attachments
       (id, edition_id, asset_id, role, display_name, status)
       VALUES ('attachment-1', 'edition-1', 'asset-1', 'primary-pdf', 'causal.pdf', 'active')`,
    )
    .run();
}

function seedAnnotation(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']): void {
  sqlite
    .prepare(
      `INSERT INTO research_annotations
       (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
        status, revision, created_at, updated_at)
       VALUES ('annotation-1', 'asset-1', 'edition-1', NULL, 'highlight', 2, ?, NULL,
               '#ffd54f', 'active', 1, ?, ?)`,
    )
    .run(JSON.stringify(anchor), instant, instant);
}

function sourceSnapshot(
  annotationId = 'annotation-1',
  workId = 'work-1',
  contextId: string | null = null,
): EvidenceSourceSnapshot {
  return {
    workId,
    editionId: 'edition-1',
    assetId: 'asset-1',
    annotationId,
    contextId,
    pageNumber: 2,
    anchor,
    sourceKind: 'pdf',
    annotationRevision: 1,
    assetHash,
    workTitle: 'Causal Paper',
    editionTitle: 'Causal Paper',
    ocr: null,
    extractedAt: instant,
  };
}

describe('SqliteKnowledgeRepository', () => {
  it('通用层用 null，拒绝归档上下文，并返回 revision 冲突的当前对象', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      const created = await database.knowledgeRepo.createNote({
        id: 'note-general',
        contextId: null,
        title: 'Methods',
        body: 'Initial body',
      });
      expect(created).toMatchObject({
        kind: 'created',
        value: { contextId: null, revision: 1 },
      });

      database.sqlite
        .prepare(
          `INSERT INTO research_reading_contexts
           (id, name, normalized_name, status, archived_at)
           VALUES ('context-archived', 'Old review', 'old review', 'archived', ?)`,
        )
        .run(instant);
      await expect(
        database.knowledgeRepo.createNote({
          id: 'note-archived',
          contextId: 'context-archived',
          title: 'Blocked',
          body: '',
        }),
      ).resolves.toEqual({ kind: 'context-archived' });

      const updated = await database.knowledgeRepo.updateNote('note-general', {
        contextId: null,
        title: 'Methods revised',
        body: 'Updated body',
        expectedRevision: 1,
        revisionId: 'revision-note-1',
      });
      expect(updated).toMatchObject({ kind: 'saved', value: { revision: 2 } });
      await expect(
        database.knowledgeRepo.updateNote('note-general', {
          contextId: null,
          title: 'Stale edit',
          body: 'Stale',
          expectedRevision: 1,
          revisionId: 'revision-note-stale',
        }),
      ).resolves.toMatchObject({
        kind: 'conflict',
        current: { title: 'Methods revised', revision: 2 },
      });
      await expect(
        database.knowledgeRepo.listRevisions('note', 'note-general'),
      ).resolves.toMatchObject([{ revision: 1, reason: 'update' }]);
    } finally {
      database.sqlite.close();
    }
  });

  it('每次操作读取当前账号连接', async () => {
    const first = makeResearchDatabase(() => instant);
    const second = makeResearchDatabase(() => instant);
    let current = first.sqlite;
    const repository = new SqliteKnowledgeRepository(
      () => current,
      () => instant,
    );
    try {
      await repository.createNote({
        id: 'account-note',
        contextId: null,
        title: 'First account',
        body: '',
      });
      expect(await repository.getNote('account-note')).not.toBeNull();
      current = second.sqlite;
      expect(await repository.getNote('account-note')).toBeNull();
      await repository.createNote({
        id: 'account-note',
        contextId: null,
        title: 'Second account',
        body: '',
      });
      current = first.sqlite;
      expect(await repository.getNote('account-note')).toMatchObject({ title: 'First account' });
    } finally {
      first.sqlite.close();
      second.sqlite.close();
    }
  });

  it('证据引用批注快照并同步可过滤的全文搜索内容', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      seedPaper(database.sqlite);
      seedAnnotation(database.sqlite);
      const result = await database.knowledgeRepo.createEvidence({
        id: 'evidence-1',
        contextId: null,
        workId: 'work-1',
        editionId: 'edition-1',
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        sourceSnapshot: sourceSnapshot(),
        title: 'Identification strategy',
        summary: 'Causal inference uses a natural experiment.',
        notes: null,
      });
      expect(result).toMatchObject({
        kind: 'created',
        value: {
          sourceState: 'current',
          sourceSnapshot: { annotationId: 'annotation-1', assetHash },
        },
      });
      expect(
        database.sqlite
          .prepare(
            `SELECT search.entity_id, search.source_state
             FROM research_knowledge_search_fts fts
             JOIN research_knowledge_search search ON search.rowid = fts.rowid
             WHERE research_knowledge_search_fts MATCH 'experiment'`,
          )
          .get(),
      ).toEqual({ entity_id: 'evidence-1', source_state: 'current' });

      database.sqlite
        .prepare("UPDATE research_annotations SET revision = 2 WHERE id = 'annotation-1'")
        .run();
      await expect(database.knowledgeRepo.getEvidence('evidence-1')).resolves.toMatchObject({
        sourceState: 'annotation-revised',
      });
      database.sqlite
        .prepare("UPDATE research_annotations SET status = 'deleted' WHERE id = 'annotation-1'")
        .run();
      await expect(database.knowledgeRepo.getEvidence('evidence-1')).resolves.toMatchObject({
        sourceState: 'annotation-deleted',
      });
      database.sqlite
        .prepare("UPDATE research_assets SET content_hash = ? WHERE id = 'asset-1'")
        .run('c'.repeat(64));
      await expect(database.knowledgeRepo.getEvidence('evidence-1')).resolves.toMatchObject({
        sourceState: 'asset-mismatch',
      });
      database.sqlite
        .prepare("UPDATE research_asset_locations SET state = 'missing' WHERE id = 'location-1'")
        .run();
      await expect(database.knowledgeRepo.getEvidence('evidence-1')).resolves.toMatchObject({
        sourceState: 'source-unavailable',
      });
    } finally {
      database.sqlite.close();
    }
  });

  it('直接提炼时批注与证据同事务创建，来源失败不留下孤立批注', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      seedPaper(database.sqlite);
      const result = await database.knowledgeRepo.createAnnotationWithEvidence({
        annotation: {
          id: 'annotation-direct',
          assetId: 'asset-1',
          editionId: 'edition-1',
          contextId: null,
          kind: 'highlight',
          pageNumber: 2,
          anchor,
          body: null,
          color: '#ffd54f',
          status: 'active',
        },
        evidence: {
          id: 'evidence-direct',
          contextId: null,
          workId: 'missing-work',
          editionId: 'edition-1',
          assetId: 'asset-1',
          annotationId: 'annotation-direct',
          sourceSnapshot: sourceSnapshot('annotation-direct', 'missing-work'),
          title: null,
          summary: 'Should roll back',
          notes: null,
        },
      });
      expect(result).toEqual({ kind: 'source-not-found' });
      expect(
        database.sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM research_annotations WHERE id = 'annotation-direct'",
          )
          .get(),
      ).toEqual({ count: 0 });
      expect(
        database.sqlite
          .prepare("SELECT COUNT(*) AS count FROM research_evidence WHERE id = 'evidence-direct'")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      database.sqlite.close();
    }
  });

  it('上下文迁移在同一事务移动批注与 C1 对象，但保留证据创建快照', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      seedPaper(database.sqlite);
      database.sqlite
        .prepare(
          `INSERT INTO research_reading_contexts
           (id, name, normalized_name, status) VALUES ('context-1', 'Review', 'review', 'active')`,
        )
        .run();
      seedAnnotation(database.sqlite);
      database.sqlite
        .prepare(
          "UPDATE research_annotations SET context_id = 'context-1' WHERE id = 'annotation-1'",
        )
        .run();
      await database.knowledgeRepo.createNote({
        id: 'note-context',
        contextId: 'context-1',
        title: 'Context note',
        body: '',
      });
      await database.knowledgeRepo.createEvidence({
        id: 'evidence-context',
        contextId: 'context-1',
        workId: 'work-1',
        editionId: 'edition-1',
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        sourceSnapshot: sourceSnapshot('annotation-1', 'work-1', 'context-1'),
        title: null,
        summary: 'Context evidence',
        notes: null,
      });

      await expect(database.repo.previewReadingContextArchive('context-1')).resolves.toMatchObject({
        annotationCount: 1,
        noteCount: 1,
        evidenceCount: 1,
      });
      let revision = 0;
      const archived = await database.repo.archiveReadingContext(
        'context-1',
        'move-to-general',
        () => `context-revision-${++revision}`,
      );
      expect(archived).toMatchObject({ kind: 'archived', result: { movedAnnotations: 1 } });
      await expect(database.knowledgeRepo.getNote('note-context')).resolves.toMatchObject({
        contextId: null,
        revision: 2,
      });
      await expect(database.knowledgeRepo.getEvidence('evidence-context')).resolves.toMatchObject({
        contextId: null,
        revision: 2,
        sourceSnapshot: { contextId: 'context-1' },
      });
      await expect(
        database.knowledgeRepo.listRevisions('evidence', 'evidence-context'),
      ).resolves.toMatchObject([{ revision: 1, reason: 'move-context' }]);
    } finally {
      database.sqlite.close();
    }
  });

  it('作品合并和撤销只迁移证据当前 Work，来源快照保留原 ID', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      seedPaper(database.sqlite);
      database.sqlite
        .prepare(
          `INSERT INTO research_works (id, type, title, title_sort, status)
           VALUES ('work-2', 'article', 'Merged paper', 'merged paper', 'active')`,
        )
        .run();
      database.sqlite
        .prepare(
          `INSERT INTO research_editions (id, work_id, kind, title)
           VALUES ('edition-2', 'work-2', 'journal', 'Merged paper')`,
        )
        .run();
      database.sqlite
        .prepare(
          `INSERT INTO research_assets
           (id, hash_algorithm, content_hash, byte_size, mime_type, state)
           VALUES ('asset-2', 'sha256', ?, 84, 'application/pdf', 'active')`,
        )
        .run('d'.repeat(64));
      database.sqlite
        .prepare(
          `INSERT INTO research_asset_locations
           (id, asset_id, mode, original_path, resolved_path, state)
           VALUES ('location-2', 'asset-2', 'linked', '/papers/merged.pdf',
                   '/papers/merged.pdf', 'available')`,
        )
        .run();
      database.sqlite
        .prepare(
          `INSERT INTO research_attachments
           (id, edition_id, asset_id, role, display_name, status)
           VALUES ('attachment-2', 'edition-2', 'asset-2', 'primary-pdf', 'merged.pdf', 'active')`,
        )
        .run();
      const mergedAnchor = {
        ...anchor,
        assetHash: 'd'.repeat(64),
        editionId: 'edition-2',
      };
      database.sqlite
        .prepare(
          `INSERT INTO research_annotations
           (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
            status, revision, created_at, updated_at)
           VALUES ('annotation-2', 'asset-2', 'edition-2', NULL, 'highlight', 2, ?, NULL,
                   '#ffd54f', 'active', 1, ?, ?)`,
        )
        .run(JSON.stringify(mergedAnchor), instant, instant);
      await database.knowledgeRepo.createEvidence({
        id: 'evidence-merged',
        contextId: null,
        workId: 'work-2',
        editionId: 'edition-2',
        assetId: 'asset-2',
        annotationId: 'annotation-2',
        sourceSnapshot: {
          ...sourceSnapshot('annotation-2', 'work-2'),
          editionId: 'edition-2',
          assetId: 'asset-2',
          anchor: mergedAnchor,
          assetHash: 'd'.repeat(64),
          workTitle: 'Merged paper',
          editionTitle: 'Merged paper',
        },
        title: null,
        summary: 'Evidence on merged work',
        notes: null,
      });

      const record = await database.repo.mergeWorks({
        id: 'merge-1',
        survivorId: 'work-1',
        mergedId: 'work-2',
        expectedSurvivorRevision: 1,
        expectedMergedRevision: 1,
        selectedFields: {
          title: 'Causal Paper',
          titleSort: 'causal paper',
          type: 'article',
          abstract: null,
          year: null,
        },
        fieldSources: {
          title: 'survivor',
          type: 'survivor',
          abstract: 'survivor',
          year: 'survivor',
        },
        editionIdsToMove: ['edition-2'],
        preferredEditionId: 'edition-1',
      });
      expect(record).not.toBeNull();
      await expect(database.knowledgeRepo.getEvidence('evidence-merged')).resolves.toMatchObject({
        workId: 'work-1',
        revision: 2,
        sourceSnapshot: { workId: 'work-2' },
      });

      await expect(database.repo.revertMerge('merge-1')).resolves.toMatchObject({
        status: 'reverted',
      });
      await expect(database.knowledgeRepo.getEvidence('evidence-merged')).resolves.toMatchObject({
        workId: 'work-2',
        revision: 3,
        sourceSnapshot: { workId: 'work-2' },
      });
      expect(
        database.sqlite
          .prepare(
            `SELECT work_id FROM research_knowledge_search
             WHERE entity_type = 'evidence' AND entity_id = 'evidence-merged'`,
          )
          .get(),
      ).toEqual({ work_id: 'work-2' });
    } finally {
      database.sqlite.close();
    }
  });

  it('有效证据进入作品和附件永久删除影响并由 Repository 二次阻止', async () => {
    const database = makeResearchDatabase(() => instant);
    try {
      seedPaper(database.sqlite);
      seedAnnotation(database.sqlite);
      await database.knowledgeRepo.createEvidence({
        id: 'evidence-protect',
        contextId: null,
        workId: 'work-1',
        editionId: 'edition-1',
        assetId: 'asset-1',
        annotationId: 'annotation-1',
        sourceSnapshot: sourceSnapshot(),
        title: null,
        summary: 'Protected evidence',
        notes: null,
      });
      await expect(database.repo.getDeletionImpact('work-1')).resolves.toMatchObject({
        evidenceCount: 1,
      });
      await expect(
        database.repo.getAttachmentDeletionImpact('attachment-1'),
      ).resolves.toMatchObject({
        evidenceCount: 1,
      });
      expect(await database.repo.recycleAttachment('attachment-1', instant)).toBe(true);
      await expect(database.knowledgeRepo.getEvidence('evidence-protect')).resolves.toMatchObject({
        sourceState: 'source-unavailable',
      });
      expect(await database.repo.restoreAttachment('attachment-1')).toBe(true);
      await expect(database.knowledgeRepo.getEvidence('evidence-protect')).resolves.toMatchObject({
        sourceState: 'current',
      });
      expect(await database.repo.recycleAttachment('attachment-1', instant)).toBe(true);
      expect(await database.repo.permanentlyDeleteAttachment('attachment-1', 'asset-1')).toBe(
        false,
      );
      expect(await database.repo.restoreAttachment('attachment-1')).toBe(true);
      expect(await database.repo.trashWork('work-1', instant)).toBe(true);
      await expect(database.knowledgeRepo.getEvidence('evidence-protect')).resolves.toMatchObject({
        workId: 'work-1',
        sourceState: 'current',
      });
      expect(await database.repo.restoreWork('work-1', instant)).toBe(true);
      expect(await database.repo.trashWork('work-1', instant)).toBe(true);
      expect(await database.repo.permanentlyDeleteWork('work-1', [])).toBe(false);
    } finally {
      database.sqlite.close();
    }
  });
});
