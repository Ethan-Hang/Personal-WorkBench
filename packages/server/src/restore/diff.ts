import type Database from 'better-sqlite3';
import type { RestoreDiff, RestoreModuleTableDiff } from '@workbench/sync/contract';
import { userTables } from '@workbench/sync/node';

/** core 自己的表。其余用户表都属于某个模块。 */
const CORE_TABLES = new Set(['items', 'app_settings']);

function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function columnsOf(sqlite: Database.Database, table: string): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

/**
 * 表名前缀反推 moduleId：`campus_recruit_` → `campus-recruit`。
 *
 * 传入已注册的 moduleId 列表而不是靠 `_`→`-` 猜，是因为猜法有歧义
 * （`campus_recruit_applications` 也可能是模块 `campus` 的表 `recruit_applications`）。
 * 遍历表名本身仍是纯结构操作——它不知道 `campus-recruit` 是干什么的。
 */
function moduleIdOf(table: string, moduleIds: readonly string[]): string {
  const matched = moduleIds
    .filter((id) => table.startsWith(`${id.replaceAll('-', '_')}_`))
    .sort((a, b) => b.length - a.length)[0];
  return matched ?? 'other';
}

function countOf(sqlite: Database.Database, schema: string, table: string): number {
  const row = sqlite.prepare(`SELECT count(*) AS c FROM ${schema}.${quote(table)}`).get() as {
    c: number;
  };
  return row.c;
}

/**
 * 恢复前的差异报告（设计 §6.4）。
 *
 * **ATTACH + EXCEPT，不手写比对。** core 的 `items` 列到行级（`title` 是 core 自己的
 * 字段，白送）；模块自有表只给计数——core 不知道模块表里哪一列适合展示给人看。
 *
 * `incomingPath` 指向的库**必须已经没有打开的连接**：ATTACH 一个还在被写的库
 * 会读到不一致的中间状态。
 */
export function computeRestoreDiff(
  local: Database.Database,
  incomingPath: string,
  moduleIds: readonly string[],
): RestoreDiff {
  local.prepare('ATTACH DATABASE ? AS cloud').run(incomingPath);
  try {
    return {
      core: coreDiff(local),
      modules: moduleDiff(local, moduleIds),
    };
  } finally {
    // 不分离掉，同一个连接上的下一次 preflight 会以 "database cloud is already in use" 失败。
    local.exec('DETACH DATABASE cloud');
  }
}

function coreDiff(local: Database.Database): RestoreDiff['core'] {
  const columns = columnsOf(local, 'items')
    .map((name) => quote(name))
    .join(', ');

  // 整行不等的那些 id：包含「云端新增」与「两边都有但内容不同」。
  const changed = local
    .prepare(
      `SELECT id FROM (SELECT ${columns} FROM cloud.items EXCEPT SELECT ${columns} FROM main.items)`,
    )
    .all() as Array<{ id: string }>;

  const added: RestoreDiff['core']['added'] = [];
  const modified: RestoreDiff['core']['modified'] = [];
  const cloudTitle = local.prepare('SELECT title FROM cloud.items WHERE id = ?');
  const localTitle = local.prepare('SELECT title FROM main.items WHERE id = ?');

  for (const { id } of changed) {
    const mine = localTitle.get(id) as { title: string } | undefined;
    const theirs = cloudTitle.get(id) as { title: string } | undefined;
    if (mine === undefined) {
      added.push({ id, title: theirs?.title ?? '' });
    } else {
      modified.push({ id, title: theirs?.title ?? '', localTitle: mine.title });
    }
  }

  const removed = local
    .prepare('SELECT id, title FROM main.items WHERE id NOT IN (SELECT id FROM cloud.items)')
    .all() as RestoreDiff['core']['removed'];

  return { added, removed, modified };
}

function moduleDiff(
  local: Database.Database,
  moduleIds: readonly string[],
): RestoreModuleTableDiff[] {
  const tables = userTables(local).filter((table) => !CORE_TABLES.has(table));
  const cloudTables = new Set(
    (
      local
        .prepare(
          `SELECT name FROM cloud.sqlite_master
           WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '__drizzle_migrations*'`,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name),
  );

  const out: RestoreModuleTableDiff[] = [];
  for (const table of [...new Set([...tables, ...cloudTables])].sort()) {
    if (CORE_TABLES.has(table)) continue;
    out.push({
      table,
      moduleId: moduleIdOf(table, moduleIds),
      localCount: tables.includes(table) ? countOf(local, 'main', table) : 0,
      remoteCount: cloudTables.has(table) ? countOf(local, 'cloud', table) : 0,
    });
  }
  return out;
}
