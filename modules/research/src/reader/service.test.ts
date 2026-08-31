import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { ReaderContentSource } from './content-source.js';
import { ResearchReaderService } from './service.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-reader-service-'));
  roots.push(root);
  const bytes = Buffer.from('%PDF-1.7\nreader-service\n%%EOF');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const filePath = join(root, ...objectKey.split('/'));
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, bytes);
  const database = makeResearchDatabase(() => '2026-08-30T12:00:00.000Z');
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: hash, byteSize: bytes.length, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'paper.pdf'),
      resolvedPath: filePath,
      objectKey,
      state: 'available',
    },
  );
  const source = new ReaderContentSource(database.repo, () => root);
  return { ...database, service: new ResearchReaderService(database.repo, source) };
}

describe('research reader service', () => {
  it('首次打开返回未伪造持久化时间的默认状态', async () => {
    const { service } = await fixture();

    expect(await service.getManifest('asset-1')).toMatchObject({
      assetId: 'asset-1',
      contentUrl: '/api/research/v1/assets/asset-1/content',
      state: { pageNumber: 1, revision: 0, createdAt: null, updatedAt: null },
    });
  });

  it('保存阅读状态并把过期 revision 返回为可重试冲突', async () => {
    const { service } = await fixture();
    const input = {
      pageNumber: 8,
      pageOffsetRatio: 0.4,
      zoom: 1.25,
      rotation: 0 as const,
      layout: 'continuous' as const,
      lastContextId: null,
      expectedRevision: 0,
    };
    expect(await service.saveState('asset-1', input)).toMatchObject({
      pageNumber: 8,
      revision: 1,
    });
    await expect(service.saveState('asset-1', input)).rejects.toMatchObject({
      code: 'READER_STATE_CONFLICT',
      status: 409,
      details: { current: { pageNumber: 8, revision: 1 } },
    });
  });
});
