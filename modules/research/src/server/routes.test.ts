import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openTestDatabase } from '@workbench/data';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  importCommitResultSchema,
  importInspectionResponseSchema,
  importSessionViewSchema,
  importSessionsResponseSchema,
  workDetailViewSchema,
  worksPageResponseSchema,
} from '../contract.js';
import { ResearchContentStore } from '../files/content-store.js';
import type { MetadataCoordinator } from '../metadata/coordinator.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { SqliteResearchRepository } from '../storage/sqlite-repository.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function appFixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-routes-'));
  roots.push(root);
  const source = join(root, 'route-paper.pdf');
  await writeFile(
    source,
    makePdfFixture({
      title: 'Route Paper',
      author: 'Route Author',
      lines: ['Route Paper', 'doi:10.1000/route'],
    }),
  );
  const { sqlite } = openTestDatabase();
  const repository = new SqliteResearchRepository(() => sqlite);
  const metadata = {
    resolve: async () => ({
      candidates: [],
      sources: [],
      diagnostics: [],
      disclosure: { services: [], sentFields: [], sendsPdf: false as const },
    }),
  } as unknown as MetadataCoordinator;
  const module = createResearchServerModule({
    repository,
    managedRoot: () => join(root, 'managed'),
    contentStore: new ResearchContentStore(() => join(root, 'managed')),
    metadata,
    filePicker: { pick: async () => [source] },
  });
  const app = await buildApp({ getSqlite: () => sqlite, modules: [module] });
  return { app, sqlite, source };
}

