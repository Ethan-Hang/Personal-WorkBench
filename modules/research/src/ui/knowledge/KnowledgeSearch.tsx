import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, IconExternalLink } from '@workbench/ui';
import type {
  EvidenceSourceState,
  KnowledgeSearchEntityType,
  KnowledgeSearchResult,
  KnowledgeSearchStatus,
} from '../../contract.js';
import { fetchKnowledgeSearch, fetchWorks, postRebuildKnowledgeSearch } from '../api.js';
import { SourceStatus } from './SourceStatus.js';

const entityLabels: Record<KnowledgeSearchEntityType, string> = {
  note: '笔记',
  evidence: '证据',
  claim: '观点',
  'writing-document': '文稿',
};

const statusLabels: Record<KnowledgeSearchStatus, string> = {
  active: '当前',
  draft: '草稿',
  archived: '已归档',
  deleted: '已删除',
};

type EntityFilter = 'all' | KnowledgeSearchEntityType;
type StatusFilter = 'current' | 'all' | KnowledgeSearchStatus;
type SourceFilter = 'all' | EvidenceSourceState;

function statusesFor(filter: StatusFilter): KnowledgeSearchStatus[] {
  if (filter === 'current') return ['active', 'draft', 'archived'];
  if (filter === 'all') return ['active', 'draft', 'archived', 'deleted'];
  return [filter];
}

function resultKey(result: KnowledgeSearchResult): string {
  return `${result.entityType}:${result.entityId}`;
}

export function KnowledgeSearch({
  contextId,
  onMessage,
}: {
  contextId: string | null | undefined;
  onMessage: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('current');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [workQuery, setWorkQuery] = useState('');
  const [workId, setWorkId] = useState('');
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const deferredWorkQuery = useDeferredValue(workQuery.trim());
  const worksQuery = useQuery({
    queryKey: ['research', 'works', 'knowledge-search', deferredWorkQuery],
    queryFn: () =>
      fetchWorks({
        status: 'active',
        ...(deferredWorkQuery ? { query: deferredWorkQuery } : {}),
        limit: 30,
      }),
  });
  const searchMutation = useMutation({
    mutationFn: ({ searchQuery, cursor }: { searchQuery: string; cursor: string | null }) =>
      fetchKnowledgeSearch({
        query: searchQuery,
        ...(contextId !== undefined ? { contextId } : {}),
        ...(workId ? { workId } : {}),
        entityTypes:
          sourceFilter !== 'all'
            ? ['evidence']
            : entityFilter === 'all'
              ? ['note', 'evidence', 'claim', 'writing-document']
              : [entityFilter],
        statuses: statusesFor(statusFilter),
        ...(sourceFilter === 'all' ? {} : { sourceStates: [sourceFilter] }),
        cursor,
        limit: 30,
      }),
    onSuccess: (page, variables) => {
      setResults((current) => (variables.cursor ? [...current, ...page.results] : page.results));
      setNextCursor(page.nextCursor);
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '搜索失败'),
  });
  const rebuildMutation = useMutation({
    mutationFn: postRebuildKnowledgeSearch,
    onSuccess: (result) => {
      onMessage(`搜索索引已重建，共 ${result.total} 项`);
      if (submittedQuery) searchMutation.mutate({ searchQuery: submittedQuery, cursor: null });
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '索引重建失败'),
  });

  const submit = () => {
    const next = query.trim();
    if (!next) return;
    setSubmittedQuery(next);
    searchMutation.mutate({ searchQuery: next, cursor: null });
  };
  const busy = searchMutation.isPending || rebuildMutation.isPending;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <header>
          <div>
            <h2 className="text-base font-semibold text-ink">搜索研究知识</h2>
            <p className="mt-1 text-xs text-secondary">
              检索笔记、证据、观点和写作正文，最多返回 500 条。
            </p>
          </div>
        </header>

        <form
          className="mt-5 grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入标题、正文或原文关键词"
            className="border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <Button type="submit" variant="primary" disabled={busy || query.trim().length === 0}>
            搜索
          </Button>
        </form>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            aria-label="对象类型"
            value={entityFilter}
            disabled={sourceFilter !== 'all'}
            onChange={(event) => setEntityFilter(event.target.value as EntityFilter)}
            className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="all">全部对象</option>
            {(Object.keys(entityLabels) as KnowledgeSearchEntityType[]).map((value) => (
              <option key={value} value={value}>
                {entityLabels[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="对象状态"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="current">当前与归档</option>
            <option value="all">全部状态</option>
            {(Object.keys(statusLabels) as KnowledgeSearchStatus[]).map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="来源状态"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
            className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="all">全部来源状态</option>
            <option value="current">来源正常</option>
            <option value="annotation-revised">批注已修订</option>
            <option value="annotation-deleted">批注已删除</option>
            <option value="asset-mismatch">文件已变化</option>
            <option value="source-unavailable">来源不可用</option>
          </select>
          <input
            aria-label="搜索作品"
            value={workQuery}
            onChange={(event) => setWorkQuery(event.target.value)}
            placeholder="按作品标题筛选"
            className="min-w-0 border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
          />
          <select
            aria-label="作品筛选"
            value={workId}
            onChange={(event) => setWorkId(event.target.value)}
            className="min-w-0 border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="">全部作品</option>
            {workId && !(worksQuery.data?.works ?? []).some((work) => work.id === workId) && (
              <option value={workId}>已选作品 · {workId}</option>
            )}
            {(worksQuery.data?.works ?? []).map((work) => (
              <option key={work.id} value={work.id}>
                {work.title}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 border-t border-line">
          {results.map((result) => (
            <a
              key={resultKey(result)}
              href={result.targetUrl}
              className="grid gap-2 border-b border-line px-1 py-4 transition hover:bg-surface-2/60 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:px-3"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  {entityLabels[result.entityType]}
                </p>
                <p className="mt-1 text-[10px] text-secondary">{statusLabels[result.status]}</p>
                {result.sourceState && (
                  <div className="mt-2">
                    <SourceStatus state={result.sourceState} compact />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-6 text-ink">{result.title}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-secondary">
                  {result.excerpt || '标题命中'}
                </p>
                <p className="mt-2 text-[10px] text-muted">
                  命中：
                  {result.matchedFields
                    .map((field) => (field === 'title' ? '标题' : '正文'))
                    .join('、')}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                打开 <IconExternalLink size={12} />
              </span>
            </a>
          ))}
          {!searchMutation.isPending && submittedQuery && results.length === 0 && (
            <p className="py-14 text-center text-xs text-muted">没有符合当前筛选条件的结果。</p>
          )}
          {!submittedQuery && (
            <p className="py-14 text-center text-xs leading-5 text-muted">
              输入关键词后开始搜索。筛选条件会与全文命中同时生效。
            </p>
          )}
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => rebuildMutation.mutate()}
          >
            重建搜索索引
          </Button>
          {nextCursor && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                searchMutation.mutate({ searchQuery: submittedQuery, cursor: nextCursor })
              }
            >
              加载更多
            </Button>
          )}
        </footer>
      </div>
    </section>
  );
}
