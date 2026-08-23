import { describe, expect, it } from 'vitest';
import { createDatabaseClient, openTestDatabase, runMigrationsFrom } from '@workbench/data';
import type Database from 'better-sqlite3';
import { makeResearchDatabase } from '../testing/harness.js';
import type { CommitImportDraft } from '../server/repository.js';
import { SqliteResearchRepository } from './sqlite-repository.js';

const NOW = '2026-08-23T12:00:00.000Z';
const HASH_A = 'a'.repeat(64);

function importDraft(overrides: Partial<CommitImportDraft> = {}): CommitImportDraft {
  return {
    importItemId: overrides.importItemId ?? 'item-1',
    work: overrides.work ?? {
      kind: 'new',
      value: {
        id: 'work-1',
        type: 'article',
        title: 'A trustworthy library',
        titleSort: 'a trustworthy library',
        year: 2026,
      },
    },
    edition: overrides.edition ?? {
      kind: 'new',
      value: {
        id: 'edition-1',
        kind: 'journal',
        title: 'A trustworthy library',
        publicationTitle: 'Workbench Journal',
      },
    },
    attachment: overrides.attachment ?? {
      id: 'attachment-1',
      assetId: 'asset-1',
      role: 'primary-pdf',
      displayName: 'paper.pdf',
    },
    identifiers: overrides.identifiers ?? [
      {
        id: 'identifier-1',
        entityType: 'edition',
        scheme: 'doi',
        value: '10.1000/Example',
        normalizedValue: '10.1000/example',
      },
    ],
    assertions: overrides.assertions ?? [
      {
        id: 'assertion-title',
        entityType: 'work',
        fieldName: 'title',
        value: 'A trustworthy library',
        normalizedValue: 'a trustworthy library',
        sourceKind: 'user',
        observedAt: NOW,
        isUserConfirmed: true,
      },
    ],
    collections: overrides.collections ?? [],
    decisionJson: overrides.decisionJson ?? JSON.stringify({ kind: 'new-work' }),
  };
}

async function createSession(repo: SqliteResearchRepository, itemId = 'item-1') {
  return repo.createImportSession({
    id: `session-${itemId}`,
    requestId: `request-${itemId}`,
    items: [
      {
        id: itemId,
        fileName: `${itemId}.pdf`,
        sourcePath: `/tmp/${itemId}.pdf`,
        storageMode: 'managed',
      },
    ],
  });
}

async function storeManagedAsset(repo: SqliteResearchRepository, id = 'asset-1', hash = HASH_A) {
  return repo.storeAsset(
    { id, contentHash: hash, byteSize: 42, mimeType: 'application/pdf' },
    {
      id: `location-${id}`,
      mode: 'managed',
      originalPath: `/tmp/${id}.pdf`,
      resolvedPath: `/library/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`,
      objectKey: `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`,
      state: 'available',
      observedSize: 42,
      lastCheckedAt: NOW,
    },
  );
}

describe('导入会话', () => {
  it('requestId 幂等，重复请求返回原会话和原条目', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    const first = await createSession(repo);
    const second = await repo.createImportSession({
      id: 'different-session-id',
      requestId: 'request-item-1',
      items: [
        {
          id: 'different-item-id',
          fileName: 'different.pdf',
          sourcePath: '/tmp/different.pdf',
          storageMode: 'linked',
        },
      ],
    });

    expect(second).toEqual(first);
    expect(second.items.map((item) => item.id)).toEqual(['item-1']);
  });

  it('逐阶段更新保留机器可读错误和重试状态', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    await createSession(repo);
    await storeManagedAsset(repo);

    const changed = await repo.updateImportItem('item-1', {
      stage: 'metadata-failed',
      assetId: 'asset-1',
      errorCode: 'PDF_INVALID',
      errorDetail: 'truncated xref',
      retryable: false,
    });

    expect(changed).toMatchObject({
      stage: 'metadata-failed',
      assetId: 'asset-1',
      errorCode: 'PDF_INVALID',
      retryable: false,
    });
  });
});

