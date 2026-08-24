import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResearchSearchAst } from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

describe('切片 A 用户操作验收', () => {
  it('从批量导入连续完成治理、搜索、文件恢复、合并撤销、回收恢复和迁移导出', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-slice-a-workflow-'));
    roots.push(root);
    const sources = join(root, 'sources');
    await mkdir(sources);
    const firstPath = join(sources, 'first.pdf');
    const secondPath = join(sources, 'second.pdf');
    await writeFile(firstPath, makePdfFixture({ title: 'Workflow Alpha', author: 'Ada Lovelace' }));
    await writeFile(secondPath, makePdfFixture({ title: 'Workflow Beta', author: 'Grace Hopper' }));
    const database = makeResearchDatabase();
    const service = new ResearchService({
      repository: database.repo,
      contentStore: new ResearchContentStore(() => join(root, 'managed')),
      metadata: {
        resolve: async () => ({
          candidates: [],
          sources: [],
          diagnostics: [],
          disclosure: { services: [], sentFields: [], sendsPdf: false as const },
        }),
      } as unknown as MetadataCoordinator,
      filePicker: { pick: async () => [] },
    });

    try {
      const reading = await service.createCollection({ name: 'Reading' });
      const methods = await service.createCollection({ name: 'Methods' });
      const trusted = await service.createTag({
        name: 'trusted',
        aliases: [],
        color: '#457b62',
        description: null,
      });
      const session = await service.prepareImport({
        files: [firstPath, secondPath].map((path) => ({
          path,
          storageMode: 'linked' as const,
        })),
        requestId: 'slice-a-acceptance-import',
      });
      const inspection = await service.inspectImport(session.id, {
        allowExternal: false,
        forceRefresh: false,
      });
      expect(inspection.items).toHaveLength(2);
      for (const [index, item] of inspection.items.entries()) {
        const title = item.localSuggestions.find((suggestion) => suggestion.fieldName === 'title')!;
        const authors = item.localSuggestions.find(
          (suggestion) => suggestion.fieldName === 'authors',
        );
        await service.saveImportDecision(session.id, item.item.id, {
          itemId: item.item.id,
          duplicateDecision: 'new-work',
          collectionIds: index === 0 ? [reading.id, methods.id] : [reading.id],
          fields: {
            title: {
              value: title.value,
              sourceKind: title.sourceKind,
              sourceRecordId: title.sourceRecordId,
            },
            type: { value: 'article', sourceKind: 'user', sourceRecordId: null },
            ...(authors
              ? {
                  authors: {
                    value: authors.value,
                    sourceKind: authors.sourceKind,
                    sourceRecordId: authors.sourceRecordId,
                  },
                }
              : {}),
          },
          requestId: `slice-a-confirm-${index}`,
        });
      }
      const committed = await service.commitImportSession(session.id);
      expect(committed.session.status).toBe('completed');
      const workIds = committed.results
        .filter((result) => result.status === 'committed')
        .map((result) => result.workId!);
      expect(workIds).toHaveLength(2);

      await service.setWorkTags(workIds[0]!, [trusted.id]);
      const searchAst: ResearchSearchAst = {
        version: 1,
        text: 'Ada Lovelace',
        filters: { ...emptyFilters(), collectionIds: [methods.id], tagIds: [trusted.id] },
        sort: 'relevance',
      };
      expect(
        (await service.structuredSearch({ ast: searchAst, cursor: null, limit: 20 })).works.map(
          (work) => work.id,
        ),
      ).toEqual([workIds[0]]);
      const saved = await service.createSavedQuery({
        name: 'Trusted methods',
        parentId: null,
        ast: searchAst,
      });
      expect((await service.runSavedQuery(saved.id, null, 20)).works[0]?.id).toBe(workIds[0]);

      const beforeMove = await service.getWork(workIds[0]!);
      const location = beforeMove.editions[0]!.attachments[0]!.asset.locations[0]!;
      const movedPath = join(sources, 'first-moved.pdf');
      await rename(firstPath, movedPath);
      expect(await service.checkLocation(location.id)).toMatchObject({
        location: { state: 'missing' },
        audit: { state: 'missing', errorCode: 'ENOENT' },
      });
      expect(await service.relinkLocation(location.id, movedPath)).toMatchObject({
        kind: 'restored',
      });

      const duplicate = await service.createManualWork({
        title: 'Workflow Alpha candidate',
        type: 'article',
        year: 2026,
        authors: ['Ada Lovelace'],
        editionKind: 'journal',
        publicationTitle: null,
        publisher: null,
        identifiers: [],
        collectionIds: [],
      });
      const mergePreview = await service.previewWorkMerge(workIds[0]!, duplicate.work.id);
      const merge = await service.mergeWorks(workIds[0]!, {
        mergedWorkId: duplicate.work.id,
        expectedSurvivorRevision: mergePreview.survivor.revision,
        expectedMergedRevision: mergePreview.merged.revision,
        fieldChoices: {
          title: 'survivor',
          type: 'survivor',
          abstract: 'survivor',
          year: 'survivor',
        },
        editionIdsToMove: mergePreview.merged.editionIds,
        preferredEditionId: mergePreview.survivor.editionIds[0]!,
      });
      expect((await service.getWork(workIds[0]!)).editions).toHaveLength(2);
      await service.undoMerge(merge.id);
      expect((await service.getWork(workIds[0]!)).editions).toHaveLength(1);

      await service.trashWork(workIds[1]!);
      expect((await service.getWork(workIds[1]!)).work.status).toBe('trashed');
      await service.restoreWork(workIds[1]!);
      expect((await service.getWork(workIds[1]!)).work.status).toBe('active');

      const targetPath = join(root, 'portable-export');
      const started = await service.startPortableExport({
        targetPath,
        includeManagedFiles: false,
        includeLinkedFiles: true,
      });
      let exported = started;
      for (let attempt = 0; attempt < 100 && exported.status === 'running'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        exported = await service.getPortableExport(started.id);
      }
      expect(exported).toMatchObject({ status: 'completed', report: { roundTripValid: true } });
      await Promise.all(
        ['library.json', 'manifest.json', 'report.json'].map((name) =>
          access(join(targetPath, name)),
        ),
      );
    } finally {
      database.sqlite.close();
    }
  });
});
