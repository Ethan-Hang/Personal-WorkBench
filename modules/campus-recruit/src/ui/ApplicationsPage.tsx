import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, IconBriefcase, PageHeader, Panel } from '@workbench/ui';
import type {
  CreateApplicationInput,
  CreateRoundInput,
  UpdateApplicationInput,
  UpdateRoundInput,
} from '../contract.js';
import {
  deleteApplication,
  deleteRound,
  fetchApplications,
  patchApplication,
  patchRound,
  postApplication,
  postApply,
  postRound,
} from './api.js';
import { ApplicationsToolbar, type ViewMode } from './components/ApplicationsToolbar.js';
import { ApplicationTableView, TableHeaderBar } from './components/ApplicationTableView.js';
import { ApplicationKanbanView } from './components/ApplicationKanbanView.js';
import { QuickAddApplicationModal } from './components/QuickAddApplicationModal.js';
import { filterAndSortApplications, type FilterAndSortOptions } from './utils/filterAndSort.js';

const APPLICATIONS_KEY = ['campus', 'applications'] as const;
const STATS_KEY = ['campus', 'stats'] as const;
const VIEW_MODE_STORAGE_KEY = 'campus_workbench_view_mode';

const INITIAL_FILTER_OPTIONS: FilterAndSortOptions = {
  query: '',
  statusFilter: 'all',
  priorityFilter: 'all',
  sortBy: 'updated-desc',
};

