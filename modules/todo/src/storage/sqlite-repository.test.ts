import { describe, expect, it } from 'vitest';
import { openTestDatabase, runMigrationsFrom } from '@workbench/data';
import { SqliteTodoRepository } from './sqlite-repository.js';

describe('SqliteTodoRepository connection switching', () => {
  it('rebuilds its drizzle client when the supplied connection identity changes', async () => {
    const first = openTestDatabase();
    const second = openTestDatabase();
    runMigrationsFrom(first.db, 'modules/todo/migrations');
    runMigrationsFrom(second.db, 'modules/todo/migrations');
    let current = first.sqlite;
    const repository = new SqliteTodoRepository(() => current);

    await repository.insertTag({
      id: 'first-tag',
      name: '第一套',
      color: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    current = second.sqlite;
    expect(await repository.listTags()).toEqual([]);
    await repository.insertTag({
      id: 'second-tag',
      name: '第二套',
      color: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    current = first.sqlite;
    expect((await repository.listTags()).map((tag) => tag.id)).toEqual(['first-tag']);
    first.sqlite.close();
    second.sqlite.close();
  });
});
