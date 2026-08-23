import { open, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ResearchContentStore } from './content-store.js';

const enabled = process.env.RUN_RESEARCH_LARGE_FILE === '1';
const run = enabled ? describe : describe.skip;
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

run('256 MiB 文件行为', () => {
  it('保持流式 hash/复制并在取消后清理 staging', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-large-file-'));
    roots.push(root);
    const source = join(root, 'large.pdf');
    const handle = await open(source, 'w');
    try {
      await handle.truncate(256 * 1024 * 1024);
    } finally {
      await handle.close();
    }
    const controller = new AbortController();
    const store = new ResearchContentStore(() => join(root, 'managed'));

    await expect(
      store.ingestManaged(source, {
        signal: controller.signal,
        onProgress: ({ processedBytes }) => {
          if (processedBytes >= 16 * 1024 * 1024) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_CANCELLED' });
    expect(await store.listStagingFiles()).toEqual([]);
  }, 30_000);
});