export function ApplicationsPage() {
  const queryClient = useQueryClient();

  // 视图与检索状态
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'table' || saved === 'kanban') return saved;
    } catch {
      // ignore
    }
    return 'table';
  });

  const [filterOptions, setFilterOptions] = useState<FilterAndSortOptions>(INITIAL_FILTER_OPTIONS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<Error | null>(null);

  const applicationsQuery = useQuery({
    queryKey: APPLICATIONS_KEY,
    queryFn: fetchApplications,
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const invalidateCampus = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: STATS_KEY }),
    ]);
  };

  const mutationStarted = () => setActionError(null);
  const mutationSucceeded = async () => {
    setActionError(null);
    await invalidateCampus();
  };
  const mutationFailed = (error: Error) => setActionError(error);

  const createApplicationMutation = useMutation({
    mutationFn: postApplication,
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: async (createdApp) => {
      await mutationSucceeded();
      // 新建投递后原地展开该行
      setExpandedIds((prev) => new Set([...prev, createdApp.id]));
    },
  });

  const updateApplicationMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateApplicationInput }) =>
      patchApplication(id, input),
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: mutationSucceeded,
  });

  const applyMutation = useMutation({
    mutationFn: postApply,
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: mutationSucceeded,
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: deleteApplication,
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: async (_, deletedId) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      await mutationSucceeded();
    },
  });

  const createRoundMutation = useMutation({
    mutationFn: ({ applicationId, input }: { applicationId: string; input: CreateRoundInput }) =>
      postRound(applicationId, input),
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: mutationSucceeded,
  });

  const updateRoundMutation = useMutation({
    mutationFn: ({ id, input }: { applicationId: string; id: string; input: UpdateRoundInput }) =>
      patchRound(id, input),
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: mutationSucceeded,
  });

  const deleteRoundMutation = useMutation({
    mutationFn: ({ id }: { applicationId: string; id: string }) => deleteRound(id),
    onMutate: mutationStarted,
    onError: mutationFailed,
    onSuccess: mutationSucceeded,
  });

  const isBusy =
    createApplicationMutation.isPending ||
    updateApplicationMutation.isPending ||
    applyMutation.isPending ||
    deleteApplicationMutation.isPending ||
    createRoundMutation.isPending ||
    updateRoundMutation.isPending ||
    deleteRoundMutation.isPending;

  const rawApplications = applicationsQuery.data?.applications ?? [];

  // 计算过滤与排序结果
  const filteredApplications = useMemo(
    () => filterAndSortApplications(rawApplications, filterOptions),
    [rawApplications, filterOptions],
  );

  // 原地折叠展开控制
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedIds(new Set(filteredApplications.map((a) => a.id)));
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const isAllExpanded =
    filteredApplications.length > 0 && expandedIds.size >= filteredApplications.length;

  if (applicationsQuery.isPending) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="秋招求职工作台" title="投递全景与流转跟踪" />
        <p role="status" className="text-[13px] text-muted">
          正在加载你的投递记录...
        </p>
      </div>
    );
  }

  if (applicationsQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="秋招求职工作台" title="投递全景与流转跟踪" />
        <Panel>
          <p className="text-[13px] text-critical">
            投递记录加载失败：{applicationsQuery.error.message}
          </p>
          <Button type="button" className="mt-3" onClick={() => void applicationsQuery.refetch()}>
            重新加载
          </Button>
        </Panel>
      </div>
    );
  }

  const isFilterActive =
    filterOptions.query !== '' ||
    filterOptions.statusFilter !== 'all' ||
    filterOptions.priorityFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* 顶部固定吸顶区：标题、工具栏、以及表格表头（向下滚动时永不滚出视口） */}
      <div className="sticky top-14 z-20 -mx-4 -mt-6 bg-page/95 px-4 pt-4 pb-2.5 backdrop-blur-md sm:-mx-8 sm:-mt-8 sm:px-8 sm:pt-6 space-y-3 transition-colors border-b border-line/30 shadow-xs">
        <div className="mx-auto max-w-6xl space-y-2.5">
          <PageHeader eyebrow="秋招求职工作台" title="投递全景与流转跟踪" />
          <ApplicationsToolbar
            options={filterOptions}
            onOptionsChange={setFilterOptions}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            totalCount={rawApplications.length}
            filteredCount={filteredApplications.length}
          />

          {/* 表格模式下：将表头直接置于吸顶区域最下端，确保随顶栏始终固定可见 */}
          {viewMode === 'table' && filteredApplications.length > 0 && (
            <TableHeaderBar
              isAllExpanded={isAllExpanded}
              onCollapseAll={handleCollapseAll}
              onExpandAll={handleExpandAll}
            />
          )}
        </div>
      </div>

      {/* 错误提示浮条 */}
      {actionError && (
        <div
          role="alert"
          className="mx-auto max-w-6xl flex items-center justify-between rounded-lg bg-critical-soft px-4 py-2.5 text-[13px] text-critical animate-item-enter"
        >
          <span>操作失败：{actionError.message}，请重试。</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="font-semibold hover:underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 主视图内容区域 */}
      <div className="mx-auto max-w-6xl">
        {rawApplications.length === 0 ? (
          <EmptyState
            icon={IconBriefcase}
            title="还没有投递记录"
            description="点击上方「记新投递」开始录入你的第一家目标企业，面试轮次和 DDL 将自动同步至日历与今日工作台。"
          />
        ) : filteredApplications.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-12 text-center shadow-xs">
            <p className="text-[14px] font-semibold text-ink">没有找到符合当前筛选条件的投递记录</p>
            <p className="mt-1 text-[12px] text-muted">
              可以尝试修改搜索关键词或放宽状态过滤条件。
            </p>
            {isFilterActive && (
              <Button
                type="button"
                onClick={() => setFilterOptions(INITIAL_FILTER_OPTIONS)}
                className="mt-3 text-[12px]"
              >
                重置所有筛选
              </Button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <ApplicationTableView
            applications={filteredApplications}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            onUpdateApplication={(id, input) => updateApplicationMutation.mutate({ id, input })}
            onMarkApplied={(id) => applyMutation.mutate(id)}
            onRemoveApplication={(id) => deleteApplicationMutation.mutate(id)}
            onCreateRound={async (applicationId, input) => {
              await createRoundMutation.mutateAsync({ applicationId, input });
            }}
            onUpdateRound={(applicationId, id, input) =>
              updateRoundMutation.mutate({ applicationId, id, input })
            }
            onRemoveRound={(applicationId, id) => deleteRoundMutation.mutate({ applicationId, id })}
            isBusy={isBusy}
          />
        ) : (
          <ApplicationKanbanView
            applications={filteredApplications}
            selectedId={null}
            onSelectApplication={(id) => {
              setViewMode('table');
              setExpandedIds(new Set([id]));
            }}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onMarkApplied={(id) => applyMutation.mutate(id)}
            isBusy={isBusy}
          />
        )}
      </div>

      {/* 快速创建模态窗 */}
      <QuickAddApplicationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={async (input: CreateApplicationInput) => {
          await createApplicationMutation.mutateAsync(input);
        }}
        isBusy={isBusy}
        error={actionError}
      />
    </div>
  );
}
