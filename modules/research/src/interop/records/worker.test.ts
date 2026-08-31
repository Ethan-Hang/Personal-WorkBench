import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function runWorker(workerData: Record<string, unknown>) {
  const messages: unknown[] = [];
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData });
  worker.on('message', (message) => messages.push(message));
  await new Promise<void>((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
  return messages;
}

describe('interop parser worker', () => {
  it('按批返回映射结果和可恢复 checkpoint', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'research-interop-worker-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'library.ris');
    await writeFile(
      sourcePath,
      'TY  - JOUR\r\nID  - first\r\nTI  - First\r\nER  - \r\nTY  - JOUR\r\nID  - second\r\nTI  - Second\r\nER  - \r\n',
      'utf8',
    );
    const messages = await runWorker({ sourcePath, format: 'ris', batchSize: 1 });

    expect(messages).toEqual([
      expect.objectContaining({ type: 'batch', totalCount: 2, checkpointOrdinal: 1 }),
      expect.objectContaining({ type: 'batch', totalCount: 2, checkpointOrdinal: 2 }),
      { type: 'completed', totalCount: 2 },
    ]);
    expect(messages[0]).toMatchObject({
      records: [expect.objectContaining({ sourceKey: 'first', status: 'valid' })],
    });
  });

  it('无效 UTF-8 返回稳定错误码', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'research-interop-worker-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'invalid.ris');
    await writeFile(sourcePath, Buffer.from([0xff, 0xfe, 0xfd]));
    const messages = await runWorker({ sourcePath, format: 'ris' });
    expect(messages).toEqual([
      expect.objectContaining({
        type: 'failed',
        code: 'RESEARCH_INTEROP_UNSUPPORTED_ENCODING',
      }),
    ]);
  });

  it('同一文件的重复来源 key 保留两条记录并标记审查', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'research-interop-worker-'));
    temporaryDirectories.push(directory);
    const sourcePath = join(directory, 'duplicate.bib');
    await writeFile(
      sourcePath,
      '@article{shared,title={First}}\n@article{shared,title={Second}}',
      'utf8',
    );
    const messages = await runWorker({ sourcePath, format: 'bibtex', batchSize: 10 });
    const batch = messages[0] as {
      records: Array<{ status: string; diagnostics: Array<{ code: string }> }>;
    };

    expect(batch.records).toHaveLength(2);
    expect(batch.records.every((record) => record.status === 'needs-review')).toBe(true);
    expect(
      batch.records.every((record) =>
        record.diagnostics.some((diagnostic) => diagnostic.code === 'duplicate-source-key'),
      ),
    ).toBe(true);
  });
});
