import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@workbench/server';
import { ResearchAnnotationService } from '../annotation/service.js';
import {
  RESEARCH_API_V1,
  annotatedExportJobSchema,
  annotatedExportPreviewSchema,
  pickAnnotatedExportTargetResponseSchema,
} from '../contract.js';
import { makePdfFixture } from '../testing/pdf-fixture.js';
import { makeResearchDatabase } from '../testing/harness.js';
import { createResearchServerModule } from './index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-annotated-export-routes-'));
  roots.push(root);
  const managedRoot = join(root, 'managed');
  const bytes = makePdfFixture();
  const hash = createHash('sha256').update(bytes).digest('hex');
  const objectKey = `sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
  const sourcePath = join(managedRoot, ...objectKey.split('/'));
  await mkdir(join(sourcePath, '..'), { recursive: true });
  await writeFile(sourcePath, bytes);
  const database = makeResearchDatabase();
  await database.repo.storeAsset(
    { id: 'asset-1', contentHash: hash, byteSize: bytes.length, mimeType: 'application/pdf' },
    {
      id: 'location-1',
      mode: 'managed',
      originalPath: join(root, 'paper.pdf'),
      resolvedPath: sourcePath,
      objectKey,
      state: 'available',
    },
  );
  const annotations = new ResearchAnnotationService(database.repo, {
    createId: () => 'annotation-route-1',
  });
  await annotations.createAnnotation('asset-1', {
    contextId: null,
    kind: 'highlight',
    anchor: {
      pageNumber: 1,
      pageSize: { width: 612, height: 792 },
      rect: null,
      quads: [{ x1: 72, y1: 730, x2: 250, y2: 730, x3: 72, y3: 710, x4: 250, y4: 710 }],
      textQuote: {
        exact: 'Research Workbench',
        prefix: '',
        suffix: '',
        fingerprint: 'c'.repeat(64),
      },
      assetHash: hash,
      editionId: null,
    },
    body: '路由测试批注',
    color: '#2563eb',
  });
  const targetPath = join(root, 'paper-annotated.pdf');
  const revealed: string[] = [];
  const module = createResearchServerModule({
    repository: database.repo,
    managedRoot: () => managedRoot,
    metadata: { resolve: async () => undefined } as never,
    filePicker: { pick: async () => [] },
    pdfOutputDialog: {
      savePdf: async () => targetPath,
      reveal: async (filePath) => {
        revealed.push(filePath);
        return true;
      },
    },
  });
  const app = await buildApp({ getSqlite: () => database.sqlite, modules: [module] });
  return { ...database, app, targetPath, revealed };
}

async function waitForCompleted(app: Awaited<ReturnType<typeof fixture>>['app'], id: string) {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const response = await app.inject({
      method: 'GET',
      url: RESEARCH_API_V1.annotatedExportJob(id),
    });
    const job = annotatedExportJobSchema.parse(response.json());
    if (['completed', 'failed'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('annotated export route timed out');
}

describe('research annotated export routes', () => {
  it('选择目标、预览、执行、查询并打开导出位置', async () => {
    const value = await fixture();
    try {
      const picked = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotatedExportPickTarget('asset-1'),
        payload: { suggestedName: 'paper-annotated.pdf' },
      });
      expect(picked.statusCode).toBe(200);
      expect(pickAnnotatedExportTargetResponseSchema.parse(picked.json())).toEqual({
        path: value.targetPath,
        cancelled: false,
      });

      const previewResponse = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotatedExportPreview('asset-1'),
        payload: { includeGeneral: true, contextIds: [], targetPath: value.targetPath },
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(annotatedExportPreviewSchema.parse(previewResponse.json())).toMatchObject({
        annotationCount: 1,
        standardCount: 1,
        targetExists: false,
      });

      const startedResponse = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotatedExports('asset-1'),
        payload: {
          includeGeneral: true,
          contextIds: [],
          targetPath: value.targetPath,
          overwriteConfirmed: false,
        },
      });
      expect(startedResponse.statusCode).toBe(200);
      const started = annotatedExportJobSchema.parse(startedResponse.json());
      const completed = await waitForCompleted(value.app, started.id);
      expect(completed).toMatchObject({
        status: 'completed',
        report: { outputReadable: true, sourceHashUnchanged: true, standardCount: 1 },
      });
      expect((await readFile(value.targetPath)).subarray(0, 5).toString()).toBe('%PDF-');

      const opened = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.annotatedExportOpenLocation(started.id),
      });
      expect(opened.statusCode).toBe(200);
      expect(opened.json()).toEqual({ opened: true });
      expect(value.revealed).toEqual([value.targetPath]);
    } finally {
      await value.app.close();
      value.sqlite.close();
    }
  });

  it('映射非法输入、缺失任务和未确认覆盖错误', async () => {
    const value = await fixture();
    try {
      const invalid = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotatedExports('asset-1'),
        payload: { targetPath: join(value.targetPath, '..', 'not-pdf.txt') },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: 'READER_EXPORT_FAILED' });

      const missing = await value.app.inject({
        method: 'GET',
        url: RESEARCH_API_V1.annotatedExportJob('missing'),
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ code: 'READER_EXPORT_NOT_FOUND' });

      await writeFile(value.targetPath, 'existing');
      const conflict = await value.app.inject({
        method: 'POST',
        url: RESEARCH_API_V1.assetAnnotatedExports('asset-1'),
        payload: {
          includeGeneral: true,
          contextIds: [],
          targetPath: value.targetPath,
          overwriteConfirmed: false,
        },
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ code: 'READER_EXPORT_TARGET_EXISTS' });
    } finally {
      await value.app.close();
      value.sqlite.close();
    }
  });
});
