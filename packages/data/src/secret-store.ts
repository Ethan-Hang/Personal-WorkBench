import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readJsonFile, writeJsonAtomically } from './atomic-json.js';
import { CREDENTIALS_FILE, type WebdavCredentials } from './credentials.js';

/** 保管库里的服务名。Windows 凭据管理器 / macOS Keychain 里就按它归组。 */
const SERVICE_NAME = 'personal-workbench';

export interface SecretBackend {
  /** `os-vault` 才算受系统保管库保护；`file` 是**降级**，必须让用户看见。 */
  readonly kind: 'os-vault' | 'file';
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export interface GithubToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  /**
   * 本设计**不启用短期 token**，所以正常情况下这两个字段不会出现。
   * 但响应里若真带了就一并存下、不丢弃——将来勾上 App 的过期选项时，
   * 凭据存储的形状不用改（设计 §7.3.2）。
   */
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
}

/** 退化路径：明文 JSON 文件。**这是降级不是等价选项。** */
export class JsonFileBackend implements SecretBackend {
  readonly kind = 'file' as const;

  constructor(private readonly dataDir: string) {}

  private get filePath(): string {
    return join(this.dataDir, CREDENTIALS_FILE);
  }

  private read(): { v: 1; secrets: Record<string, string> } {
    if (!existsSync(this.filePath)) return { v: 1, secrets: {} };
    const parsed = readJsonFile(this.filePath) as { secrets?: Record<string, string> };
    return { v: 1, secrets: parsed.secrets ?? {} };
  }

  get(key: string): string | undefined {
    return this.read().secrets[key];
  }

  set(key: string, value: string): void {
    const current = this.read();
    writeJsonAtomically(this.filePath, {
      ...current,
      secrets: { ...current.secrets, [key]: value },
    });
  }

  delete(key: string): void {
    const current = this.read();
    delete current.secrets[key];
    writeJsonAtomically(this.filePath, current);
  }
}

/** 优先方案：OS Credential Manager / Keychain / Secret Service。 */
export class OsVaultBackend implements SecretBackend {
  readonly kind = 'os-vault' as const;

  constructor(private readonly entryFor: (key: string) => OsVaultEntry) {}

  get(key: string): string | undefined {
    return this.entryFor(key).getPassword() ?? undefined;
  }

  set(key: string, value: string): void {
    this.entryFor(key).setPassword(value);
  }

  delete(key: string): void {
    this.entryFor(key).deletePassword();
  }
}

interface OsVaultEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}

/**
 * 选后端：**优先 OS 保管库，拿不到才退到明文文件**（设计 §7.4）。
 *
 * 用 `createRequire` 同步加载而不是 `await import`：整条凭据读写都是同步的，
 * 为一个可选依赖把它们全改成异步不划算。`@napi-rs/keyring` 是 N-API 预编译
 * （与 `better-sqlite3` 同样免编译，`npm run setup` 的 `--ignore-scripts` 装得上），
 * 但 Linux 上没有 Secret Service 时它会在**调用时**才失败，所以这里试写一次探活。
 */
export function createSecretBackend(dataDir: string): SecretBackend {
  // 保管库是**全机器共享**的，文件后端天然按目录隔离。给键加上数据目录的指纹，
  // 两种后端的隔离粒度才一致——否则另一个 checkout（或一次跑在临时目录上的测试）
  // 会读写、甚至删掉这台机器上真正在用的那份凭据。
  const namespace = createHash('sha256').update(resolve(dataDir)).digest('hex').slice(0, 12);
  try {
    const require = createRequire(import.meta.url);
    const { Entry } = require('@napi-rs/keyring') as {
      Entry: new (service: string, account: string) => OsVaultEntry;
    };
    // Linux 上没有 Secret Service 时，`@napi-rs/keyring` 要到**调用时**才失败，
    // 所以这里试写一次探活，而不是只看 import 成不成功。
    const probe = new Entry(SERVICE_NAME, `${namespace}:__probe__`);
    probe.setPassword('ok');
    probe.deletePassword();
    return new OsVaultBackend((key) => new Entry(SERVICE_NAME, `${namespace}:${key}`));
  } catch {
    return new JsonFileBackend(dataDir);
  }
}

/**
 * 本地秘密的读写口。
 *
 * 两条不可动摇的规则：
 *
 * - **GitHub token 永远只在本地，绝不进 Gist。** Gist 里只有 WebDAV 凭据与设置。
 * - **同步口令绝不写进明文文件。** 没有系统保管库就直接拒绝「记住口令」——
 *   把用来解密云端数据的口令和被它保护的密文放在同一台机器的明文里，
 *   加密就白做了。
 */
export class SecretStore {
  constructor(private readonly backend: SecretBackend) {}

  get protectedByOsVault(): boolean {
    return this.backend.kind === 'os-vault';
  }

  readWebdav(): WebdavCredentials | undefined {
    return this.readJson<WebdavCredentials>('webdav');
  }

  writeWebdav(credentials: WebdavCredentials): void {
    this.backend.set('webdav', JSON.stringify(credentials));
  }

  clearWebdav(): void {
    this.backend.delete('webdav');
  }

  readGithubToken(accountId: string): GithubToken | undefined {
    return this.readJson<GithubToken>(`github-token:${accountId}`);
  }

  writeGithubToken(accountId: string, token: GithubToken): void {
    this.backend.set(`github-token:${accountId}`, JSON.stringify(token));
  }

  clearGithubToken(accountId: string): void {
    this.backend.delete(`github-token:${accountId}`);
  }

  readGistId(accountId: string): string | undefined {
    return this.backend.get(`gist-id:${accountId}`);
  }

  writeGistId(accountId: string, gistId: string): void {
    this.backend.set(`gist-id:${accountId}`, gistId);
  }

  /**
   * 绑定时选的同步方向。绑定发生在 Device Flow 刚走完那一刻，用户**还没有设过
   * 口令**，所以方向当时执行不了——记下来，等第一次解锁再执行（然后清掉）。
   */
  readPendingDirection(accountId: string): 'cloud-to-local' | 'local-to-cloud' | undefined {
    const raw = this.backend.get(`pending-direction:${accountId}`);
    return raw === 'cloud-to-local' || raw === 'local-to-cloud' ? raw : undefined;
  }

  writePendingDirection(accountId: string, direction: 'cloud-to-local' | 'local-to-cloud'): void {
    this.backend.set(`pending-direction:${accountId}`, direction);
  }

  clearPendingDirection(accountId: string): void {
    this.backend.delete(`pending-direction:${accountId}`);
  }

  /** 本端上次见到的云端版本。与云端 header 的 updatedAt 不等即为冲突。 */
  readLastSeenUpdatedAt(accountId: string): string | undefined {
    return this.backend.get(`last-seen:${accountId}`);
  }

  writeLastSeenUpdatedAt(accountId: string, updatedAt: string): void {
    this.backend.set(`last-seen:${accountId}`, updatedAt);
  }

  readPassphrase(): string | undefined {
    return this.backend.get('sync-passphrase');
  }

  rememberPassphrase(passphrase: string): void {
    if (!this.protectedByOsVault) {
      throw new Error('本机没有可用的系统保管库，拒绝记住同步口令');
    }
    this.backend.set('sync-passphrase', passphrase);
  }

  forgetPassphrase(): void {
    this.backend.delete('sync-passphrase');
  }

  private readJson<T>(key: string): T | undefined {
    const raw = this.backend.get(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
}
