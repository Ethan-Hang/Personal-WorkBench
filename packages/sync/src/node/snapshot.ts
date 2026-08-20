import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { BackupMeta } from '../contract.js';

export interface SnapshotContext {
  accountId: string;
  device: string;
  appVersion: string;
  /** 高危操作前的强制快照带上它；手动与周期备份不带。 */
  reason?: string;
}

/** 迁移记账表的名字都以此开头（`runMigrationsFrom` 按目录派生专属记账表）。 */
const MIGRATION_TABLE_PREFIX = '__drizzle_migrations';

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function userTables(sqlite: Database.Database): string[] {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '${MIGRATION_TABLE_PREFIX}*'
       ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

/**
 * 每条迁移谱系各一个水位。恢复前的水位比对与备份 meta 用的是同一份读法——
 * 两处各写一遍，早晚会各改一半。
 */
export function migrationWatermarks(sqlite: Database.Database): Record<string, number> {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name GLOB '${MIGRATION_TABLE_PREFIX}*' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  const out: Record<string, number> = {};
  for (const { name } of rows) {
    const row = sqlite
      .prepare(`SELECT MAX(created_at) AS hi FROM ${quoteIdentifier(name)}`)
      .get() as { hi: number | null } | undefined;
    out[name] = Number(row?.hi ?? 0);
  }
  return out;
}

export function rowCounts(sqlite: Database.Database): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of userTables(sqlite)) {
    const row = sqlite.prepare(`SELECT count(*) AS c FROM ${quoteIdentifier(name)}`).get() as {
      c: number;
    };
    out[name] = row.c;
  }
  return out;
}

/** `2026-08-19T14:02:11.000Z` → `2026-08-19T14-02-11-000Z`（冒号与点在 WebDAV 路径里不安全）。 */
function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/**
 * 通过 SQLite Online Backup API 产出包含 WAL 中数据的一致性快照。
 */
export async function createSnapshot(
  sqlite: Database.Database,
  tmpPath: string,
  ctx: SnapshotContext,
): Promise<{ name: string; gz: Buffer; meta: BackupMeta }> {
  const createdAt = new Date().toISOString();
  const migrations = migrationWatermarks(sqlite);
  const counts = rowCounts(sqlite);

  let raw: Buffer;
  try {
    await sqlite.backup(tmpPath);
    raw = readFileSync(tmpPath);
  } finally {
    rmSync(tmpPath, { force: true });
  }

  const gz = gzipSync(raw);
  const meta: BackupMeta = {
    v: 1,
    createdAt,
    accountId: ctx.accountId,
    device: ctx.device,
    appVersion: ctx.appVersion,
    migrations,
    counts,
    bytes: raw.byteLength,
    sha256: createHash('sha256').update(raw).digest('hex'),
    ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
  };

  return { name: `${fileStamp(createdAt)}.db.gz`, gz, meta };
}
