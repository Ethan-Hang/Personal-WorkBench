import { Button, controlClass, IconPlus, IconSearch, IconX } from '@workbench/ui';
import { APPLICATION_PRIORITIES, type ApplicationPriority } from '../../contract.js';
import type {
  FilterAndSortOptions,
  SortByOption,
  StatusFilterOption,
} from '../utils/filterAndSort.js';

export type ViewMode = 'table' | 'kanban';

interface ApplicationsToolbarProps {
  options: FilterAndSortOptions;
  onOptionsChange: (updater: (prev: FilterAndSortOptions) => FilterAndSortOptions) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenCreateModal: () => void;
  totalCount: number;
  filteredCount: number;
}

const STATUS_TABS: { id: StatusFilterOption; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '进行中' },
  { id: 'pending', label: '待投递' },
  { id: 'applied', label: '已投递' },
  { id: 'interviewing', label: '面试中' },
  { id: 'offer', label: 'Offer / OC' },
  { id: 'failed', label: '已结束' },
];

const SORT_OPTIONS: { id: SortByOption; label: string }[] = [
  { id: 'updated-desc', label: '最新更新' },
  { id: 'priority-desc', label: '优先级 (S → C)' },
  { id: 'deadline-asc', label: '截止日 (临近优先)' },
  { id: 'interview-asc', label: '面试安排 (即将到来)' },
  { id: 'created-desc', label: '最早录入' },
];

export function ApplicationsToolbar({
  options,
  onOptionsChange,
  viewMode,
  onViewModeChange,
  onOpenCreateModal,
  totalCount,
  filteredCount,
}: ApplicationsToolbarProps) {
  const setOption = <K extends keyof FilterAndSortOptions>(
    key: K,
    value: FilterAndSortOptions[K],
  ) => {
    onOptionsChange((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3.5 shadow-sm">
      {/* 顶栏：搜索、视图切换与创建按钮 */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[260px] max-w-md flex-1">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={options.query}
            onChange={(e) => setOption('query', e.target.value)}
            placeholder="搜索公司、岗位、城市、内推码、轮次..."
            className={`${controlClass} w-full pl-9 pr-8 text-[13px]`}
          />
          {options.query && (
            <button
              type="button"
              onClick={() => setOption('query', '')}
              aria-label="清空搜索"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 视图切换按钮组 */}
          <div className="flex items-center rounded-control border border-line bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
              title="表格视图"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M9 3v18" />
              </svg>
              <span>表格</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('kanban')}
              className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-secondary'
              }`}
              title="看板视图"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="6" height="18" x="3" y="3" rx="1" />
                <rect width="6" height="12" x="11" y="3" rx="1" />
                <rect width="6" height="15" x="19" y="3" rx="1" />
              </svg>
              <span>看板</span>
            </button>
          </div>

          {/* 排序选择 */}
          <div className="flex items-center">
            <select
              value={options.sortBy}
              onChange={(e) => setOption('sortBy', e.target.value as SortByOption)}
              className={`${controlClass} py-1 text-[12px] font-medium`}
              aria-label="排序依据"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 添加投递主按钮 */}
          <Button
            type="button"
            variant="primary"
            onClick={onOpenCreateModal}
            className="flex items-center gap-1 py-1 text-[13px] shadow-sm"
          >
            <IconPlus size={15} />
            <span>记新投递</span>
          </Button>
        </div>
      </div>

      {/* 底栏：状态 Filter Tabs 与 优先级过滤 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-[12px]">
        {/* 状态分类药丸按钮 */}
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_TABS.map((tab) => {
            const isActive = options.statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOption('statusFilter', tab.id)}
                className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                  isActive
                    ? 'bg-ink text-white shadow-xs'
                    : 'bg-surface-2 text-secondary hover:bg-surface-3 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 优先级过滤与数据计数 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">优先级:</span>
            <button
              type="button"
              onClick={() => setOption('priorityFilter', 'all')}
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                options.priorityFilter === 'all'
                  ? 'bg-ink text-white'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              全部
            </button>
            {APPLICATION_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setOption('priorityFilter', p as ApplicationPriority)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                  options.priorityFilter === p
                    ? 'bg-ink text-white'
                    : 'text-secondary hover:text-ink'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <span className="text-[11px] tabular-nums text-muted">
            共 {filteredCount} / {totalCount} 家
          </span>
        </div>
      </div>
    </div>
  );
}
