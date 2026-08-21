import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import type Database from 'better-sqlite3';
import type { Account, AccountsRegistry, AccountsStore, ConnectionHolder } from '@workbench/data';
import type {
  AccountsResponse,
  AccountView,
  BindDirection,
  GitHubBinding,
  GitHubCredential,
} from '@workbench/sync/contract';
import type { ServiceState } from '../service-state.js';
import { AccountError, conflict, notFound } from './errors.js';

export interface AccountsServiceDeps {
  store: AccountsStore;
  holder: ConnectionHolder;
  /** 切换账号与恢复共用的那一个全服务状态。 */
  state: ServiceState;
  /**
   * 在给定连接上跑 core 与所有模块的迁移。
   *
   * 注入而不是在这里 import 模块：另一个账号的库可能是**更旧的代码建的**，
   * 切换必须跑迁移；而「哪些模块有迁移」只有组合根知道（铁律 2）。
   */
  migrate: (sqlite: Database.Database) => void;
  /**
   * 绑定 GitHub 时选的同步方向与凭据要交给谁。
   *
   * 绑定发生在 Device Flow 刚走完那一刻，用户**还没设过同步口令**，所以方向当时
   * 执行不了；组合根把它接到 SecretStore，等第一次解锁再执行（见 sync/service.ts）。
   * AccountsService 因此不必知道 Gist 同步的存在。
   */
  onGithubBound?: (
    accountId: string,
    direction: BindDirection,
    credential?: GitHubCredential,
  ) => void;
  onGithubUnbound?: (accountId: string) => void;
  /**
   * 删账号**之前**的强制安全快照（TASK-045）。拿到的是被删账号自己的库路径——
   * 它不是当前连接，快照必须单独打开那个文件。
   *
   * 失败则拒绝删除：`rm -rf` 之后没有后悔药。这与恢复的「没有回退点就不动手」
   * 是同一条原则。不传则跳过（`WORKBENCH_DB` 逃生舱下没有本地备份服务）。
   */
  onBeforeAccountRemoved?: (accountId: string, dbPath: string) => Promise<unknown>;
  onAccountRemoved?: (accountId: string) => void;
  now?: () => Date;
}

/**
 * 账号的切换、绑定与解绑（设计 §7.5 / §7.6）。
 *
 * 两条贯穿始终的性质：
 *
 * - **`id` 与 `dbDir` 恒不变。** 绑定与解绑都是纯元数据操作，一个文件都不动。
 *   若绑定时把 `local-default` 改名成 `gh-Ethan-Hang`，就得连带重命名数据目录，
 *   一次失败会留下一个找不到库的账号。
 * - **绑定不动数据库。** 想拉云端数据要走恢复流程（差异 → 确认 → 可回退），
 *   否则一次绑定就会静默干掉本地库。
 */
export class AccountsService {
  constructor(private readonly deps: AccountsServiceDeps) {}

  list(): AccountsResponse {
    return toResponse(this.deps.store.read());
  }

  create(displayName: string): AccountsResponse {
    const registry = this.deps.store.read();
    const now = this.nowIso();
    const account: Account = {
      id: this.freshId(registry),
      kind: 'local',
      displayName,
      dbDir: '',
      createdAt: now,
      lastUsedAt: now,
    };
    account.dbDir = `accounts/${account.id}`;

    // 只写元数据：库文件在第一次切过去时由 holder.open 建出来，然后立刻跑迁移。
    // 在这里预先建库会多出一条「建了一半的账号」的失败路径，而它毫无必要。
    this.deps.store.write({ ...registry, accounts: [...registry.accounts, account] });
    return this.list();
  }

  switchTo(id: string): AccountsResponse {
    const registry = this.deps.store.read();
    const target = this.require(registry, id);
    if (registry.activeId === id) return toResponse(registry);

    const previous = registry.accounts.find((account) => account.id === registry.activeId);
    this.deps.state.enter('switching', `正在切换到「${target.displayName}」`);
    try {
      this.openAndMigrate(target);
      this.deps.store.write({
        ...registry,
        activeId: id,
        accounts: registry.accounts.map((account) =>
          account.id === id ? { ...account, lastUsedAt: this.nowIso() } : account,
        ),
      });
    } catch (error) {
      // 切换失败必须切回原账号：否则进程停在一个 activeId 不指向的库上，
      // 之后每一次读写都落在错误的账号里，而且不报错。
      if (previous !== undefined) this.restore(previous);
      throw error;
    } finally {
      this.deps.state.reset();
    }
    return this.list();
  }