describe('Asset 与位置', () => {
  it('同 hash 复用 Asset 和托管位置，链接位置按原始路径分别保留', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    const first = await storeManagedAsset(repo);
    const duplicateManaged = await repo.storeAsset(
      { id: 'asset-race', contentHash: HASH_A, byteSize: 42, mimeType: 'application/pdf' },
      {
        id: 'location-race',
        mode: 'managed',
        originalPath: '/tmp/another-name.pdf',
        resolvedPath: '/library/another-object',
        objectKey: `sha256/aa/aa/${HASH_A}`,
        state: 'available',
      },
    );
    const linked = await repo.storeAsset(
      { id: 'asset-linked', contentHash: HASH_A, byteSize: 42, mimeType: 'application/pdf' },
      {
        id: 'location-linked',
        mode: 'linked',
        originalPath: '../Papers/论文.pdf',
        resolvedPath: '/Volumes/Papers/论文.pdf',
        objectKey: null,
        state: 'available',
      },
    );

    expect(first).toMatchObject({ reusedAsset: false, reusedLocation: false });
    expect(duplicateManaged).toMatchObject({
      reusedAsset: true,
      reusedLocation: true,
      asset: { id: 'asset-1' },
      location: { id: 'location-asset-1' },
    });
    expect(linked).toMatchObject({
      reusedAsset: true,
      reusedLocation: false,
      asset: { id: 'asset-1' },
      location: { originalPath: '../Papers/论文.pdf', mode: 'linked' },
    });
  });

  it('位置状态更新不会丢掉路径身份', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    await storeManagedAsset(repo);

    const missing = await repo.updateLocationState('location-asset-1', 'missing', NOW, 'ENOENT');

    expect(missing).toMatchObject({
      state: 'missing',
      originalPath: '/tmp/asset-1.pdf',
      errorCode: 'ENOENT',
    });
  });
});

describe('正式入库事务', () => {
  it('一次提交建立 Work / Edition / Attachment / 标识符 / 来源字段 / 多目录关系', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    await createSession(repo);
    await storeManagedAsset(repo);
    await repo.createCollection({
      id: 'collection-a',
      parentId: null,
      name: 'A',
      normalizedName: 'a',
      sortOrder: 0,
    });
    await repo.createCollection({
      id: 'collection-b',
      parentId: null,
      name: 'B',
      normalizedName: 'b',
      sortOrder: 1,
    });

    const result = await repo.commitImport(
      importDraft({
        collections: [
          { entryId: 'entry-a', collectionId: 'collection-a' },
          { entryId: 'entry-b', collectionId: 'collection-b' },
        ],
      }),
    );

    expect(result).toMatchObject({
      workId: 'work-1',
      editionId: 'edition-1',
      attachmentId: 'attachment-1',
      reusedWork: false,
    });
    expect(await repo.getWork('work-1')).toMatchObject({
      title: 'A trustworthy library',
      preferredEditionId: 'edition-1',
    });
    expect(await repo.listEditions('work-1')).toHaveLength(1);
    expect(await repo.listAttachments('edition-1')).toHaveLength(1);
    expect(await repo.listAssertions('work', 'work-1')).toEqual([
      expect.objectContaining({ value: 'A trustworthy library', isSelected: true }),
    ]);
    expect((await repo.getImportSession('session-item-1'))?.status).toBe('completed');
    expect(
      await repo.listWorks({ status: 'active', collectionId: 'collection-b', limit: 30 }),
    ).toMatchObject({
      works: [
        {
          id: 'work-1',
          attachmentCount: 1,
          collectionIds: ['collection-a', 'collection-b'],
          fileStatus: 'available',
        },
      ],
      nextCursor: null,
    });
  });

  it('重放完成的提交返回同一身份，不增加第二个 Attachment', async () => {
    const { repo, sqlite } = makeResearchDatabase(() => NOW);
    await createSession(repo);
    await storeManagedAsset(repo);
    const draft = importDraft();
    const first = await repo.commitImport(draft);
    const replay = await repo.commitImport(draft);

    expect(replay).toMatchObject({
      workId: first.workId,
      editionId: first.editionId,
      attachmentId: first.attachmentId,
      reusedWork: true,
      reusedEdition: true,
      reusedAttachment: true,
    });
    expect(
      (
        sqlite.prepare('SELECT COUNT(*) AS count FROM research_attachments').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
  });

  it('目录外键失败会回滚整次正式入库，不留下半成品 Work', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    await createSession(repo);
    await storeManagedAsset(repo);

    await expect(
      repo.commitImport(
        importDraft({ collections: [{ entryId: 'bad-entry', collectionId: 'missing' }] }),
      ),
    ).rejects.toThrow(/FOREIGN KEY/);

    expect(await repo.getWork('work-1')).toBeNull();
    expect((await repo.getImportSession('session-item-1'))?.items[0]?.stage).toBe('selected');
    // Asset 已在文件就位阶段登记，事务失败后仍可由 reconciliation 解释和复用。
    expect(await repo.findAssetByHash(HASH_A)).toMatchObject({ id: 'asset-1' });
  });
});

