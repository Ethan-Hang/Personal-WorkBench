import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSecretBackend,
  JsonFileBackend,
  SecretStore,
  type SecretBackend,
} from './secret-store.js';

const temporaryDirectories: string[] = [];

function makeDataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-secret-'));
  temporaryDirectories.push(directory);
  return directory;
}

/** 冒充 OS 保管库：只要 kind 是 os-vault，SecretStore 就该把它当受保护的后端。 */
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

const webdav = { url: 'https://dav.example.com/dav/', username: 'me', password: 's3cret' };
const token = { accessToken: 'ghu_xxx', tokenType: 'bearer', scope: '' };

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SecretStore', () => {
  it('WebDAV 凭据往返', () => {
    const store = new SecretStore(new JsonFileBackend(makeDataDir()));

    expect(store.readWebdav()).toBeUndefined();
    store.writeWebdav(webdav);

    expect(store.readWebdav()).toEqual(webdav);
    store.clearWebdav();
    expect(store.readWebdav()).toBeUndefined();
  });

  it('GitHub token 按账号分开存——两个账号绑的是不同的 GitHub', () => {
    const store = new SecretStore(new MemoryVaultBackend());

    store.writeGithubToken('local-default', token);
    store.writeGithubToken('second', { ...token, accessToken: 'ghu_yyy' });

    expect(store.readGithubToken('local-default')?.accessToken).toBe('ghu_xxx');
    expect(store.readGithubToken('second')?.accessToken).toBe('ghu_yyy');
  });

  it('解绑只清那一个账号的 token', () => {
    const store = new SecretStore(new MemoryVaultBackend());
    store.writeGithubToken('local-default', token);
    store.writeGithubToken('second', token);

    store.clearGithubToken('second');

    expect(store.readGithubToken('local-default')).toBeDefined();
    expect(store.readGithubToken('second')).toBeUndefined();
  });

  it('token 响应里带 refreshToken 就一并存下，不丢弃', () => {
    const store = new SecretStore(new MemoryVaultBackend());

    store.writeGithubToken('local-default', { ...token, refreshToken: 'ghr_zzz' });

    expect(store.readGithubToken('local-default')?.refreshToken).toBe('ghr_zzz');
  });

  it('OS 保管库可用时 protectedByOsVault 为真', () => {
    expect(new SecretStore(new MemoryVaultBackend()).protectedByOsVault).toBe(true);
  });

  it('退化到明文文件时 protectedByOsVault 为假——降级要能被看见', () => {
    expect(new SecretStore(new JsonFileBackend(makeDataDir())).protectedByOsVault).toBe(false);
  });

  it('同步口令**绝不**写进明文文件：没有保管库就直接拒绝记住', () => {
    const dataDir = makeDataDir();
    const store = new SecretStore(new JsonFileBackend(dataDir));

    expect(() => store.rememberPassphrase('我的口令')).toThrow('保管库');

    const file = join(dataDir, 'credentials.json');
    if (existsSync(file)) expect(readFileSync(file, 'utf8')).not.toContain('我的口令');
  });

  it('有保管库时才允许记住口令，并且能读回来', () => {
    const store = new SecretStore(new MemoryVaultBackend());

    store.rememberPassphrase('我的口令');

    expect(store.readPassphrase()).toBe('我的口令');
    store.forgetPassphrase();
    expect(store.readPassphrase()).toBeUndefined();
  });

  it('gistId 跟着账号走，且不是秘密——但仍与 token 存在一处，省一个文件', () => {
    const store = new SecretStore(new MemoryVaultBackend());

    store.writeGistId('local-default', 'abc123');

    expect(store.readGistId('local-default')).toBe('abc123');
  });
});

describe('createSecretBackend', () => {
  it('无论选到哪个后端都能往返，且如实报出是不是受保管库保护', () => {
    // 这台机器上有系统保管库就走 os-vault，CI 上（无 Secret Service）会退到 file。
    // 两条路都必须可用——**降级是允许的，静默失效不是**。
    // 跑在临时目录上，因此即便走了保管库也碰不到这台机器真正在用的那份凭据。
    const store = new SecretStore(createSecretBackend(makeDataDir()));

    store.writeWebdav(webdav);
    try {
      expect(store.readWebdav()).toEqual(webdav);
      expect(typeof store.protectedByOsVault).toBe('boolean');
    } finally {
      store.clearWebdav();
    }
    expect(store.readWebdav()).toBeUndefined();
  });

  it('两个数据目录互不可见——保管库是全机器共享的，隔离得自己加', () => {
    const first = new SecretStore(createSecretBackend(makeDataDir()));
    const second = new SecretStore(createSecretBackend(makeDataDir()));

    first.writeWebdav(webdav);
    try {
      expect(second.readWebdav()).toBeUndefined();
    } finally {
      first.clearWebdav();
    }
  });
});

describe('JsonFileBackend', () => {
  it('写入是原子的，且落在 credentials.json', () => {
    const dataDir = makeDataDir();
    const backend = new JsonFileBackend(dataDir);

    backend.set('webdav', JSON.stringify(webdav));

    const raw = JSON.parse(readFileSync(join(dataDir, 'credentials.json'), 'utf8')) as {
      secrets: Record<string, string>;
    };
    expect(JSON.parse(raw.secrets.webdav ?? '{}')).toEqual(webdav);
  });

  it('读不存在的键给 undefined，而不是抛', () => {
    expect(new JsonFileBackend(makeDataDir()).get('查无此键')).toBeUndefined();
  });
});
