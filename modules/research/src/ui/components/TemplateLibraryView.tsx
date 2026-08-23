import { useState, type FormEvent } from 'react';
import {
  Button,
  EmptyState,
  IconBookOpen,
  IconDatabase,
  IconFolder,
  IconPlus,
  IconRefreshCw,
  IconSearch,
  IconTrash,
} from '@workbench/ui';
import type { BulkWorkActionInput, SystemView } from '../../contract.js';
import type { CollectionView, WorkDetail, WorksPage } from '../api.js';
import { BulkActionsBar } from './BulkActionsBar.js';
import { FileStatus, StorageModes } from './FileStatus.js';
import { LayoutSwitch, type ResearchLayout } from './LayoutSwitch.js';
import { WorkDetailPanel, type WorkDetailPanelProps } from './WorkDetailPanel.js';

export interface TemplateLibraryViewProps {
  layout: ResearchLayout;
  message: string | null;
  collections: CollectionView[];
  works: WorksPage['works'];
  detail: WorkDetail | undefined;
  worksLoading: boolean;
  detailLoading: boolean;
  selectedCollectionId: string | null;
  selectedWorkId: string | null;
  selectedCollectionIds: string[];
  selectedWorkIds: string[];
  status: 'active' | 'trashed';
  systemView: SystemView;
  search: string;
  creatingCollection: boolean;
  savingCollections: boolean;
  reconciling: boolean;
  onLayout: (layout: ResearchLayout) => void;
  onImport: () => void;
  onInbox: () => void;
  onManualWork: () => void;
  onReconcile: () => void;
  onManageCollections: () => void;
  onManageTags: () => void;
  onReviewDuplicates: () => void;
  onCreateCollection: (name: string) => Promise<void>;
  onSelectCollection: (id: string | null) => void;
  onSelectWork: (id: string) => void;
  onToggleWorkSelection: (id: string) => void;
  onSystemView: (view: SystemView) => void;
  onBulkAction: (action: BulkWorkActionInput['action'], collectionId?: string) => Promise<void>;
  onStatus: (status: 'active' | 'trashed') => void;
  onSearch: (value: string) => void;
  detailActions: Omit<
    WorkDetailPanelProps,
    'detail' | 'loading' | 'collections' | 'selectedCollectionIds' | 'savingCollections' | 'variant'
  >;
}

