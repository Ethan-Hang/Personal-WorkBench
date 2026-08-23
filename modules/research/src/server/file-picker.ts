import { execFile, type ExecFileException } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { platform as currentPlatform } from 'node:os';
import { resolve } from 'node:path';

export type FilePickerPlatform = 'darwin' | 'win32' | 'linux' | string;

export interface PickPdfOptions {
  initialDir?: string;
  multiple?: boolean;
}

export interface PdfFilePicker {
  pick(options?: PickPdfOptions): Promise<string[]>;
}

export type FilePickerExec = (
  file: string,
  args: readonly string[],
  options: { timeout: number; encoding: 'utf8' },
  callback: (error: ExecFileException | null, stdout: string) => void,
) => void;

function usableInitialDir(value: string | undefined): string {
  if (!value) return '';
  try {
    const absolute = resolve(value);
    return existsSync(absolute) && statSync(absolute).isDirectory() ? absolute : '';
  } catch {
    return '';
  }
}

function splitOutput(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function run(
  execute: FilePickerExec,
  command: string,
  args: readonly string[],
): Promise<string[] | null> {
  return new Promise((resolvePromise) => {
    execute(command, args, { timeout: 180_000, encoding: 'utf8' }, (error, stdout) => {
      resolvePromise(error ? null : splitOutput(stdout));
    });
  });
}

export function createSystemPdfFilePicker(
  platform: FilePickerPlatform = currentPlatform(),
  execute: FilePickerExec = execFile as FilePickerExec,
): PdfFilePicker {
  return {
    async pick(options = {}) {
      const initialDir = usableInitialDir(options.initialDir);
      const multiple = options.multiple ?? false;

      if (platform === 'darwin') {
        const defaultLocation = initialDir
          ? ` default location POSIX file "${initialDir.replace(/"/g, '\\"')}"`
          : '';
        const choose = `choose file with prompt "选择 PDF" of type {"com.adobe.pdf"}${defaultLocation} with multiple selections allowed ${multiple ? 'true' : 'false'}`;
        const script = multiple
          ? `set picked to ${choose}\nset output to ""\nrepeat with itemPath in picked\nset output to output & POSIX path of itemPath & linefeed\nend repeat\nreturn output`
          : `POSIX path of (${choose})`;
        return (await run(execute, 'osascript', ['-e', script])) ?? [];
      }

      if (platform === 'win32') {
        const escapedDir = initialDir.replace(/'/g, "''");
        const script = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择 PDF'
$dialog.Filter = 'PDF 文件 (*.pdf)|*.pdf|所有文件 (*.*)|*.*'
$dialog.Multiselect = $${multiple ? 'true' : 'false'}
if ('${escapedDir}' -ne '') { $dialog.InitialDirectory = '${escapedDir}' }
$dialog.RestoreDirectory = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $dialog.FileNames | ForEach-Object { [Console]::WriteLine($_) }
}
`.trim();
        return (await run(execute, 'powershell', ['-NoProfile', '-STA', '-Command', script])) ?? [];
      }

      if (platform === 'linux') {
        const zenityArgs = [
          '--file-selection',
          '--title=选择 PDF',
          '--file-filter=PDF 文件 | *.pdf',
          '--file-filter=所有文件 | *',
        ];
        if (initialDir) zenityArgs.push(`--filename=${initialDir}/`);
        if (multiple) zenityArgs.push('--multiple', '--separator=\n');
        const zenity = await run(execute, 'zenity', zenityArgs);
        if (zenity !== null) return zenity;

        const kdialogArgs = ['--getopenfilename', initialDir || '.', '*.pdf|PDF 文件\n*|所有文件'];
        if (multiple) kdialogArgs.push('--multiple', '--separate-output');
        return (await run(execute, 'kdialog', kdialogArgs)) ?? [];
      }

      return [];
    },
  };
}

export const systemPdfFilePicker = createSystemPdfFilePicker();
