import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];
const roots: string[] = [];

afterEach(async () => {
  databases.splice(0).forEach((database) => database.sqlite.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  let tick = 0;
  const database = makeResearchDatabase(() =>
    new Date(Date.UTC(2026, 7, 24, 3, 0, tick++)).toISOString(),
  );
  databases.push(database);
  const root = await mkdtemp(join(tmpdir(), 'research-management-'));
  roots.push(root);
  const managedRoot = join(root, 'managed');
  const sourceRoot = join(root, 'sources');
  await mkdir(sourceRoot);
  const service = new ResearchService({
    repository: database.repo,
    contentStore: new ResearchContentStore(() => managedRoot),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
    clock: () => new Date('2026-08-24T03:00:00.000Z'),
  });
  return { ...database, service, managedRoot, sourceRoot };
}

async function manual(service: ResearchService, title: string, authors: string[] = []) {
  return service.createManualWork({
    title,
    type: 'article',
    year: 2025,
    authors,
    editionKind: 'journal',
    publicationTitle: 'Original Journal',
    publisher: 'Original Publisher',
    identifiers: [],
    collectionIds: [],
  });
}

describe('资料库管理闭环', () => {
  it('展示原始来源和外部映射，人工编辑成为选中值并受版本号保护', async () => {
    const { service, repo, sqlite } = await fixture();
    const created = await manual(service, 'Original title', ['Original Author']);
    const edition = created.editions[0]!;
    await repo.recordSource({
      id: 'source-crossref-original',
      provider: 'crossref',
      sourceLocator: 'https://api.crossref.org/works/10.1000/example',
      rawFormat: 'application/json',
      rawPayload: JSON.stringify({ title: ['Provider title'] }),
      parserVersion: 'research-metadata-v1',
      observedAt: '2026-08-24T02:00:00.000Z',
    });
    await repo.recordAssertion(
      {
        id: 'assertion-crossref-title',
        entityType: 'work',
        entityId: created.work.id,
        fieldName: 'title',
        value: 'Provider title',
        normalizedValue: 'provider title',
        sourceKind: 'exact-external',
        sourceRecordId: 'source-crossref-original',
        observedAt: '2026-08-24T02:00:00.000Z',
      },
      true,
    );
    sqlite
      .prepare(
        `INSERT INTO research_external_source_maps
         (id, provider, external_id, entity_type, entity_id, last_fetched_at,
          cache_status, cache_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'external-map-work',
        'crossref',
        '10.1000/example',
        'work',
        created.work.id,
        '2026-08-24T02:00:00.000Z',
        'fresh',
        '2026-08-31T02:00:00.000Z',
      );

    const before = await service.getWork(created.work.id);
    expect(before.sources).toEqual([
      expect.objectContaining({
        id: 'source-crossref-original',
        provider: 'crossref',
        rawPayload: JSON.stringify({ title: ['Provider title'] }),
      }),
    ]);
    expect(before.externalMappings).toEqual([
      expect.objectContaining({ provider: 'crossref', externalId: '10.1000/example' }),
    ]);

    const updated = await service.updateWorkMetadata(created.work.id, {
      expectedWorkRevision: before.work.revision,
      work: {
        title: 'Human corrected title',
        abstract: 'A durable local metadata record.',
        year: 2026,
      },
      edition: {
        id: edition.id,
        expectedRevision: edition.revision,
        title: 'Human corrected edition',
        publicationTitle: 'Journal of Local Research',
        publisher: 'Workbench Press',
        publishedDate: '2026-08-24',
        authors: ['Ada Lovelace', 'Grace Hopper'],
      },
    });

    expect(updated.work).toMatchObject({
      title: 'Human corrected title',
      abstract: 'A durable local metadata record.',
      year: 2026,
      revision: before.work.revision + 1,
      authors: ['Ada Lovelace', 'Grace Hopper'],
    });
    expect(updated.editions[0]).toMatchObject({
      title: 'Human corrected edition',
      publicationTitle: 'Journal of Local Research',
      publisher: 'Workbench Press',
      publishedDate: '2026-08-24',
      revision: edition.revision + 1,
    });
    expect(
      updated.assertions.find(
        (assertion) => assertion.fieldName === 'title' && assertion.isSelected,
      ),
    ).toMatchObject({ value: 'Human corrected title', sourceKind: 'user', isUserConfirmed: true });
    expect(
      updated.assertions.find((assertion) => assertion.id === 'assertion-crossref-title'),
    ).toMatchObject({ isSelected: false, sourceRecordId: 'source-crossref-original' });

    const search = await service.listWorks({
      status: 'active',
      query: 'Grace Hopper',
      limit: 20,
    });
    expect(search.works.map((work) => work.id)).toEqual([created.work.id]);
    await expect(
      service.updateWorkMetadata(created.work.id, {
        expectedWorkRevision: before.work.revision,
        work: { title: 'Stale edit' },
      }),
    ).rejects.toThrow('作品已经被其他操作修改');
  });

  it('附件可回收和恢复，最后一个托管引用永久删除时才清理对象', async () => {
    const { service, sourceRoot } = await fixture();
    const sourcePath = join(sourceRoot, 'shared-data.bin');
    const bytes = Buffer.from('shared research attachment');
    await writeFile(sourcePath, bytes);
    const first = await manual(service, 'First attachment owner');
    const second = await manual(service, 'Second attachment owner');

    const firstAttached = await service.addLocalAttachment(first.editions[0]!.id, {
      path: sourcePath,
      storageMode: 'managed',
      role: 'supplement',
      mimeType: 'application/octet-stream',
      displayName: 'shared-data.bin',
    });
    const secondAttached = await service.addLocalAttachment(second.editions[0]!.id, {
      path: sourcePath,
      storageMode: 'managed',
      role: 'supplement',
      mimeType: 'application/octet-stream',
      displayName: 'shared-data.bin',
    });
    const firstAttachment = firstAttached.editions[0]!.attachments[0]!;
    const secondAttachment = secondAttached.editions[0]!.attachments[0]!;
    const objectPath = firstAttachment.asset.locations[0]!.resolvedPath;
    expect(firstAttachment.assetId).toBe(secondAttachment.assetId);

    await service.recycleAttachment(firstAttachment.id);
    expect((await service.getWork(first.work.id)).editions[0]!.attachments[0]!.status).toBe(
      'recycled',
    );
    await service.restoreAttachment(firstAttachment.id);
    expect((await service.getWork(first.work.id)).editions[0]!.attachments[0]!.status).toBe(
      'active',
    );

    await service.recycleAttachment(firstAttachment.id);
    const sharedPreview = await service.attachmentDeletionPreview(firstAttachment.id);
    expect(sharedPreview).toMatchObject({ otherAttachmentCount: 1, managedObjectCount: 0 });
    expect(
      await service.permanentlyDeleteAttachment(
        firstAttachment.id,
        sharedPreview.confirmationToken,
      ),
    ).toMatchObject({ deleted: true, assetDeleted: false, linkedSourcesDeleted: false });
    expect(await readFile(objectPath)).toEqual(bytes);

    await service.recycleAttachment(secondAttachment.id);
    const finalPreview = await service.attachmentDeletionPreview(secondAttachment.id);
    expect(finalPreview).toMatchObject({ otherAttachmentCount: 0, managedObjectCount: 1 });
    expect(
      await service.permanentlyDeleteAttachment(
        secondAttachment.id,
        finalPreview.confirmationToken,
      ),
    ).toMatchObject({ deleted: true, assetDeleted: true, linkedSourcesDeleted: false });
    await expect(access(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(sourcePath)).toEqual(bytes);
  });

  it('永久删除链接附件只移除资料库记录，绝不删除源文件', async () => {
    const { service, sourceRoot } = await fixture();
    const sourcePath = join(sourceRoot, 'linked-notes.txt');
    const bytes = Buffer.from('keep this source file');
    await writeFile(sourcePath, bytes);
    const work = await manual(service, 'Linked attachment owner');
    const attached = await service.addLocalAttachment(work.editions[0]!.id, {
      path: sourcePath,
      storageMode: 'linked',
      role: 'other',
      mimeType: 'text/plain',
      displayName: 'linked-notes.txt',
    });
    const attachment = attached.editions[0]!.attachments[0]!;

    await service.recycleAttachment(attachment.id);
    const preview = await service.attachmentDeletionPreview(attachment.id);
    expect(preview).toMatchObject({ linkedLocationCount: 1, managedObjectCount: 0 });
    expect(
      await service.permanentlyDeleteAttachment(attachment.id, preview.confirmationToken),
    ).toMatchObject({ assetDeleted: true, linkedSourcesDeleted: false });
    expect(await readFile(sourcePath)).toEqual(bytes);
  });
});
