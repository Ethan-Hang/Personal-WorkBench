import { describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { openNativeFileDialog, type ExecFileFn } from './native-dialog.js';

describe('openNativeFileDialog', () => {
  it('当执行成功并返回文件路径时，能正确返回该路径', async () => {
    const mockExec: ExecFileFn = ((
      _file: string,
      _args: readonly string[] | null | undefined,
      _options: unknown,
      callback?: unknown,
    ) => {
      const cb = (typeof _options === 'function' ? _options : callback) as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, 'D:\\backups\\2026-08-20.db.gz\r\n', '');
      return {} as ChildProcess;
    }) as unknown as ExecFileFn;

    const res = await openNativeFileDialog('D:\\backups', mockExec);
    expect(res).toBe('D:\\backups\\2026-08-20.db.gz');
  });

  it('当用户取消对话框时（输出为空），返回 null', async () => {
    const mockExec: ExecFileFn = ((
      _file: string,
      _args: readonly string[] | null | undefined,
      _options: unknown,
      callback?: unknown,
    ) => {
      const cb = (typeof _options === 'function' ? _options : callback) as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, '', '');
      return {} as ChildProcess;
    }) as unknown as ExecFileFn;

    const res = await openNativeFileDialog('D:\\backups', mockExec);
    expect(res).toBeNull();
  });

  it('当进程执行报错时，安全捕获并返回 null', async () => {
    const mockExec: ExecFileFn = ((
      _file: string,
      _args: readonly string[] | null | undefined,
      _options: unknown,
      callback?: unknown,
    ) => {
      const cb = (typeof _options === 'function' ? _options : callback) as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(new Error('Spawn failed'), '', 'Error');
      return {} as ChildProcess;
    }) as unknown as ExecFileFn;

    const res = await openNativeFileDialog('D:\\backups', mockExec);
    expect(res).toBeNull();
  });
});
