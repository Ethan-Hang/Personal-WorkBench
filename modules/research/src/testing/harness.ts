import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { SqliteResearchRepository } from '../storage/sqlite-repository.js';
import { SqliteKnowledgeRepository } from '../storage/sqlite-knowledge-repository.js';

export function makeResearchDatabase(clock?: () => string) {
  const opened = openTestDatabase();
  runMigrationsFrom(opened.db, 'modules/research/migrations');
  return {
    ...opened,
    repo: new SqliteResearchRepository(() => opened.sqlite, clock),
    knowledgeRepo: new SqliteKnowledgeRepository(() => opened.sqlite, clock),
  };
}