function orderedCollections(collections: CollectionView[]) {
  const byParent = new Map<string | null, CollectionView[]>();
  for (const collection of collections) {
    const values = byParent.get(collection.parentId) ?? [];
    values.push(collection);
    byParent.set(collection.parentId, values);
  }
  const ordered: Array<{ collection: CollectionView; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const collection of byParent.get(parentId) ?? []) {
      ordered.push({ collection, depth });
      visit(collection.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

export function TemplateLibraryView({
  layout,
  message,
  collections,
  works,
  detail,
  worksLoading,
  detailLoading,
  selectedCollectionId,
  selectedWorkId,
  selectedCollectionIds,
  selectedWorkIds,
  status,
  systemView,
  search,
  creatingCollection,
  savingCollections,
  reconciling,
  onLayout,
  onImport,
  onInbox,
  onManualWork,
  onReconcile,
  onManageCollections,
  onManageTags,
  onReviewDuplicates,
  onCreateCollection,
  onSelectCollection,
  onSelectWork,
  onToggleWorkSelection,
  onSystemView,
  onBulkAction,
  onStatus,
  onSearch,
  detailActions,
}: TemplateLibraryViewProps) {
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const available = works.filter((work) => work.fileStatus === 'available').length;
  const attention = works.filter(
    (work) => work.fileStatus === 'missing' || work.fileStatus === 'changed',
  ).length;
  const managed = works.filter((work) => work.storageModes.includes('managed')).length;

  const submitCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (!collectionName.trim()) return;
    await onCreateCollection(collectionName.trim());
    setCollectionName('');
    setAddingCollection(false);
  };

  return (
    <div className="relative h-full min-h-0 overflow-y-auto bg-surface-2/35 animate-fade-in">
      <div className="pointer-events-none absolute right-[8%] top-8 h-72 w-72 rounded-full bg-accent-soft/45 blur-3xl" />
      <div className="relative mx-auto w-full max-w-[1180px] px-5 py-7 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
              Research library
            </p>
            <h1
              className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[36px]"
              style={{ fontFamily: '"Songti SC", "Noto Serif SC", Georgia, serif' }}
            >
              把论文留在可追溯的位置
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-secondary">
              作品、版本与文件位置彼此独立。你可以整理目录，同时清楚看到哪些文件由工作台托管、哪些仍链接原位置。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LayoutSwitch value={layout} onChange={onLayout} />
            <Button size="sm" icon={<IconDatabase size={13} />} onClick={onInbox}>
              导入箱
            </Button>
            <Button size="sm" onClick={onManualWork}>
              手工记录
            </Button>
            <Button size="sm" onClick={onManageTags}>
              标签
            </Button>
            <Button size="sm" onClick={onReviewDuplicates}>
              重复治理
            </Button>
            <Button
              size="sm"
              icon={<IconRefreshCw size={13} />}
              disabled={reconciling}
              onClick={onReconcile}
            >
              检查文件
            </Button>
            <Button variant="primary" size="sm" icon={<IconPlus size={13} />} onClick={onImport}>
              导入 PDF
            </Button>
          </div>
        </header>

        {message && (
          <div className="mt-5 rounded-[12px] border border-accent/15 bg-accent-soft/55 px-4 py-2.5 text-xs text-secondary animate-slide-down-in">
            {message}
          </div>
        )}

        <section className="mt-7 grid grid-cols-2 overflow-hidden rounded-[16px] border border-line bg-surface shadow-sm sm:grid-cols-4">
          {[
            ['当前结果', works.length],
            ['文件可用', available],
            ['需要处理', attention],
            ['含托管副本', managed],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`px-4 py-4 sm:px-5 ${index > 0 ? 'border-l border-line' : ''} ${
                index > 1 ? 'border-t border-line sm:border-t-0' : ''
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 overflow-hidden rounded-[18px] border border-line bg-surface shadow-sm">
            <div className="border-b border-line p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-control border border-line bg-surface-2/45 px-3 py-2 focus-within:border-accent">
                  <IconSearch size={14} className="text-muted" />
                  <input
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="搜索标题或年份"
                    className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onStatus('active');
                    onSelectCollection(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    status === 'active' && selectedCollectionId === null
                      ? 'border-accent/20 bg-accent-soft text-accent'
                      : 'border-line text-secondary hover:text-ink'
                  }`}
                >
                  全部
                </button>
                <select
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-secondary outline-none focus:border-accent"
                  value={systemView}
                  onChange={(event) => onSystemView(event.target.value as SystemView)}
                >
                  <option value="all">全部</option>
                  <option value="uncategorized">未分类</option>
                  <option value="missing-files">缺失文件</option>
                  <option value="metadata-review">待确认元数据</option>
                  <option value="duplicate-candidates">重复候选</option>
                  <option value="trash">回收站</option>
                </select>
              </div>
            </div>

            <BulkActionsBar
              selectedCount={selectedWorkIds.length}
              collections={collections}
              tags={detailActions.availableTags}
              status={status}
              onAction={onBulkAction}
            />

            {worksLoading ? (
              <div className="divide-y divide-line/70" aria-label="正在加载文献">
                {[0, 1, 2].map((value) => (
                  <div key={value} className="p-5 animate-pulse">
                    <div className="h-4 w-2/3 rounded bg-surface-2" />
                    <div className="mt-3 h-3 w-1/3 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
            ) : works.length === 0 ? (
              <EmptyState
                icon={IconBookOpen}
                title="这里还没有论文"
                description="导入 PDF 后，文件身份、作品信息和目录归属会一起进入资料库。"
                action={
                  <button
                    type="button"
                    onClick={onImport}
                    className="text-xs font-semibold text-accent"
                  >
                    导入第一篇
                  </button>
                }
                className="min-h-80 border-0 bg-transparent"
              />
            ) : (
              <div className="divide-y divide-line/70">
                {works.map((work) => {
                  const selected = selectedWorkId === work.id;
                  return (
                    <div
                      key={work.id}
                      className={`group flex w-full items-start gap-3 px-5 py-5 text-left transition sm:px-6 ${
                        selected ? 'bg-accent-soft/45' : 'hover:bg-surface-2/45'
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`选择 ${work.title || '未命名作品'}`}
                        className="mt-2 shrink-0"
                        checked={selectedWorkIds.includes(work.id)}
                        onChange={() => onToggleWorkSelection(work.id)}
                      />
                      <button
                        type="button"
                        onClick={() => onSelectWork(work.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start gap-4">
                          <span
                            className={`mt-1 block h-9 w-1 shrink-0 rounded-full transition ${
                              selected ? 'bg-accent' : 'bg-line group-hover:bg-accent/35'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h2 className="line-clamp-2 text-[15px] font-semibold leading-6 text-ink">
                                  {work.title || '未命名作品'}
                                </h2>
                                <p className="mt-1 truncate text-xs text-secondary">
                                  {work.authors.join('、') || '作者待补充'}
                                  {work.year !== null ? ` · ${work.year}` : ''}
                                </p>
                              </div>
                              <FileStatus status={work.fileStatus} />
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <StorageModes modes={work.storageModes} />
                              <span className="text-[11px] tabular-nums text-muted">
                                {work.attachmentCount} 个附件
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          <aside className="space-y-5">
            <section className="rounded-[16px] border border-line bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Collections
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-ink">目录</h2>
                </div>
                <button
                  type="button"
                  aria-label="新建目录"
                  onClick={() => setAddingCollection(true)}
                  className="rounded-control border border-line p-1.5 text-muted transition hover:border-accent/30 hover:text-accent"
                >
                  <IconPlus size={13} />
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {orderedCollections(collections).map(({ collection, depth }) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => {
                      onStatus('active');
                      onSelectCollection(collection.id);
                    }}
                    className={`flex w-full items-center gap-2 rounded-control py-2 pr-2 text-left text-xs transition ${
                      status === 'active' && selectedCollectionId === collection.id
                        ? 'bg-accent-soft font-semibold text-accent'
                        : 'text-secondary hover:bg-surface-2 hover:text-ink'
                    }`}
                    style={{ paddingLeft: `${10 + depth * 14}px` }}
                  >
                    <IconFolder size={13} />
                    <span className="truncate">{collection.name}</span>
                  </button>
                ))}
                {collections.length === 0 && !addingCollection && (
                  <p className="py-3 text-[11px] leading-5 text-muted">
                    还没有目录，可按主题创建。
                  </p>
                )}
              </div>
              {addingCollection && (
                <form onSubmit={submitCollection} className="mt-3 flex gap-1.5">
                  <input
                    autoFocus
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                    placeholder="目录名称"
                    className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={creatingCollection || !collectionName.trim()}
                    className="rounded-control bg-accent px-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    添加
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => {
                  onStatus('trashed');
                  onSelectCollection(null);
                }}
                className="mt-3 flex w-full items-center gap-2 border-t border-line pt-3 text-xs font-semibold text-muted hover:text-critical"
              >
                <IconTrash size={13} />
                回收站
              </button>
              <button
                type="button"
                onClick={onManageCollections}
                className="mt-2 w-full text-left text-[11px] font-semibold text-accent"
              >
                移动、排序或删除目录
              </button>
            </section>

            <WorkDetailPanel
              {...detailActions}
              variant="template"
              detail={detail}
              loading={detailLoading}
              collections={collections}
              selectedCollectionIds={selectedCollectionIds}
              savingCollections={savingCollections}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
