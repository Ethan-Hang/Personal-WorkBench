import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  ACCOUNT_DB_FILE,
  AccountsStore,
  DEFAULT_ACCOUNT_ID,
  type Account,
  type AccountsRegistry,
} from './accounts-store.js';
import { openSqliteConnection } from './db.js';

export interface ResolveActiveDatabaseOptions {
  /** 账号根目录，来自 `WORKBENCH_DATA_DIR`。 */
  dataDir: string;
  /** `WORKBENCH_DB` 逃生舱：显式设置时锁定单库、禁用账号功能。 */
  dbPathOverride?: string | undefined;
}

export type ActiveDatabase =
  | { mode: 'single'; dbPath: string }
  | {
      mode: 'accounts';
      dbPath: string;
      store: AccountsStore;
      registry: AccountsRegistry;
      account: Account;
    };

/**
 * 决定这次启动该开哪个库，必要时做现有数据的一次性迁移。
 *
 * 迁移顺序是关键：**先正常打开旧库再 close，让 WAL checkpoint 掉**，之后就只需
 * rename 一个主库文件（同盘，原子），不必同时处理 `-wal` / `-shm`，也不会搬出
 * 一个半截状态。与 TASK-025 一次性迁移 localStorage 同形。
 */
export function resolveActiveDatabase(options: ResolveActiveDatabaseOptions): ActiveDatabase {
  const { dataDir, dbPathOverride } = options;

  // 逃生舱优先：它存在的意义就是让 CI 与测试完全绕开账号机制。
  if (dbPathOverride !== undefined && dbPathOverride !== '') {
    return { mode: 'single', dbPath: dbPathOverride };
  }

  const store = new AccountsStore(dataDir);
  if (!store.exists()) {
    migrateLegacyDatabase(dataDir);
    store.write(createInitialRegistry());
  }

  const registry = store.read();
  const account = registry.accounts.find((candidate) => candidate.id === registry.activeId);
  if (account === undefined) {
    // read() 已校验过 activeId，这里只是让类型收窄而不靠断言。
    throw new Error(`activeId 指向不存在的账号：${registry.activeId}`);
  }

  return { mode: 'accounts', dbPath: store.dbPathOf(account), store, registry, account };
}

/**
 * 把 `<dataDir>/workbench.db` 搬进默认账号目录。
 *
 * 没有旧库时什么都不做——全新安装同样走这条路，只是不需要搬。
 */
function migrateLegacyDatabase(dataDir: string): void {
  const legacyPath = join(dataDir, ACCOUNT_DB_FILE);
  const targetPath = resolve(dataDir, 'accounts', DEFAULT_ACCOUNT_ID, ACCOUNT_DB_FILE);
  if (!existsSync(legacyPath)) return;

  // 打开再关闭 = 让 SQLite 自己把 WAL checkpoint 回主库并删掉 -wal / -shm。
  openSqliteConnection(legacyPath).close();

  mkdirSync(dirname(targetPath), { recursive: true });
  renameSync(legacyPath, targetPath);
}

function createInitialRegistry(): AccountsRegistry {
  const now = new Date().toISOString();
  return {
    v: 1,
    activeId: DEFAULT_ACCOUNT_ID,
    accounts: [
      {
        id: DEFAULT_ACCOUNT_ID,
        kind: 'local',
        displayName: '本地',
        dbDir: `accounts/${DEFAULT_ACCOUNT_ID}`,
        createdAt: now,
        lastUsedAt: now,
      },
    ],
  };
}
