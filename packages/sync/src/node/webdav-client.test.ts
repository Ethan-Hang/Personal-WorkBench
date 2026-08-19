import { expect, it } from 'vitest';
import { SyncError, toSyncError } from './errors.js';

it('401 映射为 400 而不是 500，凭据错要能被界面区分', () => {
  const mapped = toSyncError({ status: 401 });
  expect(mapped).toBeInstanceOf(SyncError);
  expect(mapped?.statusCode).toBe(400);
  expect(mapped?.message).toMatch(/凭据/);
});

it('507 映射为 409，配额满与凭据错不能混为一谈', () => {
  expect(toSyncError({ status: 507 })?.statusCode).toBe(409);
  expect(toSyncError({ status: 507 })?.message).toMatch(/配额/);
});

it('未知错误返回 null，交给上层继续冒泡', () => {
  expect(toSyncError(new Error('socket hang up'))).toBeNull();
  expect(toSyncError({ status: 418 })).toBeNull();
});

it('remove 拒绝非备份文件名，防止误删目录里的其他东西', async () => {
  const { WebdavBackupStore } = await import('./webdav-client.js');
  const store = new WebdavBackupStore({ url: 'https://x', username: 'u', password: 'p' });
  await expect(store.remove('../../etc/passwd')).rejects.toThrow(/不是合法的备份文件名/);
  await expect(store.remove('../escape.db.gz')).rejects.toThrow(/不是合法的备份文件名/);
});
