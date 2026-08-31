import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  RenderingCancelledException,
  TextLayer,
  setLayerDimensions,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import type { Annotation, AnnotationAnchor, AnnotationKind } from '../../contract.js';
import { buildAreaAnchor, buildTextSelectionAnchor } from './anchor.js';
import { AnnotationOverlay } from './annotation/AnnotationOverlay.js';
import {
  isPointerAnnotationTool,
  isTextAnnotationTool,
  type ReaderAnnotationTool,
} from './annotation/tools.js';
import { pdfPageCache, type PageResourceLease } from './page-cache.js';

export function PdfPage({
  document,
  documentId,
  pageNumber,
  rotation,
  zoom,
  annotations,
  annotationTool,
  assetHash,
  editionId,
  onCreateAnnotation,
  onSize,
}: {
  document: PDFDocumentProxy;
  documentId: string;
  pageNumber: number;
  rotation: number;
  zoom: number;
  annotations: Annotation[];
  annotationTool: ReaderAnnotationTool;
  assetHash: string;
  editionId: string | null;
  onCreateAnnotation: (kind: AnnotationKind, anchor: AnnotationAnchor) => void;
  onSize: (pageNumber: number, size: { width: number; height: number }) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 612 * zoom, height: 792 * zoom });
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [viewport, setViewport] = useState<ReturnType<PDFPageProxy['getViewport']> | null>(null);
  const [drag, setDrag] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let lease: PageResourceLease<Awaited<ReturnType<PDFDocumentProxy['getPage']>>> | null = null;
    const render = async () => {
      lease = await pdfPageCache.acquire(
        documentId,
        pageNumber,
        () => document.getPage(pageNumber),
        (page) => page.cleanup(),
      );
      if (disposed) {
        lease.release();
        lease = null;
        return;
      }
      const page = lease.value;
      const viewport = page.getViewport({ scale: zoom, rotation });
      const sourceViewport = page.getViewport({ scale: 1, rotation: 0 });
      const nextSize = { width: viewport.width, height: viewport.height };
      setSize(nextSize);
      setPageSize({ width: sourceViewport.width, height: sourceViewport.height });
      setViewport(viewport);
      onSize(pageNumber, nextSize);
      const canvas = canvasRef.current;
      const textNode = textLayerRef.current;
      if (!canvas || !textNode) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await renderTask.promise;
      if (disposed) return;
      textNode.replaceChildren();
      textNode.style.setProperty('--scale-factor', String(viewport.scale));
      setLayerDimensions(textNode, viewport);
      textLayer = new TextLayer({
        container: textNode,
        textContentSource: page.streamTextContent({ includeMarkedContent: true }),
        viewport,
      });
      await textLayer.render();
    };
    void render().catch((cause: unknown) => {
      if (disposed || cause instanceof RenderingCancelledException) return;
      setError(cause instanceof Error ? cause.message : '页面渲染失败');
    });
    return () => {
      disposed = true;
      setViewport(null);
      renderTask?.cancel();
      textLayer?.cancel();
      lease?.release();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      textLayerRef.current?.replaceChildren();
    };
  }, [document, documentId, onSize, pageNumber, rotation, zoom]);

  const createFromSelection = async () => {
    if (!viewport || !isTextAnnotationTool(annotationTool)) return;
    const selection = window.getSelection();
    const root = rootRef.current;
    const textLayer = textLayerRef.current;
    if (!selection || !root || !textLayer) return;
    const anchor = await buildTextSelectionAnchor({
      selection,
      pageElement: root,
      textLayerElement: textLayer,
      viewport,
      pageNumber,
      pageSize,
      assetHash,
      editionId,
    });
    if (!anchor || rootRef.current !== root) return;
    onCreateAnnotation(annotationTool, anchor);
    selection.removeAllRanges();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPointerAnnotationTool(annotationTool)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    setDrag((current) =>
      current?.pointerId === event.pointerId
        ? { ...current, currentX: event.clientX, currentY: event.clientY }
        : current,
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag;
    setDrag(null);
    if (!current || !viewport || !isPointerAnnotationTool(annotationTool)) return;
    const root = rootRef.current;
    if (!root) return;
    if (annotationTool === 'bookmark') {
      onCreateAnnotation('bookmark', {
        pageNumber,
        pageSize,
        rect: null,
        quads: [],
        textQuote: null,
        assetHash,
        editionId,
      });
      return;
    }
    const pointSize = annotationTool === 'note' ? 14 : 0;
    const left = Math.min(current.startX, event.clientX);
    const top = Math.min(current.startY, event.clientY);
    const right = Math.max(current.startX, event.clientX, left + pointSize);
    const bottom = Math.max(current.startY, event.clientY, top + pointSize);
    if (annotationTool === 'area' && (right - left < 4 || bottom - top < 4)) return;
    const anchor = buildAreaAnchor({
      bounds: { left, top, right, bottom },
      pageBounds: root.getBoundingClientRect(),
      viewport,
      pageNumber,
      pageSize,
      assetHash,
      editionId,
    });
    if (anchor) onCreateAnnotation(annotationTool, anchor);
  };

  const dragPreview = drag
    ? {
        left:
          Math.min(drag.startX, drag.currentX) -
          (rootRef.current?.getBoundingClientRect().left ?? 0),
        top:
          Math.min(drag.startY, drag.currentY) -
          (rootRef.current?.getBoundingClientRect().top ?? 0),
        width: Math.abs(drag.currentX - drag.startX),
        height: Math.abs(drag.currentY - drag.startY),
      }
    : null;

  return (
    <article
      ref={rootRef}
      data-page-number={pageNumber}
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_12px_35px_rgba(15,23,42,0.14)] transition-opacity duration-200"
      style={{ width: size.width, height: size.height }}
      aria-label={`第 ${pageNumber} 页`}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 z-[1] overflow-hidden"
        onMouseUp={() => void createFromSelection()}
      />
      {viewport && <AnnotationOverlay annotations={annotations} viewport={viewport} />}
      {isPointerAnnotationTool(annotationTool) && (
        <div
          className="absolute inset-0 z-[3] cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {dragPreview && annotationTool === 'area' && (
            <div
              className="absolute border border-accent bg-accent/10"
              style={dragPreview}
              aria-hidden="true"
            />
          )}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-white px-8 text-center text-xs text-red-700">
          第 {pageNumber} 页无法渲染：{error}
        </div>
      )}
      <span className="pointer-events-none absolute bottom-2 right-3 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white">
        {pageNumber}
      </span>
    </article>
  );
}
