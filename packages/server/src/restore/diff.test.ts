import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  openSqliteConnection,
  runCoreMigrations,
  SqliteItemRepository,
} from '@workbench/data';
import { computeRestoreDiff } from './diff.js';

const temporaryDirectories: string[] = [];
const openConnections: Database.Database[] = [];

function openFreshDatabase(name: string): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-diff-'));
  temporaryDirectories.push(directory);
  const connection = openSqliteConnection(join(directory, name));
  openConnections.push(connection);
  runCoreMigrations(createDatabaseClient(connection));
  return connection;
}

async function addItem(connection: Database.Database, id: string, title: string): Promise<void> {
  const item = await new SqliteItemRepository(() => connection).create('todo', {
    kind: 'task',
    title,
  });
  connection.prepare('UPDATE items SET id = ? WHERE id = ?').run(id, item.id);
}

/**
 * 把一条 item **逐列**复制过去。
 *
 * 不能两边各 create 一次：createdAt / updatedAt 是真实时刻，两次创建必然不同，
 * 于是「内容相同」的前提根本不成立，测试就会因为错误的原因通过。
 */
function mirrorItem(from: Database.Database, to: Database.Database, id: string): void {
  const row = from.prepare('SELECT * FROM items WHERE id = ?').get(id) as Record<string, unknown>;
  const columns = Object.keys(row);
  to.prepare(
    `INSERT INTO items (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(...columns.map((c) => row[c] as never));
}

afterEach(() => {
  for (const connection of openConnections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('computeRestoreDiff', () => {
  it('两边一样时三个列表都是空的', async () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    await addItem(local, 'a', '同一条');
    mirrorItem(local, cloud, 'a');
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, []);

    expect(diff.core).toEqual({ added: [], removed: [], modified: [] });
  });

  it('云端多出来的进 added', async () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    await addItem(cloud, 'only-cloud', '只有云端有');
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, []);

    expect(diff.core.added).toEqual([{ id: 'only-cloud', title: '只有云端有' }]);
    expect(diff.core.removed).toEqual([]);
  });

  it('本地多出来的进 removed——恢复会丢掉它们', async () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    await addItem(local, 'only-local', '只有本地有');
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, []);

    expect(diff.core.removed).toEqual([{ id: 'only-local', title: '只有本地有' }]);
    expect(diff.core.added).toEqual([]);
  });

  it('同一个 id 内容不同进 modified，并同时给出两边的标题', async () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    await addItem(local, 'same', '本地的写法');
    mirrorItem(local, cloud, 'same');
    cloud.prepare("UPDATE items SET title = '云端的写法' WHERE id = 'same'").run();
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, []);

    expect(diff.core.modified).toEqual([
      { id: 'same', title: '云端的写法', localTitle: '本地的写法' },
    ]);
    expect(diff.core.added).toEqual([]);
    expect(diff.core.removed).toEqual([]);
  });

  it('标题相同但其他列不同，也算 modified——比的是整行', async () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    await addItem(local, 'same', '一样的标题');
    mirrorItem(local, cloud, 'same');
    cloud.prepare("UPDATE items SET importance = 'high' WHERE id = 'same'").run();
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, []);

    expect(diff.core.modified.map((row) => row.id)).toEqual(['same']);
  });

  it('模块自有表给计数，模块 id 由表名前缀反推', () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    for (const connection of [local, cloud]) {
      connection.exec('CREATE TABLE campus_recruit_applications (item_id text primary key)');
    }
    cloud.prepare("INSERT INTO campus_recruit_applications VALUES ('x')").run();
    cloud.close();

    const diff = computeRestoreDiff(local, cloud.name, ['campus-recruit']);

    expect(diff.modules).toEqual([
      {
        table: 'campus_recruit_applications',
        moduleId: 'campus-recruit',
        localCount: 0,
        remoteCount: 1,
      },
    ]);
  });

  it('比完之后要把 cloud 分离掉，否则下一次 ATTACH 会失败', () => {
    const local = openFreshDatabase('local.db');
    const cloud = openFreshDatabase('cloud.db');
    cloud.close();

    computeRestoreDiff(local, cloud.name, []);
    computeRestoreDiff(local, cloud.name, []);

    expect(
      local.prepare("SELECT count(*) AS c FROM pragma_database_list WHERE name='cloud'").get(),
    ).toEqual({ c: 0 });
  });
});
