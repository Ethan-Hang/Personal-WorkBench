import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionHolder } from './connection-holder.js';
import { createDatabaseClient, runCoreMigrations } from './db.js';
import { SqliteItemRepository } from './item-repository.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ConnectionHolder', () => {
  it('swap 关闭旧连接、递增代次，并让既有仓储切到新库', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'workbench-connection-holder-'));
    temporaryDirectories.push(directory);
    const firstPath = join(directory, 'first.db');
    const secondPath = join(directory, 'second.db');
    const holder = new ConnectionHolder();

    const firstConnection = holder.open(firstPath);
    runCoreMigrations(createDatabaseClient(firstConnection));
    const repository = new SqliteItemRepository(() => holder.current());
    await repository.create('todo', { kind: 'task', title: '第一套数据' });
    expect(holder.generation()).toBe(1);

    const secondConnection = holder.swap(secondPath);
    runCoreMigrations(createDatabaseClient(secondConnection));
    expect(holder.generation()).toBe(2);
    expect(() => firstConnection.prepare('SELECT 1').get()).toThrow();
    expect(await repository.list({})).toEqual([]);

    await repository.create('todo', { kind: 'task', title: '第二套数据' });
    holder.swap(firstPath);
    expect(holder.generation()).toBe(3);
    expect((await repository.list({})).map((item) => item.title)).toEqual(['第一套数据']);

    holder.close();
    expect(() => holder.current()).toThrow('数据库连接尚未打开');
  });

  it('拒绝用 open 覆盖尚未关闭的连接', () => {
    const holder = new ConnectionHolder();
    holder.open(':memory:');
    expect(() => holder.open(':memory:')).toThrow('请使用 swap()');
    holder.close();
  });
});
