import { afterEach, describe, expect, it } from 'vitest';
import type { ResearchSearchAst } from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import { makeResearchDatabase } from '../testing/harness.js';

const databases: Array<ReturnType<typeof makeResearchDatabase>> = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});

function fixture() {
  let tick = 0;
  const database = makeResearchDatabase(() =>
    new Date(Date.UTC(2026, 7, 23, 3, 0, tick++)).toISOString(),
  );
  databases.push(database);
  const service = new ResearchService({
    repository: database.repo,
    contentStore: new ResearchContentStore(() => '/tmp/research-search-unused'),
    metadata: { resolve: async () => undefined } as unknown as MetadataCoordinator,
    filePicker: { pick: async () => [] },
  });
  return { ...database, service };
}

async function manual(
  service: ResearchService,
  title: string,
  options: {
    year?: number | null;
    authors?: string[];
    publication?: string | null;
    doi?: string;
  } = {},
) {
  return service.createManualWork({
    title,
    type: 'article',
    year: options.year ?? null,
    authors: options.authors ?? [],
    editionKind: 'journal',
    publicationTitle: options.publication ?? null,
    publisher: null,
    identifiers: options.doi ? [{ scheme: 'doi', value: options.doi }] : [],
    collectionIds: [],
  });
}

function emptyFilters(): ResearchSearchAst['filters'] {
  return {
    collectionIds: [],
    tagIds: [],
    types: [],
    yearFrom: null,
    yearTo: null,
    attachmentRoles: [],
    storageModes: [],
    fileStatuses: [],
    maintenance: [],
    relatedWorkId: null,
  };
}