  async remove(id: string): Promise<AccountsResponse> {
    const registry = this.deps.store.read();
    const target = this.require(registry, id);
    if (registry.activeId === id) {
      throw conflict('不能删除当前账号，请先切换到其他账号');
    }

    // 安全快照在动注册表之前打。这一刻账号还完好无损，失败了就当无事发生。
    if (this.deps.onBeforeAccountRemoved !== undefined) {
      try {
        await this.deps.onBeforeAccountRemoved(id, this.deps.store.dbPathOf(target));
      } catch (cause) {
        const error = new AccountError(500, '删除前的安全快照失败，删除拒绝执行');
        error.cause = cause;
        throw error;
      }
    }

    // 先改注册表再删目录：反过来一旦写注册表失败，就留下一个指向空目录的账号。
    this.deps.store.write({
      ...registry,
      accounts: registry.accounts.filter((account) => account.id !== id),
    });
    this.deps.onAccountRemoved?.(id);
    rmSync(dirname(this.deps.store.dbPathOf(target)), { recursive: true, force: true });
    return this.list();
  }

  /** 绑定 GitHub。**只写元数据，不动数据库**。 */
  bindGithub(
    id: string,
    github: GitHubBinding,
    direction: BindDirection,
    credential?: GitHubCredential,
  ): AccountsResponse {
    const registry = this.deps.store.read();
    this.require(registry, id);

    // 两个本地账号绑同一个 GitHub 账号会让它们往同一个 gist 写设置、互相覆盖。
    // AccountsStore 也会拦，但那是最后一道；在这里拦才能给出 409 而不是 500。
    const taken = registry.accounts.find(
      (account) => account.id !== id && account.github?.userId === github.userId,
    );
    if (taken !== undefined) {
      throw conflict(`GitHub 账号 ${github.login} 已绑定到「${taken.displayName}」`);
    }
    this.deps.store.write({
      ...registry,
      accounts: registry.accounts.map((account) =>
        account.id === id ? { ...account, kind: 'github', github } : account,
      ),
    });
    this.deps.onGithubBound?.(id, direction, credential);
    return this.list();
  }

  /** 解绑。**不删云端 gist**（可能还在别处用），只清本地这一侧的绑定。 */
  unbindGithub(id: string): AccountsResponse {
    const registry = this.deps.store.read();
    this.require(registry, id);

    this.deps.store.write({
      ...registry,
      accounts: registry.accounts.map((account) => {
        if (account.id !== id) return account;
        const rest = { ...account };
        delete rest.github;
        return { ...rest, kind: 'local' };
      }),
    });
    this.deps.onGithubUnbound?.(id);
    return this.list();
  }

  /** 更新账号元数据（例如显示名称、自定义头像）。 */
  update(id: string, patch: { displayName?: string; avatar?: string | null }): AccountsResponse {
    const registry = this.deps.store.read();
    this.require(registry, id);

    this.deps.store.write({
      ...registry,
      accounts: registry.accounts.map((account) => {
        if (account.id !== id) return account;
        const updated = { ...account };
        if (patch.displayName !== undefined && patch.displayName.trim().length > 0) {
          updated.displayName = patch.displayName.trim();
        }
        if (patch.avatar !== undefined) {
          if (patch.avatar === null || patch.avatar === '') {
            delete updated.avatar;
          } else {
            updated.avatar = patch.avatar;
          }
        }
        return updated;
      }),
    });
    return this.list();
  }

  private openAndMigrate(account: Account): void {
    this.deps.holder.swap(this.deps.store.dbPathOf(account));
    this.deps.migrate(this.deps.holder.current());
  }

  private restore(account: Account): void {
    try {
      this.openAndMigrate(account);
    } catch {
      // 回不去就只能保持现状：真正的错误是外面那个，别用回退的失败把它盖掉。
      // 连接此刻可能是关着的，下一次请求会以「数据库连接尚未打开」明确失败。
    }
  }

  private require(registry: AccountsRegistry, id: string): Account {
    const account = registry.accounts.find((candidate) => candidate.id === id);
    if (account === undefined) throw notFound(`账号不存在：${id}`);
    return account;
  }

  private freshId(registry: AccountsRegistry): string {
    const taken = new Set(registry.accounts.map((account) => account.id));
    let id = randomUUID();
    while (taken.has(id)) id = randomUUID();
    return id;
  }

  private nowIso(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }
}

function toView(account: Account): AccountView {
  // dbDir 刻意不出现在响应里：那是服务端的文件布局细节。
  const view: AccountView = {
    id: account.id,
    kind: account.kind,
    displayName: account.displayName,
    createdAt: account.createdAt,
    lastUsedAt: account.lastUsedAt,
    ...(account.avatar !== undefined ? { avatar: account.avatar } : {}),
  };
  return account.github === undefined ? view : { ...view, github: account.github };
}

function toResponse(registry: AccountsRegistry): AccountsResponse {
  return { activeId: registry.activeId, accounts: registry.accounts.map(toView) };
}
