import type { AnnotationAnchor, PdfQuad, PdfRect } from '../../contract.js';

export interface ClientBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PdfCoordinateViewport {
  convertToPdfPoint(x: number, y: number): readonly number[];
  convertToViewportPoint(x: number, y: number): readonly number[];
}

function coordinatePair(value: readonly number[]): [number, number] {
  return [value[0] ?? 0, value[1] ?? 0];
}

function clippedLocalBounds(bounds: ClientBounds, page: ClientBounds): ClientBounds | null {
  const left = Math.max(bounds.left, page.left) - page.left;
  const top = Math.max(bounds.top, page.top) - page.top;
  const right = Math.min(bounds.right, page.right) - page.left;
  const bottom = Math.min(bounds.bottom, page.bottom) - page.top;
  return right - left > 0.5 && bottom - top > 0.5 ? { left, top, right, bottom } : null;
}

export function viewportBoundsToPdfQuad(
  bounds: ClientBounds,
  page: ClientBounds,
  viewport: PdfCoordinateViewport,
): PdfQuad | null {
  const local = clippedLocalBounds(bounds, page);
  if (!local) return null;
  const [x1, y1] = coordinatePair(viewport.convertToPdfPoint(local.left, local.top));
  const [x2, y2] = coordinatePair(viewport.convertToPdfPoint(local.right, local.top));
  const [x3, y3] = coordinatePair(viewport.convertToPdfPoint(local.left, local.bottom));
  const [x4, y4] = coordinatePair(viewport.convertToPdfPoint(local.right, local.bottom));
  return { x1, y1, x2, y2, x3, y3, x4, y4 };
}

export function viewportBoundsToPdfRect(
  bounds: ClientBounds,
  page: ClientBounds,
  viewport: PdfCoordinateViewport,
): PdfRect | null {
  const quad = viewportBoundsToPdfQuad(bounds, page, viewport);
  if (!quad) return null;
  const xs = [quad.x1, quad.x2, quad.x3, quad.x4];
  const ys = [quad.y1, quad.y2, quad.y3, quad.y4];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function pdfQuadToViewportBounds(
  quad: PdfQuad,
  viewport: PdfCoordinateViewport,
): { left: number; top: number; width: number; height: number } {
  const points = [
    coordinatePair(viewport.convertToViewportPoint(quad.x1, quad.y1)),
    coordinatePair(viewport.convertToViewportPoint(quad.x2, quad.y2)),
    coordinatePair(viewport.convertToViewportPoint(quad.x3, quad.y3)),
    coordinatePair(viewport.convertToViewportPoint(quad.x4, quad.y4)),
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function pdfRectToViewportBounds(
  rect: PdfRect,
  viewport: PdfCoordinateViewport,
): { left: number; top: number; width: number; height: number } {
  const points = [
    coordinatePair(viewport.convertToViewportPoint(rect.x, rect.y)),
    coordinatePair(viewport.convertToViewportPoint(rect.x + rect.width, rect.y)),
    coordinatePair(viewport.convertToViewportPoint(rect.x, rect.y + rect.height)),
    coordinatePair(viewport.convertToViewportPoint(rect.x + rect.width, rect.y + rect.height)),
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

export function annotationPageOffsetRatio(
  anchor: Pick<AnnotationAnchor, 'pageSize' | 'rect' | 'quads'>,
  rotation: number,
): number {
  const points = anchor.rect
    ? [
        {
          x: anchor.rect.x + anchor.rect.width / 2,
          y: anchor.rect.y + anchor.rect.height / 2,
        },
      ]
    : anchor.quads.flatMap((quad) => [
        { x: quad.x1, y: quad.y1 },
        { x: quad.x2, y: quad.y2 },
        { x: quad.x3, y: quad.y3 },
        { x: quad.x4, y: quad.y4 },
      ]);
  if (points.length === 0) return 0.05;
  const center = points.reduce((value, point) => ({ x: value.x + point.x, y: value.y + point.y }), {
    x: 0,
    y: 0,
  });
  center.x /= points.length;
  center.y /= points.length;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const ratio =
    normalizedRotation === 90
      ? center.x / anchor.pageSize.width
      : normalizedRotation === 180
        ? center.y / anchor.pageSize.height
        : normalizedRotation === 270
          ? 1 - center.x / anchor.pageSize.width
          : 1 - center.y / anchor.pageSize.height;
  return Math.min(1, Math.max(0, ratio));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildTextSelectionAnchor({
  selection,
  pageElement,
  textLayerElement,
  viewport,
  pageNumber,
  pageSize,
  assetHash,
  editionId,
}: {
  selection: Selection;
  pageElement: HTMLElement;
  textLayerElement: HTMLElement;
  viewport: PdfCoordinateViewport;
  pageNumber: number;
  pageSize: { width: number; height: number };
  assetHash: string;
  editionId: string | null;
}): Promise<AnnotationAnchor | null> {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer.parentElement;
  const end = range.endContainer.parentElement;
  if (!start || !end || !pageElement.contains(start) || !pageElement.contains(end)) return null;
  const exact = selection.toString().trim();
  if (!exact) return null;
  const pageBounds = pageElement.getBoundingClientRect();
  return buildTextAnchor({
    bounds: Array.from(range.getClientRects()),
    pageBounds,
    viewport,
    pageNumber,
    pageSize,
    assetHash,
    editionId,
    exact,
    pageText: textLayerElement.textContent ?? '',
  });
}

export async function buildTextAnchor({
  bounds,
  pageBounds,
  viewport,
  pageNumber,
  pageSize,
  assetHash,
  editionId,
  exact,
  pageText,
}: {
  bounds: ClientBounds[];
  pageBounds: ClientBounds;
  viewport: PdfCoordinateViewport;
  pageNumber: number;
  pageSize: { width: number; height: number };
  assetHash: string;
  editionId: string | null;
  exact: string;
  pageText: string;
}): Promise<AnnotationAnchor | null> {
  const quads = bounds
    .map((rect) => viewportBoundsToPdfQuad(rect, pageBounds, viewport))
    .filter((quad): quad is PdfQuad => quad !== null);
  if (!exact.trim() || quads.length === 0) return null;
  const quoteIndex = pageText.indexOf(exact);
  const prefix = quoteIndex < 0 ? '' : pageText.slice(Math.max(0, quoteIndex - 160), quoteIndex);
  const suffix =
    quoteIndex < 0
      ? ''
      : pageText.slice(quoteIndex + exact.length, quoteIndex + exact.length + 160);
  return {
    pageNumber,
    pageSize,
    rect: null,
    quads,
    textQuote: {
      exact,
      prefix,
      suffix,
      fingerprint: await sha256(`${prefix}\u0000${exact}\u0000${suffix}`),
    },
    assetHash,
    editionId,
  };
}

export function buildAreaAnchor({
  bounds,
  pageBounds,
  viewport,
  pageNumber,
  pageSize,
  assetHash,
  editionId,
}: {
  bounds: ClientBounds;
  pageBounds: ClientBounds;
  viewport: PdfCoordinateViewport;
  pageNumber: number;
  pageSize: { width: number; height: number };
  assetHash: string;
  editionId: string | null;
}): AnnotationAnchor | null {
  const rect = viewportBoundsToPdfRect(bounds, pageBounds, viewport);
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    pageNumber,
    pageSize,
    rect,
    quads: [],
    textQuote: null,
    assetHash,
    editionId,
  };
}
