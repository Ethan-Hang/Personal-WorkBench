import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountsStore, type AccountsRegistry } from './accounts-store.js';

const temporaryDirectories: string[] = [];

function makeDataDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'workbench-accounts-'));
  temporaryDirectories.push(directory);
  return directory;
}

function registryOf(overrides: Partial<AccountsRegistry> = {}): AccountsRegistry {
  return {
    v: 1,
    activeId: 'local-default',
    accounts: [
      {
        id: 'local-default',
        kind: 'local',
        displayName: '本地',
        dbDir: 'accounts/local-default',
        createdAt: '2026-08-19T12:00:00.000Z',
        lastUsedAt: '2026-08-19T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('AccountsStore', () => {
  it('写入后能原样读回，且不留下临时文件', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);

    expect(store.exists()).toBe(false);
    store.write(registryOf());

    expect(store.exists()).toBe(true);
    expect(store.read()).toEqual(registryOf());
    expect(readdirSync(dataDir)).toEqual(['accounts.json']);
  });

  it('校验失败时不落盘，原文件分毫未动', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    store.write(registryOf());
    const before = readFileSync(store.filePath, 'utf8');

    expect(() => store.write(registryOf({ activeId: '不存在的账号' }))).toThrow('activeId');

    expect(readFileSync(store.filePath, 'utf8')).toBe(before);
    expect(readdirSync(dataDir)).toEqual(['accounts.json']);
  });

  it('拒绝把同一个 GitHub 账号绑定到两个本地账号', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    const github = { login: 'Ethan-Hang', userId: 12345 };
    const base = registryOf().accounts[0]!;

    expect(() =>
      store.write(
        registryOf({
          accounts: [
            { ...base, kind: 'github', github },
            { ...base, id: 'second', dbDir: 'accounts/second', kind: 'github', github },
          ],
        }),
      ),
    ).toThrow('userId');
  });

  it('拒绝重复的账号 id', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    const base = registryOf().accounts[0]!;

    expect(() => store.write(registryOf({ accounts: [base, { ...base }] }))).toThrow('id');
  });

  it('读到损坏的 accounts.json 时报错指出文件路径，而不是静默重建', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    writeFileSync(store.filePath, '{ 半截 JSON');

    expect(() => store.read()).toThrow(store.filePath);
  });

  it('账号的库路径由 dbDir 拼出', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);

    expect(store.dbPathOf(registryOf().accounts[0]!)).toBe(
      join(dataDir, 'accounts', 'local-default', 'workbench.db'),
    );
  });

  it('支持保存与读取自定义头像及 GitHub 头像 URL', () => {
    const dataDir = makeDataDir();
    const store = new AccountsStore(dataDir);
    const registryWithAvatar = registryOf({
      accounts: [
        {
          id: 'local-default',
          kind: 'github',
          displayName: '本地',
          avatar: 'data:image/webp;base64,customavatar',
          dbDir: 'accounts/local-default',
          createdAt: '2026-08-19T12:00:00.000Z',
          lastUsedAt: '2026-08-19T12:00:00.000Z',
          github: {
            login: 'Ethan-Hang',
            userId: 12345,
            avatarUrl: 'https://avatars.githubusercontent.com/u/12345?v=4',
          },
        },
      ],
    });

    store.write(registryWithAvatar);
    expect(store.read()).toEqual(registryWithAvatar);
  });
});
