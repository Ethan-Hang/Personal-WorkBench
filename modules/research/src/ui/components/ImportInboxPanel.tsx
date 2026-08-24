import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  EmptyState,
  IconAlertCircle,
  IconBookOpen,
  IconDatabase,
  IconRefreshCw,
  IconUpload,
  controlClass,
} from '@workbench/ui';
import type { ConfirmImportInput, ImportItemStage, ImportSessionStatus } from '../../contract.js';
import {
  fetchImportInspection,
  fetchImportSessions,
  postCancelImport,
  postCommitImport,
  postPickPdf,
  postPrepareImport,
  postRetryImportItem,
  postStartImportInspection,
  postUploadPdf,
  putImportDecision,
  type CollectionView,
  type ImportInspectionItem,
} from '../api.js';
import { LayoutSwitch, type ResearchLayout } from './LayoutSwitch.js';
import { MetadataReview } from './MetadataReview.js';

type SessionFilter = ImportSessionStatus | 'all';
type ItemFilter = 'all' | 'needs-review' | 'failed' | 'finished';

const SESSION_LABELS: Record<ImportSessionStatus, string> = {
  draft: '待识别',
  inspecting: '识别中',
  'awaiting-confirmation': '待确认',
  committing: '提交中',
  completed: '已完成',
  cancelled: '已取消',
  failed: '批次失败',
  reconciling: '恢复中',
};

const STAGE_LABELS: Record<ImportItemStage, string> = {
  selected: '已选择',
  hashing: '校验文件',
  staged: '暂存完成',
  'object-ready': '托管完成',
  'linked-verified': '链接确认',
  metadata: '识别元数据',
  'metadata-failed': '元数据失败',
  'awaiting-confirmation': '待确认',
  'database-committed': '写入完成',
  available: '已入库',
  failed: '失败',
  cancelled: '已取消',
};

function itemVisible(stage: ImportItemStage, filter: ItemFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-review') return stage === 'awaiting-confirmation';
  if (filter === 'failed') return stage === 'failed' || stage === 'metadata-failed';
  return stage === 'available' || stage === 'cancelled';
}

function sessionProgress(items: Array<{ stage: ImportItemStage }>) {
  const finished = items.filter(
    (item) =>
      item.stage === 'awaiting-confirmation' ||
      item.stage === 'available' ||
      item.stage === 'failed' ||
      item.stage === 'cancelled',
  ).length;
  return {
    finished,
    total: items.length,
    percent: items.length ? (finished / items.length) * 100 : 0,
  };
}

