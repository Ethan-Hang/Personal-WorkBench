import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  importInspectionResponseSchema,
  importSessionViewSchema,
} from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-batch-routes-'));
  roots.push(root);
  const database = makeResearchDatabase();
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => join(root, 'managed'),
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
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app, root };
}

describe('research batch routes', () => {
  it('逐条失败可重试，批次也可以恢复后再取消', async () => {
    const { app, sqlite, root } = await fixture();
    const ready = join(root, 'ready.pdf');
    const later = join(root, 'later.pdf');
    await writeFile(ready, makePdfFixture({ title: 'Ready Batch Item' }));
    try {
      const preparedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importSessions,
        payload: {
          files: [
            { path: later, storageMode: 'linked' },
            { path: ready, storageMode: 'linked' },
          ],
          requestId: 'batch-route-recovery',
        },
      });
      const prepared = importSessionViewSchema.parse(preparedResponse.json());
      const inspectedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importInspect(prepared.id),
        payload: { allowExternal: false },
      });
      const inspected = importInspectionResponseSchema.parse(inspectedResponse.json());
      expect(inspected.items.map((item) => item.item.stage).sort()).toEqual([
        'awaiting-confirmation',
        'failed',
      ]);

      await writeFile(later, makePdfFixture({ title: 'Later Batch Item' }));
      const failedItem = inspected.items.find((item) => item.item.stage === 'failed')!;
      const retriedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importItemRetry(prepared.id, failedItem.item.id),
        payload: { allowExternal: false },
      });
      expect(
        importInspectionResponseSchema
          .parse(retriedResponse.json())
          .items.every((item) => item.item.stage === 'awaiting-confirmation'),
      ).toBe(true);

      const cancelledResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importCancel(prepared.id),
      });
      expect(importSessionViewSchema.parse(cancelledResponse.json())).toMatchObject({
        status: 'cancelled',
        items: [{ stage: 'cancelled' }, { stage: 'cancelled' }],
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('契约拒绝超过 200 个文件和条目 ID 不一致的决定', async () => {
    const { app, sqlite, root } = await fixture();
    try {
      const overflow = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importSessions,
        payload: {
          files: Array.from({ length: 201 }, (_, index) => ({
            path: join(root, `${index}.pdf`),
            storageMode: 'linked',
          })),
          requestId: 'batch-overflow',
        },
      });
      expect(overflow.statusCode).toBe(400);

      const source = join(root, 'one.pdf');
      await writeFile(source, makePdfFixture({ title: 'One' }));
      const prepared = importSessionViewSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.importSessions,
            payload: {
              files: [{ path: source, storageMode: 'linked' }],
              requestId: 'batch-one',
            },
          })
        ).json(),
      );
      const inspected = importInspectionResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: RESEARCH_API_V1.importInspect(prepared.id),
            payload: { allowExternal: false },
          })
        ).json(),
      );
      const mismatch = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.importItemDecision(prepared.id, inspected.items[0]!.item.id),
        payload: {
          itemId: 'different-item',
          duplicateDecision: 'defer',
          collectionIds: [],
          fields: {},
          requestId: 'mismatch',
        },
      });
      expect(mismatch.statusCode).toBe(400);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
