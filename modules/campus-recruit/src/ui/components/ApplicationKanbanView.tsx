import { IconCalendar, IconClock, IconPlus, useTimezone } from '@workbench/ui';
import type { ApplicationView } from '../../contract.js';
import { PriorityBadge } from './PriorityBadge.js';

interface ApplicationKanbanViewProps {
  applications: ApplicationView[];
  selectedId: string | null;
  onSelectApplication: (id: string) => void;
  onOpenCreateModal: () => void;
  onMarkApplied: (id: string) => void;
  onUnmarkApplied: (id: string) => void;
  isBusy: boolean;
}

type KanbanColumnId = 'pending' | 'applied' | 'written' | 'technical' | 'offer' | 'ended';

interface KanbanColumnDef {
  id: KanbanColumnId;
  title: string;
  badgeTone: string;
  description: string;
}

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: 'pending',
    title: '待投递',
    badgeTone: 'bg-warning-soft text-warning border-warning/30',
    description: '关注中，待完善简历或投递',
  },
  {
    id: 'applied',
    title: '已投递 / 待安排',
    badgeTone: 'bg-surface-2 text-secondary border-line',
    description: '已提交，等待简历初筛',
  },
  {
    id: 'written',
    title: '笔试 / 测评',
    badgeTone: 'bg-accent/10 text-accent border-accent/30',
    description: '正在进行笔试或性格测评',
  },
  {
    id: 'technical',
    title: '面试中',
    badgeTone: 'bg-accent/15 text-accent border-accent/40',
    description: '技术一面/二面/HR面',
  },
  {
    id: 'offer',
    title: 'OC / Offer 🎉',
    badgeTone: 'bg-good-soft text-good border-good/30',
    description: '已获口头或正式录取',
  },
  {
    id: 'ended',
    title: '流程结束',
    badgeTone: 'bg-surface-2 text-muted border-line',
    description: '已挂、泡池子或已拒绝',
  },
];

function classifyApplicationToColumn(app: ApplicationView): KanbanColumnId {
  const { code } = app.status;

  if (code === 'offer' || code === 'oc') return 'offer';
  if (code === 'failed' || code === 'declined' || code === 'shelved') return 'ended';
  if (code === 'pending') return 'pending';
  if (code === 'applied') return 'applied';

  // code === 'in_progress'
  const latestRound = [...app.rounds].sort((a, b) => b.sequence - a.sequence)[0];
  if (latestRound && (latestRound.kind === 'assessment' || latestRound.kind === 'written')) {
    return 'written';
  }
  return 'technical';
}

export function ApplicationKanbanView({
  applications,
  selectedId,
  onSelectApplication,
  onOpenCreateModal,
  onMarkApplied,
  onUnmarkApplied,
  isBusy,
}: ApplicationKanbanViewProps) {
  const { formatUtcShort } = useTimezone();

  // 分组
  const grouped = KANBAN_COLUMNS.reduce<Record<KanbanColumnId, ApplicationView[]>>(
    (acc, col) => {
      acc[col.id] = [];
      return acc;
    },
    {
      pending: [],
      applied: [],
      written: [],
      technical: [],
      offer: [],
      ended: [],
    },
  );

  applications.forEach((app) => {
    const colId = classifyApplicationToColumn(app);
    grouped[colId].push(app);
  });

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-4 pt-1">
      {KANBAN_COLUMNS.map((column, colIdx) => {
        const columnApps = grouped[column.id];

        return (
          <div
            key={column.id}
            style={{ animationDelay: `${colIdx * 90}ms` }}
            className="flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-lg border border-line bg-surface-2/40 p-2.5 shadow-2xs animate-slide-left-in"
          >
            {/* 列头 */}
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-ink">{column.title}</span>
                <span
                  className={`rounded-full border px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${column.badgeTone}`}
                >
                  {columnApps.length}
                </span>
              </div>
              {column.id === 'pending' && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
                  title="添加新机会"
                >
                  <IconPlus size={14} />
                </button>
              )}
            </div>

            {/* 卡片容器 */}
            <div className="flex-1 space-y-2 overflow-y-auto pr-0.5">
              {columnApps.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-line text-[12px] text-muted">
                  暂无记录
                </div>
              ) : (
                columnApps.map((app) => {
                  const isSelected = app.id === selectedId;
                  const latestRound = [...app.rounds].sort((a, b) => b.sequence - a.sequence)[0];

                  return (
                    <div
                      key={app.id}
                      onClick={() => onSelectApplication(app.id)}
                      className={`group cursor-pointer rounded-md border bg-surface p-3 shadow-xs transition-all hover:border-accent/40 hover:shadow-sm hover-lift animate-item-enter ${
                        isSelected ? 'border-accent ring-1 ring-accent' : 'border-line'
                      }`}
                    >
                      {/* 卡片顶栏：优先级与状态 */}
                      <div className="flex items-center justify-between gap-1">
                        <PriorityBadge priority={app.priority} size="sm" />
                        <span className="text-[11px] text-muted">{app.city || '地点待定'}</span>
                      </div>

                      {/* 卡片主体：公司与岗位 */}
                      <div className="mt-1.5">
                        <h4 className="text-[13px] font-bold text-ink group-hover:text-accent">
                          {app.company}
                        </h4>
                        <p className="text-[12px] text-secondary">{app.position}</p>
                      </div>

                      {/* 轮次进展 / 安排时间 */}
                      {latestRound && (
                        <div className="mt-2 rounded bg-surface-2 px-2 py-1 text-[11px]">
                          <div className="flex items-center justify-between font-medium text-ink">
                            <span>{latestRound.name}</span>
                            <span className="text-[10px] text-muted">
                              {latestRound.outcome === 'passed'
                                ? '✓ 通过'
                                : latestRound.outcome === 'failed'
                                  ? '✕ 未通过'
                                  : latestRound.outcome === 'completed'
                                    ? '◷ 已完成'
                                    : '⏳ 待定'}
                            </span>
                          </div>
                          {latestRound.scheduledAt && (
                            <div className="mt-0.5 flex items-center gap-1 text-accent">
                              <IconClock size={11} />
                              <span>{formatUtcShort(latestRound.scheduledAt)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 底部信息与动作 */}
                      <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-muted">
                        <div>
                          {app.applyDeadlineDate ? (
                            <span className="flex items-center gap-1 text-ink">
                              <IconCalendar size={11} className="text-muted" />
                              <span>截止 {app.applyDeadlineDate.slice(5)}</span>
                            </span>
                          ) : (
                            <span>已投 {app.appliedAt ? app.appliedAt.slice(5, 10) : '—'}</span>
                          )}
                        </div>

                        {app.appliedAt === null ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkApplied(app.id);
                            }}
                            className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-accent/90"
                          >
                            标已投
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnmarkApplied(app.id);
                            }}
                            title="撤回投递，退回「待投递」"
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-50"
                          >
                            撤回
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
