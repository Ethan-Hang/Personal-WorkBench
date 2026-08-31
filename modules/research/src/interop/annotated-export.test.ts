import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import type { Annotation, AnnotationKind } from '../contract.js';
import { makePagedPdfFixture, makePdfFixture } from '../testing/pdf-fixture.js';
import { PdfLibAnnotatedPdfWriter, planAnnotatedPdfExport } from './annotated-export.js';

const roots: string[] = [];
const HASH = 'a'.repeat(64);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function annotation(
  id: string,
  kind: AnnotationKind,
  pageNumber: number,
  geometry: { rect?: { x: number; y: number; width: number; height: number }; quads?: [] } = {},
): Annotation {
  return {
    id,
    assetId: 'asset-1',
    editionId: null,
    contextId: id.endsWith('general') ? null : 'context-1',
    kind,
    pageNumber,
    anchor: {
      pageNumber,
      pageSize: { width: 612, height: 792 },
      rect: geometry.rect ?? null,
      quads:
        geometry.quads ??
        (['highlight', 'underline', 'strikeout'].includes(kind)
          ? [{ x1: 72, y1: 730, x2: 250, y2: 730, x3: 72, y3: 710, x4: 250, y4: 710 }]
          : []),
      textQuote: ['highlight', 'underline', 'strikeout'].includes(kind)
        ? { exact: 'Research Workbench', prefix: '', suffix: '', fingerprint: HASH }
        : null,
      assetHash: HASH,
      editionId: null,
    },
    body: id === 'note-zh' ? '中文批注：可追溯位置' : `body ${id}`,
    color: '#2563eb',
    status: 'active',
    revision: 2,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:01:00.000Z',
    deletedAt: null,
  };
}

async function rotatedFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.load(makePagedPdfFixture(2));
  document.getPage(1).setRotation(degrees(90));
  return document.save({ useObjectStreams: false });
}

function incrementalFixture(): Buffer {
  const source = makePdfFixture();
  const sourceText = source.toString('binary');
  const previousXref = Number(sourceText.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  if (!Number.isInteger(previousXref)) throw new Error('fixture startxref is missing');
  const objectOffset = Buffer.byteLength(`${sourceText}\n`, 'binary');
  const prefix = `${sourceText}\n7 0 obj\n<< /Producer (Research incremental fixture) >>\nendobj\n`;
  const xref = Buffer.byteLength(prefix, 'binary');
  return Buffer.from(
    `${prefix}xref\n7 1\n${objectOffset.toString().padStart(10, '0')} 00000 n \ntrailer\n<< /Size 8 /Root 1 0 R /Info 7 0 R /Prev ${previousXref} >>\nstartxref\n${xref}\n%%EOF\n`,
    'binary',
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PdfLibAnnotatedPdfWriter', () => {
  it('写入标准文本、区域和中文便笺批注，保留旋转页并生成可由 PDF.js 打开的副本', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-annotated-export-'));
    roots.push(root);
    const sourcePath = join(root, 'source.pdf');
    const targetPath = join(root, 'annotated.pdf');
    const source = await rotatedFixture();
    const sourceHash = sha256(source);
    await writeFile(sourcePath, source);
    const annotations = [
      annotation('highlight-general', 'highlight', 1),
      annotation('underline', 'underline', 1),
      annotation('strikeout', 'strikeout', 2),
      annotation('area', 'area', 2, { rect: { x: 300, y: 500, width: 120, height: 80 } }),
      annotation('note-zh', 'note', 2, { rect: { x: 100, y: 600, width: 18, height: 18 } }),
      annotation('bookmark', 'bookmark', 2),
    ].map((value) => ({
      ...value,
      anchor: { ...value.anchor, assetHash: sourceHash },
    }));
    const result = await new PdfLibAnnotatedPdfWriter().write({
      sourcePath,
      targetPath,
      sourceHash,
      annotations,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      pageCount: 2,
      outputReadable: true,
      fullRewrite: true,
    });
    expect(result.decisions.map((decision) => decision.treatment)).toEqual([
      'standard',
      'standard',
      'standard',
      'standard',
      'standard',
      'flattened',
    ]);
    expect(sha256(await readFile(sourcePath))).toBe(sourceHash);

    const output = await readFile(targetPath);
    const loading = getDocument({ data: new Uint8Array(output) });
    try {
      const pdf = await loading.promise;
      expect(pdf.numPages).toBe(2);
      expect((await pdf.getPage(2)).rotate).toBe(90);
      const pageOne = await pdf.getPage(1);
      const pageTwo = await pdf.getPage(2);
      const exported = [...(await pageOne.getAnnotations()), ...(await pageTwo.getAnnotations())];
      expect(exported.map((value) => value.subtype)).toEqual([
        'Highlight',
        'Underline',
        'StrikeOut',
        'Square',
        'Text',
      ]);
      expect(exported.find((value) => value.subtype === 'Text')?.contentsObj.str).toBe(
        '中文批注：可追溯位置',
      );
    } finally {
      await loading.destroy();
    }
  });

  it('读取含增量更新段的输入；错页、旧锚点和缺失几何在计划中明确跳过', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-annotated-incremental-'));
    roots.push(root);
    const sourcePath = join(root, 'incremental.pdf');
    const source = incrementalFixture();
    await writeFile(sourcePath, source);
    await expect(new PdfLibAnnotatedPdfWriter().inspect(sourcePath)).resolves.toEqual({
      pageCount: 1,
      sourceBytes: source.length,
    });

    const wrongPage = annotation('wrong-page', 'note', 2, {
      rect: { x: 10, y: 10, width: 18, height: 18 },
    });
    const oldAnchor = {
      ...annotation('old-anchor', 'bookmark', 1),
      status: 'needs-review' as const,
    };
    const missingGeometry = annotation('missing-geometry', 'highlight', 1, { quads: [] });
    expect(planAnnotatedPdfExport([wrongPage, oldAnchor, missingGeometry], 1, HASH)).toEqual([
      expect.objectContaining({ treatment: 'skipped', warning: '批注页码超出当前 PDF 页数' }),
      expect.objectContaining({
        treatment: 'skipped',
        warning: expect.stringContaining('不再匹配'),
      }),
      expect.objectContaining({ treatment: 'skipped', warning: '文本批注缺少四边形坐标' }),
    ]);
  });

  it('取消时不创建输出文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-annotated-cancel-'));
    roots.push(root);
    const sourcePath = join(root, 'source.pdf');
    const targetPath = join(root, 'cancelled.pdf');
    const source = makePdfFixture();
    await writeFile(sourcePath, source);
    const controller = new AbortController();
    controller.abort();
    await expect(
      new PdfLibAnnotatedPdfWriter().write({
        sourcePath,
        targetPath,
        sourceHash: sha256(source),
        annotations: [],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(readFile(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
