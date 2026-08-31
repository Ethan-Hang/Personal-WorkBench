import { describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { validateCanonicalRoundTrip } from '../storage/canonical-roundtrip.js';
import { normalizeCanonicalResearchLibrary } from './canonical.js';

const NOW = '2026-08-24T08:00:00.000Z';
const HASH = 'a'.repeat(64);

function seedAllEntities(sqlite: ReturnType<typeof makeResearchDatabase>['sqlite']) {
  const transaction = sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO research_works
         (id, type, title, title_sort, preferred_edition_id, status, revision, created_at, updated_at)
         VALUES (?, 'article', ?, ?, ?, 'active', 1, ?, ?)`,
      )
      .run('work-1', 'Canonical Work', 'canonical work', 'edition-1', NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_works
         (id, type, title, title_sort, status, revision, created_at, updated_at)
         VALUES (?, 'preprint', ?, ?, 'active', 1, ?, ?)`,
      )
      .run('work-2', 'Related Work', 'related work', NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_editions
         (id, work_id, kind, title, publication_title, revision, created_at, updated_at)
         VALUES (?, ?, 'journal', ?, ?, 1, ?, ?), (?, ?, 'preprint', ?, NULL, 1, ?, ?)`,
      )
      .run(
        'edition-1',
        'work-1',
        'Canonical Edition',
        'Journal of Stable Data',
        NOW,
        NOW,
        'edition-2',
        'work-2',
        'Related Edition',
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_contributors
         (id, edition_id, role, display_name, sequence) VALUES (?, ?, 'author', ?, 0)`,
      )
      .run('contributor-1', 'edition-1', 'Ada Example');
    sqlite
      .prepare(
        `INSERT INTO research_source_records
         (id, provider, source_locator, raw_format, raw_payload, parser_version, observed_at, created_at)
         VALUES (?, ?, ?, 'json', ?, '1', ?, ?)`,
      )
      .run(
        'source-1',
        'example-provider',
        'record/42',
        JSON.stringify({ title: 'Canonical Work', unmapped: { nested: true } }),
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_identifiers
         (id, entity_type, entity_id, scheme, value, normalized_value, source_record_id, created_at)
         VALUES (?, 'work', ?, 'doi', ?, ?, ?, ?)`,
      )
      .run('identifier-1', 'work-1', '10.1000/CANONICAL', '10.1000/canonical', 'source-1', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_collections
         (id, parent_id, name, normalized_name, kind, query_json, sort_order, created_at, updated_at)
         VALUES (?, NULL, ?, ?, 'smart', ?, 0, ?, ?)`,
      )
      .run(
        'collection-1',
        'Recent',
        'recent',
        JSON.stringify({
          version: 1,
          text: '',
          filters: {
            collectionIds: [],
            tagIds: [],
            types: [],
            yearFrom: null,
            yearTo: null,
            attachmentRoles: [],
            storageModes: [],
            fileStatuses: [],
            maintenance: [],
            relatedWorkId: null,
          },
          sort: 'updated-desc',
        }),
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_collection_entries
         (id, collection_id, work_id, sort_order, created_at) VALUES (?, ?, ?, 0, ?)`,
      )
      .run('collection-entry-1', 'collection-1', 'work-1', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_tags
         (id, name, normalized_name, color, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('tag-1', 'Methods', 'methods', '#334455', 'Method papers', NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_tag_aliases
         (id, tag_id, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run('alias-1', 'tag-1', 'Methodology', 'methodology', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_work_tags (id, work_id, tag_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run('work-tag-1', 'work-1', 'tag-1', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_work_relations
         (id, source_work_id, target_work_id, kind, note, created_at)
         VALUES (?, ?, ?, 'extends', ?, ?)`,
      )
      .run('relation-1', 'work-1', 'work-2', 'Preserved relation', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_metadata_assertions
         (id, entity_type, entity_id, field_name, value_json, normalized_value, source_kind,
          source_record_id, observed_at, is_user_confirmed, is_selected, created_at)
         VALUES (?, 'work', ?, 'title', ?, ?, 'exact-external', ?, ?, 0, 1, ?)`,
      )
      .run(
        'assertion-1',
        'work-1',
        JSON.stringify('Canonical Work'),
        'canonical work',
        'source-1',
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_external_source_maps
         (id, provider, external_id, entity_type, entity_id, cache_status, created_at, updated_at)
         VALUES (?, ?, ?, 'work', ?, 'fresh', ?, ?)`,
      )
      .run('source-map-1', 'example-provider', '42', 'work-1', NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state, created_at, updated_at)
         VALUES (?, 'sha256', ?, 12, 'application/pdf', 'active', ?, ?)`,
      )
      .run('asset-1', HASH, NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, object_key, state, created_at, updated_at)
         VALUES (?, ?, 'managed', ?, ?, ?, 'missing', ?, ?)`,
      )
      .run(
        'location-1',
        'asset-1',
        '/original/paper.pdf',
        '/missing/paper.pdf',
        `sha256/aa/aa/${HASH}`,
        NOW,
        NOW,
      );
    sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status, created_at)
         VALUES (?, ?, ?, 'primary-pdf', ?, 'active', ?)`,
      )
      .run('attachment-1', 'edition-1', 'asset-1', 'paper.pdf', NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_sources
         (id, format, display_name, source_path, content_hash, byte_size, encoding,
          parser_name, parser_version, created_at)
         VALUES (?, 'bibtex', 'library.bib', '/private/source/library.bib', ?, 128, 'utf-8',
                 'retorquere-bibtex-parser', '10.0.1', ?)`,
      )
      .run('interop-source-1', 'b'.repeat(64), NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_import_jobs
         (id, source_id, request_id, status, total_count, processed_count, checkpoint_ordinal,
          revision, created_at, updated_at, completed_at)
         VALUES ('interop-job-1', 'interop-source-1', 'canonical-fixture', 'completed', 1, 1, 1,
                 2, ?, ?, ?)`,
      )
      .run(NOW, NOW, NOW);
    sqlite
      .prepare(
        `INSERT INTO research_interop_records
         (id, source_id, job_id, ordinal, source_key, raw_hash, raw_record, summary,
          format_shadow_json, mapped_json, diagnostics_json, decision_json, status, revision,
          committed_source_record_id, committed_work_id, committed_edition_id, created_at, updated_at)
         VALUES ('interop-record-1', 'interop-source-1', 'interop-job-1', 0, 'canonicalKey', ?,
                 '@article{canonicalKey, custom={keep}}', 'Canonical Work', ?, ?, ?, ?,
                 'committed', 3, 'source-1', 'work-1', 'edition-1', ?, ?)`,
      )
      .run(
        'c'.repeat(64),
        JSON.stringify({ type: 'article', fields: { custom: 'keep' } }),
        JSON.stringify({ title: 'Canonical Work', identifiers: [] }),
        JSON.stringify([{ code: 'unknown-field', field: 'custom' }]),
        JSON.stringify({
          action: 'accept',
          fieldSuggestions: [
            {
              field: 'title',
              currentValue: 'Old',
              sourceValue: 'Canonical Work',
              selectedValue: 'Canonical Work',
              selection: 'source',
              userConfirmed: true,
              conflict: true,
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
         VALUES ('citation-key-1', 'work-1', 'edition-1', 'canonicalKey', 'user', 2, ?, ?)`,
      )
      .run(NOW, NOW);
  });
  transaction();
}

