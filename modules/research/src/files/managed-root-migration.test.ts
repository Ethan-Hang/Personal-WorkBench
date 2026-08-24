import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import {
  SqliteResearchManagedRootController,
  SqliteResearchRepository,
} from '../storage/sqlite-repository.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { ResearchContentStore } from './content-store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-root-migration-'));
  roots.push(root);
  const sourceRoot = join(root, 'managed-source');
  const targetRoot = join(root, 'managed-target');
  const files = join(root, 'files');
  await mkdir(files);
  const database = makeResearchDatabase();
  const controller = new SqliteResearchManagedRootController(
    () => database.sqlite,
    () => sourceRoot,
  );
  const makeService = () =>
    new ResearchService({
      repository: new SqliteResearchRepository(() => database.sqlite),
      contentStore: new ResearchContentStore(() => controller.current()),
      managedRootController: controller,
      metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
      filePicker: { pick: async () => [] },
    });
  return { ...database, root, sourceRoot, targetRoot, files, controller, makeService };
}

async function manual(service: ResearchService, title: string) {
  return service.createManualWork({
    title,
    type: 'article',
    year: 2026,
    authors: [],
    editionKind: 'journal',
    publicationTitle: null,
    publisher: null,
    identifiers: [],
    collectionIds: [],
  });
}

async function waitForJob(service: ResearchService, id: string, status: 'completed' | 'failed') {
  await expect
    .poll(async () => (await service.getManagedRootMigration(id)).status, {
      timeout: 10_000,
      interval: 10,
    })
    .toBe(status);
  return service.getManagedRootMigration(id);
}

describe('托管附件库迁移', () => {
  it('全部对象复制并校验后原子切换配置和位置，旧根继续保留', async () => {
    const { makeService, files, sourceRoot, targetRoot, controller, sqlite } = await fixture();
    const service = makeService();
    try {
      const firstPath = join(files, 'first.bin');
      const secondPath = join(files, 'second.bin');
      await writeFile(firstPath, Buffer.from('first managed object'));
      await writeFile(secondPath, Buffer.from('second managed object'));
      const first = await manual(service, 'First managed work');
      const second = await manual(service, 'Second managed work');
      const firstAttached = await service.addLocalAttachment(first.editions[0]!.id, {
        path: firstPath,
        storageMode: 'managed',
        role: 'dataset',
        mimeType: 'application/octet-stream',
      });
      const secondAttached = await service.addLocalAttachment(second.editions[0]!.id, {
        path: secondPath,
        storageMode: 'managed',
        role: 'dataset',
        mimeType: 'application/octet-stream',
      });
      const oldObjectPaths = [firstAttached, secondAttached].map(
        (detail) => detail.editions[0]!.attachments[0]!.asset.locations[0]!.resolvedPath,
      );

      const started = await service.startManagedRootMigration({ targetRoot });
      const completed = await waitForJob(service, started.id, 'completed');
      expect(completed).toMatchObject({
        totalObjects: 2,
        copiedObjects: 2,
        totalBytes: completed.copiedBytes,
        errorCode: null,
      });
      const resolvedTargetRoot = await realpath(targetRoot);
      expect(controller.current()).toBe(resolvedTargetRoot);
      const after = await service.getWork(first.work.id);
      const newObjectPath = after.editions[0]!.attachments[0]!.asset.locations[0]!.resolvedPath;
      expect(newObjectPath.startsWith(resolvedTargetRoot)).toBe(true);
      await access(newObjectPath);
      await Promise.all(oldObjectPaths.map((path) => access(path)));

      const configured = sqlite
        .prepare("SELECT active_root FROM research_storage_config WHERE id = 'active'")
        .get() as { active_root: string };
      expect(configured.active_root).toBe(resolvedTargetRoot);
      expect(
        (
          sqlite
            .prepare(
              "SELECT COUNT(*) AS count FROM research_asset_locations WHERE mode = 'managed' AND resolved_path LIKE ?",
            )
            .get(`${resolvedTargetRoot}%`) as { count: number }
        ).count,
      ).toBe(2);

      const thirdPath = join(files, 'third.bin');
      await writeFile(thirdPath, Buffer.from('new object after switch'));
      const third = await manual(service, 'Third managed work');
      const thirdAttached = await service.addLocalAttachment(third.editions[0]!.id, {
        path: thirdPath,
        storageMode: 'managed',
        role: 'dataset',
        mimeType: 'application/octet-stream',
      });
      expect(
        thirdAttached.editions[0]!.attachments[0]!.asset.locations[0]!.resolvedPath.startsWith(
          resolvedTargetRoot,
        ),
      ).toBe(true);
      expect(sourceRoot).not.toBe(targetRoot);
    } finally {
      sqlite.close();
    }
  });

  it('hash 校验失败时继续使用旧根，重启识别中断状态后可以重试', async () => {
    const { makeService, files, sourceRoot, targetRoot, controller, repo, sqlite } =
      await fixture();
    const service = makeService();
    try {
      const filePath = join(files, 'corruptible.bin');
      const original = Buffer.from('verified managed object');
      await writeFile(filePath, original);
      const work = await manual(service, 'Retry migration work');
      const attached = await service.addLocalAttachment(work.editions[0]!.id, {
        path: filePath,
        storageMode: 'managed',
        role: 'dataset',
        mimeType: 'application/octet-stream',
      });
      const objectPath = attached.editions[0]!.attachments[0]!.asset.locations[0]!.resolvedPath;
      expect(await readFile(objectPath)).toEqual(original);
      await writeFile(objectPath, Buffer.alloc(original.length, 0x78));

      const started = await service.startManagedRootMigration({ targetRoot });
      const failed = await waitForJob(service, started.id, 'failed');
      expect(failed.errorCode).toContain('对象校验失败');
      expect(controller.current()).toBe(sourceRoot);
      expect((await service.getWork(work.work.id)).work.fileStatus).toBe('available');

      await repo.updateManagedRootMigrationJob(started.id, {
        status: 'running',
        errorCode: null,
        completedAt: null,
      });
      const afterRestart = makeService();
      expect(await afterRestart.getManagedRootMigration(started.id)).toMatchObject({
        status: 'interrupted',
        errorCode: 'ROOT_MIGRATION_INTERRUPTED',
      });

      await writeFile(objectPath, original);
      await afterRestart.retryManagedRootMigration(started.id);
      await waitForJob(afterRestart, started.id, 'completed');
      expect(controller.current()).toBe(await realpath(targetRoot));
    } finally {
      sqlite.close();
    }
  });

  it('取消复制不会切换活动根，保留部分目标后仍可安全重试', async () => {
    const { makeService, files, sourceRoot, targetRoot, controller, sqlite } = await fixture();
    const service = makeService();
    try {
      const filePath = join(files, 'large-cancel.bin');
      await writeFile(filePath, Buffer.alloc(8 * 1024 * 1024, 0x61));
      const work = await manual(service, 'Cancelled migration work');
      await service.addLocalAttachment(work.editions[0]!.id, {
        path: filePath,
        storageMode: 'managed',
        role: 'dataset',
        mimeType: 'application/octet-stream',
      });

      const started = await service.startManagedRootMigration({ targetRoot });
      expect(await service.cancelManagedRootMigration(started.id)).toMatchObject({
        status: 'cancelled',
        errorCode: 'ROOT_MIGRATION_CANCELLED',
      });
      expect(controller.current()).toBe(sourceRoot);

      await service.retryManagedRootMigration(started.id);
      await waitForJob(service, started.id, 'completed');
      expect(controller.current()).toBe(await realpath(targetRoot));
    } finally {
      sqlite.close();
    }
  });
});
