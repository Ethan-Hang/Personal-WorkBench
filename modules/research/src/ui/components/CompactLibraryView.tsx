import { Button, IconDatabase, IconPlus, IconRefreshCw, IconSearch } from '@workbench/ui';
import type {
  BulkWorkActionInput,
  ResearchSearchAst,
  SearchSort,
  SystemView,
} from '../../contract.js';
import type { CollectionView, TagView, WorkDetail, WorksPage } from '../api.js';
import { CollectionSidebar } from './CollectionSidebar.js';
import { BulkActionsBar } from './BulkActionsBar.js';
import { LayoutSwitch, type ResearchLayout } from './LayoutSwitch.js';
import { LibraryList } from './LibraryList.js';
import { WorkDetailPanel, type WorkDetailPanelProps } from './WorkDetailPanel.js';
import { SearchFiltersPanel } from './SearchFiltersPanel.js';

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
  selectedWorkIds: string[];
  status: 'active' | 'trashed';
  systemView: SystemView;
  search: string;
  tags: TagView[];
  searchFilters: ResearchSearchAst['filters'];
  searchSort: SearchSort;
  filtersOpen: boolean;
  savingSearch: boolean;
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
  onExport: () => void;
  onRestoreBundle: () => void;
  onManageStorage: () => void;
  onCreateCollection: (name: string) => Promise<void>;
  onSelectCollection: (id: string | null) => void;
  onSelectWork: (id: string) => void;
  onToggleWorkSelection: (id: string) => void;
  onSystemView: (view: SystemView) => void;
  onBulkAction: (action: BulkWorkActionInput['action'], collectionId?: string) => Promise<void>;
  onStatus: (status: 'active' | 'trashed') => void;
  onSearch: (value: string) => void;
  onToggleFilters: () => void;
  onSearchFilters: (filters: ResearchSearchAst['filters']) => void;
  onSearchSort: (sort: SearchSort) => void;
  onClearSearchFilters: () => void;
  onSaveSearch: (name: string) => Promise<void>;
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
  selectedWorkIds,
  status,
  systemView,
  search,
  tags,
  searchFilters,
  searchSort,
  filtersOpen,
  savingSearch,
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
  onExport,
  onRestoreBundle,
  onManageStorage,
  onCreateCollection,
  onSelectCollection,
  onSelectWork,
  onToggleWorkSelection,
  onSystemView,
  onBulkAction,
  onStatus,
  onSearch,
  onToggleFilters,
  onSearchFilters,
  onSearchSort,
  onClearSearchFilters,
  onSaveSearch,
  detailActions,
}: CompactLibraryViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface animate-fade-in">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Research</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-ink">文献库</h1>
          <p className="mt-1 text-xs text-secondary">管理文献、版本、附件和目录</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LayoutSwitch value={layout} onChange={onLayout} />
          <Button size="sm" icon={<IconDatabase size={13} />} onClick={onInbox}>
            导入箱
          </Button>
          <Button size="sm" onClick={onManualWork}>
            新建文献
          </Button>
          <Button size="sm" onClick={onManageTags}>
            标签
          </Button>
          <Button size="sm" onClick={onReviewDuplicates}>
            合并重复项
          </Button>
          <Button size="sm" onClick={onExport}>
            导出
          </Button>
          <Button size="sm" onClick={onRestoreBundle}>
            恢复资料包
          </Button>
          <Button size="sm" onClick={onManageStorage}>
            附件存储
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
          systemView={systemView}
          creating={creatingCollection}
          onSelect={onSelectCollection}
          onStatus={onStatus}
          onSystemView={onSystemView}
          onCreate={onCreateCollection}
          onManage={onManageCollections}
        />

        <section className="flex min-w-[360px] flex-1 flex-col border-r border-line bg-surface">
          <div className="shrink-0 border-b border-line">
            <div className="flex gap-2 p-3">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface-2/45 px-3 py-2 focus-within:border-accent">
                <IconSearch size={14} className="text-muted" />
                <input
                  value={search}
                  onChange={(event) => onSearch(event.target.value)}
                  placeholder="搜索标题、作者、摘要、出版信息或标识符"
                  className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                />
              </label>
              <Button size="sm" onClick={onToggleFilters}>
                {filtersOpen ? '收起筛选' : '筛选'}
              </Button>
            </div>
            <SearchFiltersPanel
              open={filtersOpen}
              filters={searchFilters}
              sort={searchSort}
              collections={collections.filter((collection) => collection.kind === 'manual')}
              tags={tags}
              saving={savingSearch}
              onChange={onSearchFilters}
              onSort={onSearchSort}
              onClear={onClearSearchFilters}
              onSave={onSaveSearch}
            />
          </div>
          <BulkActionsBar
            selectedCount={selectedWorkIds.length}
            collections={collections.filter((collection) => collection.kind === 'manual')}
            tags={tags}
            status={status}
            onAction={onBulkAction}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LibraryList
              works={works}
              selectedId={selectedWorkId}
              selectedIds={selectedWorkIds}
              loading={worksLoading}
              onSelect={onSelectWork}
              onToggleSelection={onToggleWorkSelection}
              onImport={onImport}
            />
          </div>
        </section>

        <aside className="min-w-[340px] flex-[0.9] overflow-y-auto bg-surface-2/20 p-5">
          <WorkDetailPanel
            {...detailActions}
            detail={detail}
            loading={detailLoading}
            collections={collections.filter((collection) => collection.kind === 'manual')}
            selectedCollectionIds={selectedCollectionIds}
            savingCollections={savingCollections}
          />
        </aside>
      </div>
    </div>
  );
}
