import type {
  ApplicationView,
  CreateRoundInput,
  UpdateApplicationInput,
  UpdateRoundInput,
} from '../../contract.js';
import { ApplicationTableRow } from './ApplicationTableRow.js';

interface ApplicationTableViewProps {
  applications: ApplicationView[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onUpdateApplication: (id: string, input: UpdateApplicationInput) => void;
  onMarkApplied: (id: string) => void;
  onUnmarkApplied: (id: string) => void;
  onRemoveApplication: (id: string) => void;
  onCreateRound: (applicationId: string, input: CreateRoundInput) => Promise<void>;
  onUpdateRound: (applicationId: string, id: string, input: UpdateRoundInput) => void;
  onRemoveRound: (applicationId: string, id: string) => void;
  isBusy: boolean;
}

/**
 * 独立表头组件（可置于固定吸顶区中）
 */
export function TableHeaderBar({
  isAllExpanded,
  onCollapseAll,
  onExpandAll,
}: {
  isAllExpanded: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted select-none shadow-2xs">
      <div className="flex items-center gap-3 min-w-[260px] flex-1">
        <button
          type="button"
          onClick={isAllExpanded ? onCollapseAll : onExpandAll}
          className="flex items-center gap-1 text-[11px] font-semibold text-secondary hover:text-ink transition-colors"
          title={isAllExpanded ? '全部收起' : '全部展开'}
        >
          <span className="tabular-nums">[{isAllExpanded ? '全部收起' : '全部展开'}]</span>
        </button>
        <span>目标企业与岗位</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 text-[11px] sm:justify-end">
        <span className="min-w-[70px]">城市 / 渠道</span>
        <span className="min-w-[140px]">最新轮次进度</span>
        <span className="min-w-[120px] text-right">截止 / 投递</span>
      </div>

      <div className="min-w-[70px] text-right">
        <span>操作</span>
      </div>
    </div>
  );
}

export function ApplicationTableView({
  applications,
  expandedIds,
  onToggleExpand,
  onUpdateApplication,
  onMarkApplied,
  onUnmarkApplied,
  onRemoveApplication,
  onCreateRound,
  onUpdateRound,
  onRemoveRound,
  isBusy,
}: ApplicationTableViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      {/* 每一行投递记录列表 */}
      <div>
        {applications.map((app, index) => (
          <ApplicationTableRow
            key={app.id}
            index={index}
            application={app}
            isExpanded={expandedIds.has(app.id)}
            onToggleExpand={() => onToggleExpand(app.id)}
            onUpdateApplication={onUpdateApplication}
            onMarkApplied={onMarkApplied}
            onUnmarkApplied={onUnmarkApplied}
            onRemoveApplication={onRemoveApplication}
            onCreateRound={onCreateRound}
            onUpdateRound={onUpdateRound}
            onRemoveRound={onRemoveRound}
            isBusy={isBusy}
          />
        ))}
      </div>
    </div>
  );
}
