import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Button, IconAlertCircle } from '@workbench/ui';
import type { ReaderManifest, ReaderStatePosition } from '../../contract.js';
import { PasswordPrompt } from './PasswordPrompt.js';
import { PdfViewport } from './PdfViewport.js';
import { pdfPageCache } from './page-cache.js';
import { ReaderSidePanel, type ReaderOutlineItem } from './ReaderSidePanel.js';
import { ReaderToolbar } from './ReaderToolbar.js';
import { clampPage, clampZoom, nextRotation } from './reader-controls.js';
import { useReaderStatePersistence } from './session.js';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

let readerWorkspaceSequence = 0;

interface PasswordRequest {
  incorrect: boolean;
  submit: (password: string) => void;
}

async function readOutline(document: PDFDocumentProxy): Promise<ReaderOutlineItem[]> {
  const source = (await document.getOutline()) ?? [];
  const result: ReaderOutlineItem[] = [];
  const visit = async (items: typeof source, depth: number): Promise<void> => {
    for (const item of items) {
      let pageNumber: number | null = null;
      try {
        const destination =
          typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest;
        if (destination?.[0]) pageNumber = (await document.getPageIndex(destination[0])) + 1;
      } catch {
        pageNumber = null;
      }
      result.push({ title: item.title, depth, pageNumber });
      if (item.items.length > 0) await visit(item.items, depth + 1);
    }
  };
  await visit(source, 0);
  return result;
}

function messageForPdfError(error: unknown): string {
  if (!(error instanceof Error)) return 'PDF 无法打开';
  if (error.name === 'InvalidPDFException') return 'PDF 文件已损坏或格式无效';
  if (error.name === 'MissingPDFException') return 'PDF 文件当前不可用';
  if (error.name === 'UnexpectedResponseException') return 'PDF 内容请求失败';
  return error.message || 'PDF 无法打开';
}

