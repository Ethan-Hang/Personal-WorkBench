import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import type { Account, AccountsRegistry, AccountsStore } from '@workbench/data';
import { openSqliteConnection } from '@workbench/data';
import { migrationWatermarks, SyncError } from '@workbench/sync/node';
import { compareWatermarks } from '../restore/compatibility.js';

export interface LocalImportServiceDeps {
  store: AccountsStore;
  dataDir: string;
  /**
   * 在给定连接上跑 core 与所有模块的迁移。注入而不是在这里 import 模块：
   * 「哪些模块有迁移」只有组合根知道（铁律 2）。
   */
  migrate: (sqlite: Database.Database) => void;
  /** 当前代码的迁移水位，用来判断这份外来的库是不是比代码还新。 */
  localWatermarks: () => Record<string, number>;
  now?: () => Date;
}

const ACCOUNT_DB_FILE = 'workbench.db';

/**
 * 导入方向二：把一份外来的 `.db.gz` 变成一个**新账号**（TASK-048）。
 *
 * 与方向一（覆盖当前账号，走 RestoreService）刻意分开，因为风险等级不同：
 * 这里**一个现有文件都不动**，因此不需要回退点，也不进 `restoring` 态——
 * 它连 `ServiceState` 都拿不到，从结构上就不可能把服务停下来。
 * 合并进方向一会让「这里不需要回退点」这个判断被稀释掉，下一个人会照着
 * 那边的模板给它也加上回退点，白付一次全库拷贝的代价。
 */
export class LocalImportService {
  constructor(private readonly deps: LocalImportServiceDeps) {}

  async importAsNewAccount(filePath: string, displayName: string): Promise<Account> {
    const name = displayName.trim();
    if (name === '') throw new SyncError('请给新账号取一个名字', 400);
    if (!existsSync(filePath)) throw new SyncError(`找不到这个文件：${filePath}`, 404);

    const raw = this.decompress(filePath);
    this.assertUsable(raw);

    const registry = this.deps.store.read();
    const account = this.freshAccount(registry, name);
    const dir = join(this.deps.dataDir, account.dbDir);
    const dbPath = join(dir, ACCOUNT_DB_FILE);

    // 库文件先落盘、注册表最后写，与备份的「先数据后 meta」同源：中途失败只留下
    // 一个没人指向的目录，而不是一个指向坏库的账号。
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(dbPath, raw);
      // **必须跑迁移**：外来的库可能是更旧的代码建的，直接挂上去后续查询会
      // `no such table`。
      const connection = openSqliteConnection(dbPath);
      try {
        this.deps.migrate(connection);
      } finally {
        connection.close();
      }
    } catch (cause) {
      rmSync(dir, { recursive: true, force: true });
      throw cause instanceof SyncError
        ? cause
        : new SyncError('把这份备份建成新账号时失败了', 500, { cause });
    }

    this.deps.store.write({ ...registry, accounts: [...registry.accounts, account] });
    return account;
  }

  private decompress(filePath: string): Buffer {
    try {
      return gunzipSync(readFileSync(filePath));
    } catch (cause) {
      throw new SyncError('这个文件不是一份 gzip 压缩的备份', 409, { cause });
    }
  }

  /**
   * 完整性与水位两道关。水位读自库本身而不是旁挂的 meta——那个文件可能不存在，
   * 也可以撒谎，而这里已经把库解压在手边了。
   */
  private assertUsable(raw: Buffer): void {
    const probePath = join(this.deps.dataDir, `.import-probe-${process.pid}.db`);
    mkdirSync(this.deps.dataDir, { recursive: true });
    writeFileSync(probePath, raw);
    try {
      const probe = openSqliteConnection(probePath);
      let watermarks: Record<string, number>;
      try {
        const integrity = probe.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') {
          throw new SyncError(`备份文件损坏（integrity_check: ${String(integrity)}）`, 409);
        }
        watermarks = migrationWatermarks(probe);
      } finally {
        probe.close();
      }

      const comparison = compareWatermarks(this.deps.localWatermarks(), watermarks);
      if (comparison.verdict === 'backup-newer') {
        throw new SyncError(
          `${comparison.reason ?? '这份备份比当前代码新'}。向下迁移不存在，请先升级应用`,
          409,
        );
      }
    } finally {
      rmSync(probePath, { force: true });
    }
  }

  private freshAccount(registry: AccountsRegistry, displayName: string): Account {
    const taken = new Set(registry.accounts.map((account) => account.id));
    let id = randomUUID();
    while (taken.has(id)) id = randomUUID();
    const now = (this.deps.now?.() ?? new Date()).toISOString();
    return {
      id,
      kind: 'local',
      displayName,
      dbDir: `accounts/${id}`,
      createdAt: now,
      lastUsedAt: now,
    };
  }
}
