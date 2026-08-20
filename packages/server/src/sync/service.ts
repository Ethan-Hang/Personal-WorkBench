import type { SettingsRepository } from '@workbench/core';
import { parseSettingsPatch } from '@workbench/core';
import type { SecretStore, WebdavCredentials } from '@workbench/data';
import type { BindDirection, SyncStatus } from '@workbench/sync/contract';
import {
  decryptEnvelope,
  encryptEnvelope,
  SyncError,
  type SecretEnvelope,
} from '@workbench/sync/node';

/** Gist 的读写口。抽出来是为了在测试里把网络换掉，形状与 `GistClient` 一致。 */
export interface GistPort {
  create(token: string, envelope: SecretEnvelope): Promise<string>;
  update(token: string, gistId: string, envelope: SecretEnvelope): Promise<void>;
  read(token: string, gistId: string): Promise<SecretEnvelope | undefined>;
}

export interface GistSyncServiceDeps {
  secrets: SecretStore;
  settings: SettingsRepository;
  gist: GistPort;
  accountId: () => string;
  device: string;
}

/** 进 Gist 的东西**只有这两样**。业务数据与 GitHub token 都不在其中。 */
interface SyncPayload {
  settings: Record<string, unknown>;
  webdav?: WebdavCredentials;
}

/**
 * 设置与 WebDAV 凭据的 Gist 同步（设计 §8）。
 *
 * 三条贯穿全文件的规则：
 *
 * - **GitHub token 永远只在本地。** Gist 里只有设置与 WebDAV 凭据，且是密文。
 * - **口令不落盘**，只在进程内存里；只有本机有系统保管库、且用户明确选了「记住」，
 *   才写进保管库。写进明文文件是绝不允许的——那等于把锁和钥匙放在一起。
 * - **刻意不做自动合并。** 逐键取新会产生两边的混合体，无法回答「我现在用的到底是
 *   哪一套设置」。云端更新就停下来，让用户选方向。
 */
export class GistSyncService {
  /** 解锁后的口令只活在进程里。重启就要重新输（或从保管库读回）。 */
  private passphrase: string | undefined;

  constructor(private readonly deps: GistSyncServiceDeps) {
    this.passphrase = this.deps.secrets.readPassphrase();
  }

  async status(): Promise<SyncStatus> {
    const accountId = this.deps.accountId();
    const gistId = this.deps.secrets.readGistId(accountId) ?? null;
    const lastSeenUpdatedAt = this.deps.secrets.readLastSeenUpdatedAt(accountId) ?? null;

    // **只读 header，不解密**——列表与冲突判断不需要口令，也不泄露任何内容。
    const cloud = await this.readCloudHeader();

    return {
      linked: this.token() !== undefined,
      protectedByOsVault: this.deps.secrets.protectedByOsVault,
      unlocked: this.passphrase !== undefined,
      gistId,
      cloudUpdatedAt: cloud?.updatedAt ?? null,
      cloudDevice: cloud?.device ?? null,
      lastSeenUpdatedAt,
      conflict: cloud !== undefined && cloud.updatedAt !== lastSeenUpdatedAt,
      pendingDirection: this.deps.secrets.readPendingDirection(accountId) ?? null,
    };
  }

  /**
   * 输入口令。
   *
   * 云端已有信封时用它验口令——**GCM 的认证标签解不开就是口令错**，
   * 所以不需要单独存一个 verifier，也就少一个能被离线爆破的靶子。
   */
  async unlock(passphrase: string, remember = false): Promise<void> {
    if (passphrase.trim().length === 0) throw new SyncError('同步口令不能为空', 400);

    const envelope = await this.readCloud();
    if (envelope !== undefined) decryptEnvelope(envelope, passphrase);

    this.passphrase = passphrase;
    if (remember) this.deps.secrets.rememberPassphrase(passphrase);

    await this.applyPendingDirection();
  }

