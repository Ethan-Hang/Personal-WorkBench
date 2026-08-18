import type { ModuleContext } from '@workbench/core';
import { openTestDatabase, runMigrationsFrom, SqliteItemRepository } from '@workbench/data';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { SqliteCampusRecruitRepository } from '../storage/sqlite-repository.js';

export function makeCampusHarness() {
  const { db, sqlite } = openTestDatabase();
  runMigrationsFrom(db, 'modules/campus-recruit/migrations');
  const repo = new SqliteCampusRecruitRepository(sqlite);
  const items = new SqliteItemRepository(db);
  const ctx: ModuleContext = { moduleId: CAMPUS_RECRUIT_MODULE_ID, items };
  return { db, sqlite, repo, items, ctx };
}
