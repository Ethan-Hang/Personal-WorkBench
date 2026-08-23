import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeResearchDatabase } from '../testing/harness.js';
import { previewPortableExport, writePortableExport } from './portable-export.js';

const NOW = '2026-08-24T09:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('portable research export', () => {
  it('原子发布 JSON、manifest、已校验托管文件和明确的缺失报告', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-portable-'));
    roots.push(root);
    const bytes = Buffer.from('portable research attachment');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const managedPath = join(root, 'managed-object');
    const missingPath = join(root, 'missing-linked.pdf');
    await writeFile(managedPath, bytes);
    const database = makeResearchDatabase(() => NOW);
    try {
      database.sqlite
        .prepare(
          `INSERT INTO research_works
           (id, type, title, title_sort, status, revision, created_at, updated_at)
           VALUES ('work-1', 'article', 'Portable Work', 'portable work', 'active', 1, ?, ?)`,
        )
        .run(NOW, NOW);
      database.sqlite
        .prepare(
          `INSERT INTO research_editions
           (id, work_id, kind, title, revision, created_at, updated_at)
           VALUES ('edition-1', 'work-1', 'journal', 'Portable Work', 1, ?, ?)`,
        )
        .run(NOW, NOW);
      const insertAsset = database.sqlite.prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state, created_at, updated_at)
         VALUES (?, 'sha256', ?, ?, 'application/pdf', 'active', ?, ?)`,
      );
      insertAsset.run('asset-ok', hash, bytes.length, NOW, NOW);
      insertAsset.run('asset-missing', 'b'.repeat(64), 99, NOW, NOW);
      const insertLocation = database.sqlite.prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, object_key, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertLocation.run(
        'location-ok',
        'asset-ok',
        'managed',
        managedPath,
        managedPath,
        `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`,
        'available',
        NOW,
        NOW,
      );
      insertLocation.run(
        'location-missing',
        'asset-missing',
        'linked',
        missingPath,
        missingPath,
        null,
        'missing',
        NOW,
        NOW,
      );
      const insertAttachment = database.sqlite.prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status, created_at)
         VALUES (?, 'edition-1', ?, 'primary-pdf', ?, 'active', ?)`,
      );
      insertAttachment.run('attachment-ok', 'asset-ok', 'portable.pdf', NOW);
      insertAttachment.run('attachment-missing', 'asset-missing', 'missing.pdf', NOW);

      const canonical = await database.repo.exportCanonicalSnapshot(NOW);
      const target = join(root, 'published-bundle');
      const preview = await previewPortableExport(
        canonical,
        { includeManagedFiles: true, includeLinkedFiles: false },
        target,
      );
      expect(preview).toMatchObject({
        workCount: 1,
        attachmentCount: 2,
        selectedAssetCount: 1,
        estimatedBytes: bytes.length,
        targetExists: false,
      });
      expect(preview.missing.map((item) => item.attachmentId)).toEqual(['attachment-missing']);

      const report = await writePortableExport({
        jobId: 'job-complete',
        targetPath: target,
        canonical,
        options: { includeManagedFiles: true, includeLinkedFiles: false },
        signal: new AbortController().signal,
        completedAt: () => NOW,
      });
      expect(report).toMatchObject({
        roundTripValid: true,
        copiedAssetCount: 1,
        copiedBytes: bytes.length,
      });
      expect(report.missing).toHaveLength(1);
      expect(report.copyFailures).toEqual([]);
      const exportedBytes = await readFile(
        join(target, 'files', 'sha256', hash.slice(0, 2), hash.slice(2, 4), hash),
      );
      expect(exportedBytes).toEqual(bytes);
      const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')) as {
        attachments: Array<{ attachmentId: string; included: boolean; missing: boolean }>;
      };
      expect(manifest.attachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ attachmentId: 'attachment-ok', included: true }),
          expect.objectContaining({
            attachmentId: 'attachment-missing',
            included: false,
            missing: true,
          }),
        ]),
      );
      expect(await readFile(managedPath)).toEqual(bytes);
      expect(
        database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_attachments').get(),
      ).toEqual({
        count: 2,
      });
      expect((await readdir(root)).some((name) => name.includes('.tmp-job-complete'))).toBe(false);

      await writeFile(managedPath, Buffer.alloc(bytes.length, 120));
      const partialTarget = join(root, 'partial-bundle');
      const partial = await writePortableExport({
        jobId: 'job-partial',
        targetPath: partialTarget,
        canonical,
        options: { includeManagedFiles: true, includeLinkedFiles: false },
        signal: new AbortController().signal,
        completedAt: () => NOW,
      });
      expect(partial.copiedAssetCount).toBe(0);
      expect(partial.copiedBytes).toBe(0);
      expect(partial.copyFailures).toEqual([
        expect.objectContaining({ attachmentId: 'attachment-ok', assetId: 'asset-ok' }),
      ]);
      expect(await readFile(join(partialTarget, 'report.json'), 'utf8')).toContain(
        '复制后文件的大小或 SHA-256',
      );

      const cancelledTarget = join(root, 'cancelled-bundle');
      const controller = new AbortController();
      await expect(
        writePortableExport({
          jobId: 'job-cancelled',
          targetPath: cancelledTarget,
          canonical,
          options: { includeManagedFiles: true, includeLinkedFiles: false },
          signal: controller.signal,
          completedAt: () => NOW,
          onProgress(progress) {
            if (progress.phase === 'copying') controller.abort();
          },
        }),
      ).rejects.toThrow();
      expect(await readdir(root)).not.toContain('cancelled-bundle');
      expect((await readdir(root)).some((name) => name.includes('.tmp-job-cancelled'))).toBe(false);
    } finally {
      database.sqlite.close();
    }
  });
});
