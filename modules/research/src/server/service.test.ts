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
