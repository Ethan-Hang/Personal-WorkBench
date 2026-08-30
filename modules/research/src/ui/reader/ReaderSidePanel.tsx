import { useMemo, useState } from 'react';
import { Button } from '@workbench/ui';
import type {
  Annotation,
  OcrJob,
  OcrLanguage,
  PageTextSearchResult,
  ReadingContext,
  TextIndexJob,
} from '../../contract.js';
import {
  ReaderSearchPanel,
  type OcrControl,
  type TextIndexControl,
  type TextSearchScope,
} from './ReaderSearchPanel.js';

export interface ReaderOutlineItem {
  title: string;
  depth: number;
  pageNumber: number | null;
}

export interface ReaderCollectionOption {
  id: string;
  name: string;
}

const KIND_LABELS: Record<Annotation['kind'], string> = {
  highlight: '高亮',
  underline: '下划线',
  strikeout: '删除线',
  area: '区域',
  note: '便笺',
  bookmark: '书签',
};

export function ReaderSidePanel({
  outline,
  pageCount,
  contexts,
  annotations,
  activeContextId,
  visibleContextIds,
  includeGeneral,
  collections,
  busy,
  textIndexJob,
  ocrJob,
  textSearchQuery,
  textSearchScope,
  textSearchResults,
  textIndexBusy,
  ocrBusy,
  textSearching,
  textSearchError,
  undoLabel,
  onPage,
  onLocateAnnotation,
  onActiveContext,
  onToggleContext,
  onToggleGeneral,
  onCreateContext,
  onBindCollection,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onCreateEvidence,
  onUndo,
  onTextSearch,
  onTextSearchScope,
  onTextIndexControl,
  onOcrControl,
  onLocateTextResult,
}: {
  outline: ReaderOutlineItem[];
  pageCount: number;
  contexts: ReadingContext[];
  annotations: Annotation[];
  activeContextId: string | null;
  visibleContextIds: ReadonlySet<string>;
  includeGeneral: boolean;
  collections: ReaderCollectionOption[];
  busy: boolean;
  textIndexJob: TextIndexJob | null;
  ocrJob: OcrJob | null;
  textSearchQuery: string;
  textSearchScope: TextSearchScope;
  textSearchResults: PageTextSearchResult[];
  textIndexBusy: boolean;
  ocrBusy: boolean;
  textSearching: boolean;
  textSearchError: string | null;
  undoLabel: string | null;
  onPage: (pageNumber: number) => void;
  onLocateAnnotation: (annotation: Annotation) => void;
  onActiveContext: (contextId: string | null) => void;
  onToggleContext: (contextId: string) => void;
  onToggleGeneral: () => void;
  onCreateContext: (name: string) => void;
  onBindCollection: (collectionId: string, contextId: string | null) => void;
  onUpdateAnnotation: (
    annotation: Annotation,
    changes: { body: string | null; color: string | null },
  ) => void;
  onDeleteAnnotation: (annotation: Annotation) => void;
  onCreateEvidence: (annotation: Annotation) => void;
  onUndo: () => void;
  onTextSearch: (query: string) => void;
  onTextSearchScope: (scope: TextSearchScope) => void;
  onTextIndexControl: (control: TextIndexControl) => void;
  onOcrControl: (control: OcrControl, languages: OcrLanguage[]) => void;
  onLocateTextResult: (result: PageTextSearchResult) => void;
}) {
  const [panel, setPanel] = useState<'annotations' | 'search' | 'outline'>('annotations');
  const [query, setQuery] = useState('');
  const [contextName, setContextName] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [editingColor, setEditingColor] = useState('');
  const filteredAnnotations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? annotations.filter((annotation) =>
          [annotation.body, annotation.anchor.textQuote?.exact, KIND_LABELS[annotation.kind]]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalized)),
        )
      : annotations;
  }, [annotations, query]);

  const startEditing = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setEditingBody(annotation.body ?? '');
    setEditingColor(annotation.color ?? '');
    onLocateAnnotation(annotation);
  };

  return (
    <aside className="h-full w-[min(20rem,calc(100vw-1rem))] shrink-0 overflow-y-auto border-l border-line bg-surface">
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">阅读面板</p>
            <p className="mt-1 text-xs text-secondary">
              {pageCount} 页 · {annotations.length} 条可见批注
            </p>
          </div>
          {undoLabel && (
            <Button size="sm" disabled={busy} onClick={onUndo}>
              撤销删除
            </Button>
          )}
        </div>
        <div className="mt-3 flex gap-4" role="tablist" aria-label="阅读面板">
          {(['annotations', 'search', 'outline'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={panel === value}
              onClick={() => setPanel(value)}
              className={`border-b-2 pb-2 text-xs font-semibold ${
                panel === value ? 'border-accent text-ink' : 'border-transparent text-muted'
              }`}
            >
              {value === 'annotations' ? '批注' : value === 'search' ? '正文' : '目录'}
            </button>
          ))}
        </div>
      </div>

      {panel === 'outline' ? (
        <nav className="space-y-0.5 px-4 py-3" aria-label="PDF 目录">
          {outline.map((item, index) => (
            <button
              key={`${item.title}-${index}`}
              type="button"
              disabled={item.pageNumber === null}
              onClick={() => item.pageNumber !== null && onPage(item.pageNumber)}
              className="flex w-full items-start justify-between gap-2 border-l border-transparent py-1.5 pr-1 text-left text-xs text-secondary transition hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-60"
              style={{ paddingLeft: `${8 + item.depth * 14}px` }}
            >
              <span className="min-w-0 break-words leading-5">{item.title || '未命名章节'}</span>
              {item.pageNumber !== null && (
                <span className="shrink-0 font-mono text-[10px] text-muted">{item.pageNumber}</span>
              )}
            </button>
          ))}
          {outline.length === 0 && (
            <p className="py-6 text-center text-xs leading-5 text-muted">这份 PDF 没有内嵌目录。</p>
          )}
        </nav>
      ) : panel === 'search' ? (
        <ReaderSearchPanel
          job={textIndexJob}
          ocrJob={ocrJob}
          query={textSearchQuery}
          scope={textSearchScope}
          results={textSearchResults}
          busy={textIndexBusy}
          ocrBusy={ocrBusy}
          searching={textSearching}
          error={textSearchError}
          onSearch={onTextSearch}
          onScope={onTextSearchScope}
          onControl={onTextIndexControl}
          onOcrControl={onOcrControl}
          onLocate={onLocateTextResult}
        />
      ) : (
        <div className="px-4 py-4">
          <section className="border-b border-line pb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">图层</p>
              <span className="text-[10px] text-muted">圆点为当前写入层</span>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={includeGeneral}
                disabled={activeContextId === null}
                onChange={onToggleGeneral}
              />
              <input
                type="radio"
                name="reader-write-layer"
                checked={activeContextId === null}
                onChange={() => onActiveContext(null)}
              />
              <span className="font-semibold text-ink">通用批注</span>
            </label>
            {contexts.map((context) => (
              <label
                key={context.id}
                className="mt-2 flex items-center gap-2 text-xs text-secondary"
              >
                <input
                  type="checkbox"
                  checked={visibleContextIds.has(context.id)}
                  disabled={activeContextId === context.id}
                  onChange={() => onToggleContext(context.id)}
                />
                <input
                  type="radio"
                  name="reader-write-layer"
                  checked={activeContextId === context.id}
                  onChange={() => onActiveContext(context.id)}
                />
                <span
                  className="h-2 w-2 rounded-full bg-accent"
                  style={{ background: context.color ?? undefined }}
                />
                <span className="truncate">{context.name}</span>
              </label>
            ))}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!contextName.trim()) return;
                onCreateContext(contextName.trim());
                setContextName('');
              }}
            >
              <input
                value={contextName}
                onChange={(event) => setContextName(event.target.value)}
                placeholder="新建命名上下文"
                className="min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
              />
              <Button type="submit" size="sm" disabled={busy || !contextName.trim()}>
                新建
              </Button>
            </form>
            <div className="mt-3 flex gap-2">
              <select
                aria-label="绑定目录"
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
                className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5 text-xs text-ink"
              >
                <option value="">选择默认目录…</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || !collectionId}
                onClick={() => collectionId && onBindCollection(collectionId, activeContextId)}
              >
                绑定
              </Button>
            </div>
          </section>

          <section className="pt-4">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索当前可见批注"
              className="w-full rounded-control border border-line bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <div className="mt-3 space-y-2">
              {filteredAnnotations.map((annotation) => (
                <article
                  key={annotation.id}
                  className="border-l-2 border-line pl-3 text-xs"
                  style={{ borderColor: annotation.color ?? undefined }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => startEditing(annotation)}
                  >
                    <span className="font-semibold text-ink">
                      {KIND_LABELS[annotation.kind]} · 第 {annotation.pageNumber} 页
                    </span>
                    {annotation.status === 'needs-review' && (
                      <span className="text-[10px] font-semibold text-critical">待确认</span>
                    )}
                  </button>
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p className="line-clamp-2 min-w-0 flex-1 leading-5 text-secondary">
                      {annotation.body || annotation.anchor.textQuote?.exact || '无正文'}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onCreateEvidence(annotation)}
                    >
                      提炼
                    </Button>
                  </div>
                  {editingId === annotation.id && (
                    <div className="mt-2 space-y-2 pb-2">
                      <textarea
                        value={editingBody}
                        onChange={(event) => setEditingBody(event.target.value)}
                        placeholder="批注正文"
                        rows={3}
                        className="w-full resize-y rounded-control border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          aria-label="批注颜色"
                          value={editingColor}
                          onChange={(event) => setEditingColor(event.target.value)}
                          placeholder="#facc15"
                          className="min-w-0 flex-1 rounded-control border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs text-ink"
                        />
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            onUpdateAnnotation(annotation, {
                              body: editingBody.trim() || null,
                              color: editingColor.trim() || null,
                            });
                            setEditingId(null);
                          }}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onDeleteAnnotation(annotation)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {filteredAnnotations.length === 0 && (
                <p className="py-6 text-center text-xs leading-5 text-muted">
                  当前可见图层还没有匹配批注。
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
