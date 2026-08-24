import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { ResearchService } from '../server/service.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const runBatch = process.env.RUN_RESEARCH_BATCH === '1' ? it : it.skip;

describe('200 file batch acceptance', () => {
  runBatch(
    '整批确认、部分失败、重启恢复、取消和批次内重复分组',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'research-batch-200-'));
      roots.push(root);
      const database = makeResearchDatabase();
      const contentStore = new ResearchContentStore(() => join(root, 'managed'));
      const makeService = () =>
        new ResearchService({
          repository: database.repo,
          contentStore,
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
        const paths = Array.from({ length: 200 }, (_, index) => join(root, `${index}.pdf`));
        await Promise.all(
          paths.slice(0, 199).map((path, index) =>
            writeFile(
              path,
              makePdfFixture({
                title: `Generated group ${index % 20}`,
                author: `Author ${index % 20}`,
              }),
            ),
          ),
        );
        const firstProcess = makeService();
        const session = await firstProcess.prepareImport({
          files: paths.map((path) => ({ path, storageMode: 'linked' as const })),
          requestId: 'acceptance-200',
        });

        await firstProcess.startImportInspection(session.id, {
          allowExternal: false,
          forceRefresh: false,
        });
        await expect
          .poll(async () => (await database.repo.getImportSession(session.id))?.status, {
            timeout: 150_000,
            interval: 100,
          })
          .toBe('awaiting-confirmation');
        const afterFirstProcess = await firstProcess.getImportInspection(session.id);
        expect(afterFirstProcess.items.filter((item) => item.item.stage === 'failed')).toHaveLength(
          1,
        );
        expect(
          afterFirstProcess.items.filter((item) => item.batchDuplicateItemIds.length > 0).length,
        ).toBe(199);

        // 新 service 实例使用同一数据库与托管根，模拟进程重启后的批次恢复。
        const resumedProcess = makeService();
        await writeFile(
          paths[199]!,
          makePdfFixture({ title: 'Generated group 19', author: 'Author 19' }),
        );
        const failed = afterFirstProcess.items.find((item) => item.item.stage === 'failed')!;
        await resumedProcess.retryImportItem(session.id, failed.item.id, {
          allowExternal: false,
          forceRefresh: false,
        });
        const recovered = await resumedProcess.getImportInspection(session.id);
        expect(recovered.items.every((item) => item.item.stage === 'awaiting-confirmation')).toBe(
          true,
        );
        expect(recovered.items.every((item) => item.batchDuplicateItemIds.length === 9)).toBe(true);

        for (const item of recovered.items) {
          const title = item.localSuggestions.find(
            (suggestion) => suggestion.fieldName === 'title',
          )!;
          await resumedProcess.saveImportDecision(session.id, item.item.id, {
            itemId: item.item.id,
            duplicateDecision: 'new-work',
            collectionIds: [],
            fields: {
              title: {
                value: title.value,
                sourceKind: title.sourceKind,
                sourceRecordId: title.sourceRecordId,
              },
              type: { value: 'article', sourceKind: 'user', sourceRecordId: null },
            },
            requestId: `accept-${item.item.id}`,
          });
        }
        const committed = await resumedProcess.commitImportSession(session.id);
        expect(committed.session.status).toBe('completed');
        expect(committed.results.filter((result) => result.status === 'committed')).toHaveLength(
          200,
        );
        expect(
          (
            database.sqlite.prepare('SELECT COUNT(*) AS count FROM research_works').get() as {
              count: number;
            }
          ).count,
        ).toBe(200);

        const cancelSession = await resumedProcess.prepareImport({
          files: paths.slice(0, 2).map((path) => ({ path, storageMode: 'linked' as const })),
          requestId: 'acceptance-cancel',
        });
        await resumedProcess.cancelImportSession(cancelSession.id);
        const afterCancelRestart = await makeService().getImportSession(cancelSession.id);
        expect(afterCancelRestart.status).toBe('cancelled');
        expect(afterCancelRestart.items.every((item) => item.stage === 'cancelled')).toBe(true);
      } finally {
        database.sqlite.close();
      }
    },
    180_000,
  );
});
