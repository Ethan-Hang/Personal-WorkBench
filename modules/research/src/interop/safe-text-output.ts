import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export class SafeTextOutputError extends Error {
  constructor(
    readonly kind: 'invalid' | 'conflict' | 'validation',
    message: string,
  ) {
    super(message);
    this.name = 'SafeTextOutputError';
  }
}

export function abortTextOutput(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new DOMException(message, 'AbortError');
}

export async function textOutputExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface SafeTextOutputResult {
  targetPath: string;
  bytes: number;
  sha256: string;
  overwritten: boolean;
}

export async function writeSafeTextOutput(input: {
  targetPath: string;
  content: string;
  overwriteConfirmed: boolean;
  signal?: AbortSignal;
  cancelMessage: string;
  validate: (content: string, bytes: Uint8Array) => void | Promise<void>;
}): Promise<SafeTextOutputResult> {
  const targetPath = resolve(input.targetPath);
  abortTextOutput(input.signal, input.cancelMessage);
  await mkdir(dirname(targetPath), { recursive: true });
  const targetExists = await textOutputExists(targetPath);
  if (targetExists) {
    const targetStat = await lstat(targetPath);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new SafeTextOutputError('invalid', '导出目标必须是普通文件');
    }
    if (!input.overwriteConfirmed) {
      throw new SafeTextOutputError('conflict', '导出目标已存在，需要确认覆盖');
    }
  }

  const token = randomUUID();
  const temporary = `${dirname(targetPath)}/.${basename(targetPath)}.tmp-${token}`;
  const backup = `${dirname(targetPath)}/.${basename(targetPath)}.backup-${token}`;
  let backupCreated = false;
  try {
    abortTextOutput(input.signal, input.cancelMessage);
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(input.content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    abortTextOutput(input.signal, input.cancelMessage);
    const output = await readFile(temporary);
    const decoded = output.toString('utf8');
    if (decoded !== input.content) {
      throw new SafeTextOutputError('validation', '导出文件 UTF-8 写入校验失败');
    }
    await input.validate(decoded, output);

    abortTextOutput(input.signal, input.cancelMessage);
    if (targetExists) {
      await rename(targetPath, backup);
      backupCreated = true;
    }
    abortTextOutput(input.signal, input.cancelMessage);
    await rename(temporary, targetPath);
    if (backupCreated) {
      await rm(backup, { force: true });
      backupCreated = false;
    }
    return {
      targetPath,
      bytes: output.length,
      sha256: createHash('sha256').update(output).digest('hex'),
      overwritten: targetExists,
    };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (backupCreated) {
      if (await textOutputExists(targetPath)) await rm(targetPath, { force: true });
      await rename(backup, targetPath).catch(() => undefined);
    }
    throw error;
  }
}