  /** 把本地的设置与 WebDAV 凭据推上去。 */
  async push(options: { force?: boolean } = {}): Promise<void> {
    const passphrase = this.requireUnlocked();
    const token = this.requireToken();
    const accountId = this.deps.accountId();

    const cloud = await this.readCloud();
    if (options.force !== true) {
      const lastSeen = this.deps.secrets.readLastSeenUpdatedAt(accountId);
      if (cloud !== undefined && cloud.updatedAt !== lastSeen) {
        throw new SyncError(
          `云端设置已被「${cloud.device}」改过（${cloud.updatedAt}），请先选择保留哪一边`,
          409,
        );
      }
    }

    const payload: SyncPayload = {
      settings: await this.deps.settings.getAll(),
      ...(this.deps.secrets.readWebdav() === undefined
        ? {}
        : { webdav: this.deps.secrets.readWebdav() }),
    };
    const envelope = encryptEnvelope(payload, passphrase, {
      device: this.deps.device,
      // salt 沿用上一份：scrypt 很慢，每改一次主题就重派生会明显卡。
      ...(cloud?.salt === undefined ? {} : { salt: cloud.salt }),
    });

    const gistId = this.deps.secrets.readGistId(accountId);
    if (gistId === undefined) {
      this.deps.secrets.writeGistId(accountId, await this.deps.gist.create(token, envelope));
    } else {
      await this.deps.gist.update(token, gistId, envelope);
    }
    this.deps.secrets.writeLastSeenUpdatedAt(accountId, envelope.updatedAt);
  }

  /** 把云端的设置与 WebDAV 凭据拉下来覆盖本地。 */
  async pull(): Promise<void> {
    const passphrase = this.requireUnlocked();
    const envelope = await this.readCloud();
    if (envelope === undefined) throw new SyncError('云端还没有可拉取的设置', 409);

    const payload = decryptEnvelope(envelope, passphrase) as SyncPayload;

    // 云端一条设置都没存过是正常的（`parseSettingsPatch` 把空补丁当调用方的 bug
    // 拒绝，那是 PATCH 端点的口径，不是这里的）。
    const incoming = payload.settings ?? {};
    if (Object.keys(incoming).length > 0) {
      // 走 core 的校验：云端的设置也可能来自更新的代码，脏值不能直接灌进库。
      const parsed = parseSettingsPatch(incoming);
      if (!parsed.ok) throw new SyncError(`云端设置不合法：${parsed.error}`, 409);
      await this.deps.settings.setMany(parsed.patch);
    }

    if (payload.webdav !== undefined) this.deps.secrets.writeWebdav(payload.webdav);
    this.deps.secrets.writeLastSeenUpdatedAt(this.deps.accountId(), envelope.updatedAt);
  }

  private async applyPendingDirection(): Promise<void> {
    const accountId = this.deps.accountId();
    const direction = this.deps.secrets.readPendingDirection(accountId);
    if (direction === undefined) return;

    // 先清再执行：执行失败时不该把用户永远钉在「每次解锁都自动覆盖一次」上。
    this.deps.secrets.clearPendingDirection(accountId);
    await this.applyDirection(direction);
  }

  private async applyDirection(direction: BindDirection): Promise<void> {
    if (direction === 'cloud-to-local') {
      await this.pull();
    } else {
      await this.push({ force: true });
    }
  }

  private async readCloud(): Promise<SecretEnvelope | undefined> {
    const token = this.token();
    const gistId = this.deps.secrets.readGistId(this.deps.accountId());
    if (token === undefined || gistId === undefined) return undefined;
    return this.deps.gist.read(token, gistId);
  }

  private async readCloudHeader(): Promise<SecretEnvelope | undefined> {
    try {
      return await this.readCloud();
    } catch {
      // 状态查询不该因为一次网络抖动就整页失败；linked / unlocked 仍然有意义。
      return undefined;
    }
  }

  private token(): string | undefined {
    return this.deps.secrets.readGithubToken(this.deps.accountId())?.accessToken;
  }

  private requireToken(): string {
    const token = this.token();
    if (token === undefined) throw new SyncError('当前账号还没有登录 GitHub', 400);
    return token;
  }

  private requireUnlocked(): string {
    if (this.passphrase === undefined) throw new SyncError('请先输入同步口令', 400);
    return this.passphrase;
  }
}
