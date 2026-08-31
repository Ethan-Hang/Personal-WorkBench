import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import {
  RESEARCH_API_V1,
  annotationRevisionSchema,
  annotationSchema,
  readingContextCatalogSchema,
  readingContextSchema,
} from '../contract.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];
const HASH = 'e'.repeat(64);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function anchor(contentHash = HASH) {
  return {
    pageNumber: 3,
    pageSize: { width: 612, height: 792 },
    rect: null,
    quads: [{ x1: 10, y1: 30, x2: 90, y2: 30, x3: 10, y3: 20, x4: 90, y4: 20 }],
    textQuote: {
      exact: 'route selection',
      prefix: '',
      suffix: '',
      fingerprint: 'f'.repeat(64),
    },
    assetHash: contentHash,
    editionId: null,
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-annotation-routes-'));
  roots.push(root);
  const database = makeResearchDatabase(() => '2026-08-30T15:00:00.000Z');
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: HASH, byteSize: 20, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'paper.pdf'),
      resolvedPath: join(root, 'managed', HASH),
      objectKey: `sha256/ee/ee/${HASH}`,
      state: 'available',
    },
  );
  await database.repo.createCollection({
    id: 'collection-1',
    parentId: null,
    name: 'Collection',
    normalizedName: 'collection',
    sortOrder: 0,
  });
  let sequence = 0;
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => join(root, 'managed'),
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
    createId: () => `route-${++sequence}`,
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app };
}

describe('research annotation routes', () => {
  it('创建命名上下文、绑定目录并叠加读取通用层', async () => {
    const { app } = await fixture();
    try {
      const initial = await app.inject({ method: 'GET', url: RESEARCH_API_V1.readingContexts });
      expect(initial.statusCode).toBe(200);
      expect(readingContextCatalogSchema.parse(initial.json())).toMatchObject({
        general: { id: 'general' },
        contexts: [],
      });

      const createdResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.readingContexts,
        payload: { name: '路线分析', description: '第二遍阅读', color: '#2563eb' },
      });
      expect(createdResponse.statusCode).toBe(200);
      const context = readingContextSchema.parse(createdResponse.json());

      const binding = await app.inject({
        method: 'PUT',
        url: RESEARCH_API_V1.collectionReadingContext('collection-1'),
        payload: { contextId: context.id },
      });
      expect(binding.statusCode).toBe(200);
      expect(binding.json()).toMatchObject({
        collectionId: 'collection-1',
        context: { id: context.id },
      });

      const general = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-1'),
        payload: {
          contextId: null,
          kind: 'highlight',
          anchor: anchor(),
          body: 'general',
          color: '#fde047',
        },
      });
      const named = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-1'),
        payload: {
          contextId: context.id,
          kind: 'underline',
          anchor: anchor(),
          body: 'named',
          color: null,
        },
      });
      expect(general.statusCode).toBe(200);
      expect(named.statusCode).toBe(200);

      const listed = await app.inject({
        method: 'GET',
        url: `${RESEARCH_API_V1.assetAnnotations('asset-1')}?contextIds=${context.id}&includeGeneral=true`,
      });
      expect(listed.statusCode).toBe(200);
      expect(
        (listed.json() as unknown[]).map((value) => annotationSchema.parse(value).body),
      ).toEqual(['general', 'named']);
    } finally {
      await app.close();
    }
  });

  it('返回版本冲突、tombstone 修订和锚点失配状态', async () => {
    const { app } = await fixture();
    try {
      const createdResponse = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-1'),
        payload: {
          contextId: null,
          kind: 'highlight',
          anchor: anchor(),
          body: 'draft',
          color: null,
        },
      });
      const created = annotationSchema.parse(createdResponse.json());
      const updated = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.annotation(created.id),
        payload: { body: 'updated', expectedRevision: 1 },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ revision: 2, body: 'updated' });

      const stale = await app.inject({
        method: 'PATCH',
        url: RESEARCH_API_V1.annotation(created.id),
        payload: { body: 'stale', expectedRevision: 1 },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        code: 'ANNOTATION_CONFLICT',
        details: { current: { revision: 2, body: 'updated' } },
      });

      const deleted = await app.inject({
        method: 'DELETE',
        url: RESEARCH_API_V1.annotation(created.id),
        payload: { expectedRevision: 2 },
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ status: 'deleted', revision: 3 });
      const restored = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.annotationRestore(created.id),
        payload: { expectedRevision: 3 },
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ status: 'active', revision: 4 });

      const revisions = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.annotationRevisions(created.id),
      });
      expect(revisions.statusCode).toBe(200);
      expect(
        (revisions.json() as unknown[]).map(
          (value) => annotationRevisionSchema.parse(value).reason,
        ),
      ).toEqual(['restore', 'delete', 'update']);

      const mismatch = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-1'),
        payload: {
          contextId: null,
          kind: 'highlight',
          anchor: anchor('0'.repeat(64)),
          body: null,
          color: null,
        },
      });
      expect(mismatch.statusCode).toBe(200);
      expect(mismatch.json()).toMatchObject({ status: 'needs-review' });
    } finally {
      await app.close();
    }
  });

  it('归档上下文必须显式选择保留或移层', async () => {
    const { app } = await fixture();
    try {
      const created = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.readingContexts,
        payload: { name: 'Context' },
      });
      const context = readingContextSchema.parse(created.json());
      await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotations('asset-1'),
        payload: {
          contextId: context.id,
          kind: 'highlight',
          anchor: anchor(),
          body: null,
          color: null,
        },
      });
      const preview = await app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.readingContextDeletionPreview(context.id),
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ annotationCount: 1 });

      const invalid = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.readingContextArchive(context.id),
        payload: {},
      });
      expect(invalid.statusCode).toBe(400);

      const archived = await app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.readingContextArchive(context.id),
        payload: { strategy: 'move-to-general' },
      });
      expect(archived.statusCode).toBe(200);
      expect(archived.json()).toMatchObject({
        context: { status: 'archived' },
        movedAnnotations: 1,
      });
    } finally {
      await app.close();
    }
  });
});
