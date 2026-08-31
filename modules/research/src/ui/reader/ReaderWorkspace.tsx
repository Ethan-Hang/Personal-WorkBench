import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Button, IconAlertCircle } from '@workbench/ui';
import type {
  Annotation,
  AnnotationAnchor,
  AnnotationKind,
  PageTextSearchResult,
  ReaderManifest,
  ReaderStatePosition,
} from '../../contract.js';
import {
  deleteResearchAnnotation,
  fetchAnnotations,
  fetchCollectionReadingContext,
  fetchCollections,
  fetchPageTextSearch,
  fetchReadingContexts,
  fetchTextIndexJob,
  patchAnnotation,
  postAnnotation,
  postReadingContext,
  postCancelTextIndex,
  postPauseTextIndex,
  postRebuildTextIndex,
  postResumeTextIndex,
  postStartTextIndex,
  postRestoreAnnotation,
  putCollectionReadingContext,
} from '../api.js';
import { PasswordPrompt } from './PasswordPrompt.js';
import { PdfViewport } from './PdfViewport.js';
import { pdfPageCache } from './page-cache.js';
import { ReaderSidePanel, type ReaderOutlineItem } from './ReaderSidePanel.js';
import type { TextIndexControl, TextSearchScope } from './ReaderSearchPanel.js';
import { ReaderToolbar } from './ReaderToolbar.js';
import { annotationPageOffsetRatio } from './anchor.js';
import {
  annotationToolForKey,
  cycleReaderLayer,
  type ReaderAnnotationTool,
} from './annotation/tools.js';
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
  openingCollectionId = null,
  openingPageNumber = null,
  onBack,
  onOpenAsset,
}: {
  active?: boolean;
  manifest: ReaderManifest;
  openingCollectionId?: string | null;
  openingPageNumber?: number | null;
  onBack: () => void;
  onOpenAsset: (assetId: string, pageNumber: number) => void;
}) {
  const queryClient = useQueryClient();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [outline, setOutline] = useState<ReaderOutlineItem[]>([]);
  const [sidePanelOpen, setSidePanelOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024,
  );
  const [annotationTool, setAnnotationTool] = useState<ReaderAnnotationTool>('cursor');
  const [activeContextId, setActiveContextId] = useState<string | null>(
    manifest.state.lastContextId,
  );
  const [visibleContextIds, setVisibleContextIds] = useState<Set<string>>(
    () => new Set(manifest.state.lastContextId ? [manifest.state.lastContextId] : []),
  );
  const [includeGeneral, setIncludeGeneral] = useState(true);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [undoAnnotation, setUndoAnnotation] = useState<Annotation | null>(null);
  const [textSearchQuery, setTextSearchQuery] = useState('');
  const [textSearchScope, setTextSearchScope] = useState<TextSearchScope>('document');
  const autoIndexStartedRef = useRef(false);
  const [documentCacheId] = useState(() => `${manifest.assetId}:${++readerWorkspaceSequence}`);
  const readerState = useReaderStatePersistence(manifest.state);
  const contextsQuery = useQuery({
    queryKey: ['research', 'reading-contexts', 'active'],
    queryFn: () => fetchReadingContexts('active'),
  });
  const collectionsQuery = useQuery({
    queryKey: ['research', 'collections'],
    queryFn: fetchCollections,
  });
  const openingContextQuery = useQuery({
    queryKey: ['research', 'collection-reading-context', openingCollectionId],
    queryFn: () => fetchCollectionReadingContext(openingCollectionId!),
    enabled: openingCollectionId !== null,
  });
  const contexts = contextsQuery.data?.contexts ?? [];
  const visibleContextKey = [...visibleContextIds].sort().join(',');
  const annotationsQuery = useQuery({
    queryKey: [
      'research',
      'reader-annotations',
      manifest.assetId,
      visibleContextKey,
      includeGeneral,
    ],
    queryFn: () =>
      fetchAnnotations(manifest.assetId, {
        contextIds: [...visibleContextIds].sort(),
        includeGeneral,
      }),
  });
  const textIndexQuery = useQuery({
    queryKey: ['research', 'text-index', manifest.assetId],
    queryFn: () => fetchTextIndexJob(manifest.assetId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 750 : false;
    },
  });
  const pageSearchQuery = useQuery({
    queryKey: [
      'research',
      'page-text-search',
      textSearchQuery,
      textSearchScope === 'document' ? manifest.assetId : null,
    ],
    queryFn: () =>
      fetchPageTextSearch(textSearchQuery, {
        ...(textSearchScope === 'document' ? { assetId: manifest.assetId } : {}),
        limit: 50,
      }),
    enabled: textSearchQuery.length > 0,
    refetchInterval:
      textIndexQuery.data?.status === 'queued' || textIndexQuery.data?.status === 'running'
        ? 1_000
        : false,
  });

  const invalidateAnnotations = () =>
    queryClient.invalidateQueries({
      queryKey: ['research', 'reader-annotations', manifest.assetId],
    });
  const createAnnotationMutation = useMutation({
    mutationFn: ({ kind, anchor }: { kind: AnnotationKind; anchor: AnnotationAnchor }) =>
      postAnnotation(manifest.assetId, {
        contextId: activeContextId,
        kind,
        anchor,
        body: null,
        color:
          kind === 'highlight'
            ? '#facc15'
            : kind === 'underline'
              ? '#2563eb'
              : kind === 'strikeout'
                ? '#dc2626'
                : '#7c3aed',
      }),
    onSuccess: () => {
      setAnnotationError(null);
      setUndoAnnotation(null);
      void invalidateAnnotations();
    },
    onError: (cause) => setAnnotationError(cause instanceof Error ? cause.message : '创建批注失败'),
  });
  const updateAnnotationMutation = useMutation({
    mutationFn: ({
      annotation,
      changes,
    }: {
      annotation: Annotation;
      changes: { body: string | null; color: string | null };
    }) =>
      patchAnnotation(annotation.id, {
        ...changes,
        expectedRevision: annotation.revision,
      }),
    onSuccess: () => {
      setAnnotationError(null);
      void invalidateAnnotations();
    },
    onError: (cause) => setAnnotationError(cause instanceof Error ? cause.message : '保存批注失败'),
  });
  const deleteAnnotationMutation = useMutation({
    mutationFn: (annotation: Annotation) =>
      deleteResearchAnnotation(annotation.id, annotation.revision),
    onSuccess: (annotation) => {
      setAnnotationError(null);
      setUndoAnnotation(annotation);
      void invalidateAnnotations();
    },
    onError: (cause) => setAnnotationError(cause instanceof Error ? cause.message : '删除批注失败'),
  });
  const restoreAnnotationMutation = useMutation({
    mutationFn: (annotation: Annotation) =>
      postRestoreAnnotation(annotation.id, annotation.revision),
    onSuccess: () => {
      setAnnotationError(null);
      setUndoAnnotation(null);
      void invalidateAnnotations();
    },
    onError: (cause) => setAnnotationError(cause instanceof Error ? cause.message : '恢复批注失败'),
  });
  const createContextMutation = useMutation({
    mutationFn: (name: string) => postReadingContext({ name, description: null, color: null }),
    onSuccess: (context) => {
      setActiveContextId(context.id);
      setVisibleContextIds((current) => new Set(current).add(context.id));
      setAnnotationError(null);
      void queryClient.invalidateQueries({ queryKey: ['research', 'reading-contexts'] });
    },
    onError: (cause) =>
      setAnnotationError(cause instanceof Error ? cause.message : '创建上下文失败'),
  });
  const bindCollectionMutation = useMutation({
    mutationFn: ({ collectionId, contextId }: { collectionId: string; contextId: string | null }) =>
      putCollectionReadingContext(collectionId, contextId),
    onSuccess: () => setAnnotationError(null),
    onError: (cause) => setAnnotationError(cause instanceof Error ? cause.message : '绑定目录失败'),
  });
  const textIndexMutation = useMutation({
    mutationFn: (control: TextIndexControl) => {
      const pageNumber = readerState.position.pageNumber;
      if (control === 'start') return postStartTextIndex(manifest.assetId, pageNumber);
      if (control === 'pause') return postPauseTextIndex(manifest.assetId);
      if (control === 'cancel') return postCancelTextIndex(manifest.assetId);
      if (control === 'resume') return postResumeTextIndex(manifest.assetId, pageNumber);
      return postRebuildTextIndex(manifest.assetId, pageNumber);
    },
    onSuccess: (job) => {
      setAnnotationError(null);
      queryClient.setQueryData(['research', 'text-index', manifest.assetId], job);
      void queryClient.invalidateQueries({ queryKey: ['research', 'page-text-search'] });
    },
    onError: (cause) =>
      setAnnotationError(cause instanceof Error ? cause.message : '正文索引操作失败'),
  });
  const controlTextIndex = textIndexMutation.mutate;
  const annotationPending =
    createAnnotationMutation.isPending ||
    updateAnnotationMutation.isPending ||
    deleteAnnotationMutation.isPending ||
    restoreAnnotationMutation.isPending ||
    createContextMutation.isPending ||
    bindCollectionMutation.isPending;

  useEffect(() => {
    const contexts = contextsQuery.data?.contexts;
    if (!contexts) return;
    setActiveContextId((current) =>
      current && !contexts.some((context) => context.id === current) ? null : current,
    );
    setVisibleContextIds(
      (current) =>
        new Set([...current].filter((id) => contexts.some((context) => context.id === id))),
    );
  }, [contextsQuery.data?.contexts]);

  useEffect(() => {
    const contextId = openingContextQuery.data?.context?.id;
    if (!contextId) return;
    setActiveContextId(contextId);
    setVisibleContextIds((current) => new Set(current).add(contextId));
  }, [openingContextQuery.data?.context?.id]);

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

  useEffect(() => {
    if (
      !active ||
      !document ||
      !textIndexQuery.isSuccess ||
      textIndexQuery.data !== null ||
      autoIndexStartedRef.current
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      autoIndexStartedRef.current = true;
      controlTextIndex('start');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [active, controlTextIndex, document, textIndexQuery.data, textIndexQuery.isSuccess]);

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
  const setActiveContext = useCallback(
    (contextId: string | null) => {
      setActiveContextId(contextId);
      if (contextId) setVisibleContextIds((current) => new Set(current).add(contextId));
      else setIncludeGeneral(true);
      update({ lastContextId: contextId });
    },
    [update],
  );
  const locateAnnotation = useCallback(
    (annotation: Annotation) => {
      update({
        pageNumber: annotation.pageNumber,
        pageOffsetRatio: annotationPageOffsetRatio(
          annotation.anchor,
          readerState.position.rotation,
        ),
      });
    },
    [readerState.position.rotation, update],
  );
  const locateTextResult = useCallback(
    (result: PageTextSearchResult) => {
      if (result.assetId !== manifest.assetId) {
        onOpenAsset(result.assetId, result.pageNumber);
        return;
      }
      update({
        pageNumber: result.pageNumber,
        pageOffsetRatio:
          result.position && result.pageSize
            ? annotationPageOffsetRatio(
                { pageSize: result.pageSize, rect: result.position, quads: [] },
                readerState.position.rotation,
              )
            : 0.1,
      });
    },
    [manifest.assetId, onOpenAsset, readerState.position.rotation, update],
  );

  useEffect(() => {
    if (!active || openingPageNumber === null) return;
    setPage(openingPageNumber);
  }, [active, openingPageNumber, setPage]);

  useEffect(() => {
    if (!active || readerState.position.lastContextId === activeContextId) return;
    update({ lastContextId: activeContextId });
  }, [active, activeContextId, readerState.position.lastContextId, update]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (
        (editingText && event.key !== 'Escape') ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === 'Escape') {
        setAnnotationTool('cursor');
        setSidePanelOpen(false);
      } else if (event.key === '[' || event.key === ']') {
        setActiveContext(
          cycleReaderLayer(
            activeContextId,
            contexts.map((context) => context.id),
            event.key === ']' ? 1 : -1,
          ),
        );
      } else if (event.key === 'PageUp') setPage(readerState.position.pageNumber - 1);
      else if (event.key === 'PageDown') setPage(readerState.position.pageNumber + 1);
      else if (event.key === 'Home') setPage(1);
      else if (event.key === 'End') setPage(document?.numPages ?? 1);
      else if (event.key === '+' || event.key === '=') setZoom(readerState.position.zoom + 0.1);
      else if (event.key === '-') setZoom(readerState.position.zoom - 0.1);
      else if (event.key.toLowerCase() === 'r') {
        update({ rotation: nextRotation(readerState.position.rotation) });
      } else {
        const tool = annotationToolForKey(event.key);
        if (tool) setAnnotationTool(tool);
        else return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    active,
    activeContextId,
    contexts,
    document?.numPages,
    readerState.position,
    setActiveContext,
    setPage,
    setZoom,
    update,
  ]);
  const saveLabel = useMemo(() => {
    if (readerState.status === 'saving') return '保存中';
    if (readerState.status === 'saved') return `已保存 · v${readerState.revision}`;
    if (readerState.status === 'error') return '保存失败';
    return readerState.revision > 0 ? `已保存 · v${readerState.revision}` : '尚未保存';
  }, [readerState.revision, readerState.status]);
  const annotations = annotationsQuery.data ?? [];
  const activeLayerName =
    activeContextId === null
      ? '通用批注'
      : (contexts.find((context) => context.id === activeContextId)?.name ?? '上下文不可用');

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
        activeLayerName={activeLayerName}
        annotationPending={annotationPending}
        annotationTool={annotationTool}
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
        onAnnotationTool={setAnnotationTool}
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
            annotations={annotations}
            annotationTool={annotationTool}
            assetHash={manifest.contentHash}
            editionId={manifest.editionId}
            onCreateAnnotation={(kind, anchor) => createAnnotationMutation.mutate({ kind, anchor })}
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
            <ReaderSidePanel
              outline={outline}
              pageCount={document.numPages}
              contexts={contexts}
              annotations={annotations}
              activeContextId={activeContextId}
              visibleContextIds={visibleContextIds}
              includeGeneral={includeGeneral}
              collections={(collectionsQuery.data?.collections ?? []).map((collection) => ({
                id: collection.id,
                name: collection.name,
              }))}
              busy={annotationPending}
              textIndexJob={textIndexQuery.data ?? null}
              textSearchQuery={textSearchQuery}
              textSearchScope={textSearchScope}
              textSearchResults={pageSearchQuery.data ?? []}
              textIndexBusy={textIndexMutation.isPending}
              textSearching={pageSearchQuery.isFetching}
              textSearchError={
                pageSearchQuery.error instanceof Error ? pageSearchQuery.error.message : null
              }
              undoLabel={undoAnnotation ? '恢复刚删除的批注' : null}
              onPage={setPage}
              onLocateAnnotation={locateAnnotation}
              onActiveContext={setActiveContext}
              onToggleContext={(contextId) => {
                if (contextId === activeContextId) return;
                setVisibleContextIds((current) => {
                  const next = new Set(current);
                  if (next.has(contextId)) next.delete(contextId);
                  else next.add(contextId);
                  return next;
                });
              }}
              onToggleGeneral={() =>
                activeContextId !== null && setIncludeGeneral((value) => !value)
              }
              onCreateContext={(name) => createContextMutation.mutate(name)}
              onBindCollection={(collectionId, contextId) =>
                bindCollectionMutation.mutate({ collectionId, contextId })
              }
              onUpdateAnnotation={(annotation, changes) =>
                updateAnnotationMutation.mutate({ annotation, changes })
              }
              onDeleteAnnotation={(annotation) => deleteAnnotationMutation.mutate(annotation)}
              onUndo={() => undoAnnotation && restoreAnnotationMutation.mutate(undoAnnotation)}
              onTextSearch={setTextSearchQuery}
              onTextSearchScope={setTextSearchScope}
              onTextIndexControl={controlTextIndex}
              onLocateTextResult={locateTextResult}
            />
          </div>
        )}
      </div>

      {annotationError && (
        <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 border border-critical/30 bg-surface px-3 py-2 text-xs text-critical shadow-lg">
          {annotationError}
        </div>
      )}

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
