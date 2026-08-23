import { Button, IconDatabase, IconPlus, IconRefreshCw, IconSearch } from '@workbench/ui';
import type { CollectionView, WorkDetail, WorksPage } from '../api.js';
import { CollectionSidebar } from './CollectionSidebar.js';
import { LayoutSwitch, type ResearchLayout } from './LayoutSwitch.js';
import { LibraryList } from './LibraryList.js';
import { WorkDetailPanel, type WorkDetailPanelProps } from './WorkDetailPanel.js';

export interface CompactLibraryViewProps {
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
  status: 'active' | 'trashed';
  search: string;
  creatingCollection: boolean;
  savingCollections: boolean;
  reconciling: boolean;
  onLayout: (layout: ResearchLayout) => void;
  onImport: () => void;
  onInbox: () => void;
  onManualWork: () => void;
  onReconcile: () => void;
  onCreateCollection: (name: string) => Promise<void>;
  onSelectCollection: (id: string | null) => void;
  onSelectWork: (id: string) => void;
  onStatus: (status: 'active' | 'trashed') => void;
  onSearch: (value: string) => void;
  detailActions: Omit<
    WorkDetailPanelProps,
    'detail' | 'loading' | 'collections' | 'selectedCollectionIds' | 'savingCollections' | 'variant'
  >;
}

export function CompactLibraryView({
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
  status,
  search,
  creatingCollection,
  savingCollections,
  reconciling,
  onLayout,
  onImport,
  onInbox,
  onManualWork,
  onReconcile,
  onCreateCollection,
  onSelectCollection,
  onSelectWork,
  onStatus,
  onSearch,
  detailActions,
}: CompactLibraryViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface animate-fade-in">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Research</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-ink">文献库</h1>
          <p className="mt-1 text-xs text-secondary">作品身份、文件位置和元数据来源统一管理</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LayoutSwitch value={layout} onChange={onLayout} />
          <Button size="sm" icon={<IconDatabase size={13} />} onClick={onInbox}>
            导入箱
          </Button>
          <Button size="sm" onClick={onManualWork}>
            手工记录
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
        <div className="shrink-0 border-b border-line bg-accent-soft/45 px-5 py-2 text-xs text-secondary animate-slide-down-in">
          {message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <CollectionSidebar
          collections={collections}
          selectedId={selectedCollectionId}
          status={status}
          creating={creatingCollection}
          onSelect={onSelectCollection}
          onStatus={onStatus}
          onCreate={onCreateCollection}
        />

        <section className="flex min-w-[360px] flex-1 flex-col border-r border-line bg-surface">
          <div className="shrink-0 border-b border-line p-3">
            <label className="flex items-center gap-2 rounded-control border border-line bg-surface-2/45 px-3 py-2 focus-within:border-accent">
              <IconSearch size={14} className="text-muted" />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="按标题或年份筛选"
                className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LibraryList
              works={works}
              selectedId={selectedWorkId}
              loading={worksLoading}
              onSelect={onSelectWork}
              onImport={onImport}
            />
          </div>
        </section>

        <aside className="min-w-[340px] flex-[0.9] overflow-y-auto bg-surface-2/20 p-5">
          <WorkDetailPanel
            {...detailActions}
            detail={detail}
            loading={detailLoading}
            collections={collections}
            selectedCollectionIds={selectedCollectionIds}
            savingCollections={savingCollections}
          />
        </aside>
      </div>
    </div>
  );
}
