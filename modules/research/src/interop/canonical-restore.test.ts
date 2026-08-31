import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationAnchor, EvidenceSourceSnapshot } from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { previewCanonicalRestore, restoreCanonicalIntoEmptyLibrary } from './canonical-restore.js';

const NOW = '2026-08-30T16:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function seedKnowledgeLibrary(
  sqlite: ReturnType<typeof makeResearchDatabase>['sqlite'],
  hash: string,
  byteSize: number,
  missingHash: string,
): void {
  const anchor: AnnotationAnchor = {
    pageNumber: 2,
    pageSize: { width: 612, height: 792 },
    rect: { x: 72, y: 680, width: 180, height: 20 },
    quads: [{ x1: 72, y1: 700, x2: 252, y2: 700, x3: 72, y3: 680, x4: 252, y4: 680 }],
    textQuote: {
      exact: 'restorable evidence',
      prefix: 'a ',
      suffix: ' source',
      fingerprint: 'f'.repeat(64),
    },
    assetHash: hash,
    editionId: 'edition-1',
  };
  const snapshot: EvidenceSourceSnapshot = {
    workId: 'work-1',
    editionId: 'edition-1',
    assetId: 'asset-1',
    annotationId: 'annotation-1',
    contextId: 'context-1',
    pageNumber: 2,
    anchor,
    sourceKind: 'pdf',
    annotationRevision: 1,
    assetHash: hash,
    workTitle: 'Restorable Work',
    editionTitle: 'Restorable Edition',
    ocr: null,
    extractedAt: NOW,
  };
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO research_works
         (id, type, title, title_sort, preferred_edition_id, status, revision, created_at, updated_at)
         VALUES ('work-1', 'article', 'Restorable Work', 'restorable work', 'edition-1',
                 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_editions
         (id, work_id, kind, title, revision, created_at, updated_at)
         VALUES ('edition-1', 'work-1', 'journal', 'Restorable Edition', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    const insertAsset = sqlite.prepare(
      `INSERT INTO research_assets
       (id, hash_algorithm, content_hash, byte_size, mime_type, state, created_at, updated_at)
       VALUES (?, 'sha256', ?, ?, 'application/pdf', 'active', ?, ?)`,
    );
    insertAsset.run('asset-1', hash, byteSize, NOW, NOW);
    insertAsset.run('asset-missing', missingHash, 77, NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, state, created_at, updated_at)
         VALUES ('location-source', 'asset-1', 'linked', '/old/source.pdf', '/old/source.pdf',
                 'available', ?, ?),
                ('location-missing', 'asset-missing', 'linked', '/old/missing.pdf',
                 '/old/missing.pdf', 'missing', ?, ?)`,
      )
      .run(NOW, NOW, NOW, NOW);
    const insertAttachment = sqlite.prepare(
      `INSERT INTO research_attachments
       (id, edition_id, asset_id, role, display_name, status, created_at)
       VALUES (?, 'edition-1', ?, ?, ?, 'active', ?)`,
    );
    insertAttachment.run('attachment-1', 'asset-1', 'primary-pdf', 'paper.pdf', NOW);
    insertAttachment.run('attachment-missing', 'asset-missing', 'supplement', 'missing.pdf', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_reading_contexts
         (id, name, normalized_name, description, color, status, created_at, updated_at)
         VALUES ('context-1', '综述', '综述', 'Canonical context', '#6366f1', 'active', ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_asset_reader_state
         (asset_id, page_number, page_offset_ratio, zoom, rotation, layout, last_context_id,
          revision, created_at, updated_at)
         VALUES ('asset-1', 2, 0.25, 1.2, 0, 'continuous', 'context-1', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_annotations
         (id, asset_id, edition_id, context_id, kind, page_number, anchor_json, body, color,
          status, revision, created_at, updated_at)
         VALUES ('annotation-1', 'asset-1', 'edition-1', 'context-1', 'highlight', 2, ?,
                 'Reader note', '#fde047', 'active', 1, ?, ?)`,
      )
      .run(JSON.stringify(anchor), NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_annotation_revisions
         (id, annotation_id, revision, snapshot_json, reason, created_at)
         VALUES ('annotation-revision-1', 'annotation-1', 1, ?, 'update', ?)`,
      )
      .run(
        JSON.stringify({
          id: 'annotation-1',
          assetId: 'asset-1',
          editionId: 'edition-1',
          contextId: 'context-1',
          kind: 'highlight',
          pageNumber: 2,
          anchor,
          body: 'Reader note',
          color: '#fde047',
          status: 'active',
          revision: 1,
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        }),
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_notes
         (id, context_id, title, body, status, revision, created_at, updated_at)
         VALUES ('note-1', 'context-1', 'Research note', 'Synthesis', 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_evidence
         (id, context_id, work_id, edition_id, asset_id, annotation_id, source_snapshot_json,
          source_kind, title, summary, notes, status, revision, created_at, updated_at)
         VALUES ('evidence-1', 'context-1', 'work-1', 'edition-1', 'asset-1', 'annotation-1',
                 ?, 'pdf', 'Evidence title', 'Evidence summary', NULL, 'active', 1, ?, ?)`,
      )
      .run(JSON.stringify(snapshot), NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_claims
         (id, context_id, statement, rationale, status, revision, created_at, updated_at)
         VALUES ('claim-1', 'context-1', 'Canonical restores knowledge', 'Round-trip proof',
                 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_note_links
         (id, note_id, claim_id, status, revision, created_at, updated_at)
         VALUES ('note-link-1', 'note-1', 'claim-1', 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_claim_evidence
         (id, claim_id, evidence_id, relation, note, status, revision, created_at, updated_at)
         VALUES ('claim-evidence-1', 'claim-1', 'evidence-1', 'supports', NULL,
                 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_matrices
         (id, context_id, title, description, status, structure_revision, revision, created_at,
          updated_at)
         VALUES ('matrix-1', 'context-1', 'Comparison', 'Canonical matrix', 'active', 1, 1,
                 ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_matrix_columns
         (id, matrix_id, work_id, position, status, revision, created_at, updated_at)
         VALUES ('matrix-column-1', 'matrix-1', 'work-1', 0, 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_matrix_rows
         (id, matrix_id, kind, claim_id, position, status, revision, created_at, updated_at)
         VALUES ('matrix-row-1', 'matrix-1', 'claim', 'claim-1', 0, 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_matrix_cells
         (id, matrix_id, row_id, column_id, synthesis, status, revision, created_at, updated_at)
         VALUES ('matrix-cell-1', 'matrix-1', 'matrix-row-1', 'matrix-column-1',
                 'Cell synthesis', 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_matrix_cell_evidence
         (id, cell_id, evidence_id, status, revision, created_at, updated_at)
         VALUES ('matrix-cell-evidence-1', 'matrix-cell-1', 'evidence-1', 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_writing_documents
         (id, context_id, title, status, structure_revision, revision, created_at, updated_at)
         VALUES ('writing-1', 'context-1', 'Draft', 'active', 1, 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_writing_sections
         (id, document_id, title, position, status, revision, created_at, updated_at)
         VALUES ('section-1', 'writing-1', 'Introduction', 0, 'active', 1, ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_writing_blocks
         (id, document_id, section_id, kind, text_content, position, status, revision, created_at,
          updated_at)
         VALUES ('block-1', 'writing-1', 'section-1', 'text', 'Opening text', 0, 'active', 1,
                 ?, ?)`,
      )
      .run(NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_writing_blocks
         (id, document_id, section_id, kind, work_id, edition_id, citation_intent_json,
          target_label, position, status, revision, created_at, updated_at)
         VALUES ('block-citation-1', 'writing-1', 'section-1', 'citation', 'work-1',
                 'edition-1', ?, 'Restorable Work', 1, 'active', 1, ?, ?)`,
      )
      .run(
        JSON.stringify({
          editionId: 'edition-1',
          locator: '42',
          label: 'page',
          prefix: 'see ',
          suffix: null,
          suppressAuthor: false,
        }),
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_knowledge_revisions
         (id, entity_type, entity_id, revision, snapshot_json, reason, created_at)
         VALUES ('knowledge-revision-1', 'note', 'note-1', 1, ?, 'update', ?)`,
      )
      .run(JSON.stringify({ title: 'Research note', body: 'Synthesis' }), NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_sources
         (id, format, display_name, source_path, content_hash, byte_size, encoding,
          parser_name, parser_version, created_at)
         VALUES ('interop-source-1', 'bibtex', 'restore.bib', '/private/restore.bib', ?, 80,
                 'utf-8', 'retorquere-bibtex-parser', '10.0.1', ?)`,
      )
      .run('d'.repeat(64), NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_import_jobs
         (id, source_id, request_id, status, total_count, processed_count, checkpoint_ordinal,
          revision, created_at, updated_at, completed_at)
         VALUES ('interop-job-1', 'interop-source-1', 'restore-fixture', 'completed', 1, 1, 1,
                 1, ?, ?, ?)`,
      )
      .run(NOW, NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_records
         (id, source_id, job_id, ordinal, source_key, raw_hash, raw_record, summary,
          format_shadow_json, mapped_json, diagnostics_json, decision_json, status, revision,
          committed_work_id, committed_edition_id, created_at, updated_at)
         VALUES ('interop-record-1', 'interop-source-1', 'interop-job-1', 0, 'restoreKey', ?,
                 '@article{restoreKey, custom={preserve}}', 'Restorable Work', ?, ?, '[]', ?,
                 'committed', 2, 'work-1', 'edition-1', ?, ?)`,
      )
      .run(
        'e'.repeat(64),
        JSON.stringify({ fields: { custom: 'preserve' } }),
        JSON.stringify({ title: 'Restorable Work' }),
        JSON.stringify({
          action: 'accept',
          fieldSuggestions: [
            {
              field: 'title',
              currentValue: null,
              sourceValue: 'Restorable Work',
              selectedValue: 'Restorable Work',
              selection: 'source',
              userConfirmed: true,
              conflict: false,
            },
          ],
          attachmentCandidates: [],
        }),
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_interop_record_entities
         (id, record_id, work_id, edition_id, action, is_current, created_at)
         VALUES ('interop-entity-1', 'interop-record-1', 'work-1', 'edition-1', 'created', 1, ?)`,
      )
      .run(NOW);
    sqlite
      .prepare(
        `INSERT INTO research_citation_key_preferences
         (id, work_id, edition_id, preferred_key, source, revision, created_at, updated_at)
         VALUES ('citation-key-1', 'work-1', 'edition-1', 'restoreKey', 'user', 3, ?, ?)`,
      )
      .run(NOW, NOW);
  })();
}

describe('canonical restore', () => {
  it('先预览，再把 A/B/C 真值、修订和可用附件恢复到空库', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-canonical-restore-'));
    roots.push(root);
    const bundle = join(root, 'bundle');
    const managedRoot = join(root, 'managed');
    const bytes = Buffer.from('canonical managed attachment');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const objectKey = join('sha256', hash.slice(0, 2), hash.slice(2, 4), hash);
    await mkdir(join(bundle, 'files', 'sha256', hash.slice(0, 2), hash.slice(2, 4)), {
      recursive: true,
    });
    await writeFile(join(bundle, 'files', objectKey), bytes);

    const source = makeResearchDatabase(() => NOW);
    const target = makeResearchDatabase(() => NOW);
    try {
      seedKnowledgeLibrary(source.sqlite, hash, bytes.length, 'b'.repeat(64));
      const canonical = await source.repo.exportCanonicalSnapshot(NOW);
      const sourcePath = join(bundle, 'library.json');
      await writeFile(sourcePath, `${JSON.stringify(canonical, null, 2)}\n`);
      const store = new ResearchContentStore(() => managedRoot);

      const preview = await previewCanonicalRestore(target.repo, store, sourcePath);
      expect(preview).toMatchObject({
        schemaVersion: 3,
        targetEmpty: true,
        workCount: 1,
        attachmentCount: 2,
        availableAssetCount: 1,
        missingAssetCount: 1,
        estimatedCopyBytes: bytes.length,
        conflictIds: [],
      });

      const report = await restoreCanonicalIntoEmptyLibrary(target.repo, store, sourcePath, {
        completedAt: () => NOW,
      });
      expect(report).toMatchObject({
        schemaVersion: 3,
        importedWorks: 1,
        importedAttachments: 2,
        copiedAssets: 1,
        copiedBytes: bytes.length,
        missingAssets: 1,
        foreignKeysValid: true,
        roundTripValid: true,
        searchIndexed: 4,
      });
      expect(await readFile(join(managedRoot, objectKey))).toEqual(bytes);
      expect(target.sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(
        target.sqlite
          .prepare(
            `SELECT state, error_code FROM research_asset_locations
             WHERE asset_id = 'asset-missing'`,
          )
          .get(),
      ).toEqual({ state: 'missing', error_code: 'CANONICAL_ATTACHMENT_MISSING' });
      expect(
        target.sqlite.prepare('SELECT COUNT(*) AS count FROM research_annotation_revisions').get(),
      ).toEqual({ count: 1 });
      expect(
        target.sqlite.prepare('SELECT COUNT(*) AS count FROM research_knowledge_revisions').get(),
      ).toEqual({ count: 1 });
      expect(
        target.sqlite
          .prepare(`SELECT source_path FROM research_interop_sources WHERE id = 'interop-source-1'`)
          .get(),
      ).toEqual({ source_path: 'canonical://restored/interop-source-1' });
      expect(
        target.sqlite
          .prepare(
            `SELECT raw_record, decision_json FROM research_interop_records
             WHERE id = 'interop-record-1'`,
          )
          .get(),
      ).toMatchObject({ raw_record: '@article{restoreKey, custom={preserve}}' });
      expect(
        target.sqlite
          .prepare(
            `SELECT preferred_key, revision FROM research_citation_key_preferences
             WHERE id = 'citation-key-1'`,
          )
          .get(),
      ).toEqual({ preferred_key: 'restoreKey', revision: 3 });
      expect(
        target.sqlite
          .prepare(
            `SELECT work_id, edition_id, citation_intent_json FROM research_writing_blocks
             WHERE id = 'block-citation-1'`,
          )
          .get(),
      ).toMatchObject({ work_id: 'work-1', edition_id: 'edition-1' });
      expect(
        target.sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM research_knowledge_search_fts WHERE research_knowledge_search_fts MATCH 'Canonical'",
          )
          .get(),
      ).toEqual({ count: 1 });
      await expect(
        restoreCanonicalIntoEmptyLibrary(target.repo, store, sourcePath),
      ).rejects.toThrow('不是空库');
    } finally {
      source.sqlite.close();
      target.sqlite.close();
    }
  });

  it('数据库事务失败时清理本轮新复制的托管对象', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-canonical-rollback-'));
    roots.push(root);
    const sourcePath = join(root, 'library.json');
    const sourceFile = join(root, 'source.bin');
    const managedRoot = join(root, 'managed');
    const bytes = Buffer.from('must be cleaned after rollback');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(sourceFile, bytes);
    const source = makeResearchDatabase(() => NOW);
    const target = makeResearchDatabase(() => NOW);
    try {
      const canonical = await source.repo.exportCanonicalSnapshot(NOW);
      if (canonical.schemaVersion !== 3) throw new Error('expected canonical v3');
      canonical.editions.push({
        id: 'broken-edition',
        workId: 'missing-work',
        kind: 'other',
        title: 'Broken relationship',
        publicationTitle: null,
        publisher: null,
        publishedDate: null,
        volume: null,
        issue: null,
        pages: null,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
      canonical.assets.push({
        id: 'asset-rollback',
        hashAlgorithm: 'sha256',
        contentHash: hash,
        byteSize: bytes.length,
        mimeType: 'application/octet-stream',
        state: 'active',
        createdAt: NOW,
        updatedAt: NOW,
        recycledAt: null,
      });
      canonical.locations.push({
        id: 'location-rollback',
        assetId: 'asset-rollback',
        mode: 'linked',
        originalPath: sourceFile,
        resolvedPath: sourceFile,
        objectKey: null,
        state: 'available',
        deviceId: null,
        fileId: null,
        observedSize: bytes.length,
        observedMtimeMs: null,
        errorCode: null,
        lastCheckedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
        recycledAt: null,
      });
      await writeFile(sourcePath, JSON.stringify(canonical));
      const store = new ResearchContentStore(() => managedRoot);
      await expect(
        restoreCanonicalIntoEmptyLibrary(target.repo, store, sourcePath),
      ).rejects.toThrow();
      expect(await store.auditManaged(objectKeyFor(hash), hash, bytes.length)).toMatchObject({
        state: 'missing',
      });
      expect(await target.repo.canonicalImportTargetIsEmpty()).toBe(true);
    } finally {
      source.sqlite.close();
      target.sqlite.close();
    }
  });
});

function objectKeyFor(hash: string): string {
  return `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}
