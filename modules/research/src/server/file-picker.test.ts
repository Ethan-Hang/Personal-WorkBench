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

  it('macOS 保存选择器返回单个 PDF 路径并可在 Finder 中显示', async () => {
    const fake = fakeExec([{ stdout: '/Users/me/annotated.pdf\n' }, { stdout: '' }]);
    const picker = createSystemPdfFilePicker('darwin', fake.execute);
    await expect(picker.savePdf({ suggestedName: 'paper-annotated.pdf' })).resolves.toBe(
      '/Users/me/annotated.pdf',
    );
    await expect(picker.reveal('/Users/me/annotated.pdf')).resolves.toBe(true);
    expect(fake.calls[0]?.args.join(' ')).toContain('choose file name');
    expect(fake.calls[1]).toEqual({ command: 'open', args: ['-R', '/Users/me/annotated.pdf'] });
  });

  it('Windows 保存选择器启用覆盖确认并使用 Explorer 定位文件', async () => {
    const fake = fakeExec([{ stdout: 'C:\\Exports\\annotated.pdf\r\n' }, { stdout: '' }]);
    const picker = createSystemPdfFilePicker('win32', fake.execute);
    await expect(picker.savePdf({ suggestedName: 'paper:annotated?.pdf' })).resolves.toBe(
      'C:\\Exports\\annotated.pdf',
    );
    await expect(picker.reveal('C:\\Exports\\annotated.pdf')).resolves.toBe(true);
    expect(fake.calls[0]?.args.join(' ')).toContain('$dialog.OverwritePrompt = $true');
    expect(fake.calls[0]?.args.join(' ')).toContain('$dialog.AddExtension = $true');
    expect(fake.calls[0]?.args.join(' ')).toContain("$dialog.FileName = 'paper-annotated-.pdf'");
    expect(fake.calls[1]?.command).toBe('explorer.exe');
  });

  it('macOS 文档选择器补齐扩展名并只选择 canonical JSON', async () => {
    const fake = fakeExec([
      { stdout: '/Users/me/Research draft.md\n' },
      { stdout: '/Users/me/library.json\n' },
    ]);
    const picker = createSystemPdfFilePicker('darwin', fake.execute);
    await expect(
      picker.saveDocument({ suggestedName: 'Research draft', format: 'markdown' }),
    ).resolves.toBe('/Users/me/Research draft.md');
    await expect(picker.pickDocument({ format: 'json' })).resolves.toBe('/Users/me/library.json');
    expect(fake.calls[0]?.args.join(' ')).toContain('default name "Research draft.md"');
    expect(fake.calls[1]?.args.join(' ')).toContain('public.json');
  });

  it('Windows 文档选择器使用对应过滤器、扩展名和单选 JSON', async () => {
    const fake = fakeExec([
      { stdout: 'C:\\Exports\\matrix.csv\r\n' },
      { stdout: 'C:\\Bundle\\library.json\r\n' },
    ]);
    const picker = createSystemPdfFilePicker('win32', fake.execute);
    await expect(picker.saveDocument({ suggestedName: 'matrix', format: 'csv' })).resolves.toBe(
      'C:\\Exports\\matrix.csv',
    );
    await expect(picker.pickDocument({ format: 'json' })).resolves.toBe('C:\\Bundle\\library.json');
    expect(fake.calls[0]?.args.join(' ')).toContain("$dialog.DefaultExt = 'csv'");
    expect(fake.calls[0]?.args.join(' ')).toContain("$dialog.FileName = 'matrix.csv'");
    expect(fake.calls[1]?.args.join(' ')).toContain('$dialog.Multiselect = $false');
    expect(fake.calls[1]?.args.join(' ')).toContain('*.json');
  });

  it('三平台文献记录保存选择器使用固定扩展名与覆盖确认', async () => {
    const mac = fakeExec([{ stdout: '/Users/me/library.bib\n' }]);
    await expect(
      createSystemPdfFilePicker('darwin', mac.execute).saveInterop({
        suggestedName: 'library',
        format: 'bibtex',
      }),
    ).resolves.toBe('/Users/me/library.bib');
    expect(mac.calls[0]?.args.join(' ')).toContain('default name "library.bib"');

    const windows = fakeExec([{ stdout: 'C:\\Exports\\library.ris\r\n' }]);
    await expect(
      createSystemPdfFilePicker('win32', windows.execute).saveInterop({
        suggestedName: 'library',
        format: 'ris',
      }),
    ).resolves.toBe('C:\\Exports\\library.ris');
    expect(windows.calls[0]?.args.join(' ')).toContain("$dialog.DefaultExt = 'ris'");
    expect(windows.calls[0]?.args.join(' ')).toContain('$dialog.OverwritePrompt = $true');

    const linux = fakeExec([{ stdout: '/exports/library.json\n' }]);
    await expect(
      createSystemPdfFilePicker('linux', linux.execute).saveInterop({
        suggestedName: 'library',
        format: 'csl-json',
      }),
    ).resolves.toBe('/exports/library.json');
    expect(linux.calls[0]).toMatchObject({ command: 'zenity' });
    expect(linux.calls[0]?.args).toContain('--confirm-overwrite');
  });
});
