import type { ExecFileException } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createSystemPdfFilePicker, type FilePickerExec } from './file-picker.js';

interface Call {
  command: string;
  args: readonly string[];
}

function fakeExec(outputs: Array<{ error?: string; stdout?: string }>): {
  execute: FilePickerExec;
  calls: Call[];
} {
  const calls: Call[] = [];
  const execute: FilePickerExec = (command, args, _options, callback) => {
    calls.push({ command, args });
    const output = outputs.shift() ?? {};
    const error = output.error
      ? (Object.assign(new Error(output.error), { code: 1 }) as ExecFileException)
      : null;
    callback(error, output.stdout ?? '');
  };
  return { execute, calls };
}

describe('PDF 系统文件选择器', () => {
  it('macOS 多选返回逐行绝对路径', async () => {
    const fake = fakeExec([{ stdout: '/Users/me/A.pdf\n/Users/me/B.pdf\n' }]);
    const picker = createSystemPdfFilePicker('darwin', fake.execute);

    await expect(picker.pick({ multiple: true })).resolves.toEqual([
      '/Users/me/A.pdf',
      '/Users/me/B.pdf',
    ]);
    expect(fake.calls[0]).toMatchObject({ command: 'osascript' });
    expect(fake.calls[0]?.args.join(' ')).toContain('multiple selections allowed true');
    expect(fake.calls[0]?.args.join(' ')).toContain('com.adobe.pdf');
  });

  it('Windows 使用 STA OpenFileDialog 并输出 FileNames', async () => {
    const fake = fakeExec([{ stdout: 'C:\\Papers\\A.pdf\r\nD:\\B.pdf\r\n' }]);
    const picker = createSystemPdfFilePicker('win32', fake.execute);

    await expect(picker.pick({ multiple: true })).resolves.toEqual([
      'C:\\Papers\\A.pdf',
      'D:\\B.pdf',
    ]);
    expect(fake.calls[0]).toMatchObject({ command: 'powershell' });
    expect(fake.calls[0]?.args).toEqual(expect.arrayContaining(['-NoProfile', '-STA', '-Command']));
    expect(fake.calls[0]?.args.join(' ')).toContain('$dialog.Multiselect = $true');
  });

  it('Linux 在 zenity 不可用时回退 kdialog', async () => {
    const fake = fakeExec([{ error: 'ENOENT' }, { stdout: '/papers/a.pdf\n' }]);
    const picker = createSystemPdfFilePicker('linux', fake.execute);

    await expect(picker.pick()).resolves.toEqual(['/papers/a.pdf']);
    expect(fake.calls.map((call) => call.command)).toEqual(['zenity', 'kdialog']);
  });

  it('用户取消或平台不支持时返回空数组', async () => {
    const cancelled = fakeExec([{ error: 'cancelled' }]);
    await expect(createSystemPdfFilePicker('darwin', cancelled.execute).pick()).resolves.toEqual(
      [],
    );
    await expect(createSystemPdfFilePicker('freebsd', cancelled.execute).pick()).resolves.toEqual(
      [],
    );
  });
});
