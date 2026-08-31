import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { RESEARCH_API_V1, readerManifestSchema, readerStateSchema } from '../contract.js';
import { ReaderContentSource } from '../reader/content-source.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-reader-routes-'));
  roots.push(root);
  const managedRoot = join(root, 'managed');
  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.7\nreader-routes\n'),
    Buffer.alloc(256 * 1024, 0x41),
    Buffer.from('\n%%EOF'),
  ]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const filePath = join(managedRoot, ...objectKey.split('/'));
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
  const contentSource = new ReaderContentSource(database.repo, () => managedRoot);
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => managedRoot,
    readerContentSource: contentSource,
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app, bytes, contentSource, hash };
}

describe('research reader routes', () => {
  it('manifest 与 HEAD 不暴露路径并提供内容身份', async () => {
    const { app, bytes, hash } = await fixture();
    try {
      const manifestResponse = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.readerManifest('asset-1'),
      });
      expect(manifestResponse.statusCode).toBe(200);
      const manifest = readerManifestSchema.parse(manifestResponse.json());
      expect(manifest).toMatchObject({
        assetId: 'asset-1',
        contentHash: hash,
        byteSize: bytes.length,
        state: { revision: 0 },
      });
      expect(JSON.stringify(manifest)).not.toContain('/tmp/');

      const head = await app.inject({
        method: 'HEAD',
        url: RESEARCH_API_V1.assetContent('asset-1'),
      });
      expect(head.statusCode).toBe(200);
      expect(head.headers).toMatchObject({
        'accept-ranges': 'bytes',
        'content-length': String(bytes.length),
        'content-type': 'application/pdf',
        etag: `"sha256-${hash}"`,
      });
      expect(head.rawPayload).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('支持单 Range、条件请求与 If-Range 回退', async () => {
    const { app, bytes, hash } = await fixture();
    try {
      const ranged = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetContent('asset-1'),
        headers: { range: 'bytes=5-14' },
      });
      expect(ranged.statusCode).toBe(206);
      expect(ranged.headers['content-range']).toBe(`bytes 5-14/${bytes.length}`);
      expect(ranged.rawPayload).toEqual(bytes.subarray(5, 15));

      const notModified = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetContent('asset-1'),
        headers: { 'if-none-match': `"sha256-${hash}"` },
      });
      expect(notModified.statusCode).toBe(304);

      const staleIfRange = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetContent('asset-1'),
        headers: { range: 'bytes=0-4', 'if-range': '"old"' },
      });
      expect(staleIfRange.statusCode).toBe(200);
      expect(staleIfRange.rawPayload).toEqual(bytes);
    } finally {
      await app.close();
    }
  });

  it('拒绝未授权 ID 和非法多区间', async () => {
    const { app, bytes } = await fixture();
    try {
      const missing = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetContent('missing'),
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({
        code: 'READER_ASSET_NOT_FOUND',
        error: 'PDF 附件不存在',
      });

      const invalid = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.assetContent('asset-1'),
        headers: { range: 'bytes=0-1,4-5' },
      });
      expect(invalid.statusCode).toBe(416);
      expect(invalid.headers['content-range']).toBe(`bytes */${bytes.length}`);
      expect(invalid.json()).toEqual({
        code: 'READER_RANGE_INVALID',
        error: '请求的 PDF 字节范围无效',
      });
    } finally {
      await app.close();
    }
  });

  it('阅读状态使用乐观 revision 并返回当前冲突值', async () => {
    const { app } = await fixture();
    try {
      const input = {
        pageNumber: 12,
        pageOffsetRatio: 0.3,
        zoom: 1.5,
        rotation: 90,
        layout: 'single-page',
        lastContextId: null,
        expectedRevision: 0,
      };
      const saved = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.readerState('asset-1'),
        payload: input,
      });
      expect(saved.statusCode).toBe(200);
      expect(readerStateSchema.parse(saved.json())).toMatchObject({ pageNumber: 12, revision: 1 });

      const conflict = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.readerState('asset-1'),
        payload: input,
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({
        code: 'READER_STATE_CONFLICT',
        details: { current: { pageNumber: 12, revision: 1 } },
      });
    } finally {
      await app.close();
    }
  });

  it('客户端中断后释放文件流', async () => {
    const { app, contentSource } = await fixture();
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const controller = new AbortController();
      const response = await fetch(`${address}${RESEARCH_API_V1.assetContent('asset-1')}`, {
        headers: { range: 'bytes=0-' },
        signal: controller.signal,
      });
      expect(response.status).toBe(206);
      const reader = response.body!.getReader();
      await reader.read();
      controller.abort();
      await reader.cancel().catch(() => undefined);

      const deadline = performance.now() + 2_000;
      while (contentSource.activeStreams !== 0 && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(contentSource.activeStreams).toBe(0);
    } finally {
      await app.close();
    }
  });
});