describe('research HTTP API', () => {
  it('通过版本化路由完成选择、导入、确认和查询', async () => {
    const { app, sqlite, source } = await appFixture();
    try {
      const picked = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importPickFiles,
        payload: { multiple: false },
      });
      expect(picked.statusCode).toBe(200);
      expect(picked.json()).toEqual({ paths: [source], cancelled: false });

      const collectionResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.collections,
        payload: { name: 'Route Collection' },
      });
      expect(collectionResponse.statusCode).toBe(201);
      const collection = collectionResponse.json<{ id: string }>();

      const preparedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importSessions,
        payload: {
          files: [{ path: source, storageMode: 'managed' }],
          requestId: 'route-import',
        },
      });
      expect(preparedResponse.statusCode).toBe(201);
      const prepared = importSessionViewSchema.parse(preparedResponse.json());

      const inspectedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importInspect(prepared.id),
        payload: { allowExternal: false },
      });
      expect(inspectedResponse.statusCode).toBe(200);
      const inspected = importInspectionResponseSchema.parse(inspectedResponse.json());
      const item = inspected.items[0]!;
      const title = item.localSuggestions.find((value) => value.fieldName === 'title')!;
      const authors = item.localSuggestions.find((value) => value.fieldName === 'authors')!;

      const confirmedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importConfirm(prepared.id),
        payload: {
          itemId: item.item.id,
          duplicateDecision: 'new-work',
          collectionIds: [collection.id],
          fields: {
            title: {
              value: title.value,
              sourceKind: title.sourceKind,
              sourceRecordId: title.sourceRecordId,
            },
            authors: {
              value: authors.value,
              sourceKind: authors.sourceKind,
              sourceRecordId: authors.sourceRecordId,
            },
            type: { value: 'article', sourceKind: 'user', sourceRecordId: null },
          },
          requestId: 'route-confirm',
        },
      });
      expect(confirmedResponse.statusCode).toBe(200);
      const confirmed = confirmedResponse.json<{ workId: string }>();

      const worksResponse = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.works}?collectionId=${collection.id}`,
      });
      const works = worksPageResponseSchema.parse(worksResponse.json());
      expect(works.works).toEqual([
        expect.objectContaining({ id: confirmed.workId, title: 'Route Paper' }),
      ]);

      const detailResponse = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.work(confirmed.workId),
      });
      const detail = workDetailViewSchema.parse(detailResponse.json());
      expect(detail.editions[0]).toMatchObject({
        contributors: [expect.objectContaining({ displayName: 'Route Author' })],
        attachments: [
          expect.objectContaining({
            asset: expect.objectContaining({ locations: [expect.anything()] }),
          }),
        ],
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('边界输入和永久删除确认失败返回稳定 4xx', async () => {
    const { app, sqlite } = await appFixture();
    try {
      const invalid = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importSessions,
        payload: { files: [], requestId: '' },
      });
      expect(invalid.statusCode).toBe(400);

      const missing = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workPermanentDelete('missing-work'),
        payload: { confirmationToken: 'invalid-token' },
      });
      expect(missing.statusCode).toBe(409);
      expect(missing.json()).toEqual({ error: '永久删除确认已失效，请重新查看影响' });
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('浏览器 PDF 流只建立 managed 导入会话并可继续识别', async () => {
    const { app, sqlite } = await appFixture();
    try {
      const uploaded = await app.inject({
        method: 'POST',
        url: `${RESEARCH_API_V1.importUpload}?fileName=Browser%20Paper.pdf&requestId=browser-upload`,
        headers: { 'content-type': 'application/pdf' },
        payload: makePdfFixture({ title: 'Browser Paper', author: 'Local User' }),
      });

      expect(uploaded.statusCode).toBe(201);
      const session = importSessionViewSchema.parse(uploaded.json());
      expect(session.items).toEqual([
        expect.objectContaining({ fileName: 'Browser Paper.pdf', storageMode: 'managed' }),
      ]);

      const inspected = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importInspect(session.id),
        payload: { allowExternal: false },
      });
      expect(inspected.statusCode).toBe(200);
      const inspectedItem = importInspectionResponseSchema.parse(inspected.json()).items[0]!;
      expect(inspectedItem.asset).toMatchObject({ mimeType: 'application/pdf' });
      expect(inspectedItem.localSuggestions).toContainEqual(
        expect.objectContaining({ fieldName: 'title' }),
      );
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it('A2 路由支持导入箱逐项决定、批次提交和无附件记录', async () => {
    const { app, sqlite, source } = await appFixture();
    try {
      const manualResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.workManual,
        payload: {
          title: 'Manual Research Record',
          type: 'unknown',
          year: null,
          authors: ['Manual Author'],
          editionKind: 'unknown',
          publicationTitle: null,
          publisher: null,
          identifiers: [],
          collectionIds: [],
        },
      });
      expect(manualResponse.statusCode).toBe(201);
      const manual = workDetailViewSchema.parse(manualResponse.json());
      expect(manual.work).toMatchObject({ attachmentCount: 0, fileStatus: 'none' });

      const notesPath = join(source, '..', 'notes.txt');
      await writeFile(notesPath, 'supplementary notes');
      const attachmentResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.editionAttachments(manual.editions[0]!.id),
        payload: {
          path: notesPath,
          storageMode: 'linked',
          role: 'supplement',
          displayName: 'notes.txt',
          mimeType: 'text/plain',
        },
      });
      expect(attachmentResponse.statusCode).toBe(201);
      expect(
        workDetailViewSchema.parse(attachmentResponse.json()).editions[0]!.attachments,
      ).toEqual([expect.objectContaining({ role: 'supplement' })]);

      const preparedResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importSessions,
        payload: {
          files: [{ path: source, storageMode: 'managed' }],
          requestId: 'route-batch',
        },
      });
      const session = importSessionViewSchema.parse(preparedResponse.json());
      const started = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importInspectAsync(session.id),
        payload: { allowExternal: false },
      });
      expect(started.statusCode).toBe(202);

      let inspection = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await app.inject({
          method: 'GET',
          url: RESEARCH_API_V1.importInspection(session.id),
        });
        inspection = importInspectionResponseSchema.parse(response.json());
        if (inspection.status === 'awaiting-confirmation') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(inspection?.status).toBe('awaiting-confirmation');
      const inspectedItem = inspection!.items[0]!;
      const title = inspectedItem.localSuggestions.find(
        (suggestion) => suggestion.fieldName === 'title',
      )!;
      const decision = {
        itemId: inspectedItem.item.id,
        duplicateDecision: 'new-work' as const,
        collectionIds: [],
        fields: {
          title: {
            value: title.value,
            sourceKind: title.sourceKind,
            sourceRecordId: title.sourceRecordId,
          },
          type: { value: 'article', sourceKind: 'user' as const, sourceRecordId: null },
        },
        requestId: 'route-batch-decision',
      };
      const saved = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.importItemDecision(session.id, inspectedItem.item.id),
        payload: decision,
      });
      expect(importSessionViewSchema.parse(saved.json()).items[0]!.hasDecision).toBe(true);

      const committed = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.importCommit(session.id),
      });
      expect(importCommitResultSchema.parse(committed.json())).toMatchObject({
        session: { status: 'completed' },
        results: [{ status: 'committed' }],
      });

      const listed = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.importSessions}?status=completed`,
      });
      expect(importSessionsResponseSchema.parse(listed.json()).sessions).toEqual([
        expect.objectContaining({ id: session.id }),
      ]);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