export function ReaderWorkspace({
  active = true,
  manifest,
  onBack,
}: {
  active?: boolean;
  manifest: ReaderManifest;
  onBack: () => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [outline, setOutline] = useState<ReaderOutlineItem[]>([]);
  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024,
  );
  const [documentCacheId] = useState(() => `${manifest.assetId}:${++readerWorkspaceSequence}`);
  const readerState = useReaderStatePersistence(manifest.state);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setSidePanelOpen(false);
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let disposed = false;
    const task = getDocument({
      url: manifest.contentUrl,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 64 * 1024,
    });
    setDocument(null);
    setLoadError(null);
    setOutline([]);
    setProgress(0);
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (!disposed && total > 0) setProgress(Math.min(1, loaded / total));
    };
    task.onPassword = (submit: (password: string) => void, reason: number) => {
      if (disposed) return;
      setPasswordRequest({
        incorrect: reason === PasswordResponses.INCORRECT_PASSWORD,
        submit: (password) => {
          setPasswordRequest(null);
          submit(password);
        },
      });
    };
    void task.promise
      .then(async (value) => {
        if (disposed) return;
        setDocument(value);
        setProgress(1);
        const nextOutline = await readOutline(value);
        if (!disposed) setOutline(nextOutline);
      })
      .catch((error: unknown) => {
        if (!disposed) setLoadError(messageForPdfError(error));
      });
    return () => {
      disposed = true;
      setPasswordRequest(null);
      setDocument(null);
      pdfPageCache.clearDocument(documentCacheId);
      void task.destroy();
    };
  }, [documentCacheId, manifest.assetId, manifest.contentUrl]);

  const updatePosition = readerState.updatePosition;
  const update = useCallback(
    (changes: Partial<ReaderStatePosition>) => {
      updatePosition((current) => ({ ...current, ...changes }));
    },
    [updatePosition],
  );
  const setPage = useCallback(
    (pageNumber: number) => {
      if (!Number.isFinite(pageNumber)) return;
      update({
        pageNumber: clampPage(pageNumber, document?.numPages ?? 1),
        pageOffsetRatio: 0.5,
      });
    },
    [document?.numPages, update],
  );
  const setZoom = useCallback((zoom: number) => update({ zoom: clampZoom(zoom) }), [update]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === 'PageUp') setPage(readerState.position.pageNumber - 1);
      else if (event.key === 'PageDown') setPage(readerState.position.pageNumber + 1);
      else if (event.key === 'Home') setPage(1);
      else if (event.key === 'End') setPage(document?.numPages ?? 1);
      else if (event.key === '+' || event.key === '=') setZoom(readerState.position.zoom + 0.1);
      else if (event.key === '-') setZoom(readerState.position.zoom - 0.1);
      else if (event.key.toLowerCase() === 'r') {
        update({ rotation: nextRotation(readerState.position.rotation) });
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, document?.numPages, readerState.position, setPage, setZoom, update]);
  const saveLabel = useMemo(() => {
    if (readerState.status === 'saving') return '保存中';
    if (readerState.status === 'saved') return `已保存 · v${readerState.revision}`;
    if (readerState.status === 'error') return '保存失败';
    return readerState.revision > 0 ? `已保存 · v${readerState.revision}` : '尚未保存';
  }, [readerState.revision, readerState.status]);

  return (
    <section className="relative flex h-full min-h-[calc(100vh-9rem)] flex-col overflow-hidden bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button size="sm" onClick={onBack}>
            返回文献库
          </Button>
          <div className="min-w-0 border-l border-line pl-3">
            <h1 className="truncate text-sm font-bold text-ink">{manifest.displayName}</h1>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
              {manifest.contentHash.slice(0, 12)} · {(manifest.byteSize / 1024 / 1024).toFixed(2)}{' '}
              MiB
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold text-secondary">{saveLabel}</p>
          {readerState.error && (
            <p className="mt-0.5 max-w-56 truncate text-[10px] text-critical">
              {readerState.error}
            </p>
          )}
        </div>
      </header>

      <ReaderToolbar
        layout={readerState.position.layout}
        pageNumber={readerState.position.pageNumber}
        pageCount={document?.numPages ?? 0}
        rotation={readerState.position.rotation}
        sidePanelOpen={sidePanelOpen}
        zoom={readerState.position.zoom}
        onLayout={(layout) => update({ layout })}
        onPage={setPage}
        onRotate={() => update({ rotation: nextRotation(readerState.position.rotation) })}
        onSidePanel={() => setSidePanelOpen((value) => !value)}
        onZoom={setZoom}
      />

      <div className="relative flex min-h-0 flex-1">
        {document && active ? (
          <PdfViewport
            document={document}
            documentId={documentCacheId}
            layout={readerState.position.layout}
            pageNumber={readerState.position.pageNumber}
            pageOffsetRatio={readerState.position.pageOffsetRatio}
            rotation={readerState.position.rotation}
            zoom={readerState.position.zoom}
            onPosition={(position) => update(position)}
          />
        ) : document ? (
          <div className="flex-1 bg-surface-2" />
        ) : loadError ? (
          <div className="grid flex-1 place-items-center bg-surface-2 px-5">
            <div className="max-w-md border-y border-line py-8 text-center">
              <IconAlertCircle size={28} className="mx-auto text-critical" />
              <h2 className="mt-3 text-base font-bold text-ink">无法打开 PDF</h2>
              <p className="mt-2 text-xs leading-5 text-secondary">{loadError}</p>
              <Button className="mt-5" onClick={onBack}>
                返回文献库检查文件
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center bg-surface-2 px-5">
            <div className="w-full max-w-sm text-center">
              <p className="text-sm font-semibold text-ink">正在打开 PDF</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted">{Math.round(progress * 100)}%</p>
            </div>
          </div>
        )}

        {document && sidePanelOpen && (
          <div className="absolute inset-y-0 right-0 z-20 shadow-xl lg:static lg:shadow-none">
            <ReaderSidePanel outline={outline} pageCount={document.numPages} onPage={setPage} />
          </div>
        )}
      </div>

      {passwordRequest && (
        <PasswordPrompt
          incorrect={passwordRequest.incorrect}
          onCancel={onBack}
          onSubmit={passwordRequest.submit}
        />
      )}
    </section>
  );
}
