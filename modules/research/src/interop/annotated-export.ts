import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFHexString, PDFName, PDFString, rgb, type PDFPage } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Annotation, AnnotationKind, PdfQuad, PdfRect } from '../contract.js';

export type AnnotatedExportTreatment = 'standard' | 'flattened' | 'skipped';

export interface AnnotationExportDecision {
  annotationId: string;
  revision: number;
  contextId: string | null;
  kind: AnnotationKind;
  treatment: AnnotatedExportTreatment;
  warning: string | null;
}

export interface AnnotatedPdfInspection {
  pageCount: number;
  sourceBytes: number;
}

export interface AnnotatedPdfWriteResult extends AnnotatedPdfInspection {
  decisions: AnnotationExportDecision[];
  outputBytes: number;
  outputHash: string;
  outputReadable: true;
  fullRewrite: true;
  warnings: string[];
}

export interface AnnotatedPdfWriter {
  inspect(sourcePath: string): Promise<AnnotatedPdfInspection>;
  write(input: {
    sourcePath: string;
    targetPath: string;
    sourceHash: string;
    annotations: Annotation[];
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => Promise<void> | void;
  }): Promise<AnnotatedPdfWriteResult>;
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('带批注副本导出已取消', 'AbortError');
}

function rectBounds(rect: PdfRect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
}

