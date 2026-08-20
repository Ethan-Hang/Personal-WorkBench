import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openTestDatabase, SecretStore, SqliteSettingsRepository } from '@workbench/data';
import type { SecretBackend } from '@workbench/data';
import { encryptEnvelope, type SecretEnvelope } from '@workbench/sync/node';
import { GistSyncService, type GistPort } from './service.js';

/** 冒充 OS 保管库，好让「记住口令」这条路走得通。 */
class MemoryVaultBackend implements SecretBackend {
  readonly kind = 'os-vault' as const;
  private readonly values = new Map<string, string>();
  get(key: string): string | undefined {
    return this.values.get(key);
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  delete(key: string): void {
    this.values.delete(key);
  }
}

/** 内存里的假 gist。 */
class FakeGist implements GistPort {
  envelope: SecretEnvelope | undefined;
  createdWithToken: string | undefined;

  async create(token: string, envelope: SecretEnvelope): Promise<string> {
    this.createdWithToken = token;
    this.envelope = envelope;
    return 'gist-1';
  }

  async update(token: string, gistId: string, envelope: SecretEnvelope): Promise<void> {
    void token;
    void gistId;
    this.envelope = envelope;
  }

  async read(token: string, gistId: string): Promise<SecretEnvelope | undefined> {
    void token;
    void gistId;
    return this.envelope;
  }
}

const passphrase = '一个还算长的口令 42';
const webdav = { url: 'https://dav.example.com/dav/', username: 'me', password: 's3cret' };

interface Harness {
  sqlite: Database.Database;
  secrets: SecretStore;
  settings: SqliteSettingsRepository;
  gist: FakeGist;
  service: GistSyncService;
}

function createHarness(): Harness {
  const { sqlite } = openTestDatabase();
  const secrets = new SecretStore(new MemoryVaultBackend());
  const settings = new SqliteSettingsRepository(() => sqlite);
  const gist = new FakeGist();
  const service = new GistSyncService({
    secrets,
    settings,
    gist,
    accountId: () => 'local-default',
    device: '测试机',
  });
  secrets.writeGithubToken('local-default', {
    accessToken: 'ghu_token',
    tokenType: 'bearer',
    scope: '',
  });
  return { sqlite, secrets, settings, gist, service };
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  harness.sqlite.close();
});

describe('GistSyncService.status', () => {
  it('没登录 GitHub 时 linked 为假', async () => {
    harness.secrets.clearGithubToken('local-default');

    expect((await harness.service.status()).linked).toBe(false);
  });

  it('如实报出本机凭据有没有受系统保管库保护', async () => {
    expect((await harness.service.status()).protectedByOsVault).toBe(true);
  });

  it('没解锁时 unlocked 为假', async () => {
    expect((await harness.service.status()).unlocked).toBe(false);
  });
});

