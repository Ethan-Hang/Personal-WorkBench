import { useEffect, useRef, useState } from 'react';
import {
  RenderingCancelledException,
  TextLayer,
  setLayerDimensions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { pdfPageCache, type PageResourceLease } from './page-cache.js';

export function PdfPage({
  document,
  documentId,
  pageNumber,
  rotation,
  zoom,
  onSize,
}: {
  document: PDFDocumentProxy;
  documentId: string;
  pageNumber: number;
  rotation: number;
  zoom: number;
  onSize: (pageNumber: number, size: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 612 * zoom, height: 792 * zoom });
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
      const nextSize = { width: viewport.width, height: viewport.height };
      setSize(nextSize);
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

  return (
    <article
      data-page-number={pageNumber}
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_12px_35px_rgba(15,23,42,0.14)] transition-opacity duration-200"
      style={{ width: size.width, height: size.height }}
      aria-label={`第 ${pageNumber} 页`}
    >
      <canvas ref={canvasRef} className="block" />
      <div ref={textLayerRef} className="textLayer absolute inset-0 overflow-hidden" />
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