describe('字段来源与列表', () => {
  it('选择新 assertion 会取消旧 current，但保留旧来源', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    await createSession(repo);
    await storeManagedAsset(repo);
    await repo.commitImport(importDraft({ assertions: [] }));

    await repo.recordAssertion(
      {
        id: 'embedded',
        entityType: 'work',
        entityId: 'work-1',
        fieldName: 'title',
        value: 'Embedded',
        sourceKind: 'embedded-pdf',
        observedAt: NOW,
      },
      true,
    );
    await repo.recordAssertion(
      {
        id: 'manual',
        entityType: 'work',
        entityId: 'work-1',
        fieldName: 'title',
        value: '人工标题',
        sourceKind: 'user',
        observedAt: NOW,
        isUserConfirmed: true,
      },
      true,
    );

    const assertions = await repo.listAssertions('work', 'work-1');
    expect(assertions).toHaveLength(2);
    expect(assertions.find((item) => item.id === 'embedded')?.isSelected).toBe(false);
    expect(assertions.find((item) => item.id === 'manual')).toMatchObject({
      isSelected: true,
      isUserConfirmed: true,
    });
  });

  it('keyset 分页覆盖全集，不重不漏', async () => {
    const { repo } = makeResearchDatabase(() => NOW);
    for (let index = 0; index < 5; index += 1) {
      const itemId = `item-${index}`;
      const assetId = `asset-${index}`;
      await createSession(repo, itemId);
      await storeManagedAsset(repo, assetId, index === 0 ? HASH_A : `${index}`.repeat(64));
      await repo.commitImport(
        importDraft({
          importItemId: itemId,
          work: {
            kind: 'new',
            value: {
              id: `work-${index}`,
              type: 'article',
              title: `Title ${index}`,
              titleSort: `title ${index}`,
            },
          },
          edition: {
            kind: 'new',
            value: { id: `edition-${index}`, kind: 'journal', title: `Title ${index}` },
          },
          attachment: {
            id: `attachment-${index}`,
            assetId,
            role: 'primary-pdf',
            displayName: `${index}.pdf`,
          },
          identifiers: [],
          assertions: [],
        }),
      );
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await repo.listWorks({ status: 'active', limit: 2, cursor });
      seen.push(...page.works.map((work) => work.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(cursor).toBeNull();
  });
});

describe('动态账号连接', () => {
  it('同一个 Repository 随 getSqlite 切库，不跨账号复用 hash', async () => {
    const first = openTestDatabase();
    const second = openTestDatabase();
    runMigrationsFrom(first.db, 'modules/research/migrations');
    runMigrationsFrom(second.db, 'modules/research/migrations');
    let active: Database.Database = first.sqlite;
    const repo = new SqliteResearchRepository(
      () => active,
      () => NOW,
    );

    await storeManagedAsset(repo);
    active = second.sqlite;
    expect(await repo.findAssetByHash(HASH_A)).toBeNull();
    const secondStored = await storeManagedAsset(repo, 'second-account-asset', HASH_A);
    expect(secondStored.reusedAsset).toBe(false);

    // 同时证明切换使用的是连接本身，不依赖测试 harness 的缓存。
    expect(createDatabaseClient(first.sqlite)).not.toBe(createDatabaseClient(second.sqlite));
  });
});
