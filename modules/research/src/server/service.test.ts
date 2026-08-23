import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import type { MetadataLookupResult } from '../metadata/types.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { SqliteResearchRepository } from '../storage/sqlite-repository.js';
import { ResearchService } from './service.js';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function emptyLookup(): MetadataLookupResult {
  return {
    candidates: [],
    sources: [],
    diagnostics: [],
    disclosure: { services: [], sentFields: [], sendsPdf: false },
  };
}

async function harness(metadataResult: MetadataLookupResult = emptyLookup()) {
  const root = await mkdtemp(join(tmpdir(), 'research-service-'));
  temporaryRoots.push(root);
  const managedRoot = join(root, 'managed');
  const sources = join(root, 'sources');
  await mkdir(sources);
  const database = makeResearchDatabase(() => NOW.toISOString());
  const resolve = vi.fn(async () => metadataResult);
  const contentStore = new ResearchContentStore(() => managedRoot);
  const service = new ResearchService({
    repository: database.repo,
    contentStore,
    metadata: { resolve } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
    clock: () => NOW,
  });
  return { ...database, root, managedRoot, sources, service, contentStore, resolve };
}

async function pdf(path: string, options: Parameters<typeof makePdfFixture>[0] = {}) {
  await writeFile(path, makePdfFixture(options));
  return path;
}

function selectedFields(inspection: Awaited<ReturnType<ResearchService['inspectImport']>>) {
  const candidate = inspection.items[0]!;
  const title = candidate.localSuggestions.find((value) => value.fieldName === 'title')!;
  const authors = candidate.localSuggestions.find((value) => value.fieldName === 'authors');
  return {
    title: {
      value: title.value,
      sourceKind: title.sourceKind,
      sourceRecordId: title.sourceRecordId,
    },
    type: { value: 'article', sourceKind: 'user' as const, sourceRecordId: null },
    ...(authors
      ? {
          authors: {
            value: authors.value,
            sourceKind: authors.sourceKind,
            sourceRecordId: authors.sourceRecordId,
          },
        }
      : {}),
  };
}

async function inspectFile(
  service: ResearchService,
  path: string,
  storageMode: 'managed' | 'linked',
  requestId: string,
) {
  const session = await service.prepareImport({
    files: [{ path, storageMode }],
    requestId,
  });
  const inspection = await service.inspectImport(session.id, {
    allowExternal: false,
    forceRefresh: false,
  });
  return { session, inspection, item: inspection.items[0]! };
}

