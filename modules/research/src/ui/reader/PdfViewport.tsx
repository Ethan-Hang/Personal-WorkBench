import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, AnnotationAnchor, AnnotationKind, ReaderLayout } from '../../contract.js';
import { PdfPage } from './PdfPage.js';
import type { ReaderAnnotationTool } from './annotation/tools.js';
import {
  buildPageLayout,
  computeVirtualWindow,
  positionAtViewportCenter,
  scrollTopForPosition,
  type ReaderPageSize,
} from './virtualizer.js';

export function PdfViewport({
  document,
  documentId,
  layout,
  pageNumber,
  pageOffsetRatio,
  rotation,
  zoom,
  annotations,
  annotationTool,
  assetHash,
  editionId,
  onCreateAnnotation,
  onPosition,
}: {
  document: PDFDocumentProxy;
  documentId: string;
  layout: ReaderLayout;
  pageNumber: number;
  pageOffsetRatio: number;
  rotation: number;
  zoom: number;
  annotations: Annotation[];
  annotationTool: ReaderAnnotationTool;
  assetHash: string;
  editionId: string | null;
  onCreateAnnotation: (kind: AnnotationKind, anchor: AnnotationAnchor) => void;
  onPosition: (position: { pageNumber: number; pageOffsetRatio: number }) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const positionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationPositionRef = useRef<{
    pageNumber: number;
    pageOffsetRatio: number;
  } | null>(null);
  const measurementKey = `${documentId}:${rotation}:${zoom}`;
  const [measurements, setMeasurements] = useState<{
    key: string;
    pages: ReadonlyMap<number, ReaderPageSize>;
  }>({ key: measurementKey, pages: new Map() });
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 800 });
  const pageSizes = measurements.key === measurementKey ? measurements.pages : undefined;
  const defaultPageSize = useMemo(
    () =>
      rotation === 90 || rotation === 270
        ? { width: 792 * zoom, height: 612 * zoom }
        : { width: 612 * zoom, height: 792 * zoom },
    [rotation, zoom],
  );
  const geometry = useMemo(
    () =>
      buildPageLayout({
        pageCount: document.numPages,
        pageGap: 20,
        defaultPageSize,
        pageSizes,
      }),
    [defaultPageSize, document.numPages, pageSizes],
  );
  const virtualWindow = useMemo(
    () =>
      computeVirtualWindow({
        pageCount: document.numPages,
        pageGap: 20,
        defaultPageSize,
        pageSizes,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
        overscan: Math.max(600, viewport.height),
      }),
    [defaultPageSize, document.numPages, pageSizes, viewport],
  );
  const contentWidth = useMemo(
    () => geometry.reduce((width, page) => Math.max(width, page.width), defaultPageSize.width),
    [defaultPageSize.width, geometry],
  );
  const onSize = useCallback(
    (value: number, size: ReaderPageSize) => {
      setMeasurements((current) => {
        const pages = current.key === measurementKey ? new Map(current.pages) : new Map();
        const previous = pages.get(value);
        if (
          previous?.width === size.width &&
          previous.height === size.height &&
          current.key === measurementKey
        ) {
          return current;
        }
        pages.set(value, size);
        return { key: measurementKey, pages };
      });
    },
    [measurementKey],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const updateSize = () =>
      setViewport((current) => ({ ...current, height: Math.max(1, root.clientHeight) }));
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    navigationPositionRef.current = null;
  }, [documentId, layout, rotation, zoom]);

  useEffect(() => {
    const root = rootRef.current;
    const navigation = navigationPositionRef.current;
    if (
      !root ||
      layout !== 'continuous' ||
      (navigation?.pageNumber === pageNumber &&
        Math.abs(navigation.pageOffsetRatio - pageOffsetRatio) < 0.001)
    ) {
      return;
    }
    const scrollTop = scrollTopForPosition(
      geometry,
      pageNumber,
      pageOffsetRatio,
      Math.max(1, root.clientHeight),
    );
    navigationPositionRef.current = { pageNumber, pageOffsetRatio };
    root.scrollTop = scrollTop;
    setViewport({ scrollTop, height: Math.max(1, root.clientHeight) });
  }, [geometry, layout, pageNumber, pageOffsetRatio]);

  useEffect(
    () => () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
    },
    [],
  );

  const handleScroll = () => {
    if (animationRef.current !== null) return;
    animationRef.current = requestAnimationFrame(() => {
      animationRef.current = null;
      const root = rootRef.current;
      if (!root) return;
      const nextViewport = { scrollTop: root.scrollTop, height: Math.max(1, root.clientHeight) };
      setViewport(nextViewport);
      const position = positionAtViewportCenter(
        geometry,
        nextViewport.scrollTop,
        nextViewport.height,
      );
      navigationPositionRef.current = position;
      if (positionTimerRef.current) clearTimeout(positionTimerRef.current);
      positionTimerRef.current = setTimeout(() => onPosition(position), 120);
    });
  };

  if (layout === 'single-page') {
    return (
      <div
        ref={rootRef}
        className="flex h-full min-w-0 flex-1 items-start justify-center overflow-auto bg-surface-2 px-5 py-6 [scrollbar-gutter:stable]"
      >
        <PdfPage
          key={`${pageNumber}-${rotation}-${zoom}`}
          document={document}
          documentId={documentId}
          pageNumber={pageNumber}
          rotation={rotation}
          zoom={zoom}
          annotations={annotations.filter((annotation) => annotation.pageNumber === pageNumber)}
          annotationTool={annotationTool}
          assetHash={assetHash}
          editionId={editionId}
          onCreateAnnotation={onCreateAnnotation}
          onSize={onSize}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      onScroll={handleScroll}
      className="relative h-full min-w-0 flex-1 overflow-auto bg-surface-2 px-5 py-6 [scrollbar-gutter:stable]"
    >
      <div
        className="relative mx-auto"
        style={{ height: virtualWindow.totalHeight, width: contentWidth }}
      >
        {virtualWindow.pages.map((page) => (
          <div
            key={`${page.pageNumber}-${rotation}-${zoom}`}
            className="absolute inset-x-0 flex justify-center"
            style={{ top: page.top }}
          >
            <PdfPage
              document={document}
              documentId={documentId}
              pageNumber={page.pageNumber}
              rotation={rotation}
              zoom={zoom}
              annotations={annotations.filter(
                (annotation) => annotation.pageNumber === page.pageNumber,
              )}
              annotationTool={annotationTool}
              assetHash={assetHash}
              editionId={editionId}
              onCreateAnnotation={onCreateAnnotation}
              onSize={onSize}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
