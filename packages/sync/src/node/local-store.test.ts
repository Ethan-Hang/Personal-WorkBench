import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BackupMeta } from '../contract.js';
import { LocalBackupStore } from './local-store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-local-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const NAME_A = '2026-08-19T14-02-11-000Z.db.gz';
const NAME_B = '2026-08-20T09-30-00-000Z.db.gz';

function meta(overrides: Partial<BackupMeta> = {}): BackupMeta {
  return {
    v: 1,
    createdAt: '2026-08-19T14:02:11.000Z',
    accountId: 'local-default',
    device: 'test-device',
    appVersion: '0.0.0',
    migrations: { __drizzle_migrations: 1 },
    counts: { items: 3 },
    bytes: 4,
    sha256: 'deadbeef',
    ...overrides,
  };
}

it('upload 后 download 字节往返一致', async () => {
  const store = new LocalBackupStore(dir);
  const gz = Buffer.from([1, 2, 3, 4]);

  await store.upload(NAME_A, gz, meta());

  expect(await store.download(NAME_A)).toEqual(gz);
});

it('list 在备份目录尚不存在时返回空数组，而不是抛错', async () => {
  const store = new LocalBackupStore(join(dir, 'not-created-yet'));

  expect(await store.list()).toEqual([]);
});

it('有 .db.gz 却没有 meta 的是孤儿：complete 为 false 且 meta 为 null', async () => {
  const store = new LocalBackupStore(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, NAME_A), Buffer.from([1, 2, 3, 4]));

  expect(await store.list()).toEqual([{ name: NAME_A, complete: false, meta: null }]);
});

it('meta 不是合法 JSON 时报为不完整，而不是让整个 list 崩掉', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), meta());
  writeFileSync(join(dir, `${NAME_A}.meta.json`), '{ 这不是 JSON');

  expect(await store.list()).toEqual([{ name: NAME_A, complete: false, meta: null }]);
});

it('meta 不符合 schema 时报为不完整', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), meta());
  writeFileSync(join(dir, `${NAME_A}.meta.json`), JSON.stringify({ v: 1 }));

  expect(await store.list()).toEqual([{ name: NAME_A, complete: false, meta: null }]);
});

it('list 按名字倒序，最新的备份排在最前', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1]), meta());
  await store.upload(NAME_B, Buffer.from([2]), meta({ createdAt: '2026-08-20T09:30:00.000Z' }));

  expect((await store.list()).map((item) => item.name)).toEqual([NAME_B, NAME_A]);
});

it('list 忽略目录里的无关文件', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1]), meta());
  writeFileSync(join(dir, 'README.txt'), 'hi');

  expect((await store.list()).map((item) => item.name)).toEqual([NAME_A]);
});

it('upload 拒绝覆盖已存在的备份，时间戳撞名不得静默吞掉旧数据', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), meta());

  await expect(store.upload(NAME_A, Buffer.from([9]), meta())).rejects.toThrow(/已存在/);
  expect(await store.download(NAME_A)).toEqual(Buffer.from([1, 2, 3, 4]));
});

it('remove 先删 meta：只删掉 meta 的中间态表现为孤儿，而不是可恢复的假象', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), meta());

  rmSync(join(dir, `${NAME_A}.meta.json`));

  expect(await store.list()).toEqual([{ name: NAME_A, complete: false, meta: null }]);
});

it('remove 删掉数据与 meta 两个文件', async () => {
  const store = new LocalBackupStore(dir);
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), meta());

  await store.remove(NAME_A);

  expect(await store.list()).toEqual([]);
});

it('remove 一个不存在的备份不抛错，清理要幂等', async () => {
  const store = new LocalBackupStore(dir);

  await expect(store.remove(NAME_A)).resolves.toBeUndefined();
});

it('download 一个不存在的备份报 404，而不是落到统一错误出口变成 500', async () => {
  const store = new LocalBackupStore(dir);

  await expect(store.download(NAME_A)).rejects.toMatchObject({ statusCode: 404 });
});

it.each(['../../etc/passwd', '../escape.db.gz', 'nope.txt', '2026-08-19T14-02-11-000Z.db'])(
  'remove 拒绝非法备份文件名 %s，防止误删目录里的其他东西',
  async (bad) => {
    const store = new LocalBackupStore(dir);
    await expect(store.remove(bad)).rejects.toThrow(/不是合法的备份文件名/);
  },
);

it('download 拒绝非法备份文件名，防止读出备份目录以外的文件', async () => {
  const store = new LocalBackupStore(dir);
  await expect(store.download('../../etc/passwd')).rejects.toThrow(/不是合法的备份文件名/);
});

it('upload 拒绝非法备份文件名，防止写到备份目录以外', async () => {
  const store = new LocalBackupStore(dir);
  await expect(store.upload('../escape.db.gz', Buffer.from([1]), meta())).rejects.toThrow(
    /不是合法的备份文件名/,
  );
});

it('meta 原样落盘，list 读回的内容与写入时相等', async () => {
  const store = new LocalBackupStore(dir);
  const written = meta();
  await store.upload(NAME_A, Buffer.from([1, 2, 3, 4]), written);

  expect(await store.list()).toEqual([{ name: NAME_A, complete: true, meta: written }]);
  expect(JSON.parse(readFileSync(join(dir, `${NAME_A}.meta.json`), 'utf8'))).toEqual(written);
});