describe('research canonical JSON', () => {
  it('覆盖全部迁移实体并在新临时 SQLite 库中逐字段往返', async () => {
    const database = makeResearchDatabase(() => NOW);
    try {
      seedAllEntities(database.sqlite);
      const canonical = await database.repo.exportCanonicalSnapshot(NOW);
      expect(canonical.schemaVersion).toBe(3);
      expect(canonical.sourceRecords[0]).toMatchObject({
        provider: 'example-provider',
        rawPayload: JSON.stringify({ title: 'Canonical Work', unmapped: { nested: true } }),
      });
      expect(canonical).toMatchObject({
        works: [{ id: 'work-1' }, { id: 'work-2' }],
        editions: [{ id: 'edition-1' }, { id: 'edition-2' }],
        contributors: [{ id: 'contributor-1' }],
        identifiers: [{ id: 'identifier-1', sourceRecordId: 'source-1' }],
        collections: [{ id: 'collection-1', kind: 'smart' }],
        tags: [{ id: 'tag-1' }],
        tagAliases: [{ id: 'alias-1' }],
        workRelations: [{ id: 'relation-1' }],
        metadataAssertions: [{ id: 'assertion-1', isSelected: true }],
        externalSourceMaps: [{ id: 'source-map-1' }],
        assets: [{ id: 'asset-1', contentHash: HASH }],
        locations: [{ id: 'location-1', mode: 'managed' }],
        attachments: [{ id: 'attachment-1', assetId: 'asset-1' }],
        interop: {
          sources: [{ id: 'interop-source-1', displayName: 'library.bib' }],
          records: [
            {
              id: 'interop-record-1',
              formatShadow: { type: 'article', fields: { custom: 'keep' } },
              decision: { fieldSuggestions: [{ userConfirmed: true }] },
            },
          ],
          recordEntities: [{ id: 'interop-entity-1', workId: 'work-1' }],
          citationKeyPreferences: [{ id: 'citation-key-1', preferredKey: 'canonicalKey' }],
        },
      });
      expect(JSON.stringify(canonical)).not.toContain('/private/source/library.bib');
      const report = validateCanonicalRoundTrip(canonical);
      expect(report.valid).toBe(true);
      expect(report.recordCount).toBe(22);
      expect(report.verifiedKinds).toContain('sourceRecords');
      expect(report.verifiedKinds).toContain('interop.records');
      expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      database.sqlite.close();
    }
  });

  it('拒绝未知 schemaVersion，不把未来格式当作当前格式解释', async () => {
    const database = makeResearchDatabase(() => NOW);
    try {
      const canonical = await database.repo.exportCanonicalSnapshot(NOW);
      expect(() => validateCanonicalRoundTrip({ ...canonical, schemaVersion: 4 })).toThrow();
    } finally {
      database.sqlite.close();
    }
  });

  it('继续读取 schema v1/v2，并在恢复前补齐 v3 空数据组', async () => {
    const database = makeResearchDatabase(() => NOW);
    try {
      seedAllEntities(database.sqlite);
      const current = await database.repo.exportCanonicalSnapshot(NOW);
      if (current.schemaVersion !== 3) throw new Error('expected canonical v3');
      const legacy: Record<string, unknown> = { ...current, schemaVersion: 1 };
      delete legacy.reader;
      delete legacy.knowledge;
      delete legacy.interop;
      const report = validateCanonicalRoundTrip(legacy);
      expect(report).toMatchObject({ valid: true, schemaVersion: 1, recordCount: 18 });
      expect(normalizeCanonicalResearchLibrary(legacy)).toMatchObject({
        schemaVersion: 3,
        reader: { annotations: [], annotationRevisions: [] },
        knowledge: { notes: [], evidence: [], claims: [], writingDocuments: [] },
        interop: { sources: [], records: [], recordEntities: [], citationKeyPreferences: [] },
      });

      const v2: Record<string, unknown> = { ...current, schemaVersion: 2 };
      delete v2.interop;
      expect(validateCanonicalRoundTrip(v2)).toMatchObject({ valid: true, schemaVersion: 2 });
      expect(normalizeCanonicalResearchLibrary(v2)).toMatchObject({
        schemaVersion: 3,
        interop: { sources: [], records: [], recordEntities: [], citationKeyPreferences: [] },
      });
    } finally {
      database.sqlite.close();
    }
  });
});