export function ImportInboxPanel({
  layout,
  collections,
  onLayout,
  onLibrary,
  onManualWork,
  onChanged,
}: {
  layout: ResearchLayout;
  collections: CollectionView[];
  onLayout: (layout: ResearchLayout) => void;
  onLibrary: () => void;
  onManualWork: () => void;
  onChanged: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'managed' | 'linked'>('managed');
  const [manualPaths, setManualPaths] = useState('');
  const [allowExternal, setAllowExternal] = useState(false);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['research', 'import-sessions', sessionFilter],
    queryFn: () =>
      fetchImportSessions({
        status: sessionFilter === 'all' ? undefined : sessionFilter,
        limit: 100,
      }),
    refetchInterval: 1_500,
  });
  const inspectionQuery = useQuery({
    queryKey: ['research', 'import-inspection', selectedSessionId],
    queryFn: () => fetchImportInspection(selectedSessionId!),
    enabled: selectedSessionId !== null,
    refetchInterval: 1_000,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]!.id);
    }
  }, [selectedSessionId, sessions]);

  const inspectionItems = inspectionQuery.data?.items ?? [];
  const visibleItems = useMemo(
    () => inspectionItems.filter((item) => itemVisible(item.item.stage, itemFilter)),
    [inspectionItems, itemFilter],
  );
  useEffect(() => {
    if (visibleItems.length === 0) {
      setSelectedItemId(null);
      return;
    }
    if (!selectedItemId || !visibleItems.some((item) => item.item.id === selectedItemId)) {
      setSelectedItemId(visibleItems[0]!.item.id);
    }
  }, [selectedItemId, visibleItems]);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedItem = inspectionItems.find((item) => item.item.id === selectedItemId) ?? null;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['research', 'import-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['research', 'import-inspection'] }),
    ]);
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const startSession = async (sessionId: string) => {
    await postStartImportInspection(sessionId, { allowExternal, forceRefresh: false });
    setSelectedSessionId(sessionId);
  };

  const preparePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    if (paths.length > 200) throw new Error('一个批次最多 200 个文件');
    const session = await postPrepareImport({
      files: paths.map((path) => ({ path, storageMode })),
      requestId: crypto.randomUUID(),
    });
    await startSession(session.id);
    setManualPaths('');
  };

  const chooseLocalBatch = () =>
    run(async () => {
      const picked = await postPickPdf({ multiple: true });
      if (!picked.cancelled) await preparePaths(picked.paths);
    }, '批次已经进入导入箱');

  const submitManualPaths = () =>
    run(
      () =>
        preparePaths(
          manualPaths
            .split(/\r?\n/)
            .map((path) => path.trim())
            .filter(Boolean),
        ),
      '批次已经进入导入箱',
    );

  const uploadBrowserFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void run(
      async () => {
        const selected = [...files];
        if (selected.length > 200) throw new Error('一次最多选择 200 个 PDF');
        let lastSessionId: string | null = null;
        for (const file of selected) {
          const session = await postUploadPdf(file, crypto.randomUUID());
          await startSession(session.id);
          lastSessionId = session.id;
        }
        if (lastSessionId) setSelectedSessionId(lastSessionId);
      },
      files.length === 1 ? '文件已经进入导入箱' : `${files.length} 个文件已逐个进入导入箱`,
    );
  };

  const saveDecision = async (input: ConfirmImportInput) => {
    if (!selectedSessionId) return;
    await run(
      () => putImportDecision(selectedSessionId, input.itemId, input),
      input.duplicateDecision === 'discard' ? '放弃决定已保存' : '条目决定已保存',
    );
  };

  const commit = () => {
    if (!selectedSessionId) return;
    void (async () => {
      setBusy(true);
      setMessage(null);
      try {
        const result = await postCommitImport(selectedSessionId);
        const committed = result.results.filter((item) => item.status === 'committed').length;
        const discarded = result.results.filter((item) => item.status === 'discarded').length;
        const failed = result.results.filter((item) => item.status === 'failed').length;
        setMessage(`已提交 ${committed} 条，放弃 ${discarded} 条，失败 ${failed} 条`);
        await Promise.all([onChanged(), refresh()]);
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : '批次提交失败');
      } finally {
        setBusy(false);
      }
    })();
  };

  const isTemplate = layout === 'template';
  const wrapper = isTemplate
    ? 'relative h-full min-h-0 overflow-y-auto bg-surface-2/35'
    : 'flex h-full min-h-0 flex-col overflow-hidden bg-surface';
  const frame = isTemplate
    ? 'relative mx-auto w-full max-w-[1180px] px-5 py-7 sm:px-8 sm:py-9'
    : 'flex min-h-0 flex-1 flex-col';
  const columns = isTemplate
    ? 'mt-6 grid min-h-[620px] gap-5 lg:grid-cols-[270px_minmax(0,1fr)_minmax(360px,1.2fr)]'
    : 'grid min-h-0 flex-1 grid-cols-[250px_minmax(300px,0.85fr)_minmax(420px,1.3fr)] overflow-x-auto';
  const pane = isTemplate
    ? 'min-w-0 rounded-[16px] border border-line bg-surface shadow-sm'
    : 'min-w-0 border-r border-line bg-surface';

  return (
    <div className={wrapper}>
      {isTemplate && (
        <div className="pointer-events-none absolute right-[8%] top-8 h-72 w-72 rounded-full bg-accent-soft/45 blur-3xl" />
      )}
      <div className={frame}>
        <header
          className={
            isTemplate
              ? 'flex flex-wrap items-start justify-between gap-5'
              : 'flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4'
          }
        >
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
              Research
            </p>
            <h1
              className={
                isTemplate
                  ? 'mt-2 text-[34px] font-semibold tracking-tight text-ink'
                  : 'mt-0.5 text-xl font-bold text-ink'
              }
              style={
                isTemplate
                  ? { fontFamily: '"Songti SC", "Noto Serif SC", Georgia, serif' }
                  : undefined
              }
            >
              导入箱
            </h1>
            <p className="mt-1 text-xs leading-5 text-secondary">
              检查重复项和元数据，确认后加入文献库。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LayoutSwitch value={layout} onChange={onLayout} />
            <Button onClick={onLibrary}>文献库</Button>
            <Button onClick={onManualWork}>新建文献</Button>
          </div>
        </header>

        {message && (
          <div
            className={
              isTemplate
                ? 'mt-5 rounded-control border border-accent/15 bg-accent-soft/55 px-4 py-2.5 text-xs text-secondary'
                : 'border-b border-line bg-accent-soft/45 px-5 py-2 text-xs text-secondary'
            }
          >
            {message}
          </div>
        )}

        <section
          className={
            isTemplate
              ? 'mt-6 rounded-[16px] border border-line bg-surface p-4 shadow-sm'
              : 'shrink-0 border-b border-line p-4'
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">新批次</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={<IconUpload size={13} />}
                  disabled={busy}
                  onClick={chooseLocalBatch}
                >
                  本机多选 PDF
                </Button>
                {storageMode === 'managed' && (
                  <label className="inline-flex cursor-pointer items-center rounded-control border border-line bg-surface px-3 py-[7px] text-xs font-semibold text-ink transition hover:bg-surface-2">
                    浏览器选择 PDF
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(event) => uploadBrowserFiles(event.target.files)}
                    />
                  </label>
                )}
              </div>
            </div>
            <label className="text-[11px] font-semibold text-secondary">
              保存方式
              <select
                className={`${controlClass} mt-1 min-w-28`}
                value={storageMode}
                onChange={(event) => setStorageMode(event.target.value as 'managed' | 'linked')}
              >
                <option value="managed">托管副本</option>
                <option value="linked">链接原文件</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={allowExternal}
                onChange={(event) => setAllowExternal(event.target.checked)}
              />
              识别后查询外部元数据
            </label>
            <details className="ml-auto min-w-[260px] max-w-md flex-1">
              <summary className="cursor-pointer text-xs font-semibold text-accent">
                粘贴多行绝对路径
              </summary>
              <div className="mt-2 flex gap-2">
                <textarea
                  className={`${controlClass} min-h-16 resize-y`}
                  value={manualPaths}
                  onChange={(event) => setManualPaths(event.target.value)}
                  placeholder={'每行一个 PDF 路径，最多 200 个'}
                />
                <Button disabled={busy || !manualPaths.trim()} onClick={submitManualPaths}>
                  加入
                </Button>
              </div>
            </details>
          </div>
          {collections.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                确认时加入目录
              </span>
              {collections.map((collection) => {
                const checked = collectionIds.includes(collection.id);
                return (
                  <label
                    key={collection.id}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                      checked
                        ? 'border-accent/25 bg-accent-soft text-accent'
                        : 'border-line text-secondary'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setCollectionIds((values) =>
                          checked
                            ? values.filter((value) => value !== collection.id)
                            : [...values, collection.id],
                        )
                      }
                    />
                    {collection.name}
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <div className={columns}>
          <aside className={`${pane} overflow-y-auto p-3`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">批次</h2>
              <Button size="sm" icon={<IconRefreshCw size={12} />} onClick={() => void refresh()}>
                刷新
              </Button>
            </div>
            <select
              className={`${controlClass} mt-3`}
              value={sessionFilter}
              onChange={(event) => setSessionFilter(event.target.value as SessionFilter)}
            >
              <option value="all">全部批次</option>
              {Object.entries(SESSION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="mt-3 space-y-2">
              {sessions.map((session) => {
                const progress = sessionProgress(session.items);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full rounded-control border p-3 text-left transition ${
                      selectedSessionId === session.id
                        ? 'border-accent/30 bg-accent-soft/55'
                        : 'border-line hover:bg-surface-2/55'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {session.items[0]?.fileName ?? '空批次'}
                        {session.items.length > 1 ? ` 等 ${session.items.length} 个` : ''}
                      </span>
                      <Chip tone={session.status === 'completed' ? 'good' : 'neutral'}>
                        {SESSION_LABELS[session.status]}
                      </Chip>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] tabular-nums text-muted">
                      {progress.finished}/{progress.total} ·{' '}
                      {new Date(session.updatedAt).toLocaleString()}
                    </p>
                  </button>
                );
              })}
              {!sessionsQuery.isLoading && sessions.length === 0 && (
                <p className="py-6 text-center text-xs text-muted">当前筛选没有批次</p>
              )}
            </div>
          </aside>

          <section className={`${pane} overflow-y-auto p-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">条目</h2>
              <select
                className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink"
                value={itemFilter}
                onChange={(event) => setItemFilter(event.target.value as ItemFilter)}
              >
                <option value="all">全部</option>
                <option value="needs-review">待确认</option>
                <option value="failed">失败</option>
                <option value="finished">已处理</option>
              </select>
            </div>
            {selectedSession && (
              <div className="mt-3 flex flex-wrap gap-2 border-b border-line pb-3">
                {(selectedSession.status === 'draft' || selectedSession.status === 'failed') && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => startSession(selectedSession.id), '已经开始识别')}
                  >
                    开始识别
                  </Button>
                )}
                {!['completed', 'cancelled'].includes(selectedSession.status) && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(() => postCancelImport(selectedSession.id), '批次已取消')
                    }
                  >
                    取消批次
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || !selectedSession.items.some((item) => item.hasDecision)}
                  onClick={commit}
                >
                  提交已确认条目
                </Button>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {visibleItems.map((entry) => (
                <button
                  key={entry.item.id}
                  type="button"
                  onClick={() => setSelectedItemId(entry.item.id)}
                  className={`w-full rounded-control border p-3 text-left transition ${
                    selectedItemId === entry.item.id
                      ? 'border-accent/30 bg-accent-soft/50'
                      : 'border-line hover:bg-surface-2/55'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="min-w-0 truncate text-xs font-semibold text-ink"
                      title={entry.item.fileName}
                    >
                      {entry.item.fileName}
                    </p>
                    {entry.item.hasDecision && <Chip tone="accent">已保存</Chip>}
                  </div>
                  <p className="mt-1 text-[11px] text-secondary">
                    {STAGE_LABELS[entry.item.stage]} ·{' '}
                    {entry.item.storageMode === 'managed' ? '托管' : '链接'}
                  </p>
                  {entry.batchDuplicateItemIds.length > 0 && (
                    <p className="mt-1 text-[10px] text-warning">
                      批次内 {entry.batchDuplicateItemIds.length} 个相同文件
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>

          <main className={`${pane} overflow-y-auto p-4 sm:p-5`}>
            {!selectedItem ? (
              <EmptyState
                icon={IconDatabase}
                title="选择一个导入条目"
                description="查看文件信息、重复项和识别出的元数据。"
                className="min-h-72 border-0 bg-transparent"
              />
            ) : selectedItem.item.stage === 'awaiting-confirmation' ? (
              <>
                {inspectionQuery.data?.disclosure.externalEnabled && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Chip tone="accent">
                      已访问：{inspectionQuery.data.disclosure.services.join('、') || '无'}
                    </Chip>
                    <Chip tone="good">PDF 未发送</Chip>
                  </div>
                )}
                <MetadataReview
                  key={selectedItem.item.id}
                  item={selectedItem}
                  collectionIds={collectionIds}
                  busy={busy}
                  primaryLabel="保存决定"
                  onConfirm={saveDecision}
                />
              </>
            ) : selectedItem.item.stage === 'failed' ||
              selectedItem.item.stage === 'metadata-failed' ? (
              <FailedItem
                item={selectedItem}
                busy={busy}
                onRetry={() => {
                  if (!selectedSessionId) return;
                  return run(
                    () =>
                      postRetryImportItem(selectedSessionId, selectedItem.item.id, {
                        allowExternal,
                        forceRefresh: false,
                      }),
                    '条目已经重新识别',
                  );
                }}
              />
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <IconBookOpen size={28} className="text-muted" />
                <p className="mt-3 text-sm font-semibold text-ink">
                  {STAGE_LABELS[selectedItem.item.stage]}
                </p>
                <p className="mt-1 text-xs text-secondary">这个条目当前不需要编辑。</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function FailedItem({
  item,
  busy,
  onRetry,
}: {
  item: ImportInspectionItem;
  busy: boolean;
  onRetry: () => void | Promise<unknown>;
}) {
  return (
    <div className="rounded-control border border-critical/20 bg-critical-soft/45 p-4">
      <div className="flex items-start gap-3">
        <IconAlertCircle size={18} className="mt-0.5 shrink-0 text-critical" />
        <div>
          <h3 className="text-sm font-semibold text-ink">文件识别未完成</h3>
          <p className="mt-2 text-xs leading-5 text-critical">
            {item.item.error?.message ?? item.warnings[0] ?? '未知错误'}
          </p>
          <p className="mt-1 text-[11px] text-secondary">
            {item.item.error?.retryable
              ? '修正文件或路径后，可以只重试这一条。'
              : '该错误不能直接重试。'}
          </p>
          <Button
            className="mt-4"
            disabled={busy || !item.item.error?.retryable}
            onClick={() => void onRetry()}
          >
            重试条目
          </Button>
        </div>
      </div>
    </div>
  );
}