function quadBounds(quads: PdfQuad[]): [number, number, number, number] {
  const xs = quads.flatMap((quad) => [quad.x1, quad.x2, quad.x3, quad.x4]);
  const ys = quads.flatMap((quad) => [quad.y1, quad.y2, quad.y3, quad.y4]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function normalizedRect(
  bounds: [number, number, number, number],
): [number, number, number, number] {
  const [x1, y1, x2, y2] = bounds;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function parseColor(value: string | null): [number, number, number] {
  const match = value?.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return [250 / 255, 204 / 255, 21 / 255];
  const color = Number.parseInt(match[1]!, 16);
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}

function decisionFor(
  annotation: Annotation,
  pageCount: number,
  sourceHash: string,
): AnnotationExportDecision {
  const shared = {
    annotationId: annotation.id,
    revision: annotation.revision,
    contextId: annotation.contextId,
    kind: annotation.kind,
  };
  if (annotation.status !== 'active' || annotation.anchor.assetHash !== sourceHash) {
    return {
      ...shared,
      treatment: 'skipped',
      warning: '批注锚点不再匹配当前 Asset，未写入副本',
    };
  }
  if (annotation.pageNumber > pageCount) {
    return { ...shared, treatment: 'skipped', warning: '批注页码超出当前 PDF 页数' };
  }
  if (['highlight', 'underline', 'strikeout'].includes(annotation.kind)) {
    return annotation.anchor.quads.length > 0
      ? { ...shared, treatment: 'standard', warning: null }
      : { ...shared, treatment: 'skipped', warning: '文本批注缺少四边形坐标' };
  }
  if (annotation.kind === 'area' || annotation.kind === 'note') {
    return annotation.anchor.rect
      ? { ...shared, treatment: 'standard', warning: null }
      : { ...shared, treatment: 'skipped', warning: '区域批注缺少矩形坐标' };
  }
  return {
    ...shared,
    treatment: 'flattened',
    warning: '页书签以页边色块写入页面内容，不是可编辑 PDF 批注',
  };
}

export function planAnnotatedPdfExport(
  annotations: Annotation[],
  pageCount: number,
  sourceHash: string,
): AnnotationExportDecision[] {
  return annotations.map((annotation) => decisionFor(annotation, pageCount, sourceHash));
}

function annotationContents(annotation: Annotation): string {
  return annotation.body?.trim() || annotation.anchor.textQuote?.exact || annotation.kind;
}

function addStandardAnnotation(page: PDFPage, annotation: Annotation): void {
  const context = page.doc.context;
  const color = parseColor(annotation.color);
  const common = {
    Type: PDFName.of('Annot'),
    P: page.ref,
    NM: PDFHexString.fromText(annotation.id),
    Contents: PDFHexString.fromText(annotationContents(annotation)),
    T: PDFHexString.fromText(annotation.contextId ?? '通用批注'),
    M: PDFString.fromDate(new Date(annotation.updatedAt)),
    C: color,
    F: 4,
  };
  let dictionary;
  if (['highlight', 'underline', 'strikeout'].includes(annotation.kind)) {
    const subtype =
      annotation.kind === 'highlight'
        ? 'Highlight'
        : annotation.kind === 'underline'
          ? 'Underline'
          : 'StrikeOut';
    dictionary = context.obj({
      ...common,
      Subtype: PDFName.of(subtype),
      Rect: normalizedRect(quadBounds(annotation.anchor.quads)),
      QuadPoints: annotation.anchor.quads.flatMap((quad) => [
        quad.x1,
        quad.y1,
        quad.x2,
        quad.y2,
        quad.x3,
        quad.y3,
        quad.x4,
        quad.y4,
      ]),
      CA: annotation.kind === 'highlight' ? 0.34 : 1,
    });
  } else if (annotation.kind === 'area') {
    dictionary = context.obj({
      ...common,
      Subtype: PDFName.of('Square'),
      Rect: normalizedRect(rectBounds(annotation.anchor.rect!)),
      Border: [0, 0, 2],
      BS: { W: 2, S: PDFName.of('S') },
    });
  } else {
    const [x1, y1, x2, y2] = normalizedRect(rectBounds(annotation.anchor.rect!));
    dictionary = context.obj({
      ...common,
      Subtype: PDFName.of('Text'),
      Rect: [x1, y1, Math.max(x2, x1 + 18), Math.max(y2, y1 + 18)],
      Name: PDFName.of('Comment'),
      Open: false,
    });
  }
  page.node.addAnnot(context.register(dictionary));
}

function flattenBookmark(page: PDFPage, annotation: Annotation): void {
  const [red, green, blue] = parseColor(annotation.color);
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: Math.max(0, width - 14),
    y: Math.max(0, height - 34),
    width: 10,
    height: 28,
    color: rgb(red, green, blue),
    opacity: 0.9,
  });
}

async function inspectBytes(bytes: Uint8Array): Promise<number> {
  const task = getDocument({
    data: new Uint8Array(bytes),
  });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

export class PdfLibAnnotatedPdfWriter implements AnnotatedPdfWriter {
  async inspect(sourcePath: string): Promise<AnnotatedPdfInspection> {
    const bytes = await readFile(sourcePath);
    return { pageCount: await inspectBytes(bytes), sourceBytes: bytes.length };
  }

  async write(input: {
    sourcePath: string;
    targetPath: string;
    sourceHash: string;
    annotations: Annotation[];
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => Promise<void> | void;
  }): Promise<AnnotatedPdfWriteResult> {
    abortIfNeeded(input.signal);
    const source = await readFile(input.sourcePath);
    if (hash(source) !== input.sourceHash) throw new Error('ANNOTATED_EXPORT_SOURCE_CHANGED');
    const document = await PDFDocument.load(source, { updateMetadata: false });
    const pages = document.getPages();
    const decisions = planAnnotatedPdfExport(input.annotations, pages.length, input.sourceHash);
    let completed = 0;
    for (let index = 0; index < input.annotations.length; index += 1) {
      abortIfNeeded(input.signal);
      const annotation = input.annotations[index]!;
      const decision = decisions[index]!;
      const page = pages[annotation.pageNumber - 1];
      if (page && decision.treatment === 'standard') addStandardAnnotation(page, annotation);
      else if (page && decision.treatment === 'flattened') flattenBookmark(page, annotation);
      completed += 1;
      await input.onProgress?.(completed, input.annotations.length);
    }
    abortIfNeeded(input.signal);
    const output = await document.save({ useObjectStreams: false, updateFieldAppearances: false });
    abortIfNeeded(input.signal);
    const outputPageCount = await inspectBytes(output);
    if (outputPageCount !== pages.length) throw new Error('ANNOTATED_EXPORT_PAGE_COUNT_CHANGED');
    await writeFile(input.targetPath, output, { flag: 'wx' });
    return {
      pageCount: pages.length,
      sourceBytes: source.length,
      outputBytes: output.length,
      outputHash: hash(output),
      outputReadable: true,
      fullRewrite: true,
      decisions,
      warnings: ['pdf-lib 不支持增量保存；输出是新的完整重写副本'],
    };
  }
}