describe('GistSyncService.push', () => {
  it('没解锁就推 → 400，让用户先输口令', async () => {
    await expect(harness.service.push()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('第一次推会建 gist，并把 gistId 记在本地', async () => {
    await harness.service.unlock(passphrase);

    await harness.service.push();

    expect(harness.secrets.readGistId('local-default')).toBe('gist-1');
    expect(harness.gist.createdWithToken).toBe('ghu_token');
  });

  it('推上去的是密文，云端看不到 WebDAV 密码', async () => {
    harness.secrets.writeWebdav(webdav);
    await harness.service.unlock(passphrase);

    await harness.service.push();

    expect(JSON.stringify(harness.gist.envelope)).not.toContain('s3cret');
  });

  it('GitHub token 绝不进 Gist', async () => {
    await harness.service.unlock(passphrase);

    await harness.service.push();

    expect(JSON.stringify(harness.gist.envelope)).not.toContain('ghu_token');
  });

  it('第二次推沿用同一个 salt——scrypt 很慢，不能每写一次就重派生', async () => {
    await harness.service.unlock(passphrase);
    await harness.service.push();
    const first = harness.gist.envelope?.salt;

    await harness.service.push();

    expect(harness.gist.envelope?.salt).toBe(first);
  });

  it('云端被另一台设备改过 → 停下来报冲突，绝不自动合并', async () => {
    await harness.service.unlock(passphrase);
    await harness.service.push();
    harness.gist.envelope = encryptEnvelope({ settings: {} }, passphrase, {
      device: '另一台设备',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });

    await expect(harness.service.push()).rejects.toMatchObject({ statusCode: 409 });
  });

  it('用户明确选了「本地覆写云端」才强推', async () => {
    await harness.service.unlock(passphrase);
    await harness.service.push();
    harness.gist.envelope = encryptEnvelope({ settings: {} }, passphrase, {
      device: '另一台设备',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });

    await harness.service.push({ force: true });

    expect(harness.gist.envelope?.device).toBe('测试机');
  });
});

describe('GistSyncService.pull', () => {
  it('把云端设置写回本地库', async () => {
    await harness.service.unlock(passphrase);
    harness.gist.envelope = encryptEnvelope(
      { settings: { 'theme.palette': 'ocean' } },
      passphrase,
      { device: '另一台设备' },
    );
    harness.secrets.writeGistId('local-default', 'gist-1');

    await harness.service.pull();

    expect((await harness.settings.getAll())['theme.palette']).toBe('ocean');
  });

  it('把云端的 WebDAV 凭据写回本地保管库', async () => {
    await harness.service.unlock(passphrase);
    harness.gist.envelope = encryptEnvelope({ settings: {}, webdav }, passphrase, {
      device: '另一台设备',
    });
    harness.secrets.writeGistId('local-default', 'gist-1');

    await harness.service.pull();

    expect(harness.secrets.readWebdav()).toEqual(webdav);
  });

  it('拉完之后冲突就消了', async () => {
    await harness.service.unlock(passphrase);
    harness.gist.envelope = encryptEnvelope({ settings: {} }, passphrase, {
      device: '另一台设备',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    harness.secrets.writeGistId('local-default', 'gist-1');
    expect((await harness.service.status()).conflict).toBe(true);

    await harness.service.pull();

    expect((await harness.service.status()).conflict).toBe(false);
  });
});

describe('GistSyncService.unlock', () => {
  it('口令不对 → 400，且不改变已解锁状态', async () => {
    harness.gist.envelope = encryptEnvelope({ settings: {} }, passphrase, { device: '另一台设备' });
    harness.secrets.writeGistId('local-default', 'gist-1');

    await expect(harness.service.unlock('错的口令')).rejects.toMatchObject({ statusCode: 400 });
    expect((await harness.service.status()).unlocked).toBe(false);
  });

  it('云端还没有东西时任何口令都算解锁——那是第一次设置', async () => {
    await harness.service.unlock(passphrase);

    expect((await harness.service.status()).unlocked).toBe(true);
  });

  it('remember 只在有保管库时允许，且口令能在下次读回', async () => {
    await harness.service.unlock(passphrase, true);

    expect(harness.secrets.readPassphrase()).toBe(passphrase);
  });

  it('绑定时选的方向在解锁后才执行：cloud-to-local 会拉下来', async () => {
    harness.gist.envelope = encryptEnvelope(
      { settings: { 'theme.palette': 'forest' } },
      passphrase,
      { device: '另一台设备' },
    );
    harness.secrets.writeGistId('local-default', 'gist-1');
    harness.secrets.writePendingDirection('local-default', 'cloud-to-local');

    await harness.service.unlock(passphrase);

    expect((await harness.settings.getAll())['theme.palette']).toBe('forest');
    expect((await harness.service.status()).pendingDirection).toBeNull();
  });

  it('绑定时选的方向执行完就清掉，不会每次解锁都重来一遍', async () => {
    harness.secrets.writePendingDirection('local-default', 'local-to-cloud');

    await harness.service.unlock(passphrase);

    expect(harness.secrets.readPendingDirection('local-default')).toBeUndefined();
  });
});
