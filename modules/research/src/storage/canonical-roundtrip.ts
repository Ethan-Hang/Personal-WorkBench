import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  canonicalResearchLibrarySchema,
  type CanonicalResearchLibrary,
} from '../interop/canonical.js';

const entityKeys = [
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

export interface CanonicalRoundTripReport {
  valid: true;
  schemaVersion: 1;
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
    const writeAll = sqlite.transaction(() => {
      for (const key of entityKeys) {
        const rows = canonical[key] as Array<{ id: string }>;
        rows.forEach((row, ordinal) => insert.run(key, row.id, ordinal, JSON.stringify(row)));
      }
    });
    writeAll();

    const reconstructed = {
      schemaVersion: canonical.schemaVersion,
      exportedAt: canonical.exportedAt,
      generator: canonical.generator,
    } as Record<string, unknown>;
    for (const key of entityKeys) {
      const rows = sqlite
        .prepare(
          'SELECT payload_json FROM canonical_records WHERE kind = ? ORDER BY ordinal, record_id',
        )
        .all(key) as Array<{ payload_json: string }>;
      reconstructed[key] = rows.map((row) => JSON.parse(row.payload_json) as unknown);
    }
    const reparsed = canonicalResearchLibrarySchema.parse(reconstructed);
    const expected = JSON.stringify(canonical);
    const actual = JSON.stringify(reparsed);
    if (actual !== expected) throw new Error('canonical round-trip comparison failed');
    return {
      valid: true,
      schemaVersion: 1,
      recordCount: entityKeys.reduce(
        (total, key) => total + (canonical[key] as unknown[]).length,
        0,
      ),
      fingerprint: createHash('sha256').update(actual).digest('hex'),
      verifiedKinds: [...entityKeys],
    };
  } finally {
    sqlite.close();
  }
}
