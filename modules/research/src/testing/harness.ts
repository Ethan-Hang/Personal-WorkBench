import { openTestDatabase, runMigrationsFrom } from '@workbench/data';

export function makeResearchDatabase() {
  const opened = openTestDatabase();
  runMigrationsFrom(opened.db, 'modules/research/migrations');
  return opened;
}
