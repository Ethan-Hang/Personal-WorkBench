import { statSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { SettingsRepository } from '@workbench/core';
import { resolveSettings } from '@workbench/core';
import type {
  BackupListItem,
  LocalBackupConfig,
  LocalBackupConfigPatch,
} from '@workbench/sync/contract';
import { createSnapshot, LocalBackupStore, SyncError } from '@workbench/sync/node';
import type { BackupStore } from '../backup/service.js';

export interface LocalBackupServiceDeps {
  settings: SettingsRepository;
  getSqlite: () => Database.Database;
  /** 当前账号 id，写进 meta：导入时要知道这份备份是谁的。 */
  accountId: () => string;
  dataDir: string;
  device: string;
  appVersion: string;
  /** 只为测试留的缝；生产恒为 LocalBackupStore。 */
  createStore?: (dir: string) => BackupStore;
}

/** 未设 targetDir 时的落点，相对账号根目录——不写死绝对路径，设置要跟着账号目录走。 */
const DEFAULT_SUBDIR = 'backups';

/**
 * 本地备份的配置、执行、列表、删除与保留策略（TASK-044）。
 *
 * **刻意不复用 `BackupService`。** 那一个是 WebDAV 专属的：`requireStore()` 读凭据、
 * 没配就抛 400，`getConfig()` 的形状是 `{ url, username, ... }` 装不下 targetDir，
 * 保留策略挂在 `backup.autoEnabled` 上。合并两者会得到一个「要么凭据要么目录」的
 * 联合类型——重复的是形状不是知识，等出现第三个存储后端再抽取。
 *
 * 与云端共享的只有真正共享的那部分：`createSnapshot` 与 `BackupStore` 的形状。
 */
export class LocalBackupService {
  constructor(private readonly deps: LocalBackupServiceDeps) {}

  async getConfig(): Promise<LocalBackupConfig> {
    const settings = resolveSettings(await this.deps.settings.getAll());
    const targetDir = settings['localBackup.targetDir'];
    return {
      targetDir,
      resolvedDir: this.resolveDir(targetDir),
      autoEnabled: settings['localBackup.autoEnabled'],
      retentionCount: settings['localBackup.retentionCount'],
    };
  }

  /**
   * 目录的可写性在这里当场校验，而不是留到 `run`。
   * 配错路径要在设置页立刻看见，不能等到某次备份沉默成一份 0 字节文件才发现。
   */
  async updateConfig(patch: LocalBackupConfigPatch): Promise<LocalBackupConfig> {
    const settingsPatch: Record<string, unknown> = {};
    if (patch.targetDir !== undefined) {
      const targetDir = patch.targetDir.trim();
      // 空串是「回到默认目录」，不是非法值，因此不校验。
      if (targetDir !== '') this.assertUsableDir(targetDir);
      settingsPatch['localBackup.targetDir'] = targetDir;
    }
    if (patch.autoEnabled !== undefined) {
      settingsPatch['localBackup.autoEnabled'] = patch.autoEnabled;
    }
    if (patch.retentionCount !== undefined) {
      settingsPatch['localBackup.retentionCount'] = patch.retentionCount;
    }
    if (Object.keys(settingsPatch).length > 0) {
      await this.deps.settings.setMany(settingsPatch);
    }
    return this.getConfig();
  }

  async run(): Promise<BackupListItem> {
    const store = await this.store();
    const snapshot = await createSnapshot(this.deps.getSqlite(), this.snapshotTmpPath(), {
      accountId: this.deps.accountId(),
      device: this.deps.device,
      appVersion: this.deps.appVersion,
    });

    await store.upload(snapshot.name, snapshot.gz, snapshot.meta);
    await this.applyRetention(store);
    return { name: snapshot.name, complete: true, meta: snapshot.meta };
  }

  async list(): Promise<BackupListItem[]> {
    return (await this.store()).list();
  }

  async remove(name: string): Promise<void> {
    await (await this.store()).remove(name);
  }

  async download(name: string): Promise<Buffer> {
    return (await this.store()).download(name);
  }

  /**
   * 只在自动快照开着时清理，且只清理**完整**的备份。
   *
   * 两条都与云端同源：自动删除不可逆，关着开关却在背后删你手动导出的备份是自相矛盾的；
   * 孤儿也可能是另一个进程正在写的那一份，自动删掉会把一次正常备份变成事故。
   */
  private async applyRetention(store: BackupStore): Promise<void> {
    const settings = resolveSettings(await this.deps.settings.getAll());
    if (!settings['localBackup.autoEnabled']) return;

    const complete = (await store.list()).filter((item) => item.complete);
    for (const stale of complete.slice(settings['localBackup.retentionCount'])) {
      await store.remove(stale.name);
    }
  }

  private async store(): Promise<BackupStore> {
    const { resolvedDir } = await this.getConfig();
    return this.deps.createStore?.(resolvedDir) ?? new LocalBackupStore(resolvedDir);
  }

  private resolveDir(targetDir: string): string {
    return targetDir === '' ? join(this.deps.dataDir, DEFAULT_SUBDIR) : targetDir;
  }

  private assertUsableDir(dir: string): void {
    let stat;
    try {
      stat = statSync(dir);
    } catch {
      throw new SyncError(`备份目录不存在：${dir}`, 400);
    }
    if (!stat.isDirectory()) {
      throw new SyncError(`备份目录不是一个目录：${dir}`, 400);
    }
  }

  private snapshotTmpPath(): string {
    return join(this.deps.dataDir, `.local-snapshot-${process.pid}.db`);
  }
}
