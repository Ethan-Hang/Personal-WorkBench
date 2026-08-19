import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountsStore,
  ConnectionHolder,
  createDatabaseClient,
  resolveActiveDatabase,
  runCoreMigrations,
  SqliteItemRepository,
} from '@workbench/data';
import { ServiceState } from '../service-state.js';
import { AccountsService } from './service.js';

const temporaryDirectories: string[] = [];

interface Harness {
  dataDir: string;
  store: AccountsStore;
  holder: ConnectionHolder;
  state: ServiceState;
  service: AccountsService;
}

function createHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'workbench-accounts-service-'));
  temporaryDirectories.push(dataDir);
  const active = resolveActiveDatabase({ dataDir });
  const holder = new ConnectionHolder();
  holder.open(active.dbPath);
  const migrate = (sqlite: Database.Database) => runCoreMigrations(createDatabaseClient(sqlite));
  migrate(holder.current());
  const store = new AccountsStore(dataDir);
  const state = new ServiceState();
  return {
    dataDir,
    store,
    holder,
    state,
    service: new AccountsService({ store, holder, state, migrate }),
  };
}

async function seedItem(holder: ConnectionHolder, title: string): Promise<void> {
  await new SqliteItemRepository(() => holder.current()).create('todo', { kind: 'task', title });
}

async function titles(holder: ConnectionHolder): Promise<string[]> {
  const items = await new SqliteItemRepository(() => holder.current()).list({});
  return items.map((item) => item.title);
}

function accountDirOf(harness: Harness, id: string): string {
  const account = harness.store.read().accounts.find((candidate) => candidate.id === id);
  if (account === undefined) throw new Error(`账号不存在：${id}`);
  return dirname(harness.store.dbPathOf(account));
}

function createAccount(harness: Harness, displayName: string): string {
  const response = harness.service.create(displayName);
  const created = response.accounts.find((account) => account.displayName === displayName);
  if (created === undefined) throw new Error('新建账号没有出现在响应里');
  return created.id;
}

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  harness.holder.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('AccountsService.list', () => {
  it('列出账号与当前账号，且不泄露 dbDir', () => {
    const response = harness.service.list();

    expect(response.activeId).toBe('local-default');
    expect(response.accounts).toHaveLength(1);
    expect(response.accounts[0]).not.toHaveProperty('dbDir');
  });
});

describe('AccountsService.create', () => {
  it('新建的本地账号只是元数据，此刻还不建库', () => {
    const id = createAccount(harness, '工作');

    expect(harness.service.list().activeId).toBe('local-default');
    expect(existsSync(accountDirOf(harness, id))).toBe(false);
  });

  it('同名账号也能建，id 不会撞车', () => {
    createAccount(harness, '工作');
    createAccount(harness, '工作');

    const ids = harness.service.list().accounts.map((account) => account.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('AccountsService.switchTo', () => {
  it('换库、跑迁移、改 activeId，两个账号的数据互不可见', async () => {
    await seedItem(harness.holder, '默认账号的事项');
    const workId = createAccount(harness, '工作');

    const response = harness.service.switchTo(workId);

    expect(response.activeId).toBe(workId);
    expect(await titles(harness.holder)).toEqual([]);

    await seedItem(harness.holder, '工作账号的事项');
    harness.service.switchTo('local-default');
    expect(await titles(harness.holder)).toEqual(['默认账号的事项']);
  });

  it('切换期间处于 switching 态，结束后回 idle', () => {
    const workId = createAccount(harness, '工作');
    const seen: string[] = [];
    const service = new AccountsService({
      store: harness.store,
      holder: harness.holder,
      state: harness.state,
      migrate: (sqlite) => {
        seen.push(harness.state.current().state);
        runCoreMigrations(createDatabaseClient(sqlite));
      },
    });

    service.switchTo(workId);

    expect(seen).toEqual(['switching']);
    expect(harness.state.current()).toEqual({ state: 'idle' });
  });

  it('切到当前账号是空操作，不换连接也不跑迁移', () => {
    let migrated = 0;
    const service = new AccountsService({
      store: harness.store,
      holder: harness.holder,
      state: harness.state,
      migrate: () => {
        migrated += 1;
      },
    });

    service.switchTo('local-default');

    expect(migrated).toBe(0);
  });

  it('切换途中失败会切回原账号，activeId 与数据都不动', async () => {
    await seedItem(harness.holder, '默认账号的事项');
    const workId = createAccount(harness, '工作');
    let shouldFail = true;
    const service = new AccountsService({
      store: harness.store,
      holder: harness.holder,
      state: harness.state,
      migrate: (sqlite) => {
        if (shouldFail) throw new Error('迁移炸了');
        runCoreMigrations(createDatabaseClient(sqlite));
      },
    });

    expect(() => service.switchTo(workId)).toThrow('迁移炸了');

    shouldFail = false;
    expect(harness.store.read().activeId).toBe('local-default');
    expect(await titles(harness.holder)).toEqual(['默认账号的事项']);
    expect(harness.state.current()).toEqual({ state: 'idle' });
  });

  it('切到不存在的账号报 404', () => {
    expect(() => harness.service.switchTo('查无此人')).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});

describe('AccountsService.remove', () => {
  it('删账号连同它的数据目录一起删', () => {
    const workId = createAccount(harness, '工作');
    harness.service.switchTo(workId);
    const accountDir = accountDirOf(harness, workId);
    expect(existsSync(accountDir)).toBe(true);
    harness.service.switchTo('local-default');

    const response = harness.service.remove(workId);

    expect(response.accounts.map((account) => account.id)).toEqual(['local-default']);
    expect(existsSync(accountDir)).toBe(false);
  });

  it('拒绝删除当前账号', () => {
    expect(() => harness.service.remove('local-default')).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });
});

describe('AccountsService.bindGithub / unbindGithub', () => {
  const github = { login: 'Ethan-Hang', userId: 12345 };

  it('绑定只写元数据，不动数据库', async () => {
    await seedItem(harness.holder, '绑定前就在的事项');

    const response = harness.service.bindGithub('local-default', github, 'local-to-cloud');

    const bound = response.accounts.find((account) => account.id === 'local-default');
    expect(bound?.kind).toBe('github');
    expect(bound?.github).toEqual(github);
    expect(await titles(harness.holder)).toEqual(['绑定前就在的事项']);
  });

  it('绑定不改账号 id 与目录', () => {
    const before = harness.store.read().accounts[0];

    harness.service.bindGithub('local-default', github, 'cloud-to-local');

    const after = harness.store.read().accounts[0];
    expect(after?.id).toBe(before?.id);
    expect(after?.dbDir).toBe(before?.dbDir);
  });

  it('同一个 GitHub 账号不能被第二个本地账号绑定', () => {
    harness.service.bindGithub('local-default', github, 'local-to-cloud');
    const workId = createAccount(harness, '工作');

    expect(() => harness.service.bindGithub(workId, github, 'local-to-cloud')).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('解绑清掉 github 字段并变回本地账号', () => {
    harness.service.bindGithub('local-default', github, 'local-to-cloud');

    const response = harness.service.unbindGithub('local-default');

    const unbound = response.accounts.find((account) => account.id === 'local-default');
    expect(unbound?.kind).toBe('local');
    expect(unbound?.github).toBeUndefined();
  });
});