describe('结构化与模糊检索', () => {
  it('搜索标题、作者、摘要、出版信息和标识符，并返回稳定分数与命中字段', async () => {
    const { service, sqlite } = fixture();
    const target = await manual(service, 'Trustworthy Local Research', {
      year: 2026,
      authors: ['Ada Lovelace'],
      publication: 'Journal of Durable Data',
      doi: '10.1000/trust',
    });
    await manual(service, 'Unrelated Biology', { year: 2020, authors: ['Charles Darwin'] });
    sqlite
      .prepare("UPDATE research_works SET abstract = 'Offline metadata provenance' WHERE id = ?")
      .run(target.work.id);

    for (const [text, field] of [
      ['Lovelce', 'authors'],
      ['metadata provenance', 'abstract'],
      ['Durable Data', 'publication'],
      ['10.1000/trust', 'identifiers'],
    ] as const) {
      const result = await service.structuredSearch({
        ast: { version: 1, text, filters: emptyFilters(), sort: 'relevance' },
        cursor: null,
        limit: 20,
      });
      expect(result.works[0]).toMatchObject({ id: target.work.id });
      expect(result.works[0]!.searchScore).toBeGreaterThanOrEqual(0.28);
      expect(result.works[0]!.matchedFields).toContain(field);
      expect(result.works.map((work) => work.title)).not.toContain('Unrelated Biology');
    }
  });

  it('组合目录、标签、类型、年份、附件角色、存储模式、文件状态与关系过滤', async () => {
    const { service, sqlite } = fixture();
    const collection = await service.createCollection({ name: 'Methods' });
    const tag = await service.createTag({
      name: 'Reviewed',
      aliases: [],
      color: null,
      description: null,
    });
    const target = await manual(service, 'Filtered Work', { year: 2025, authors: ['Ada'] });
    const related = await manual(service, 'Related Work', { year: 2024 });
    await service.setWorkCollections(target.work.id, [collection.id]);
    await service.setWorkTags(target.work.id, [tag.id]);
    await service.addWorkRelation(target.work.id, {
      targetWorkId: related.work.id,
      kind: 'related',
      note: null,
    });
    const editionId = target.editions[0]!.id;
    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state)
         VALUES ('asset-filter', 'sha256', ?, 12, 'application/pdf', 'active')`,
      )
      .run('a'.repeat(64));
    sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, object_key, state)
         VALUES ('location-filter', 'asset-filter', 'managed', '/source.pdf', '/managed.pdf',
                 'sha256/aa/file', 'available')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status)
         VALUES ('attachment-filter', ?, 'asset-filter', 'primary-pdf', 'source.pdf', 'active')`,
      )
      .run(editionId);

    const result = await service.structuredSearch({
      ast: {
        version: 1,
        text: '',
        filters: {
          ...emptyFilters(),
          collectionIds: [collection.id],
          tagIds: [tag.id],
          types: ['article'],
          yearFrom: 2025,
          yearTo: 2025,
          attachmentRoles: ['primary-pdf'],
          storageModes: ['managed'],
          fileStatuses: ['available'],
          relatedWorkId: related.work.id,
        },
        sort: 'title-asc',
      },
      cursor: null,
      limit: 20,
    });
    expect(result.works.map((work) => work.id)).toEqual([target.work.id]);
  });

  it('维护过滤覆盖缺失字段和缺失文件', async () => {
    const { service, sqlite } = fixture();
    const incomplete = await manual(service, 'Incomplete Work');
    const missing = await manual(service, 'Missing File Work', { year: 2026, authors: ['Ada'] });
    const editionId = missing.editions[0]!.id;
    sqlite
      .prepare(
        `INSERT INTO research_assets
         (id, hash_algorithm, content_hash, byte_size, mime_type, state)
         VALUES ('asset-missing', 'sha256', ?, 12, 'application/pdf', 'active')`,
      )
      .run('b'.repeat(64));
    sqlite
      .prepare(
        `INSERT INTO research_asset_locations
         (id, asset_id, mode, original_path, resolved_path, object_key, state)
         VALUES ('location-missing', 'asset-missing', 'linked', '/gone.pdf', '/gone.pdf', NULL, 'missing')`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO research_attachments
         (id, edition_id, asset_id, role, display_name, status)
         VALUES ('attachment-missing', ?, 'asset-missing', 'primary-pdf', 'gone.pdf', 'active')`,
      )
      .run(editionId);

    const find = async (maintenance: 'missing-fields' | 'missing-files') =>
      service.structuredSearch({
        ast: {
          version: 1,
          text: '',
          filters: { ...emptyFilters(), maintenance: [maintenance] },
          sort: 'updated-desc',
        },
        cursor: null,
        limit: 20,
      });
    expect((await find('missing-fields')).works.map((work) => work.id)).toContain(
      incomplete.work.id,
    );
    expect((await find('missing-files')).works.map((work) => work.id)).toEqual([missing.work.id]);
  });

  it('保存查询作为 smart collection 执行，未知版本明确拒绝', async () => {
    const { service, sqlite } = fixture();
    const target = await manual(service, 'Saved Query Work', { year: 2026, authors: ['Ada'] });
    await manual(service, 'Older Work', { year: 2020, authors: ['Ada'] });
    const ast = {
      version: 1 as const,
      text: '',
      filters: { ...emptyFilters(), yearFrom: 2025 },
      sort: 'year-desc' as const,
    };
    const saved = await service.createSavedQuery({ name: 'Recent papers', parentId: null, ast });
    expect(saved).toMatchObject({ kind: 'smart', queryAst: ast });
    expect((await service.runSavedQuery(saved.id, null, 20)).works.map((work) => work.id)).toEqual([
      target.work.id,
    ]);

    sqlite
      .prepare('UPDATE research_collections SET query_json = \'{"version":99}\' WHERE id = ?')
      .run(saved.id);
    await expect(service.runSavedQuery(saved.id, null, 20)).rejects.toThrow('版本不受支持');
  });

  it('keyset 分页在并发新增记录时不重复既有结果', async () => {
    const { service } = fixture();
    const first = await manual(service, 'First page item', { year: 2026 });
    const second = await manual(service, 'Second page item', { year: 2026 });
    const third = await manual(service, 'Third page item', { year: 2026 });
    const ast = {
      version: 1 as const,
      text: '',
      filters: emptyFilters(),
      sort: 'updated-desc' as const,
    };
    const pageOne = await service.structuredSearch({ ast, cursor: null, limit: 2 });
    expect(pageOne.nextCursor).not.toBeNull();
    await manual(service, 'Inserted after page one', { year: 2026 });
    const pageTwo = await service.structuredSearch({ ast, cursor: pageOne.nextCursor, limit: 2 });
    expect(pageTwo.works.map((work) => work.id)).toEqual([first.work.id]);
    expect(new Set([...pageOne.works, ...pageTwo.works].map((work) => work.id)).size).toBe(3);
    expect(pageOne.works.map((work) => work.id)).toEqual([third.work.id, second.work.id]);
  });
});
