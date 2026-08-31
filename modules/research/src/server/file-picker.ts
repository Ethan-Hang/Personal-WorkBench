import { execFile, type ExecFileException } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { platform as currentPlatform } from 'node:os';
import { dirname, resolve } from 'node:path';

export type FilePickerPlatform = 'darwin' | 'win32' | 'linux' | string;

export interface PickPdfOptions {
  initialDir?: string;
  multiple?: boolean;
}

export interface PdfFilePicker {
  pick(options?: PickPdfOptions): Promise<string[]>;
}

export interface SavePdfOptions {
  initialDir?: string;
  suggestedName: string;
}

export interface PdfOutputDialog {
  savePdf(options: SavePdfOptions): Promise<string | null>;
  reveal(filePath: string): Promise<boolean>;
}

export type DocumentFormat = 'markdown' | 'csv' | 'json';

export interface SaveDocumentOptions {
  initialDir?: string;
  suggestedName: string;
  format: DocumentFormat;
}

export interface DocumentFileDialog {
  saveDocument(options: SaveDocumentOptions): Promise<string | null>;
  pickDocument(options: { initialDir?: string; format: 'json' }): Promise<string | null>;
}

export interface InteropSourcePicker {
  pickInteropSource(options?: {
    initialDir?: string;
    format?: 'bibtex' | 'ris' | 'csl-json';
  }): Promise<string | null>;
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

function safeSuggestedName(value: string, fallback = 'annotated.pdf'): string {
  const invalid = '<>:"/\\|?*';
  return (
    Array.from(value, (character) =>
      character.charCodeAt(0) < 32 || invalid.includes(character) ? '-' : character,
    )
      .join('')
      .replace(/[. ]+$/g, '')
      .trim() || fallback
  );
}

const documentFormat = {
  markdown: { extension: 'md', label: 'Markdown 文件', pattern: '*.md' },
  csv: { extension: 'csv', label: 'CSV 文件', pattern: '*.csv' },
  json: { extension: 'json', label: 'JSON 文件', pattern: '*.json' },
} as const;

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
): PdfFilePicker & PdfOutputDialog & DocumentFileDialog & InteropSourcePicker {
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

    async savePdf(options) {
      const initialDir = usableInitialDir(options.initialDir);
      const suggestedName = safeSuggestedName(options.suggestedName);

      if (platform === 'darwin') {
        const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const defaultLocation = initialDir
          ? ` default location POSIX file "${escape(initialDir)}"`
          : '';
        const script = `POSIX path of (choose file name with prompt "导出带批注 PDF 副本" default name "${escape(suggestedName)}"${defaultLocation})`;
        return (await run(execute, 'osascript', ['-e', script]))?.[0] ?? null;
      }

      if (platform === 'win32') {
        const escapedDir = initialDir.replace(/'/g, "''");
        const escapedName = suggestedName.replace(/'/g, "''");
        const script = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = '导出带批注 PDF 副本'
$dialog.Filter = 'PDF 文件 (*.pdf)|*.pdf'
$dialog.FileName = '${escapedName}'
$dialog.AddExtension = $true
$dialog.DefaultExt = 'pdf'
$dialog.OverwritePrompt = $true
if ('${escapedDir}' -ne '') { $dialog.InitialDirectory = '${escapedDir}' }
$dialog.RestoreDirectory = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::WriteLine($dialog.FileName)
}
`.trim();
        return (
          (await run(execute, 'powershell', ['-NoProfile', '-STA', '-Command', script]))?.[0] ??
          null
        );
      }

      if (platform === 'linux') {
        const initialPath = initialDir ? resolve(initialDir, suggestedName) : suggestedName;
        const zenity = await run(execute, 'zenity', [
          '--file-selection',
          '--save',
          '--confirm-overwrite',
          '--title=导出带批注 PDF 副本',
          '--file-filter=PDF 文件 | *.pdf',
          `--filename=${initialPath}`,
        ]);
        if (zenity !== null) return zenity[0] ?? null;
        return (
          (
            await run(execute, 'kdialog', ['--getsavefilename', initialPath, '*.pdf|PDF 文件'])
          )?.[0] ?? null
        );
      }

      return null;
    },

    async saveDocument(options) {
      const initialDir = usableInitialDir(options.initialDir);
      const format = documentFormat[options.format];
      const sanitizedName = safeSuggestedName(
        options.suggestedName,
        `research-export.${format.extension}`,
      );
      const suggestedName = sanitizedName.toLocaleLowerCase().endsWith(`.${format.extension}`)
        ? sanitizedName
        : `${sanitizedName}.${format.extension}`;

      if (platform === 'darwin') {
        const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const defaultLocation = initialDir
          ? ` default location POSIX file "${escape(initialDir)}"`
          : '';
        const script = `POSIX path of (choose file name with prompt "导出研究内容" default name "${escape(suggestedName)}"${defaultLocation})`;
        return (await run(execute, 'osascript', ['-e', script]))?.[0] ?? null;
      }

      if (platform === 'win32') {
        const escapedDir = initialDir.replace(/'/g, "''");
        const escapedName = suggestedName.replace(/'/g, "''");
        const script = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = '导出研究内容'
$dialog.Filter = '${format.label} (${format.pattern})|${format.pattern}'
$dialog.FileName = '${escapedName}'
$dialog.AddExtension = $true
$dialog.DefaultExt = '${format.extension}'
$dialog.OverwritePrompt = $true
if ('${escapedDir}' -ne '') { $dialog.InitialDirectory = '${escapedDir}' }
$dialog.RestoreDirectory = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::WriteLine($dialog.FileName)
}
`.trim();
        return (
          (await run(execute, 'powershell', ['-NoProfile', '-STA', '-Command', script]))?.[0] ??
          null
        );
      }

      if (platform === 'linux') {
        const initialPath = initialDir ? resolve(initialDir, suggestedName) : suggestedName;
        const zenity = await run(execute, 'zenity', [
          '--file-selection',
          '--save',
          '--confirm-overwrite',
          '--title=导出研究内容',
          `--file-filter=${format.label} | ${format.pattern}`,
          `--filename=${initialPath}`,
        ]);
        if (zenity !== null) return zenity[0] ?? null;
        return (
          (
            await run(execute, 'kdialog', [
              '--getsavefilename',
              initialPath,
              `${format.pattern}|${format.label}`,
            ])
          )?.[0] ?? null
        );
      }
      return null;
    },

    async pickDocument(options) {
      const initialDir = usableInitialDir(options.initialDir);
      const format = documentFormat[options.format];
      if (platform === 'darwin') {
        const defaultLocation = initialDir
          ? ` default location POSIX file "${initialDir.replace(/"/g, '\\"')}"`
          : '';
        const script = `POSIX path of (choose file with prompt "选择规范 JSON" of type {"public.json"}${defaultLocation})`;
        return (await run(execute, 'osascript', ['-e', script]))?.[0] ?? null;
      }
      if (platform === 'win32') {
        const escapedDir = initialDir.replace(/'/g, "''");
        const script = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择规范 JSON'
$dialog.Filter = '${format.label} (${format.pattern})|${format.pattern}'
$dialog.Multiselect = $false
if ('${escapedDir}' -ne '') { $dialog.InitialDirectory = '${escapedDir}' }
$dialog.RestoreDirectory = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::WriteLine($dialog.FileName)
}
`.trim();
        return (
          (await run(execute, 'powershell', ['-NoProfile', '-STA', '-Command', script]))?.[0] ??
          null
        );
      }
      if (platform === 'linux') {
        const zenityArgs = [
          '--file-selection',
          '--title=选择规范 JSON',
          `--file-filter=${format.label} | ${format.pattern}`,
        ];
        if (initialDir) zenityArgs.push(`--filename=${initialDir}/`);
        const zenity = await run(execute, 'zenity', zenityArgs);
        if (zenity !== null) return zenity[0] ?? null;
        return (
          (
            await run(execute, 'kdialog', [
              '--getopenfilename',
              initialDir || '.',
              `${format.pattern}|${format.label}`,
            ])
          )?.[0] ?? null
        );
      }
      return null;
    },

    async pickInteropSource(options = {}) {
      const initialDir = usableInitialDir(options.initialDir);
      const extension =
        options.format === 'ris' ? 'ris' : options.format === 'csl-json' ? 'json' : 'bib';
      const label =
        options.format === 'ris'
          ? 'RIS 文件'
          : options.format === 'csl-json'
            ? 'CSL JSON 文件'
            : options.format === 'bibtex'
              ? 'BibTeX 文件'
              : '文献交换文件';
      const pattern = options.format ? `*.${extension}` : '*.bib;*.bibtex;*.ris;*.json';
      if (platform === 'darwin') {
        const defaultLocation = initialDir
          ? ` default location POSIX file "${initialDir.replace(/"/g, '\\"')}"`
          : '';
        const types =
          options.format === 'ris'
            ? '{"ris"}'
            : options.format === 'csl-json'
              ? '{"public.json"}'
              : options.format === 'bibtex'
                ? '{"bib", "bibtex"}'
                : '{"bib", "bibtex", "ris", "public.json"}';
        const script = `POSIX path of (choose file with prompt "选择文献交换文件" of type ${types}${defaultLocation})`;
        return (await run(execute, 'osascript', ['-e', script]))?.[0] ?? null;
      }
      if (platform === 'win32') {
        const escapedDir = initialDir.replace(/'/g, "''");
        const script = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择文献交换文件'
$dialog.Filter = '${label} (${pattern})|${pattern}|所有文件 (*.*)|*.*'
$dialog.Multiselect = $false
if ('${escapedDir}' -ne '') { $dialog.InitialDirectory = '${escapedDir}' }
$dialog.RestoreDirectory = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::WriteLine($dialog.FileName)
}
`.trim();
        return (
          (await run(execute, 'powershell', ['-NoProfile', '-STA', '-Command', script]))?.[0] ??
          null
        );
      }
      if (platform === 'linux') {
        const zenityArgs = [
          '--file-selection',
          '--title=选择文献交换文件',
          `--file-filter=${label} | ${pattern.replaceAll(';', ' ')}`,
        ];
        if (initialDir) zenityArgs.push(`--filename=${initialDir}/`);
        const zenity = await run(execute, 'zenity', zenityArgs);
        if (zenity !== null) return zenity[0] ?? null;
        return (
          (
            await run(execute, 'kdialog', [
              '--getopenfilename',
              initialDir || '.',
              `${pattern.replaceAll(';', ' ')}|${label}`,
            ])
          )?.[0] ?? null
        );
      }
      return null;
    },

    async reveal(filePath) {
      const absolute = resolve(filePath);
      if (platform === 'darwin') return (await run(execute, 'open', ['-R', absolute])) !== null;
      if (platform === 'win32') {
        return (await run(execute, 'explorer.exe', [`/select,${absolute}`])) !== null;
      }
      if (platform === 'linux') {
        return (await run(execute, 'xdg-open', [dirname(absolute)])) !== null;
      }
      return false;
    },
  };
}

export const systemPdfFilePicker = createSystemPdfFilePicker();