describe('ResearchService 导入闭环', () => {
  it('浏览器托管上传按 requestId 复用会话且不泄漏重试产生的临时文件', async () => {
    const { service, contentStore } = await harness();
    const bytes = makePdfFixture({ title: 'Uploaded Paper', author: 'Browser User' });
    const upload = async function* () {
      yield bytes;
    };

    const first = await service.prepareManagedUpload(upload(), 'Uploaded Paper.pdf', 'upload-once');
    const second = await service.prepareManagedUpload(
      upload(),
      'Uploaded Paper.pdf',
      'upload-once',
    );

    expect(second.id).toBe(first.id);
    expect(await contentStore.listStagingFiles()).toHaveLength(1);
    await service.inspectImport(first.id, { allowExternal: false, forceRefresh: false });
    expect(await contentStore.listStagingFiles()).toEqual([]);
  });

  it('托管导入建立完整领域关系、来源记录和多目录归属', async () => {
    const { service, repo, sources, sqlite } = await harness();
    const source = await pdf(join(sources, 'paper.pdf'), {
      title: 'A Trustworthy Library',
      author: 'Ada Lovelace; Alan Turing',
      lines: ['A Trustworthy Library', 'doi:10.1000/example'],
    });
    const collectionA = await service.createCollection({ name: 'Reading' });
    const collectionB = await service.createCollection({ name: 'Methods' });
    const { session, inspection, item } = await inspectFile(
      service,
      source,
      'managed',
      'managed-flow',
    );

    expect(item.item.stage).toBe('awaiting-confirmation');
    expect(item.identifiers).toEqual([
      expect.objectContaining({
        scheme: 'doi',
        normalizedValue: '10.1000/example',
        sourceRecordId: expect.any(String),
      }),
    ]);
    const committed = await service.confirmImport(session.id, {
      itemId: item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [collectionA.id, collectionB.id],
      fields: selectedFields(inspection),
      requestId: 'confirm-managed-flow',
    });
    expect(committed).toMatchObject({ reusedWork: false, reusedEdition: false });
    if ('deferred' in committed || 'discarded' in committed) throw new Error('unexpected decision');

    const detail = await service.getWork(committed.workId);
    expect(detail.work).toMatchObject({
      title: 'A Trustworthy Library',
      attachmentCount: 1,
      collectionIds: [collectionB.id, collectionA.id].sort(),
      fileStatus: 'available',
    });
    expect(detail.editions[0]?.contributors.map((value) => value.displayName)).toEqual([
      'Ada Lovelace',
      'Alan Turing',
    ]);
    expect(detail.editions[0]?.identifiers).toContainEqual({
      scheme: 'doi',
      value: '10.1000/example',
    });
    expect(detail.assertions.find((value) => value.fieldName === 'title')).toMatchObject({
      sourceKind: 'embedded-pdf',
      sourceRecordId: expect.any(String),
      isUserConfirmed: true,
      isSelected: true,
    });

    const attachment = detail.editions[0]!.attachments[0]!;
    const managedObjectPath = attachment.asset.locations[0]!.resolvedPath;
    const afterDirectoryRemoval = await service.setWorkCollections(committed.workId, [
      collectionA.id,
    ]);
    expect(afterDirectoryRemoval.work.collectionIds).toEqual([collectionA.id]);
    expect(afterDirectoryRemoval.work.attachmentCount).toBe(1);
    await expect(access(managedObjectPath)).resolves.toBeUndefined();

    await service.trashWork(committed.workId);
    expect((await service.getWork(committed.workId)).work.status).toBe('trashed');
    await expect(service.restoreWork(committed.workId)).resolves.toMatchObject({
      work: { work: { status: 'active' } },
      missingLocations: [],
    });

    await service.recycleAttachment(attachment.id);
    expect((await service.getWork(committed.workId)).editions[0]?.attachments[0]?.status).toBe(
      'recycled',
    );
    await expect(access(managedObjectPath)).resolves.toBeUndefined();
    await expect(access(source)).resolves.toBeUndefined();
    expect((await repo.getImportSession(session.id))?.status).toBe('completed');
    expect(
      sqlite
        .prepare("SELECT provider FROM research_source_records WHERE provider = 'local-pdf'")
        .get(),
    ).toEqual({ provider: 'local-pdf' });
  });

  it('离线识别后可只补查外部元数据，不重新读取或复制原文件', async () => {
    const external: MetadataLookupResult = {
      candidates: [
        {
          provider: 'crossref',
          matchKind: 'exact',
          sourceLocator: 'https://api.crossref.org/works/10.1000/example',
          title: 'External Canonical Title',
          authors: ['External Author'],
          year: 2026,
          type: 'article',
          publicationTitle: 'Journal',
          publisher: 'Publisher',
          abstract: null,
          identifiers: [{ scheme: 'doi', value: '10.1000/example' }],
          raw: { DOI: '10.1000/example' },
        },
      ],
      sources: [
        {
          provider: 'crossref',
          status: 'success',
          candidates: [],
          sourceLocator: 'https://api.crossref.org/works/10.1000/example',
          rawFormat: 'json',
          rawPayload: '{"DOI":"10.1000/example"}',
          httpStatus: 200,
          error: null,
        },
      ],
      diagnostics: [{ provider: 'crossref', status: 'success', message: null }],
      disclosure: { services: ['crossref'], sentFields: ['doi'], sendsPdf: false },
    };
    const { service, sources, resolve } = await harness(external);
    const source = await pdf(join(sources, 'offline-first.pdf'), {
      title: 'Local Title',
      lines: ['Local Title', 'doi:10.1000/example'],
    });
    const prepared = await inspectFile(service, source, 'managed', 'offline-first');
    await rename(source, `${source}.gone`);

    const refreshed = await service.inspectImport(prepared.session.id, {
      allowExternal: true,
      forceRefresh: false,
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(refreshed.items[0]?.externalCandidates).toEqual([
      expect.objectContaining({
        title: 'External Canonical Title',
        sourceRecordId: expect.any(String),
      }),
    ]);
    expect(refreshed.disclosure).toEqual({
      externalEnabled: true,
      services: ['crossref'],
      sentFields: ['doi'],
      sendsPdf: false,
    });
  });

  it('同 hash 再导入会给出精确候选，并可幂等挂回现有 Edition', async () => {
    const { service, repo, sources } = await harness();
    const source = await pdf(join(sources, 'same.pdf'), { title: 'Same Work' });
    const first = await inspectFile(service, source, 'managed', 'same-1');
    const firstCommit = await service.confirmImport(first.session.id, {
      itemId: first.item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [],
      fields: selectedFields(first.inspection),
      requestId: 'same-confirm-1',
    });
    if ('deferred' in firstCommit || 'discarded' in firstCommit) throw new Error('unexpected');

    const second = await inspectFile(service, source, 'managed', 'same-2');
    expect(second.item.exactAssetUsages).toEqual([
      expect.objectContaining({
        workId: firstCommit.workId,
        editionId: firstCommit.editionId,
      }),
    ]);
    const secondCommit = await service.confirmImport(second.session.id, {
      itemId: second.item.item.id,
      duplicateDecision: 'existing-edition',
      targetEditionId: firstCommit.editionId,
      collectionIds: [],
      fields: selectedFields(second.inspection),
      requestId: 'same-confirm-2',
    });
    expect(secondCommit).toMatchObject({
      workId: firstCommit.workId,
      editionId: firstCommit.editionId,
      reusedWork: true,
      reusedEdition: true,
      reusedAttachment: true,
    });
    expect(await repo.listAttachments(firstCommit.editionId)).toHaveLength(1);
  });

  it('不同 hash 但 DOI 相同只返回作品候选，不自动合并', async () => {
    const { service, sources } = await harness();
    const firstPath = await pdf(join(sources, 'doi-first.pdf'), {
      title: 'First Bytes',
      lines: ['First Bytes', 'doi:10.1000/shared'],
    });
    const first = await inspectFile(service, firstPath, 'managed', 'doi-first');
    const committed = await service.confirmImport(first.session.id, {
      itemId: first.item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [],
      fields: selectedFields(first.inspection),
      requestId: 'doi-first-confirm',
    });
    if ('deferred' in committed || 'discarded' in committed) throw new Error('unexpected');
    const secondPath = await pdf(join(sources, 'doi-second.pdf'), {
      title: 'Different Bytes',
      lines: ['Different Bytes and Layout', 'doi:10.1000/shared'],
    });

    const second = await inspectFile(service, secondPath, 'managed', 'doi-second');

    expect(second.item.item.assetId).not.toBe(committed.assetId);
    expect(second.item.exactAssetUsages).toEqual([]);
    expect(second.item.identifierMatches).toEqual([
      expect.objectContaining({
        workId: committed.workId,
        editionId: committed.editionId,
        scheme: 'doi',
        value: '10.1000/shared',
      }),
    ]);
  });

  it('链接文件缺失后可按同 hash 恢复，不同 hash 只生成替换候选', async () => {
    const { service, sources } = await harness();
    const source = await pdf(join(sources, 'linked.pdf'), { title: 'Linked Work' });
    const imported = await inspectFile(service, source, 'linked', 'linked-flow');
    const committed = await service.confirmImport(imported.session.id, {
      itemId: imported.item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [],
      fields: selectedFields(imported.inspection),
      requestId: 'linked-confirm',
    });
    if ('deferred' in committed || 'discarded' in committed) throw new Error('unexpected');
    const detail = await service.getWork(committed.workId);
    const location = detail.editions[0]!.attachments[0]!.asset.locations[0]!;
    const relocated = join(sources, 'relocated.pdf');
    await rename(source, relocated);

    await expect(service.checkLocation(location.id)).resolves.toMatchObject({
      audit: { state: 'missing' },
    });
    await expect(service.relinkLocation(location.id, relocated)).resolves.toMatchObject({
      kind: 'restored',
      location: { originalPath: relocated, state: 'available' },
    });
    const replacement = await pdf(join(sources, 'replacement.pdf'), {
      title: 'Different Bytes',
    });
    await expect(service.relinkLocation(location.id, replacement)).resolves.toMatchObject({
      kind: 'replacement-candidate',
      expectedAssetId: committed.assetId,
      candidateAssetId: expect.any(String),
    });

    await service.trashWork(committed.workId);
    const preview = await service.deletionPreview(committed.workId);
    await service.permanentlyDelete(committed.workId, preview.confirmationToken);
    await expect(access(relocated)).resolves.toBeUndefined();
    await expect(service.getWork(committed.workId)).rejects.toThrow('作品不存在');
  });

  it('托管 Work 永久删除时移除无引用对象，损坏 PDF 仍可用文件名完成导入', async () => {
    const { service, sources } = await harness();
    const source = join(sources, 'Readable Filename.pdf');
    await writeFile(source, Buffer.from('%PDF-corrupt'));
    const imported = await inspectFile(service, source, 'managed', 'corrupt-flow');
    expect(imported.item.localSuggestions).toContainEqual(
      expect.objectContaining({ fieldName: 'title', value: 'Readable Filename' }),
    );
    expect(imported.item.warnings.length).toBeGreaterThan(0);
    const committed = await service.confirmImport(imported.session.id, {
      itemId: imported.item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [],
      fields: selectedFields(imported.inspection),
      requestId: 'corrupt-confirm',
    });
    if ('deferred' in committed || 'discarded' in committed) throw new Error('unexpected');
    const detail = await service.getWork(committed.workId);
    const objectPath = detail.editions[0]!.attachments[0]!.asset.locations[0]!.resolvedPath;

    await service.trashWork(committed.workId);
    const preview = await service.deletionPreview(committed.workId);
    expect(preview).toMatchObject({ managedObjectCount: 1, linkedLocationCount: 0 });
    await service.permanentlyDelete(committed.workId, preview.confirmationToken);

    await expect(access(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(source)).resolves.toBeUndefined();
  });

  it('对账会登记文件已发布但数据库尚未提交的托管对象', async () => {
    const { service, contentStore, repo, sources } = await harness();
    const source = await pdf(join(sources, 'interrupted.pdf'), { title: 'Interrupted' });
    const object = await contentStore.ingestManaged(source);

    expect(await repo.findAssetByHash(object.contentHash)).toBeNull();
    await expect(service.reconcile()).resolves.toMatchObject({
      registeredOrphans: 1,
      corruptObjects: 0,
    });
    const asset = await repo.findAssetByHash(object.contentHash);
    expect(asset).toMatchObject({ byteSize: object.byteSize });
    expect(await repo.listLocationsForAsset(asset!.id)).toEqual([
      expect.objectContaining({ mode: 'managed', objectKey: object.objectKey, state: 'available' }),
    ]);
  });

  it('账号切换时 Repository 与托管根一起切换', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-account-switch-'));
    temporaryRoots.push(root);
    const first = makeResearchDatabase(() => NOW.toISOString());
    const second = makeResearchDatabase(() => NOW.toISOString());
    let activeSqlite = first.sqlite;
    let accountId = 'account-a';
    const repository = new SqliteResearchRepository(
      () => activeSqlite,
      () => NOW.toISOString(),
    );
    const service = new ResearchService({
      repository,
      contentStore: new ResearchContentStore(() => join(root, accountId, 'managed')),
      metadata: { resolve: async () => emptyLookup() } as unknown as MetadataCoordinator,
      filePicker: { pick: async () => [] },
      clock: () => NOW,
    });
    const source = await pdf(join(root, 'account-paper.pdf'), { title: 'Account Paper' });

    const accountA = await inspectFile(service, source, 'managed', 'account-a-import');
    const commitA = await service.confirmImport(accountA.session.id, {
      itemId: accountA.item.item.id,
      duplicateDecision: 'new-work',
      collectionIds: [],
      fields: selectedFields(accountA.inspection),
      requestId: 'account-a-confirm',
    });
    if ('deferred' in commitA || 'discarded' in commitA) throw new Error('unexpected');
    const locationA = (await repository.listLocationsForAsset(commitA.assetId))[0]!;

    activeSqlite = second.sqlite;
    accountId = 'account-b';
    expect(await service.listWorks({ status: 'active', limit: 30 })).toEqual({
      works: [],
      nextCursor: null,
    });
    const accountB = await inspectFile(service, source, 'managed', 'account-b-import');
    expect(accountB.item.exactAssetUsages).toEqual([]);
    expect(accountB.item.item.assetId).not.toBe(commitA.assetId);

    const detailBSession = await service.getImportSession(accountB.session.id);
    expect(detailBSession.items[0]?.stage).toBe('awaiting-confirmation');
    const locationB = (await repository.listLocationsForAsset(accountB.item.item.assetId!))[0]!;
    expect(locationA.resolvedPath).toContain(join('account-a', 'managed'));
    expect(locationB.resolvedPath).toContain(join('account-b', 'managed'));
    await expect(access(locationA.resolvedPath)).resolves.toBeUndefined();
    await expect(access(locationB.resolvedPath)).resolves.toBeUndefined();

    activeSqlite = first.sqlite;
    accountId = 'account-a';
    expect((await service.getWork(commitA.workId)).work.title).toBe('Account Paper');
    first.sqlite.close();
    second.sqlite.close();
  });
});

describe('ResearchService A2 导入箱', () => {
  it('创建无附件记录后可以追加不假设可阅读的通用附件', async () => {
    const { service, sources } = await harness();
    const collection = await service.createCollection({ name: 'Manual records' });

    const created = await service.createManualWork({
      title: 'Dataset without a paper',
      type: 'unknown',
      year: null,
      authors: ['Grace Hopper'],
      editionKind: 'unknown',
      publicationTitle: null,
      publisher: null,
      identifiers: [{ scheme: 'url', value: 'https://example.test/dataset' }],
      collectionIds: [collection.id],
    });

    expect(created.work).toMatchObject({
      title: 'Dataset without a paper',
      type: 'unknown',
      attachmentCount: 0,
      collectionIds: [collection.id],
      fileStatus: 'none',
    });
    expect(created.editions[0]).toMatchObject({
      contributors: [expect.objectContaining({ displayName: 'Grace Hopper' })],
      identifiers: [{ scheme: 'url', value: 'https://example.test/dataset' }],
      attachments: [],
    });

    const dataset = join(sources, 'measurements.csv');
    await writeFile(dataset, 'sample,value\nA,42\n');
    const withDataset = await service.addLocalAttachment(created.editions[0]!.id, {
      path: dataset,
      storageMode: 'managed',
      role: 'dataset',
      displayName: 'measurements.csv',
      mimeType: 'text/csv',
    });

    expect(withDataset.editions[0]!.attachments).toEqual([
      expect.objectContaining({
        role: 'dataset',
        displayName: 'measurements.csv',
        asset: expect.objectContaining({ mimeType: 'text/csv' }),
      }),
    ]);
    await expect(access(dataset)).resolves.toBeUndefined();
  });

  it('批次保存逐项决定，单条失败不会回滚已经提交的条目', async () => {
    const { service, sources } = await harness();
    const firstPath = await pdf(join(sources, 'batch-first.pdf'), { title: 'Batch First' });
    const secondPath = await pdf(join(sources, 'batch-second.pdf'), { title: 'Batch Second' });
    const session = await service.prepareImport({
      files: [
        { path: firstPath, storageMode: 'managed' },
        { path: secondPath, storageMode: 'managed' },
      ],
      requestId: 'batch-partial',
    });
    const inspection = await service.inspectImport(session.id, {
      allowExternal: false,
      forceRefresh: false,
    });
    const decisionFor = (index: number, collectionIds: string[]) => {
      const candidate = inspection.items[index]!;
      const title = candidate.localSuggestions.find((value) => value.fieldName === 'title')!;
      return {
        itemId: candidate.item.id,
        duplicateDecision: 'new-work' as const,
        collectionIds,
        fields: {
          title: {
            value: title.value,
            sourceKind: title.sourceKind,
            sourceRecordId: title.sourceRecordId,
          },
          type: { value: 'article', sourceKind: 'user' as const, sourceRecordId: null },
        },
        requestId: `decision-${index}`,
      };
    };
    const firstDecision = decisionFor(0, []);
    const failedDecision = decisionFor(1, ['missing-collection']);
    await service.saveImportDecision(session.id, firstDecision.itemId, firstDecision);
    await service.saveImportDecision(session.id, failedDecision.itemId, failedDecision);

    const result = await service.commitImportSession(session.id);

    expect(result.results).toEqual([
      expect.objectContaining({ itemId: firstDecision.itemId, status: 'committed' }),
      expect.objectContaining({ itemId: failedDecision.itemId, status: 'failed' }),
    ]);
    expect((await service.listWorks({ status: 'active', limit: 30 })).works).toHaveLength(1);
    expect(result.session).toMatchObject({
      status: 'awaiting-confirmation',
      items: [
        expect.objectContaining({ id: firstDecision.itemId, stage: 'available' }),
        expect.objectContaining({
          id: failedDecision.itemId,
          stage: 'awaiting-confirmation',
          hasDecision: true,
        }),
      ],
    });

    const correctedDecision = decisionFor(1, []);
    await service.saveImportDecision(session.id, correctedDecision.itemId, correctedDecision);
    const retried = await service.commitImportSession(session.id);
    expect(retried.session.status).toBe('completed');
    expect((await service.listWorks({ status: 'active', limit: 30 })).works).toHaveLength(2);
  });

  it('异步识别可轮询恢复，失败条目补齐文件后可以单独重试', async () => {
    const { service, sources } = await harness();
    const missingPath = join(sources, 'arrives-later.pdf');
    const readyPath = await pdf(join(sources, 'ready.pdf'), { title: 'Ready' });
    const session = await service.prepareImport({
      files: [
        { path: missingPath, storageMode: 'linked' },
        { path: readyPath, storageMode: 'linked' },
      ],
      requestId: 'batch-recovery',
    });

    await service.startImportInspection(session.id, {
      allowExternal: false,
      forceRefresh: false,
    });
    await expect
      .poll(async () => (await service.getImportSession(session.id)).status)
      .toBe('awaiting-confirmation');
    const afterInspection = await service.getImportInspection(session.id);
    expect(afterInspection.items.map((item) => item.item.stage).sort()).toEqual([
      'awaiting-confirmation',
      'failed',
    ]);

    await pdf(missingPath, { title: 'Arrived Later' });
    const failedItem = afterInspection.items.find((item) => item.item.stage === 'failed')!;
    await service.retryImportItem(session.id, failedItem.item.id, {
      allowExternal: false,
      forceRefresh: false,
    });
    expect(
      (await service.getImportInspection(session.id)).items.every(
        (item) => item.item.stage === 'awaiting-confirmation',
      ),
    ).toBe(true);
    expect((await service.listImportSessions('awaiting-confirmation', 10)).sessions).toEqual([
      expect.objectContaining({ id: session.id }),
    ]);

    const cancelled = await service.cancelImportSession(session.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.items.every((item) => item.stage === 'cancelled')).toBe(true);
  });
});
