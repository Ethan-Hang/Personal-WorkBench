import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  canonicalResearchLibrarySchema,
  type CanonicalResearchLibrary,
} from '../interop/canonical.js';

const baseEntityKeys = [
  'works',
  'editions',
  'contributors',
  'identifiers',
  'collections',
  'collectionEntries',
  'tags',
  'tagAliases',
  'workTags',
  'workRelations',
  'sourceRecords',
  'metadataAssertions',
  'externalSourceMaps',
  'assets',
  'locations',
  'attachments',
] as const satisfies ReadonlyArray<keyof CanonicalResearchLibrary>;

const readerEntityKeys = [
  'contexts',
  'collectionContexts',
  'states',
  'annotations',
  'annotationRevisions',
] as const;

const knowledgeEntityKeys = [
  'notes',
  'evidence',
  'noteLinks',
  'claims',
  'claimEvidence',
  'matrices',
  'matrixColumns',
  'matrixRows',
  'matrixCells',
  'matrixCellEvidence',
  'writingDocuments',
  'writingSections',
  'writingBlocks',
  'revisions',
] as const;

const interopEntityKeys = [
  'sources',
  'records',
  'recordEntities',
  'citationKeyPreferences',
] as const;

export interface CanonicalRoundTripReport {
  valid: true;
  schemaVersion: 1 | 2 | 3;
  recordCount: number;
  fingerprint: string;
  verifiedKinds: string[];
}

/**
 * 将 canonical JSON 放入全新的临时 SQLite 库，再从库中重建并逐字段比较。
 * 这个验证器不触碰当前账户数据库，也不解释未来 schemaVersion。
 */
export function validateCanonicalRoundTrip(input: unknown): CanonicalRoundTripReport {
  const canonical = canonicalResearchLibrarySchema.parse(input);
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(
      `CREATE TABLE canonical_records (
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (kind, record_id)
      ) STRICT`,
    );
    const insert = sqlite.prepare(
      'INSERT INTO canonical_records (kind, record_id, ordinal, payload_json) VALUES (?, ?, ?, ?)',
    );
    const recordId = (kind: string, row: Record<string, unknown>): string => {
      if (typeof row.id === 'string') return row.id;
      if (kind === 'reader.collectionContexts') {
        return `${String(row.collectionId)}:${String(row.contextId)}`;
      }
      if (kind === 'reader.states') return String(row.assetId);
      throw new Error(`canonical ${kind} record has no stable ID`);
    };
    const writeRows = (kind: string, rows: Array<Record<string, unknown>>) => {
      rows.forEach((row, ordinal) =>
        insert.run(kind, recordId(kind, row), ordinal, JSON.stringify(row)),
      );
    };
    const writeAll = sqlite.transaction(() => {
      for (const key of baseEntityKeys) {
        const rows = canonical[key] as Array<{ id: string }>;
        writeRows(key, rows);
      }
      if (canonical.schemaVersion !== 1) {
        for (const key of readerEntityKeys) {
          writeRows(`reader.${key}`, canonical.reader[key]);
        }
        for (const key of knowledgeEntityKeys) {
          writeRows(`knowledge.${key}`, canonical.knowledge[key]);
        }
      }
      if (canonical.schemaVersion === 3) {
        for (const key of interopEntityKeys) {
          writeRows(`interop.${key}`, canonical.interop[key]);
        }
      }
    });
    writeAll();

    const reconstructed = {
      schemaVersion: canonical.schemaVersion,
      exportedAt: canonical.exportedAt,
      generator: canonical.generator,
    } as Record<string, unknown>;
    const readRows = (kind: string) =>
      (
        sqlite
          .prepare(
            'SELECT payload_json FROM canonical_records WHERE kind = ? ORDER BY ordinal, record_id',
          )
          .all(kind) as Array<{ payload_json: string }>
      ).map((row) => JSON.parse(row.payload_json) as unknown);
    for (const key of baseEntityKeys) reconstructed[key] = readRows(key);
    if (canonical.schemaVersion !== 1) {
      reconstructed.reader = Object.fromEntries(
        readerEntityKeys.map((key) => [key, readRows(`reader.${key}`)]),
      );
      reconstructed.knowledge = Object.fromEntries(
        knowledgeEntityKeys.map((key) => [key, readRows(`knowledge.${key}`)]),
      );
    }
    if (canonical.schemaVersion === 3) {
      reconstructed.interop = Object.fromEntries(
        interopEntityKeys.map((key) => [key, readRows(`interop.${key}`)]),
      );
    }
    const reparsed = canonicalResearchLibrarySchema.parse(reconstructed);
    const expected = JSON.stringify(canonical);
    const actual = JSON.stringify(reparsed);
    if (actual !== expected) throw new Error('canonical round-trip comparison failed');
    return {
      valid: true,
      schemaVersion: canonical.schemaVersion,
      recordCount:
        baseEntityKeys.reduce((total, key) => total + (canonical[key] as unknown[]).length, 0) +
        (canonical.schemaVersion !== 1
          ? readerEntityKeys.reduce((total, key) => total + canonical.reader[key].length, 0) +
            knowledgeEntityKeys.reduce((total, key) => total + canonical.knowledge[key].length, 0)
          : 0) +
        (canonical.schemaVersion === 3
          ? interopEntityKeys.reduce((total, key) => total + canonical.interop[key].length, 0)
          : 0),
      fingerprint: createHash('sha256').update(actual).digest('hex'),
      verifiedKinds: [
        ...baseEntityKeys,
        ...(canonical.schemaVersion !== 1
          ? [
              ...readerEntityKeys.map((key) => `reader.${key}`),
              ...knowledgeEntityKeys.map((key) => `knowledge.${key}`),
            ]
          : []),
        ...(canonical.schemaVersion === 3 ? interopEntityKeys.map((key) => `interop.${key}`) : []),
      ],
    };
  } finally {
    sqlite.close();
  }
}
