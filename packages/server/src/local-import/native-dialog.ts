import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

export type ExecFileFn = typeof execFile;

/**
 * 唤起本地操作系统原生的文件选择对话框（TASK-046 / TASK-048 体验增强）。
 *
 * 默认打开目录设置为程序保存本地备份的实际目录（`initialDir`）。
 * 若用户取消或环境不支持（无头环境/远程），安全返回 `null`，由前端无缝退化至网页文件选择器。
 */
export async function openNativeFileDialog(
  initialDir?: string,
  execFn: ExecFileFn = execFile,
): Promise<string | null> {
  const osPlatform = platform();

  let targetDir = '';
  if (initialDir) {
    try {
      const abs = resolve(initialDir);
      if (!existsSync(abs)) {
        mkdirSync(abs, { recursive: true });
      }
      targetDir = abs;
    } catch {
      targetDir = initialDir;
    }
  }

  if (osPlatform === 'win32') {
    return new Promise((resolvePromise) => {
      const escapedDir = targetDir.replace(/'/g, "''");
      const psScript = `
[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
$f = New-Object System.Windows.Forms.OpenFileDialog
$f.Title = '选择本地备份文件'
$f.Filter = 'SQLite 备份文件 (*.db.gz;*.db)|*.db.gz;*.db|所有文件 (*.*)|*.*'
if ('${escapedDir}' -ne '') {
    $f.InitialDirectory = '${escapedDir}'
}
$f.Multiselect = $false
$f.RestoreDirectory = $false
$f.ShowHelp = $false
$result = $f.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($f.FileName)
}
`.trim();

      execFn(
        'powershell',
        ['-NoProfile', '-STA', '-Command', psScript],
        { timeout: 180000, encoding: 'utf8' } as Parameters<typeof execFn>[2],
        (err, stdout) => {
          if (err) {
            resolvePromise(null);
            return;
          }
          const picked = typeof stdout === 'string' ? stdout.trim() : '';
          resolvePromise(picked === '' ? null : picked);
        },
      );
    });
  }

  if (osPlatform === 'darwin') {
    return new Promise((resolvePromise) => {
      const defaultLoc =
        targetDir !== '' ? `default location POSIX file "${targetDir.replace(/"/g, '\\"')}"` : '';
      const script = `POSIX path of (choose file with prompt "选择本地备份文件" ${defaultLoc})`;

      execFn(
        'osascript',
        ['-e', script],
        { timeout: 180000, encoding: 'utf8' } as Parameters<typeof execFn>[2],
        (err, stdout) => {
          if (err) {
            resolvePromise(null);
            return;
          }
          const picked = typeof stdout === 'string' ? stdout.trim() : '';
          resolvePromise(picked === '' ? null : picked);
        },
      );
    });
  }

  if (osPlatform === 'linux') {
    return new Promise((resolvePromise) => {
      const dirArg = targetDir !== '' ? `--filename=${targetDir}/` : '';

      execFn(
        'zenity',
        [
          '--file-selection',
          '--title=选择本地备份文件',
          dirArg,
          '--file-filter=SQLite 备份 (*.db.gz *.db) | *.db.gz *.db',
          '--file-filter=所有文件 | *',
        ],
        { timeout: 180000, encoding: 'utf8' } as Parameters<typeof execFn>[2],
        (err, stdout) => {
          if (!err && typeof stdout === 'string' && stdout.trim() !== '') {
            resolvePromise(stdout.trim());
            return;
          }
          // Fallback to kdialog if available
          execFn(
            'kdialog',
            [
              '--getopenfilename',
              targetDir !== '' ? targetDir : '.',
              '*.db.gz *.db|SQLite 备份文件\n*|所有文件',
            ],
            { timeout: 180000, encoding: 'utf8' } as Parameters<typeof execFn>[2],
            (kErr, kStdout) => {
              if (kErr) {
                resolvePromise(null);
                return;
              }
              const picked = typeof kStdout === 'string' ? kStdout.trim() : '';
              resolvePromise(picked === '' ? null : picked);
            },
          );
        },
      );
    });
  }

  return null;
}
