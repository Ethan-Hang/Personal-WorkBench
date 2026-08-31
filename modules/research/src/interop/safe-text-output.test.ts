import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeTextOutputError, writeSafeTextOutput } from './safe-text-output.js';

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'research-safe-output-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('safe text output', () => {
  it('写入并重新读取完全一致的 UTF-8 内容后发布', async () => {
    const root = await temporaryRoot();
    const targetPath = join(root, '引用资料.json');
    const content = '[{"title":"研究方法"}]\n';
    const result = await writeSafeTextOutput({
      targetPath,
      content,
      overwriteConfirmed: false,
      cancelMessage: 'cancelled',
      validate: (decoded, bytes) => {
        expect(decoded).toBe(content);
        expect(bytes.length).toBe(Buffer.byteLength(content));
      },
    });
    expect(await readFile(targetPath, 'utf8')).toBe(content);
    expect(result).toMatchObject({
      targetPath,
      overwritten: false,
      bytes: Buffer.byteLength(content),
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('未确认覆盖或内容验证失败时保留旧文件并清理临时文件', async () => {
    const root = await temporaryRoot();
    const targetPath = join(root, 'library.bib');
    await writeFile(targetPath, 'old', 'utf8');
    await expect(
      writeSafeTextOutput({
        targetPath,
        content: 'new',
        overwriteConfirmed: false,
        cancelMessage: 'cancelled',
        validate: () => undefined,
      }),
    ).rejects.toMatchObject({ kind: 'conflict' } satisfies Partial<SafeTextOutputError>);
    await expect(
      writeSafeTextOutput({
        targetPath,
        content: 'new',
        overwriteConfirmed: true,
        cancelMessage: 'cancelled',
        validate: () => {
          throw new Error('invalid output');
        },
      }),
    ).rejects.toThrow('invalid output');
    expect(await readFile(targetPath, 'utf8')).toBe('old');
    expect(await readdir(root)).toEqual(['library.bib']);
  });

  it('旧文件备份后收到取消也会恢复旧文件', async () => {
    const root = await temporaryRoot();
    const targetPath = join(root, 'library.ris');
    await writeFile(targetPath, 'old', 'utf8');
    let checks = 0;
    const signal = {
      get aborted() {
        checks += 1;
        return checks >= 5;
      },
    } as AbortSignal;
    await expect(
      writeSafeTextOutput({
        targetPath,
        content: 'new',
        overwriteConfirmed: true,
        signal,
        cancelMessage: 'cancelled',
        validate: () => undefined,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readFile(targetPath, 'utf8')).toBe('old');
    expect(await readdir(root)).toEqual(['library.ris']);
  });
});
