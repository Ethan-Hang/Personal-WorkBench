import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  DatePicker,
  ScheduleRangePicker,
  type ScheduleRangeValue,
  useTimezone,
  EmptyState,
  Field,
  Modal,
  Panel,
  MetricRing,
  MetricTile,
  useSlotEntries,
  QuickAddBar,
  TodayClockCard,
  usePreferences,
  controlClass,
  useModuleLabel,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconBookOpen,
  IconTrash,
  IconEdit,
  IconInfo,
  IconCalendar,
  IconX,
  IconTag,
  IconRepeat,
  IconListTodo,
  IconFileText,
  IconArrowUp,
  IconArrowDown,
  IconPlus,
} from '@workbench/ui';
import { type WorkbenchItem, type TodayResponse, type ScheduleInput } from '../contract.js';
import { WORKBENCH_SLOTS } from './slots.js';
import {
  fetchToday,
  fetchUnscheduled,
  patchSchedule,
  postTodoTask,
  patchTodoTask,
  postTodoComplete,
  postTodoUncomplete,
  postTodoTrash,
  postTodoRestore,
  deleteTodoPermanently,
  fetchTodoTrash,
  postTodoBatchRestore,
  postTodoBatchDelete,
  postTodoRestoreAll,
  postTodoClearTrash,
  fetchTodoToday,
  fetchTodoTags,
  postTodoTag,
  patchTodoTag,
  deleteTodoTag,
  putTodoTaskTags,
  postTodoSubtask,
  patchTodoSubtask,
  deleteTodoSubtask,
  putTodoReorderSubtasks,
  fetchTodoRecurrences,
  postTodoRecurrence,
  deleteTodoRecurrence,
  TAG_COLORS,
  type TagColor,
  type TagView,
  type SubtaskView,
  type RecurrenceView,
  type RecurrenceFreq,
  type CreateRecurrenceInput,
  type CreateTodoInput,
  type UpdateTodoInput,
} from './api.js';

const TODAY_KEY = ['workbench', 'today'] as const;
const TODO_TODAY_KEY = ['todo', 'today'] as const;
const UNSCHEDULED_KEY = ['workbench', 'unscheduled'] as const;
const TRASH_KEY = ['todo', 'trash'] as const;
const TAGS_KEY = ['todo', 'tags'] as const;
const RECURRENCES_KEY = ['todo', 'recurrences'] as const;

const URGENCY_LABEL: Record<WorkbenchItem['urgency'], string> = {
  overdue: '已逾期',
  imminent: '24 小时内',
  soon: '3 天内',
  later: '还早',
  none: '无死线',
};

const URGENCY_TONE: Record<WorkbenchItem['urgency'], 'neutral' | 'warning' | 'critical'> = {
  overdue: 'critical',
  imminent: 'warning',
  soon: 'warning',
  later: 'neutral',
  none: 'neutral',
};

/**
 * 标签语义色样式映射
 */
const TAG_COLOR_STYLES: Record<
  TagColor,
  { bg: string; text: string; border: string; dot: string }
> = {
  slate: {
    bg: 'bg-slate-500/10 dark:bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/25',
    dot: 'bg-slate-500',
  },
  red: {
    bg: 'bg-red-500/10 dark:bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/25',
    dot: 'bg-red-500',
  },
  amber: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/25',
    dot: 'bg-amber-500',
  },
  green: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/25',
    dot: 'bg-emerald-500',
  },
  blue: {
    bg: 'bg-sky-500/10 dark:bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/25',
    dot: 'bg-sky-500',
  },
  violet: {
    bg: 'bg-violet-500/10 dark:bg-violet-500/15',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/25',
    dot: 'bg-violet-500',
  },
  pink: {
    bg: 'bg-pink-500/10 dark:bg-pink-500/15',
    text: 'text-pink-700 dark:text-pink-300',
    border: 'border-pink-500/25',
    dot: 'bg-pink-500',
  },
};

const DEFAULT_TAG_STYLE = {
  bg: 'bg-accent-soft/80',
  text: 'text-accent',
  border: 'border-accent/30',
  dot: 'bg-accent',
};

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatRecurrenceRule(rule: RecurrenceView): string {
  let freqStr = '';
  if (rule.freq === 'daily') {
    freqStr = rule.interval === 1 ? '每天' : `每 ${rule.interval} 天`;
  } else if (rule.freq === 'weekly') {
    const days = (rule.byWeekday ?? []).map((d) => WEEKDAY_NAMES[d]).join('、');
    freqStr =
      rule.interval === 1
        ? `每周 (${days || '未指定'})`
        : `每 ${rule.interval} 周 (${days || '未指定'})`;
  } else if (rule.freq === 'monthly') {
    freqStr =
      rule.interval === 1
        ? `每月 ${rule.byMonthday ?? 1} 号`
        : `每 ${rule.interval} 月 ${rule.byMonthday ?? 1} 号`;
  }
  const dateStr = rule.untilDate ? ` (截止 ${rule.untilDate})` : '';
  return `${freqStr}${dateStr}`;
}

function getGreeting(dateStr: string) {
  const hour = new Date().getHours();
  let timeGreeting = '早上好';
  if (hour >= 12 && hour < 18) timeGreeting = '下午好';
  else if (hour >= 18) timeGreeting = '晚上好';

  return {
    title: `${timeGreeting}，今天专注三件事。`,
    date: dateStr,
  };
}

/**
 * 格式化 ScheduledTimeView 呈现
 */
function formatScheduledTime(scheduled: WorkbenchItem['scheduled']): string {
  if (!scheduled) return '未排程';
  if (scheduled.kind === 'all-day') {
    return `${scheduled.date} (全天)`;
  }
  const dateObj = new Date(scheduled.start);
  const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
  const dateStr = scheduled.start.slice(0, 10);
  return `${dateStr} ${timeStr}`;
}

/**
 * 缓动数值动画 Hook
 */
function useAnimatedValue(targetValue: number, duration = 850, enabled = true): number {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const currentRef = useRef(targetValue);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      currentRef.current = targetValue;
      setDisplayValue(targetValue);
      return;
    }
    const startVal = currentRef.current;
    const endVal = targetValue;
    if (startVal === endVal) return;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + (endVal - startVal) * eased;

      currentRef.current = nextVal;
      setDisplayValue(nextVal);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        currentRef.current = endVal;
        setDisplayValue(endVal);
      }
    }

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetValue, duration, enabled]);

  return enabled ? displayValue : targetValue;
}

/**
 * 标签展示组件
 */
