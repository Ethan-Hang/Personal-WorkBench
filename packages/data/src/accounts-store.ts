import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJsonFile, writeJsonAtomically } from './atomic-json.js';

/** 引导文件名。它不进 SQLite：读账号才能知道开哪个库，鸡生蛋。 */
export const ACCOUNTS_FILE = 'accounts.json';
/** 一次性迁移落到的账号，也是全新安装的默认账号。 */
export const DEFAULT_ACCOUNT_ID = 'local-default';
/** 每个账号目录下的库文件名，与迁移前的旧库同名。 */
export const ACCOUNT_DB_FILE = 'workbench.db';

export interface GithubBinding {
  login: string;
  userId: number;
  gistId?: string;
  avatarUrl?: string;
}

export interface Account {
  id: string;
  kind: 'local' | 'github';
  displayName: string;
  avatar?: string;
  /** 相对 dataDir 的账号目录。与 id 一样恒不变（设计 §7.1 D10）。 */
  dbDir: string;
  createdAt: string;
  lastUsedAt: string;
  github?: GithubBinding;
}

export interface AccountsRegistry {
  v: 1;
  activeId: string;
  accounts: Account[];
}

/**
 * `accounts.json` 的原子读写。
 *
 * 写一律「写临时文件 → rename」：引导文件最重要的性质是**坏了能手工修**，
 * 而写到一半的 JSON 连开机都做不到。校验在落盘之前完成，因此一次失败的写
 * 不会碰到原文件。
 */
export class AccountsStore {
  constructor(private readonly dataDir: string) {}

  get filePath(): string {
    return join(this.dataDir, ACCOUNTS_FILE);
  }

  exists(): boolean {
    return existsSync(this.filePath);
  }

  read(): AccountsRegistry {
    const registry = readJsonFile(this.filePath) as AccountsRegistry;
    try {
      assertValidRegistry(registry);
    } catch (cause) {
      throw new Error(`${this.filePath} 内容不合法：${(cause as Error).message}`, { cause });
    }
    return registry;
  }

  write(registry: AccountsRegistry): void {
    assertValidRegistry(registry);
    writeJsonAtomically(this.filePath, registry);
  }

  dbPathOf(account: Account): string {
    return resolve(this.dataDir, account.dbDir, ACCOUNT_DB_FILE);
  }
}

function assertValidRegistry(registry: AccountsRegistry): void {
  if (registry?.v !== 1) {
    throw new Error(`不认识的 accounts.json 版本：${String(registry?.v)}`);
  }
  if (!Array.isArray(registry.accounts) || registry.accounts.length === 0) {
    throw new Error('accounts 至少要有一个账号');
  }

  const seenIds = new Set<string>();
  const seenGithubUserIds = new Set<number>();
  for (const account of registry.accounts) {
    if (seenIds.has(account.id)) {
      throw new Error(`重复的账号 id：${account.id}`);
    }
    seenIds.add(account.id);

    // 两个本地账号绑同一个 GitHub 账号会让它们往同一个 gist 写设置、互相覆盖。
    const userId = account.github?.userId;
    if (userId !== undefined) {
      if (seenGithubUserIds.has(userId)) {
        throw new Error(`同一个 GitHub 账号（userId ${userId}）已被其他本地账号绑定`);
      }
      seenGithubUserIds.add(userId);
    }
  }

  if (!seenIds.has(registry.activeId)) {
    throw new Error(`activeId 指向不存在的账号：${registry.activeId}`);
  }
}
