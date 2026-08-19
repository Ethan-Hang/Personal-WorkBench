import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { nowIso, type AppSettings, type SettingsRepository } from '@workbench/core';
import type { Db } from './db.js';
import * as schema from './schema.js';
import { appSettings } from './schema.js';

export class SqliteSettingsRepository implements SettingsRepository {
  private cached?: { connection: Database.Database; db: Db };

  constructor(private readonly getSqlite: () => Database.Database) {}

  private get db(): Db {
    const connection = this.getSqlite();
    if (this.cached?.connection !== connection) {
      this.cached = { connection, db: drizzle(connection, { schema }) };
    }
    return this.cached.db;
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.select().from(appSettings);
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.valueJson);
      } catch {
        // 存坏的行直接跳过。读取路径永不失败——resolveSettings 会补上默认值。
      }
    }
    return out;
  }

  async setMany(patch: Partial<AppSettings>): Promise<void> {
    const entries = Object.entries(patch);
    if (entries.length === 0) return;
    const now = nowIso();
    this.db.transaction((tx) => {
      for (const [key, value] of entries) {
        const valueJson = JSON.stringify(value);
        tx.insert(appSettings)
          .values({ key, valueJson, updatedAt: now })
          .onConflictDoUpdate({ target: appSettings.key, set: { valueJson, updatedAt: now } })
          .run();
      }
    });
  }
}
