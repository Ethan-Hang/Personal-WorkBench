import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { SettingsRepository } from '@workbench/core';
import { resolveSettings } from '@workbench/core';
import type { CredentialsStore, WebdavCredentials } from '@workbench/data';
import type {
  BackupConfig,
  BackupConfigPatch,
  BackupListItem,
  BackupMeta,
} from '@workbench/sync/contract';
import { createSnapshot, SyncError } from '@workbench/sync/node';

/**
 * 云端备份仓库。`WebdavBackupStore` 已经是这个形状；抽出接口只为让服务能在测试里
 * 拿到一个内存实现——**协议编解码由 webdav-client 自己的测试覆盖，网络在这里打桩**。
 */
export interface BackupStore {
  upload(name: string, gz: Buffer, meta: BackupMeta): Promise<void>;
  list(): Promise<BackupListItem[]>;
  remove(name: string): Promise<void>;
  download(name: string): Promise<Buffer>;
}

export interface BackupServiceDeps {
  credentials: CredentialsStore;
  settings: SettingsRepository;
  getSqlite: () => Database.Database;
  /** 当前账号 id，写进 meta：恢复时要知道这份备份是谁的。 */
  accountId: () => string;
  dataDir: string;
  device: string;
  appVersion: string;
  createStore: (credentials: WebdavCredentials) => BackupStore;
  now?: () => Date;
}

const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 备份的配置、执行、列表、删除与保留策略（设计 §6.1 / §6.6）。
 *
 * 三条刻意的取舍：
 *
 * - **默认不自动备份**，因此默认配置下零出站网络请求，本地优先不被稀释。
 * - **自动清理跟随同一个开关。** 自动删除不可逆；关着自动备份却在背后删你手动传的
 *   备份是自相矛盾的。
 * - **「上次备份时间」从云端列表推**，不另存一个设置项。它自愈（换机器也对），
 *   代价是自动备份开着时启动会多一次 list——而那本来就要联网。
 */
export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  async getConfig(): Promise<BackupConfig> {
    const webdav = this.deps.credentials.readWebdav();
    const settings = resolveSettings(await this.deps.settings.getAll());
    return {
      configured: webdav !== undefined,
      // password 只进不出：读接口永远不回传它。
      url: webdav?.url ?? null,
      username: webdav?.username ?? null,
      autoEnabled: settings['backup.autoEnabled'],
      retentionCount: settings['backup.retentionCount'],
    };
  }

  async updateConfig(patch: BackupConfigPatch): Promise<BackupConfig> {
    const current = this.deps.credentials.readWebdav();
    const merged: WebdavCredentials = {
      url: patch.url ?? current?.url ?? '',
      username: patch.username ?? current?.username ?? '',
      // 只改开关时 password 缺席，这里必须沿用旧值而不是清空。
      password: patch.password ?? current?.password ?? '',
    };
    if (merged.url !== '' && merged.username !== '' && merged.password !== '') {
      this.deps.credentials.writeWebdav(merged);
    }

    const settingsPatch: Record<string, unknown> = {};
    if (patch.autoEnabled !== undefined) settingsPatch['backup.autoEnabled'] = patch.autoEnabled;
    if (patch.retentionCount !== undefined) {
      settingsPatch['backup.retentionCount'] = patch.retentionCount;
    }
    if (Object.keys(settingsPatch).length > 0) {
      await this.deps.settings.setMany(settingsPatch);
    }

    return this.getConfig();
  }

  async run(): Promise<BackupListItem> {
    const store = this.requireStore();
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
    return this.requireStore().list();
  }

  async remove(name: string): Promise<void> {
    await this.requireStore().remove(name);
  }

  async download(name: string): Promise<Buffer> {
    return this.requireStore().download(name);
  }

  /**
   * 进程启动时的自动备份。**不引入常驻调度器**——与「重复任务物化挂在 listToday」同源。
   */
  async maybeAutoBackup(): Promise<void> {
    const config = await this.getConfig();
    if (!config.autoEnabled || !config.configured) return;

    const latest = (await this.list()).find((item) => item.complete && item.meta !== null);
    const lastRunAt = latest?.meta?.createdAt;
    if (lastRunAt !== undefined) {
      const elapsed = this.now().getTime() - Date.parse(lastRunAt);
      if (Number.isFinite(elapsed) && elapsed < AUTO_BACKUP_INTERVAL_MS) return;
    }
    await this.run();
  }

  /**
   * 只清理**完整**的备份。孤儿（有 .db.gz 没 meta）留给人手动删：它也可能是另一个
   * 进程正在上传的那一份，自动删掉会把一次正常备份变成事故。
   */
  private async applyRetention(store: BackupStore): Promise<void> {
    const settings = resolveSettings(await this.deps.settings.getAll());
    if (!settings['backup.autoEnabled']) return;

    const complete = (await store.list()).filter((item) => item.complete);
    for (const stale of complete.slice(settings['backup.retentionCount'])) {
      await store.remove(stale.name);
    }
  }

  private requireStore(): BackupStore {
    const webdav = this.deps.credentials.readWebdav();
    if (webdav === undefined) {
      throw new SyncError('尚未配置 WebDAV，请先在设置里填好地址、账号与密码', 400);
    }
    return this.deps.createStore(webdav);
  }

  private snapshotTmpPath(): string {
    return join(this.deps.dataDir, `.snapshot-${process.pid}.db`);
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }
}