function TagBadge({
  tag,
  onRemove,
  onClick,
  size = 'sm',
}: {
  tag: TagView;
  onRemove?: () => void;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
}) {
  const style = (tag.color && TAG_COLOR_STYLES[tag.color]) || DEFAULT_TAG_STYLE;
  const sizeClasses = {
    xs: 'px-1.5 py-0.2 text-[10px]',
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
  }[size];

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border font-medium transition ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${
        onClick ? 'cursor-pointer hover:opacity-85' : ''
      }`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      <span>{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-75 focus:outline-none -mr-0.5"
          title="移除标签"
        >
          <IconX size={10} />
        </button>
      )}
    </span>
  );
}

/**
 * 独立隔离的今日执行度仪表盘卡片
 */
const TodayExecutionCard = memo(function TodayExecutionCard({
  doneCount,
  totalCount,
}: {
  doneCount: number;
  totalCount: number;
}) {
  const { preferences } = usePreferences();
  const metricEntries = useSlotEntries(WORKBENCH_SLOTS.todayMetrics);
  const targetRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const animatedRate = useAnimatedValue(targetRate, 850, preferences.enableAnimations);

  return (
    <section className="relative overflow-hidden rounded-panel border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#182338] to-[#0f172a] text-white p-5 shadow-lg hover-lift">
      <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
        <span>今日执行度</span>
        <span className="rounded-full bg-good/20 px-2 py-0.5 text-good font-bold text-[11px] border border-good/30">
          {targetRate >= 80 ? '节奏极佳' : targetRate >= 40 ? '稳步推进' : '蓄势待发'}
        </span>
      </div>

      <div className="my-4 flex items-center justify-between">
        <div>
          <div className="text-4xl sm:text-5xl font-black tracking-tight text-white tabular-nums drop-shadow-sm">
            {Math.round(animatedRate)}%
          </div>
          <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
            已完成 <strong className="text-white font-bold">{doneCount}</strong> / {totalCount}{' '}
            项事项。
            <br />
            <span className="text-slate-400">保持专注节奏，不必追赶。</span>
          </p>
        </div>
        <MetricRing
          value={animatedRate}
          size={72}
          strokeWidth={6}
          tone="good"
          trackStroke="rgba(255, 255, 255, 0.15)"
          textColor="text-white"
        />
      </div>

      <div
        className={`grid gap-2 border-t border-slate-700/60 pt-3 text-center ${
          2 + metricEntries.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'
        }`}
      >
        <MetricTile label="事项达成" value={`${doneCount}/${totalCount}`} />
        {/* 别的模块贡献的指标格（如习惯打卡）。工作台不知道它们从哪来，也不该知道 */}
        {metricEntries.map((entry) => (
          <div key={entry.id}>{entry.node}</div>
        ))}
        {/* TODO: 预估耗时仍是占位值，等 estimateMinutes 在今日聚合里透出后接真实数据 */}
        <MetricTile label="预估耗时" value="2.5h" />
      </div>
    </section>
  );
});

export type TaskRowAnimAction = 'complete' | 'uncomplete' | 'trash';

/**
 * 事项列表单行项组件
 */
function TaskItemRow({
  task,
  subtasks = [],
  tags = [],
  recurrenceId = null,
  isCurrent = false,
  isSubtasksExpanded = false,
  animAction = null,
  onComplete,
  onEdit,
  onDetail,
  onTrash,
  onSchedule,
  onToggleSubtasks,
  onToggleSubtaskDone,
  onAddSubtask,
  onDeleteSubtask,
  onMoveSubtask,
  disabled = false,
}: {
  task: WorkbenchItem;
  subtasks?: SubtaskView[];
  tags?: TagView[];
  recurrenceId?: string | null;
  isCurrent?: boolean;
  isSubtasksExpanded?: boolean;
  animAction?: TaskRowAnimAction | null;
  onComplete: (id: string) => void;
  onEdit: (task: WorkbenchItem) => void;
  onDetail: (task: WorkbenchItem) => void;
  onTrash: (task: WorkbenchItem) => void;
  onSchedule: (task: WorkbenchItem) => void;
  onToggleSubtasks: (id: string) => void;
  onToggleSubtaskDone: (subtaskId: string, currentDone: boolean) => void;
  onAddSubtask: (itemId: string, title: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onMoveSubtask: (itemId: string, index: number, direction: 'up' | 'down') => void;
  disabled?: boolean;
}) {
  const isTodo = task.sourceModule === 'todo';
  const sourceLabel = useModuleLabel(task.sourceModule);
  const isCompleted = task.status === 'done';

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const isCompleting = animAction === 'complete';
  const isUncompleting = animAction === 'uncomplete';
  const isTrashing = animAction === 'trash';

  let animContainerClass =
    'animate-item-enter border border-transparent hover:border-line hover:bg-surface-2/60 opacity-100 translate-x-0 transition-all duration-200 ease-out';

  if (isCompleting) {
    animContainerClass = 'animate-task-complete-out';
  } else if (isUncompleting) {
    animContainerClass = 'animate-task-uncomplete-out';
  } else if (isTrashing) {
    animContainerClass = 'animate-task-trash-out';
  } else if (isCurrent) {
    animContainerClass =
      'animate-item-enter border border-accent/30 bg-accent-soft/70 shadow-xs opacity-100 translate-x-0 transition-all duration-200';
  }

  const effectiveChecked = isCompleted ? !isUncompleting : isCompleting;
  const completedSubtasksCount = subtasks.filter((s) => s.done).length;

  return (
    <div className={`group rounded-control px-3 py-2.5 transition-all ${animContainerClass}`}>
      <div className="flex items-center gap-3">
        {/* 完成复选按钮 */}
        {isTodo ? (
          <button
            type="button"
            onClick={() => !disabled && onComplete(task.id)}
            disabled={disabled || isCompleting || isUncompleting || isTrashing}
            title={isCompleted ? '点击重新打开任务' : `完成任务：${task.title}`}
            aria-label={isCompleted ? '重新打开任务' : `完成任务：${task.title}`}
            className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-all duration-150 ${
              effectiveChecked
                ? 'border-good bg-good text-white scale-110 shadow-xs'
                : 'border-line bg-surface hover:border-accent hover:bg-accent-soft active:scale-95'
            }`}
          >
            {effectiveChecked && <IconCheck size={13} className="animate-scale-in" />}
          </button>
        ) : (
          <span
            title={`来自「${sourceLabel}」模块的事项`}
            className="size-5 shrink-0 rounded-full border border-line bg-surface-2 flex items-center justify-center text-[10px] text-muted font-bold"
          >
            •
          </span>
        )}

        {/* 事项主体信息 */}
        <div
          className="min-w-0 flex-1 cursor-pointer select-none"
          onClick={() => onDetail(task)}
          title="点击查看事项详情"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-sm font-semibold tracking-tight transition-all duration-200 ${
                effectiveChecked
                  ? 'text-muted line-through opacity-70'
                  : isCurrent
                    ? 'text-ink font-bold'
                    : 'text-ink'
              }`}
            >
              {task.title}
            </span>

            {isCurrent && !effectiveChecked && (
              <span className="rounded-full bg-accent px-1.5 py-0.2 text-[10px] font-bold text-white shadow-xs">
                进行中
              </span>
            )}
            {task.kind === 'event' && (
              <span className="rounded-full bg-surface-2 border border-line px-1.5 py-0.2 text-[10px] text-muted">
                日程
              </span>
            )}
            {recurrenceId && (
              <span
                title="该事项由重复规则生成"
                className="inline-flex items-center gap-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 px-1.5 py-0.2 text-[10px] font-medium"
              >
                <IconRepeat size={10} />
                <span>重复</span>
              </span>
            )}

            {/* 标签列表 */}
            {tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="xs" />
            ))}

            {/* 备注提示图标 */}
            {task.notes && (
              <span
                title={`备注：${task.notes}`}
                className="inline-flex items-center text-muted hover:text-ink transition"
              >
                <IconFileText size={12} />
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {task.scheduled && (
              <span className="flex items-center gap-1 text-accent">
                <IconCalendar size={11} />
                <span>{formatScheduledTime(task.scheduled)}</span>
              </span>
            )}
            {task.dueAt && (
              <span className="flex items-center gap-1">
                <IconClock size={11} />
                <span>截止: {task.dueAt.slice(0, 10)}</span>
              </span>
            )}
            <span>权重: {task.priorityScore}</span>

            {/* 子任务进度徽标与折叠按钮 */}
            {isTodo && subtasks.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtasks(task.id);
                }}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                  isSubtasksExpanded
                    ? 'bg-accent/15 text-accent font-bold'
                    : 'bg-surface-2 text-secondary hover:text-ink hover:bg-surface'
                }`}
                title="点击展开/收起子任务检查清单"
              >
                <IconListTodo size={11} />
                <span>
                  {completedSubtasksCount}/{subtasks.length}
                </span>
                {isSubtasksExpanded ? (
                  <IconChevronDown size={10} />
                ) : (
                  <IconChevronRight size={10} />
                )}
              </button>
            )}
          </div>
        </div>

        {/* 悬浮操作按钮组与状态徽标 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden items-center gap-1 group-hover:flex transition-all">
            {isTodo && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtasks(task.id);
                }}
                title={isSubtasksExpanded ? '收起子任务' : '查看/添加子任务'}
                className={`flex size-6 items-center justify-center rounded-control transition ${
                  isSubtasksExpanded
                    ? 'bg-accent/20 text-accent'
                    : 'text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <IconListTodo size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSchedule(task);
              }}
              title="调整排程"
              className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink transition"
            >
              <IconCalendar size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDetail(task);
              }}
              title="查看详情"
              className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink transition"
            >
              <IconInfo size={13} />
            </button>
            {isTodo && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  title="编辑待办"
                  className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-ink transition"
                >
                  <IconEdit size={13} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrash(task);
                  }}
                  title="移至回收站"
                  className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-critical transition"
                >
                  <IconTrash size={13} />
                </button>
              </>
            )}
          </div>

          {!isTodo && <Chip tone="accent">{sourceLabel}</Chip>}
          {task.isImportantQuadrant && <Chip tone="warning">重要</Chip>}
          <Chip tone={URGENCY_TONE[task.urgency]}>{URGENCY_LABEL[task.urgency]}</Chip>
        </div>
      </div>

      {/* 展开的行内子任务检查清单 */}
      {isTodo && isSubtasksExpanded && (
        <div className="mt-2.5 ml-8 rounded-control border border-line/60 bg-surface/70 p-2.5 space-y-2 animate-slide-down-in">
          <div className="flex items-center justify-between text-[11px] font-bold text-secondary">
            <span className="flex items-center gap-1.5">
              <IconListTodo size={12} className="text-accent" />
              <span>
                子任务清单 ({completedSubtasksCount}/{subtasks.length})
              </span>
            </span>
          </div>

          {subtasks.length > 0 && (
            <div className="space-y-1">
              {subtasks.map((st, idx) => (
                <div
                  key={st.id}
                  className="group/st flex items-center justify-between rounded-control px-2 py-1 hover:bg-surface-2 transition text-xs"
                >
                  <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={st.done}
                      onChange={() => onToggleSubtaskDone(st.id, st.done)}
                      className="size-3.5 rounded border-line text-good accent-good focus:ring-good"
                    />
                    <span
                      className={`truncate ${
                        st.done ? 'text-muted line-through opacity-70' : 'text-ink'
                      }`}
                    >
                      {st.title}
                    </span>
                  </label>

                  <div className="hidden group-hover/st:flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMoveSubtask(task.id, idx, 'up')}
                      title="上移"
                      className="text-muted hover:text-ink disabled:opacity-30 p-0.5"
                    >
                      <IconArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === subtasks.length - 1}
                      onClick={() => onMoveSubtask(task.id, idx, 'down')}
                      title="下移"
                      className="text-muted hover:text-ink disabled:opacity-30 p-0.5"
                    >
                      <IconArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSubtask(st.id)}
                      title="删除子任务"
                      className="text-muted hover:text-critical p-0.5 ml-1"
                    >
                      <IconTrash size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 行内快捷添加子任务 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSubtaskTitle.trim()) return;
              onAddSubtask(task.id, newSubtaskTitle.trim());
              setNewSubtaskTitle('');
            }}
            className="flex items-center gap-1.5 pt-1 border-t border-line/40"
          >
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              placeholder="输入子任务标题，按回车添加..."
              className="flex-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!newSubtaskTitle.trim()}
              className="px-2 py-1 text-xs"
            >
              添加
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

export function TodayPage() {
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const asideEntries = useSlotEntries(WORKBENCH_SLOTS.todayAside);
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(() => preferences.autoExpandOverdue);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  useEffect(() => {
    setIsOverdueExpanded(preferences.autoExpandOverdue);
  }, [preferences.autoExpandOverdue]);

  // 动画状态映射: taskId -> Action
  const [taskAnimActions, setTaskAnimActions] = useState<Map<string, TaskRowAnimAction>>(new Map());
  const [trashAnimActions, setTrashAnimActions] = useState<Map<string, 'restore' | 'delete'>>(
    new Map(),
  );

  // 筛选与展开状态
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [expandedSubtasksTaskIds, setExpandedSubtasksTaskIds] = useState<Set<string>>(new Set());

  // 弹窗状态
  const [detailTask, setDetailTask] = useState<WorkbenchItem | null>(null);
  const [editingTask, setEditingTask] = useState<WorkbenchItem | null>(null);
  const [schedulingTask, setSchedulingTask] = useState<WorkbenchItem | null>(null);
  const [scheduleRangeValue, setScheduleRangeValue] = useState<ScheduleRangeValue | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isUnscheduledDrawerOpen, setIsUnscheduledDrawerOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);

  // 回收站多选状态
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());

  // 编辑表单字段
  const [editTitle, setEditTitle] = useState('');
  const [editImportance, setEditImportance] = useState<WorkbenchItem['importance']>('normal');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  // 快捷收集栏扩展字段
  const [quickAddNotes, setQuickAddNotes] = useState('');
  const [isQuickAddExpanded, setIsQuickAddExpanded] = useState(false);

  // 标签管理表单字段
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColor>('blue');
  const [editingTagItem, setEditingTagItem] = useState<TagView | null>(null);

  // 重复规则表单字段
  const [recurrenceTab, setRecurrenceTab] = useState<'list' | 'create'>('list');
  const [recTitle, setRecTitle] = useState('');
  const [recImportance, setRecImportance] = useState<WorkbenchItem['importance']>('normal');
  const [recNotes, setRecNotes] = useState('');
  const [recFreq, setRecFreq] = useState<RecurrenceFreq>('weekly');
  const [recInterval, setRecInterval] = useState(1);
  const [recWeekdays, setRecWeekdays] = useState<number[]>([1, 3, 5]);
  const [recMonthday, setRecMonthday] = useState(1);
  const [recStartDate, setRecStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recUntilDate, setRecUntilDate] = useState('');

  // 详情弹窗中的子任务输入
  const [detailSubtaskInput, setDetailSubtaskInput] = useState('');

  // 撤销 Toast
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);

  const { formatUtcToLocal } = useTimezone();

  // 1. 查询今日聚合
  const today = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday });

  // 2. 查询 todo 今日丰富详情（subtasks, tags, recurrenceId, notes）
  const todoTodayQuery = useQuery({ queryKey: TODO_TODAY_KEY, queryFn: fetchTodoToday });

  // 3. 查询标签全集
  const tagsQuery = useQuery({ queryKey: TAGS_KEY, queryFn: fetchTodoTags });

  // 4. 查询重复规则全集
  const recurrencesQuery = useQuery({
    queryKey: RECURRENCES_KEY,
    queryFn: fetchTodoRecurrences,
    enabled: isRecurrenceModalOpen,
  });

  // 5. 待排程抽屉
  const unscheduledQuery = useQuery({
    queryKey: UNSCHEDULED_KEY,
    queryFn: fetchUnscheduled,
    enabled: isUnscheduledDrawerOpen,
  });

  // 6. 回收站
  const trashQuery = useQuery({
    queryKey: TRASH_KEY,
    queryFn: fetchTodoTrash,
    enabled: isTrashOpen,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
    void queryClient.invalidateQueries({ queryKey: TODO_TODAY_KEY });
    void queryClient.invalidateQueries({ queryKey: UNSCHEDULED_KEY });
    void queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
    void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
    void queryClient.invalidateQueries({ queryKey: TAGS_KEY });
    void queryClient.invalidateQueries({ queryKey: RECURRENCES_KEY });
  };

  // 丰富数据 Map
  const richTasksMap = useMemo(() => {
    const map = new Map<
      string,
      {
        subtasks: SubtaskView[];
        tags: TagView[];
        recurrenceId: string | null;
        notes: string | null;
      }
    >();
    if (!todoTodayQuery.data) return map;
    const all = [
      ...(todoTodayQuery.data.tasks ?? []),
      ...(todoTodayQuery.data.overdue ?? []),
      ...(todoTodayQuery.data.completed ?? []),
    ];
    for (const item of all) {
      map.set(item.id, {
        subtasks: item.subtasks ?? [],
        tags: item.tags ?? [],
        recurrenceId: item.recurrenceId ?? null,
        notes: item.notes ?? null,
      });
    }
    return map;
  }, [todoTodayQuery.data]);

  // 当进入编辑弹窗时，填入已有数据
  useEffect(() => {
    if (editingTask) {
      setEditTitle(editingTask.title);
      setEditImportance(editingTask.importance);
      setEditDueDate(editingTask.dueAt ? editingTask.dueAt.slice(0, 10) : '');
      const rich = richTasksMap.get(editingTask.id);
      setEditNotes(rich?.notes ?? editingTask.notes ?? '');
      setEditTagIds((rich?.tags ?? []).map((t) => t.id));
    }
  }, [editingTask, richTasksMap]);

  // Mutations
  const create = useMutation({
    mutationFn: (input: CreateTodoInput) => postTodoTask(input),
    onSuccess: () => invalidateAll(),
  });

  const complete = useMutation({
    mutationFn: postTodoComplete,
    onSuccess: () => invalidateAll(),
  });

  const uncomplete = useMutation({
    mutationFn: postTodoUncomplete,
    onSuccess: () => invalidateAll(),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      input,
      tagIds,
    }: {
      id: string;
      input: UpdateTodoInput;
      tagIds?: string[];
    }) => {
      const updated = await patchTodoTask(id, input);
      if (tagIds !== undefined) {
        await putTodoTaskTags(id, tagIds);
      }
      return updated;
    },
    onSuccess: () => {
      setEditingTask(null);
      invalidateAll();
    },
  });

  const scheduleMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleInput }) => patchSchedule(id, input),
    onSuccess: () => {
      setSchedulingTask(null);
      invalidateAll();
    },
  });

  const trash = useMutation({
    mutationFn: postTodoTrash,
    onSuccess: () => invalidateAll(),
  });

  const restore = useMutation({
    mutationFn: postTodoRestore,
    onSuccess: () => invalidateAll(),
  });

  const deletePermanently = useMutation({
    mutationFn: deleteTodoPermanently,
    onSuccess: () => invalidateAll(),
  });

  const batchRestoreMut = useMutation({
    mutationFn: (ids: string[]) => postTodoBatchRestore(ids),
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidateAll();
    },
  });

  const batchDeleteMut = useMutation({
    mutationFn: (ids: string[]) => postTodoBatchDelete(ids),
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidateAll();
    },
  });

  const restoreAllMut = useMutation({
    mutationFn: postTodoRestoreAll,
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidateAll();
    },
  });

  const clearTrashMut = useMutation({
    mutationFn: postTodoClearTrash,
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidateAll();
    },
  });

  // 子任务 Mutations
  const addSubtaskMut = useMutation({
    mutationFn: ({ itemId, title }: { itemId: string; title: string }) =>
      postTodoSubtask(itemId, { title }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TODO_TODAY_KEY }),
  });

  const updateSubtaskMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { title?: string; done?: boolean } }) =>
      patchTodoSubtask(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TODO_TODAY_KEY }),
  });

  const deleteSubtaskMut = useMutation({
    mutationFn: (id: string) => deleteTodoSubtask(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TODO_TODAY_KEY }),
  });

  const reorderSubtasksMut = useMutation({
    mutationFn: ({ itemId, ids }: { itemId: string; ids: string[] }) =>
      putTodoReorderSubtasks(itemId, ids),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TODO_TODAY_KEY }),
  });

  // 标签 Mutations
  const createTagMut = useMutation({
    mutationFn: (input: { name: string; color: TagColor }) => postTodoTag(input),
    onSuccess: () => {
      setNewTagName('');
      invalidateAll();
    },
  });

  const updateTagMut = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; color?: TagColor | null };
    }) => patchTodoTag(id, input),
    onSuccess: () => {
      setEditingTagItem(null);
      invalidateAll();
    },
  });

  const deleteTagMut = useMutation({
    mutationFn: (id: string) => deleteTodoTag(id),
    onSuccess: () => invalidateAll(),
  });

  const setTaskTagsMut = useMutation({
    mutationFn: ({ itemId, tagIds }: { itemId: string; tagIds: string[] }) =>
      putTodoTaskTags(itemId, tagIds),
    onSuccess: () => invalidateAll(),
  });

  // 重复规则 Mutations
  const createRecurrenceMut = useMutation({
    mutationFn: (input: CreateRecurrenceInput) => postTodoRecurrence(input),
    onSuccess: () => {
      setRecTitle('');
      setRecNotes('');
      setRecurrenceTab('list');
      invalidateAll();
    },
  });

  const deleteRecurrenceMut = useMutation({
    mutationFn: (id: string) => deleteTodoRecurrence(id),
    onSuccess: () => invalidateAll(),
  });

  // 逾期动画
  const currentOverdueCount = today.data?.overdue.length ?? 0;
  const [renderedOverdueItems, setRenderedOverdueItems] = useState<WorkbenchItem[]>(
    () => today.data?.overdue ?? [],
  );
  const [overdueAnimClass, setOverdueAnimClass] = useState<string>(() =>
    currentOverdueCount > 0 ? 'animate-expand-in' : '',
  );
  const prevOverdueCountRef = useRef(currentOverdueCount);

  useEffect(() => {
    const prev = prevOverdueCountRef.current;
    if (currentOverdueCount > 0) {
      setRenderedOverdueItems(today.data?.overdue ?? []);
      if (prev === 0) {
        setOverdueAnimClass('animate-expand-in');
      } else {
        setOverdueAnimClass('');
      }
    } else if (currentOverdueCount === 0 && prev > 0) {
      setOverdueAnimClass('animate-collapse-out');
      const timer = setTimeout(() => {
        setRenderedOverdueItems([]);
        setOverdueAnimClass('');
      }, 400);
      return () => clearTimeout(timer);
    }
    prevOverdueCountRef.current = currentOverdueCount;
  }, [currentOverdueCount, today.data?.overdue]);

  // 已完成动画
  const currentDoneCount = (today.data?.completed ?? []).length;
  const [renderedDoneTasks, setRenderedDoneTasks] = useState<WorkbenchItem[]>(
    () => today.data?.completed ?? [],
  );
  const [doneSectionAnimClass, setDoneSectionAnimClass] = useState<string>(() =>
    currentDoneCount > 0 ? 'animate-expand-in' : '',
  );
  const prevDoneCountRef = useRef(currentDoneCount);

  useEffect(() => {
    const prev = prevDoneCountRef.current;
    if (currentDoneCount > 0) {
      setRenderedDoneTasks(today.data?.completed ?? []);
      if (prev === 0) {
        setDoneSectionAnimClass('animate-expand-in');
      } else {
        setDoneSectionAnimClass('');
      }
    } else if (currentDoneCount === 0 && prev > 0) {
      setDoneSectionAnimClass('animate-collapse-out');
      const timer = setTimeout(() => {
        setRenderedDoneTasks([]);
        setDoneSectionAnimClass('');
      }, 400);
      return () => clearTimeout(timer);
    }
    prevDoneCountRef.current = currentDoneCount;
  }, [currentDoneCount, today.data?.completed]);

  function handleComplete(id: string) {
    setTaskAnimActions((prev) => new Map(prev).set(id, 'complete'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        const targetTask =
          old.scheduled.find((t) => t.id === id) || old.overdue.find((t) => t.id === id);
        if (!targetTask) return old;
        const doneTask: WorkbenchItem = { ...targetTask, status: 'done' };
        return {
          ...old,
          scheduled: old.scheduled.filter((t) => t.id !== id),
          overdue: old.overdue.filter((t) => t.id !== id),
          completed: [doneTask, ...(old.completed ?? []).filter((t) => t.id !== id)],
        };
      });

      setTaskAnimActions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      complete.mutate(id);
    }, 830);
  }

  function handleUncomplete(id: string) {
    setTaskAnimActions((prev) => new Map(prev).set(id, 'uncomplete'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        const targetTask = (old.completed ?? []).find((t) => t.id === id);
        if (!targetTask) return old;
        const reopenedTask: WorkbenchItem = { ...targetTask, status: 'todo' };
        return {
          ...old,
          completed: (old.completed ?? []).filter((t) => t.id !== id),
          scheduled: [...old.scheduled.filter((t) => t.id !== id), reopenedTask],
        };
      });

      setTaskAnimActions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      uncomplete.mutate(id);
    }, 730);
  }

  function handleTrash(taskItem: WorkbenchItem) {
    setTaskAnimActions((prev) => new Map(prev).set(taskItem.id, 'trash'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          scheduled: old.scheduled.filter((t) => t.id !== taskItem.id),
          overdue: old.overdue.filter((t) => t.id !== taskItem.id),
          completed: (old.completed ?? []).filter((t) => t.id !== taskItem.id),
        };
      });

      setTaskAnimActions((prev) => {
        const next = new Map(prev);
        next.delete(taskItem.id);
        return next;
      });

      setUndoToast({ id: taskItem.id, title: taskItem.title });
      trash.mutate(taskItem.id);
    }, 730);
  }

  function handleToggleSubtasks(taskId: string) {
    setExpandedSubtasksTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleToggleSubtaskDone(subtaskId: string, currentDone: boolean) {
    updateSubtaskMut.mutate({ id: subtaskId, input: { done: !currentDone } });
  }

  function handleAddSubtask(itemId: string, title: string) {
    addSubtaskMut.mutate({ itemId, title });
  }

  function handleDeleteSubtask(subtaskId: string) {
    deleteSubtaskMut.mutate(subtaskId);
  }

  function handleMoveSubtask(itemId: string, index: number, direction: 'up' | 'down') {
    const list = richTasksMap.get(itemId)?.subtasks ?? [];
    if (list.length <= 1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const currentItem = list[index];
    const targetItem = list[targetIdx];
    if (!currentItem || !targetItem) return;
    const nextList = [...list];
    nextList[index] = targetItem;
    nextList[targetIdx] = currentItem;
    reorderSubtasksMut.mutate({ itemId, ids: nextList.map((s) => s.id) });
  }

  function toggleTrashSelect(id: string) {
    setSelectedTrashIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllTrash(allIds: string[]) {
    if (selectedTrashIds.size === allIds.length) {
      setSelectedTrashIds(new Set());
    } else {
      setSelectedTrashIds(new Set(allIds));
    }
  }

  if (today.isPending && !today.data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="size-10 rounded-full border-3 border-line border-t-accent animate-spin-ring" />
        <p className="mt-3 text-xs font-medium text-muted">正在加载今日工作台数据…</p>
      </div>
    );
  }

  if (today.isError) {
    return (
      <div className="rounded-panel border border-critical-soft bg-critical-soft p-6 text-center text-critical">
        <IconAlertCircle size={28} className="mx-auto mb-2" />
        <h3 className="font-bold">加载今日数据失败</h3>
        <p className="mt-1 text-xs">{today.error.message}</p>
      </div>
    );
  }

  const { date, scheduled: scheduledTasks, completed: completedTasks = [] } = today.data;
  const greeting = getGreeting(date);

  const allTags = tagsQuery.data?.tags ?? [];
  const recurrences = recurrencesQuery.data?.recurrences ?? [];

  // 按选中标签筛选事项
  const filterByTag = (task: WorkbenchItem) => {
    if (!selectedTagId) return true;
    const rich = richTasksMap.get(task.id);
    const taskTags = rich?.tags ?? [];
    return taskTags.some((t) => t.id === selectedTagId);
  };

  const pendingTasks = scheduledTasks.filter((t) => t.status !== 'done').filter(filterByTag);
  const doneTasks = completedTasks.filter(filterByTag);
  const totalTasksCount = pendingTasks.length + doneTasks.length;
  const targetCompletionRate =
    totalTasksCount > 0 ? Math.round((doneTasks.length / totalTasksCount) * 100) : 0;

  const trashItems = trashQuery.data?.items ?? [];
  const trashIds = trashItems.map((i) => i.id);
  const isAllTrashSelected = trashItems.length > 0 && selectedTrashIds.size === trashItems.length;

  const unscheduledItems = unscheduledQuery.data?.items ?? [];

  // 详情弹窗当前事项的丰富信息
  const detailRich = detailTask ? richTasksMap.get(detailTask.id) : null;
  const detailSubtasks = detailRich?.subtasks ?? [];
  const detailTags = detailRich?.tags ?? [];
  const detailRecurrence = detailRich?.recurrenceId
    ? recurrences.find((r) => r.id === detailRich.recurrenceId)
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 左侧 2 栏 */}
      <div className="space-y-6 lg:col-span-2 animate-slide-down-in">
        {/* 头部：今日问候与快捷动作 */}
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-wider text-accent uppercase">
              {preferences.showGreeting ? `${date} · 今日执行舱` : date}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {preferences.showGreeting ? greeting.title : '今日执行舱'}
            </h1>
            <p className="mt-1 text-xs text-secondary">
              今日共 {totalTasksCount} 项排程，已达成 {doneTasks.length} 项（
              {targetCompletionRate}%）
            </p>
          </div>

          {/* 顶部工具按钮组 */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsTagManagerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-secondary hover:border-accent/40 hover:bg-surface-2 hover:text-ink transition shadow-2xs"
            >
              <IconTag size={13} className="text-accent" />
              <span>标签管理</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRecurrenceModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-secondary hover:border-indigo-500/40 hover:bg-surface-2 hover:text-ink transition shadow-2xs"
            >
              <IconRepeat size={13} className="text-indigo-500" />
              <span>重复规则</span>
            </button>
            <button
              type="button"
              onClick={() => setIsUnscheduledDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-secondary hover:border-accent/40 hover:bg-surface-2 hover:text-ink transition shadow-2xs"
            >
              <IconCalendar size={13} className="text-accent" />
              <span>待排程抽屉</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTrashOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-secondary hover:border-line hover:bg-surface-2 hover:text-ink transition shadow-2xs"
            >
              <IconTrash size={13} className="text-muted" />
              <span>回收站</span>
            </button>
          </div>
        </div>

        {/* 标签过滤条 */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <IconTag size={11} />
              <span>分类筛选:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedTagId(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition shrink-0 ${
                selectedTagId === null
                  ? 'bg-accent text-white shadow-2xs'
                  : 'bg-surface border border-line text-secondary hover:bg-surface-2 hover:text-ink'
              }`}
            >
              全部
            </button>
            {allTags.map((tag) => {
              const active = selectedTagId === tag.id;
              const style = (tag.color && TAG_COLOR_STYLES[tag.color]) || DEFAULT_TAG_STYLE;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTagId(active ? null : tag.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition shrink-0 ${
                    active
                      ? `${style.bg} ${style.text} ${style.border} ring-2 ring-accent/30 font-bold`
                      : 'bg-surface border-line text-secondary hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${style.dot}`} />
                  <span>{tag.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 逾期任务智能折叠横幅 */}
        {renderedOverdueItems.length > 0 && (
          <section
            className={`overflow-hidden rounded-panel border border-critical/30 bg-critical-soft/60 transition-all shadow-xs ${overdueAnimClass}`}
            aria-label="逾期事项警告"
          >
            <button
              type="button"
              onClick={() => setIsOverdueExpanded(!isOverdueExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-critical-soft/80"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-critical text-white">
                  <IconAlertCircle size={13} />
                </span>
                <span className="text-xs font-bold text-critical">
                  有 {renderedOverdueItems.length} 项已逾期事项，建议优先推进或调整排程
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-critical">
                <span>{isOverdueExpanded ? '收起' : '展开查看'}</span>
                {isOverdueExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </div>
            </button>

            {isOverdueExpanded && (
              <div className="border-t border-critical/20 px-3 py-3 space-y-1 bg-surface/80">
                {renderedOverdueItems.filter(filterByTag).map((t) => {
                  const rich = richTasksMap.get(t.id);
                  return (
                    <TaskItemRow
                      key={t.id}
                      task={t}
                      subtasks={rich?.subtasks}
                      tags={rich?.tags}
                      recurrenceId={rich?.recurrenceId}
                      isSubtasksExpanded={expandedSubtasksTaskIds.has(t.id)}
                      animAction={taskAnimActions.get(t.id) ?? null}
                      onComplete={handleComplete}
                      onEdit={setEditingTask}
                      onDetail={setDetailTask}
                      onTrash={handleTrash}
                      onSchedule={setSchedulingTask}
                      onToggleSubtasks={handleToggleSubtasks}
                      onToggleSubtaskDone={handleToggleSubtaskDone}
                      onAddSubtask={handleAddSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                      onMoveSubtask={handleMoveSubtask}
                      disabled={complete.isPending}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 今日事项列表卡片 */}
        <Panel
          className="hover-lift"
          title="今日排程事项"
          hint={`${pendingTasks.length} 项进行中 · ${doneTasks.length} 项已完成`}
        >
          {pendingTasks.length === 0 && renderedDoneTasks.length === 0 ? (
            <div className="animate-fade-in">
              <EmptyState
                title={selectedTagId ? '当前标签下无排程事项' : '今天还没有任何排程'}
                description={
                  selectedTagId
                    ? '请尝试切换或清除分类标签筛选。'
                    : '随手在下方收集箱记录第一件事，或从待排程抽屉拖入事项开始吧。'
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* 进行中事项列表 */}
              {pendingTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {pendingTasks.map((task, idx) => {
                    const isCurrent = idx === 0;
                    const rich = richTasksMap.get(task.id);
                    return (
                      <TaskItemRow
                        key={task.id}
                        task={task}
                        subtasks={rich?.subtasks}
                        tags={rich?.tags}
                        recurrenceId={rich?.recurrenceId}
                        isCurrent={isCurrent}
                        isSubtasksExpanded={expandedSubtasksTaskIds.has(task.id)}
                        animAction={taskAnimActions.get(task.id) ?? null}
                        onComplete={handleComplete}
                        onEdit={setEditingTask}
                        onDetail={setDetailTask}
                        onTrash={handleTrash}
                        onSchedule={setSchedulingTask}
                        onToggleSubtasks={handleToggleSubtasks}
                        onToggleSubtaskDone={handleToggleSubtaskDone}
                        onAddSubtask={handleAddSubtask}
                        onDeleteSubtask={handleDeleteSubtask}
                        onMoveSubtask={handleMoveSubtask}
                        disabled={complete.isPending}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-control border border-good/30 bg-good-soft/40 p-3.5 text-center animate-expand-in">
                  <span className="text-sm font-bold text-good">
                    🎉 棒极了！今日排程已全部完成，尽情享受专注带来的成果吧。
                  </span>
                </div>
              )}

              {/* 已完成事项分组折叠区 */}
              {preferences.showCompletedTasks && renderedDoneTasks.length > 0 && (
                <div className={`border-t border-line/60 pt-3 ${doneSectionAnimClass}`}>
                  <button
                    type="button"
                    onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                    className="flex w-full items-center justify-between py-1 text-xs font-bold text-secondary hover:text-ink transition select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex size-4 items-center justify-center rounded-full bg-good/20 text-good text-[10px] font-bold">
                        ✓
                      </span>
                      <span>已完成事项 ({renderedDoneTasks.length})</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted font-normal">
                      <span>{isCompletedExpanded ? '收起' : '展开'}</span>
                      {isCompletedExpanded ? (
                        <IconChevronDown size={13} />
                      ) : (
                        <IconChevronRight size={13} />
                      )}
                    </div>
                  </button>

                  {isCompletedExpanded && (
                    <div className="mt-2 space-y-1.5 animate-slide-down-in">
                      {renderedDoneTasks.map((task) => {
                        const rich = richTasksMap.get(task.id);
                        return (
                          <TaskItemRow
                            key={task.id}
                            task={task}
                            subtasks={rich?.subtasks}
                            tags={rich?.tags}
                            recurrenceId={rich?.recurrenceId}
                            isSubtasksExpanded={expandedSubtasksTaskIds.has(task.id)}
                            animAction={taskAnimActions.get(task.id) ?? null}
                            onComplete={handleUncomplete}
                            onEdit={setEditingTask}
                            onDetail={setDetailTask}
                            onTrash={handleTrash}
                            onSchedule={setSchedulingTask}
                            onToggleSubtasks={handleToggleSubtasks}
                            onToggleSubtaskDone={handleToggleSubtaskDone}
                            onAddSubtask={handleAddSubtask}
                            onDeleteSubtask={handleDeleteSubtask}
                            onMoveSubtask={handleMoveSubtask}
                            disabled={uncomplete.isPending}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* 快速收集栏 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-secondary">
            <span>快速收集箱</span>
            <button
              type="button"
              onClick={() => setIsQuickAddExpanded(!isQuickAddExpanded)}
              className="text-[11px] text-accent hover:underline flex items-center gap-1"
            >
              <IconEdit size={11} />
              <span>{isQuickAddExpanded ? '收起备注' : '添加备注'}</span>
            </button>
          </div>
          <QuickAddBar
            onAdd={({ title, importance, dueDate }) => {
              create.mutate({
                title,
                importance,
                dueDate,
                notes: isQuickAddExpanded && quickAddNotes.trim() ? quickAddNotes.trim() : null,
              });
              setQuickAddNotes('');
              setIsQuickAddExpanded(false);
            }}
            disabled={create.isPending}
          />
          {isQuickAddExpanded && (
            <div className="rounded-control border border-line bg-surface p-2.5 animate-slide-down-in">
              <label className="block text-[11px] font-semibold text-secondary mb-1">
                事项补充备注 (可选):
              </label>
              <textarea
                value={quickAddNotes}
                onChange={(e) => setQuickAddNotes(e.target.value)}
                placeholder="添加一两行补充说明（如：记得带身份证、会议要点等）..."
                rows={2}
                maxLength={2000}
                className="w-full rounded-control border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 错误提示条 */}
        {create.isError && (
          <div className="rounded-control border border-critical/30 bg-critical-soft p-3 text-xs text-critical">
            添加事项失败：{create.error.message}
          </div>
        )}
        {update.isError && (
          <div className="rounded-control border border-critical/30 bg-critical-soft p-3 text-xs text-critical">
            更新事项失败：{update.error.message}
          </div>
        )}
      </div>

      {/* 右侧 1 栏 */}
      <div className="space-y-5 animate-slide-right-in">
        {/* 今日实时时钟 */}
        <TodayClockCard />

        {/* 今日执行度仪表盘卡片 */}
        <TodayExecutionCard doneCount={doneTasks.length} totalCount={totalTasksCount} />

        {/* 别的模块贡献进来的今日卡片（如习惯打卡），由组合根装配 */}
        {asideEntries.map((entry) => (
          <div key={entry.id}>{entry.node}</div>
        ))}

        {/* 复盘引导卡片 */}
        <div className="rounded-panel border border-warning/20 bg-warning-soft/50 p-4 hover-lift">
          <div className="flex items-center gap-2 text-xs font-bold text-warning">
            <IconBookOpen size={14} />
            <span>今日复盘提示</span>
          </div>
          <p className="mt-2 text-xs text-secondary leading-relaxed italic">
            “少规划功能，多完成一次真实的使用闭环。先让每天的安排足够顺手。”
          </p>
        </div>
      </div>

      {/* 调整排程弹窗 */}
      <Modal
        isOpen={Boolean(schedulingTask)}
        onClose={() => setSchedulingTask(null)}
        title="安排事项排程"
        description="设定事项的排程日期或具体时间段，帮助您合理规划日程节奏。"
        maxWidth="max-w-lg"
      >
        {schedulingTask && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!scheduleRangeValue) {
                scheduleMut.mutate({
                  id: schedulingTask.id,
                  input: { scheduled: null },
                });
                return;
              }
              if (scheduleRangeValue.kind === 'all-day') {
                scheduleMut.mutate({
                  id: schedulingTask.id,
                  input: {
                    scheduled: {
                      kind: 'all-day',
                      date: scheduleRangeValue.date || '',
                    },
                  },
                });
              } else {
                scheduleMut.mutate({
                  id: schedulingTask.id,
                  input: {
                    scheduled: {
                      kind: 'timed',
                      start: scheduleRangeValue.startUtc!,
                      end: scheduleRangeValue.endUtc,
                    },
                  },
                });
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="rounded-control bg-surface-2 p-3 border border-line/60">
              <div className="font-semibold text-ink">{schedulingTask.title}</div>
              <div className="mt-1 text-muted text-[11px]">
                当前排程：{formatScheduledTime(schedulingTask.scheduled)}
              </div>
            </div>

            <ScheduleRangePicker
              key={schedulingTask.id}
              initialKind={schedulingTask.scheduled?.kind ?? 'all-day'}
              initialDate={
                schedulingTask.scheduled?.kind === 'all-day' ? schedulingTask.scheduled.date : ''
              }
              initialStartLocal={
                schedulingTask.scheduled?.kind === 'timed'
                  ? formatUtcToLocal(schedulingTask.scheduled.start).full
                  : ''
              }
              initialEndLocal={
                schedulingTask.scheduled?.kind === 'timed' && schedulingTask.scheduled.end
                  ? formatUtcToLocal(schedulingTask.scheduled.end).full
                  : ''
              }
              onChange={setScheduleRangeValue}
            />

            <div className="flex justify-between items-center pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  scheduleMut.mutate({
                    id: schedulingTask.id,
                    input: { scheduled: null },
                  });
                }}
                className="text-critical hover:underline"
              >
                取消排程（退回待排程抽屉）
              </button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchedulingTask(null)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={scheduleMut.isPending || !scheduleRangeValue}
                >
                  {scheduleMut.isPending ? '排程中…' : '确认排程'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* 待排程抽屉弹窗 */}
      <Modal
        isOpen={isUnscheduledDrawerOpen}
        onClose={() => setIsUnscheduledDrawerOpen(false)}
        title="待排程事项抽屉"
        description="展示有截止时间（DDL）但尚未决定哪天执行的事项，支持一键排入今日或指定日期"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3 text-xs">
          {unscheduledItems.length > 0 ? (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {unscheduledItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-control border border-line p-3 hover:bg-surface-2/60 transition"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="font-semibold text-ink truncate">{item.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      {item.dueAt && <span>截止日: {item.dueAt.slice(0, 10)}</span>}
                      <span>权重分: {item.priorityScore}</span>
                      <Chip tone="neutral">{useModuleLabel(item.sourceModule)}</Chip>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        scheduleMut.mutate({
                          id: item.id,
                          input: { scheduled: { kind: 'all-day', date } },
                        });
                      }}
                      disabled={scheduleMut.isPending}
                    >
                      排入今天
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSchedulingTask(item)}
                    >
                      选日期
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="待排程抽屉暂无事项"
              description="当前所有事项均已安排妥当，或通过取消排程将事项移入抽屉。"
            />
          )}
        </div>
      </Modal>

      {/* 事项详情弹窗 */}
      <Modal
        isOpen={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        title="事项详情"
        description={`来源模块：${detailTask ? detailTask.sourceModule : ''}`}
        maxWidth="max-w-lg"
      >
        {detailTask && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="text-base font-bold text-ink">{detailTask.title}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={detailTask.status === 'done' ? 'good' : 'accent'}>
                  {detailTask.status === 'done' ? '已完成' : '待办中'}
                </Chip>
                {detailTask.kind === 'event' && <Chip tone="neutral">日程事件</Chip>}
                {detailTask.isImportantQuadrant && <Chip tone="warning">重要事项</Chip>}
                <Chip tone={URGENCY_TONE[detailTask.urgency]}>
                  {URGENCY_LABEL[detailTask.urgency]}
                </Chip>
                {detailRecurrence && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 px-2 py-0.5 text-xs font-medium">
                    <IconRepeat size={12} />
                    <span>重复规则: {formatRecurrenceRule(detailRecurrence)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 标签管理区域 */}
            {detailTask.sourceModule === 'todo' && (
              <div className="rounded-control bg-surface-2 p-3 border border-line/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-secondary flex items-center gap-1">
                    <IconTag size={12} className="text-accent" />
                    <span>分类标签</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTagManagerOpen(true);
                    }}
                    className="text-[11px] text-accent hover:underline"
                  >
                    管理标签库
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {detailTags.length > 0 ? (
                    detailTags.map((tag) => (
                      <TagBadge
                        key={tag.id}
                        tag={tag}
                        size="sm"
                        onRemove={() => {
                          const nextIds = detailTags
                            .filter((t) => t.id !== tag.id)
                            .map((t) => t.id);
                          setTaskTagsMut.mutate({ itemId: detailTask.id, tagIds: nextIds });
                        }}
                      />
                    ))
                  ) : (
                    <span className="text-[11px] text-muted">暂未添加分类标签</span>
                  )}
                </div>
                {/* 快速加标签下拉选项 */}
                {allTags.filter((t) => !detailTags.some((dt) => dt.id === t.id)).length > 0 && (
                  <div className="pt-1.5 border-t border-line/40 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted">添加标签:</span>
                    {allTags
                      .filter((t) => !detailTags.some((dt) => dt.id === t.id))
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            const nextIds = [...detailTags.map((dt) => dt.id), t.id];
                            setTaskTagsMut.mutate({ itemId: detailTask.id, tagIds: nextIds });
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[10px] text-secondary hover:border-accent hover:text-accent transition"
                        >
                          <IconPlus size={9} />
                          <span>{t.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* 备注区域 */}
            <div className="rounded-control bg-surface-2 p-3 border border-line/60 space-y-1">
              <span className="font-bold text-secondary flex items-center gap-1">
                <IconFileText size={12} className="text-accent" />
                <span>详细备注</span>
              </span>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                {detailRich?.notes || detailTask.notes || '暂无详细备注'}
              </p>
            </div>

            {/* 子任务清单区域 */}
            {detailTask.sourceModule === 'todo' && (
              <div className="rounded-control bg-surface-2 p-3 border border-line/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-secondary flex items-center gap-1">
                    <IconListTodo size={12} className="text-accent" />
                    <span>
                      子任务检查清单 ({detailSubtasks.filter((s) => s.done).length}/
                      {detailSubtasks.length})
                    </span>
                  </span>
                </div>

                {detailSubtasks.length > 0 && (
                  <div className="space-y-1">
                    {detailSubtasks.map((st, idx) => (
                      <div
                        key={st.id}
                        className="group flex items-center justify-between rounded-control px-2 py-1.5 hover:bg-surface transition"
                      >
                        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={st.done}
                            onChange={() => handleToggleSubtaskDone(st.id, st.done)}
                            className="size-3.5 rounded border-line text-good accent-good focus:ring-good"
                          />
                          <span
                            className={`text-xs ${
                              st.done
                                ? 'text-muted line-through opacity-70'
                                : 'text-ink font-medium'
                            }`}
                          >
                            {st.title}
                          </span>
                        </label>

                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSubtask(detailTask.id, idx, 'up')}
                            title="上移"
                            className="text-muted hover:text-ink disabled:opacity-30 p-0.5"
                          >
                            <IconArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === detailSubtasks.length - 1}
                            onClick={() => handleMoveSubtask(detailTask.id, idx, 'down')}
                            title="下移"
                            className="text-muted hover:text-ink disabled:opacity-30 p-0.5"
                          >
                            <IconArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtask(st.id)}
                            title="删除子任务"
                            className="text-muted hover:text-critical p-0.5 ml-1"
                          >
                            <IconTrash size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!detailSubtaskInput.trim()) return;
                    handleAddSubtask(detailTask.id, detailSubtaskInput.trim());
                    setDetailSubtaskInput('');
                  }}
                  className="flex items-center gap-2 pt-1 border-t border-line/40"
                >
                  <input
                    type="text"
                    value={detailSubtaskInput}
                    onChange={(e) => setDetailSubtaskInput(e.target.value)}
                    placeholder="输入新子任务标题..."
                    className="flex-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={!detailSubtaskInput.trim() || addSubtaskMut.isPending}
                  >
                    添加
                  </Button>
                </form>
              </div>
            )}

            {/* 排程与截止信息 */}
            <div className="grid grid-cols-2 gap-3 rounded-control bg-surface-2 p-3 border border-line/60">
              <div>
                <span className="text-muted">排程时间</span>
                <p className="mt-0.5 font-semibold text-accent">
                  {formatScheduledTime(detailTask.scheduled)}
                </p>
              </div>
              <div>
                <span className="text-muted">截止时间 (DDL)</span>
                <p className="mt-0.5 font-semibold text-ink">
                  {detailTask.dueAt ? detailTask.dueAt.slice(0, 10) : '无截止日'}
                </p>
              </div>
              <div>
                <span className="text-muted">优先级权重分</span>
                <p className="mt-0.5 font-bold text-accent tabular-nums">
                  {detailTask.priorityScore} 分
                </p>
              </div>
              <div>
                <span className="text-muted">来源模块</span>
                <p className="mt-0.5 font-semibold text-ink">
                  {useModuleLabel(detailTask.sourceModule)}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-line">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const t = detailTask;
                  setDetailTask(null);
                  setSchedulingTask(t);
                }}
              >
                调整排程
              </Button>

              <div className="flex gap-2">
                {detailTask.sourceModule === 'todo' && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const t = detailTask;
                        setDetailTask(null);
                        handleTrash(t);
                      }}
                      className="text-critical hover:bg-critical-soft"
                    >
                      移至回收站
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const t = detailTask;
                        setDetailTask(null);
                        setEditingTask(t);
                      }}
                    >
                      编辑待办
                    </Button>
                  </>
                )}
                {detailTask.status !== 'done' && detailTask.sourceModule === 'todo' ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const id = detailTask.id;
                      setDetailTask(null);
                      handleComplete(id);
                    }}
                  >
                    完成任务
                  </Button>
                ) : (
                  detailTask.sourceModule === 'todo' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const id = detailTask.id;
                        setDetailTask(null);
                        handleUncomplete(id);
                      }}
                    >
                      重新打开
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 待办编辑弹窗 */}
      <Modal
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="编辑待办事项"
        description="修改任务标题、重要程度、截止时间、备注与分类标签"
        maxWidth="max-w-lg"
      >
        {editingTask && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) return;
              update.mutate({
                id: editingTask.id,
                input: {
                  title: editTitle.trim(),
                  importance: editImportance,
                  dueDate: editDueDate || null,
                  notes: editNotes.trim() || null,
                },
                tagIds: editTagIds,
              });
            }}
            className="space-y-4 text-xs"
          >
            <Field label="任务标题">
              <input
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className={controlClass}
                placeholder="输入待办事项标题..."
              />
            </Field>

            <Field label="重要程度">
              <div className="flex gap-2">
                {(['high', 'normal', 'low'] as const).map((imp) => {
                  const labels = { high: '重要', normal: '普通', low: '低' };
                  const active = editImportance === imp;
                  return (
                    <button
                      key={imp}
                      type="button"
                      onClick={() => setEditImportance(imp)}
                      className={`flex-1 rounded-control border py-2 font-medium transition ${
                        active
                          ? 'border-accent bg-accent-soft text-accent font-bold ring-1 ring-accent/30'
                          : 'border-line bg-surface hover:bg-surface-2 text-secondary'
                      }`}
                    >
                      {labels[imp]}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="截止日期 / 时间">
              <DatePicker
                value={editDueDate}
                onChange={setEditDueDate}
                placeholder="年 / 月 / 日  时 : 分"
                showTime={true}
                className="w-full"
              />
            </Field>

            <Field label="补充备注 (上限 2000 字)">
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="填写事项补充备注、注意事项或备忘..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-control border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="mt-1 text-right text-[10px] text-muted">
                {editNotes.length}/2000 字
              </div>
            </Field>

            {/* 标签多选 */}
            {allTags.length > 0 && (
              <Field label="分类标签">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {allTags.map((tag) => {
                    const isSelected = editTagIds.includes(tag.id);
                    const style = (tag.color && TAG_COLOR_STYLES[tag.color]) || DEFAULT_TAG_STYLE;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditTagIds(editTagIds.filter((id) => id !== tag.id));
                          } else {
                            setEditTagIds([...editTagIds, tag.id]);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                          isSelected
                            ? `${style.bg} ${style.text} ${style.border} font-bold ring-2 ring-accent/30`
                            : 'bg-surface border-line text-secondary hover:bg-surface-2'
                        }`}
                      >
                        <span className={`size-2 rounded-full ${style.dot}`} />
                        <span>{tag.name}</span>
                        {isSelected && <IconCheck size={11} />}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingTask(null)}>
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={update.isPending || !editTitle.trim()}
              >
                {update.isPending ? '保存中…' : '保存修改'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 标签管理弹窗 */}
      <Modal
        isOpen={isTagManagerOpen}
        onClose={() => {
          setIsTagManagerOpen(false);
          setEditingTagItem(null);
        }}
        title="分类标签管理"
        description="管理待办事项的分类标签与语义主题色，支持按标签高效筛选"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs">
          {/* 新建/编辑标签表单 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingTagItem) {
                if (!newTagName.trim()) return;
                updateTagMut.mutate({
                  id: editingTagItem.id,
                  input: { name: newTagName.trim(), color: newTagColor },
                });
              } else {
                if (!newTagName.trim()) return;
                createTagMut.mutate({ name: newTagName.trim(), color: newTagColor });
              }
            }}
            className="rounded-control bg-surface-2 p-3.5 border border-line space-y-3"
          >
            <div className="font-bold text-ink">{editingTagItem ? '编辑标签' : '创建新标签'}</div>

            <div className="flex gap-2">
              <input
                required
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="输入标签名称 (如: 工作、学习、生活)..."
                maxLength={40}
                className="flex-1 rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!newTagName.trim() || createTagMut.isPending || updateTagMut.isPending}
              >
                {editingTagItem ? '更新' : '创建'}
              </Button>
              {editingTagItem && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingTagItem(null);
                    setNewTagName('');
                  }}
                >
                  取消
                </Button>
              )}
            </div>

            <div>
              <span className="text-[11px] font-semibold text-secondary block mb-1.5">
                选择语义主题色:
              </span>
              <div className="flex gap-2">
                {TAG_COLORS.map((c) => {
                  const style = TAG_COLOR_STYLES[c];
                  const active = newTagColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewTagColor(c)}
                      className={`size-6 rounded-full ${style.dot} flex items-center justify-center transition-all ${
                        active
                          ? 'ring-3 ring-offset-2 ring-offset-surface ring-accent scale-110'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      title={c}
                    >
                      {active && <IconCheck size={12} className="text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>

          {/* 标签列表 */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-secondary block">
              全部标签 ({allTags.length})
            </span>
            {allTags.length > 0 ? (
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {allTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-control border border-line bg-surface p-2 hover:bg-surface-2 transition"
                  >
                    <TagBadge tag={tag} size="md" />

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTagItem(tag);
                          setNewTagName(tag.name);
                          setNewTagColor(tag.color ?? 'blue');
                        }}
                        className="p-1 text-muted hover:text-ink rounded transition"
                        title="编辑标签"
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `确定删除标签「${tag.name}」吗？已打该标签的事项将自动移除此关联。`,
                            )
                          ) {
                            deleteTagMut.mutate(tag.id);
                          }
                        }}
                        className="p-1 text-muted hover:text-critical rounded transition"
                        title="删除标签"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="暂无标签"
                description="在上方输入名称并选择颜色即可创建第一个标签。"
              />
            )}
          </div>
        </div>
      </Modal>

      {/* 重复任务规则管理弹窗 */}
      <Modal
        isOpen={isRecurrenceModalOpen}
        onClose={() => {
          setIsRecurrenceModalOpen(false);
          setRecurrenceTab('list');
        }}
        title="重复任务规则管理"
        description="设定周期性规则，系统将自动按周期在执行日生成待办事项。"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          {/* 顶部标签切换 */}
          <div className="flex border-b border-line pb-2">
            <button
              type="button"
              onClick={() => setRecurrenceTab('list')}
              className={`flex-1 py-1.5 text-center font-bold transition rounded-control ${
                recurrenceTab === 'list'
                  ? 'bg-accent/15 text-accent font-bold'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              规则列表 ({recurrences.length})
            </button>
            <button
              type="button"
              onClick={() => setRecurrenceTab('create')}
              className={`flex-1 py-1.5 text-center font-bold transition rounded-control ${
                recurrenceTab === 'create'
                  ? 'bg-accent/15 text-accent font-bold'
                  : 'text-secondary hover:text-ink'
              }`}
            >
              + 新建重复规则
            </button>
          </div>

          {recurrenceTab === 'create' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!recTitle.trim()) return;
                createRecurrenceMut.mutate({
                  title: recTitle.trim(),
                  importance: recImportance,
                  notes: recNotes.trim() || null,
                  freq: recFreq,
                  interval: Number(recInterval) || 1,
                  byWeekday: recFreq === 'weekly' ? recWeekdays : null,
                  byMonthday: recFreq === 'monthly' ? Number(recMonthday) : null,
                  startDate: recStartDate,
                  untilDate: recUntilDate || null,
                });
              }}
              className="space-y-3.5"
            >
              <Field label="任务标题">
                <input
                  required
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="例如: 每周撰写工作周报、每月交房租..."
                  className={controlClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="重复周期类型">
                  <select
                    value={recFreq}
                    onChange={(e) => setRecFreq(e.target.value as RecurrenceFreq)}
                    className={controlClass}
                  >
                    <option value="daily">按天重复 (Daily)</option>
                    <option value="weekly">按周重复 (Weekly)</option>
                    <option value="monthly">按月重复 (Monthly)</option>
                  </select>
                </Field>

                <Field label="周期间隔">
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={recInterval}
                    onChange={(e) => setRecInterval(Number(e.target.value) || 1)}
                    className={controlClass}
                  />
                </Field>
              </div>

              {/* 按周重复星期几选择 */}
              {recFreq === 'weekly' && (
                <Field label="选择星期几执行">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const active = recWeekdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            if (active) {
                              if (recWeekdays.length > 1) {
                                setRecWeekdays(recWeekdays.filter((w) => w !== d));
                              }
                            } else {
                              setRecWeekdays([...recWeekdays, d].sort());
                            }
                          }}
                          className={`flex-1 rounded-control border py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'border-accent bg-accent text-white shadow-2xs'
                              : 'border-line bg-surface hover:bg-surface-2 text-secondary'
                          }`}
                        >
                          {WEEKDAY_NAMES[d]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              {/* 按月重复几号选择 */}
              {recFreq === 'monthly' && (
                <Field label="每月执行日 (几号)">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={recMonthday}
                      onChange={(e) => setRecMonthday(Number(e.target.value) || 1)}
                      className="w-24 rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                    />
                    <span className="text-secondary text-xs">号 (若当月天数不足则跳过)</span>
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="开始生效日期">
                  <DatePicker
                    value={recStartDate}
                    onChange={setRecStartDate}
                    placeholder="年-月-日"
                    showTime={false}
                    className="w-full"
                  />
                </Field>
                <Field label="截止日期 (可选)">
                  <DatePicker
                    value={recUntilDate}
                    onChange={setRecUntilDate}
                    placeholder="无截止日期 (永久)"
                    showTime={false}
                    className="w-full"
                  />
                </Field>
              </div>

              <Field label="重要程度">
                <div className="flex gap-2">
                  {(['high', 'normal', 'low'] as const).map((imp) => {
                    const labels = { high: '重要', normal: '普通', low: '低' };
                    const active = recImportance === imp;
                    return (
                      <button
                        key={imp}
                        type="button"
                        onClick={() => setRecImportance(imp)}
                        className={`flex-1 rounded-control border py-1.5 font-medium transition ${
                          active
                            ? 'border-accent bg-accent-soft text-accent font-bold ring-1 ring-accent/30'
                            : 'border-line bg-surface hover:bg-surface-2 text-secondary'
                        }`}
                      >
                        {labels[imp]}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="补充备注 (可选)">
                <textarea
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="每次生成的待办所附带的备注说明..."
                  rows={2}
                  maxLength={2000}
                  className="w-full rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </Field>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecurrenceTab('list')}
                >
                  返回列表
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!recTitle.trim() || createRecurrenceMut.isPending}
                >
                  {createRecurrenceMut.isPending ? '创建中…' : '确认创建规则'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {recurrences.length > 0 ? (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {recurrences.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-control border border-line bg-surface p-3 hover:bg-surface-2 transition flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink text-sm truncate">{rule.title}</span>
                          <Chip tone={rule.importance === 'high' ? 'warning' : 'neutral'}>
                            {rule.importance === 'high' ? '重要' : '普通'}
                          </Chip>
                        </div>
                        <div className="text-xs text-accent font-semibold flex items-center gap-1">
                          <IconRepeat size={12} />
                          <span>{formatRecurrenceRule(rule)}</span>
                        </div>
                        <div className="text-[11px] text-muted">
                          生效自: {rule.startDate}{' '}
                          {rule.untilDate ? `至 ${rule.untilDate}` : '(永久有效)'}
                        </div>
                        {rule.notes && (
                          <p className="text-[11px] text-secondary italic truncate">
                            备注: {rule.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              window.confirm(
                                `确定删除规则「${rule.title}」吗？\n将清除未来未完成的重复实例，已完成的历史记录将被完整保留。`,
                              )
                            ) {
                              deleteRecurrenceMut.mutate(rule.id);
                            }
                          }}
                          className="text-critical hover:bg-critical-soft"
                          title="删除规则"
                        >
                          <IconTrash size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="暂无重复规则"
                  description="点击右上角「+ 新建重复规则」即可配置每日/每周/每月的定期待办。"
                />
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 待办回收站弹窗 */}
      <Modal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        title="待办回收站"
        description="所有软删除数据均完整保存在 SQLite 本地数据库中，支持多选批量或全部恢复/彻底销毁"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          {trashItems.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-ink select-none">
                    <input
                      type="checkbox"
                      checked={isAllTrashSelected}
                      onChange={() => toggleSelectAllTrash(trashIds)}
                      className="size-4 rounded border-line text-accent accent-accent focus:ring-accent"
                    />
                    <span>
                      全选 ({selectedTrashIds.size}/{trashItems.length})
                    </span>
                  </label>

                  {selectedTrashIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTrashIds(new Set())}
                      className="text-[11px] text-muted hover:text-ink transition"
                    >
                      取消选择
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedTrashIds.size > 0 ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => batchRestoreMut.mutate([...selectedTrashIds])}
                        disabled={batchRestoreMut.isPending}
                      >
                        {batchRestoreMut.isPending
                          ? '恢复中…'
                          : `恢复已选 (${selectedTrashIds.size})`}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => batchDeleteMut.mutate([...selectedTrashIds])}
                        disabled={batchDeleteMut.isPending}
                      >
                        {batchDeleteMut.isPending
                          ? '销毁中…'
                          : `彻底销毁 (${selectedTrashIds.size})`}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => restoreAllMut.mutate()}
                        disabled={restoreAllMut.isPending}
                      >
                        {restoreAllMut.isPending ? '全部恢复中…' : '全部恢复'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => clearTrashMut.mutate()}
                        disabled={clearTrashMut.isPending}
                      >
                        {clearTrashMut.isPending ? '清空中…' : '全部彻底删除'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {trashItems.map((item) => {
                  const isSelected = selectedTrashIds.has(item.id);
                  const trashAction = trashAnimActions.get(item.id);
                  const isRestoring = trashAction === 'restore';
                  const isDeleting = trashAction === 'delete';

                  let itemClass =
                    'border-line bg-surface-2/50 hover:border-line hover:bg-surface-2 opacity-100 translate-x-0 transition-all duration-200 ease-out';

                  if (isRestoring) {
                    itemClass = 'animate-task-complete-out';
                  } else if (isDeleting) {
                    itemClass = 'animate-task-trash-out';
                  } else if (isSelected) {
                    itemClass =
                      'border-accent/40 bg-accent-soft/40 shadow-2xs opacity-100 translate-x-0 transition-all duration-150';
                  }

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-control border p-3 ${itemClass}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTrashSelect(item.id)}
                          className="size-4 rounded border-line text-accent accent-accent focus:ring-accent shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink truncate">{item.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                            {item.dueAt && <span>截止日: {item.dueAt.slice(0, 10)}</span>}
                            <span>权重分: {item.priorityScore}</span>
                            {item.isImportantQuadrant && (
                              <span className="text-warning font-semibold">重要</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setTrashAnimActions((prev) => new Map(prev).set(item.id, 'restore'));
                            setTimeout(() => {
                              restore.mutate(item.id);
                            }, 730);
                          }}
                          disabled={restore.isPending}
                        >
                          恢复
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTrashAnimActions((prev) => new Map(prev).set(item.id, 'delete'));
                            setTimeout(() => {
                              deletePermanently.mutate(item.id);
                            }, 730);
                          }}
                          disabled={deletePermanently.isPending}
                          className="text-critical hover:bg-critical-soft"
                        >
                          彻底删除
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              title="回收站空空如也"
              description="没有已删除的任务，所有待办都在数据库中安全保存。"
            />
          )}
        </div>
      </Modal>

      {/* 撤销删除 Toast 悬浮通知 */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-panel border border-line bg-surface p-3.5 shadow-xl animate-slide-up">
          <div className="flex items-center gap-2 text-xs text-ink font-medium">
            <IconTrash size={14} className="text-warning" />
            <span>已将「{undoToast.title}」移至回收站</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                restore.mutate(undoToast.id);
                setUndoToast(null);
              }}
              className="rounded-control bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-white transition"
            >
              撤销删除
            </button>
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="flex size-6 items-center justify-center rounded text-muted hover:text-ink transition"
            >
              <IconX size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
