import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { SqliteResearchRepository } from '../storage/sqlite-repository.js';

export function makeResearchDatabase(clock?: () => string) {
  const opened = openTestDatabase();
  runMigrationsFrom(opened.db, 'modules/research/migrations');
  return {
    ...opened,
    repo: new SqliteResearchRepository(() => opened.sqlite, clock),
  };
}
