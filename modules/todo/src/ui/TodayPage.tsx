import { useState, useEffect, useRef, memo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  DatePicker,
  EmptyState,
  Field,
  Modal,
  Panel,
  ProgressBar,
  MetricRing,
  QuickAddBar,
  TodayClockCard,
  controlClass,
  useModuleLabel,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconTarget,
  IconFlame,
  IconBookOpen,
  IconTrash,
  IconEdit,
  IconInfo,
  IconX,
} from '@workbench/ui';
import {
  TODO_MODULE_ID,
  type TaskView,
  type TodayResponse,
  type TrashResponse,
  type UpdateTaskInput,
} from '../contract.js';
import {
  deleteTaskPermanently,
  fetchToday,
  fetchTrash,
  patchTask,
  postBatchDelete,
  postBatchRestore,
  postClearTrash,
  postComplete,
  postRestore,
  postRestoreAll,
  postTask,
  postTrash,
  postUncomplete,
} from './api.js';

const TODAY_KEY = ['todo', 'today'] as const;
const TRASH_KEY = ['todo', 'trash'] as const;

const URGENCY_LABEL: Record<TaskView['urgency'], string> = {
  overdue: '已逾期',
  imminent: '24 小时内',
  soon: '3 天内',
  later: '还早',
  none: '无死线',
};

const URGENCY_TONE: Record<TaskView['urgency'], 'neutral' | 'warning' | 'critical'> = {
  overdue: 'critical',
  imminent: 'warning',
  soon: 'warning',
  later: 'neutral',
  none: 'neutral',
};

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
 * 缓动数值动画 Hook：
 * 隔离在卡片内部独立运行，避免 RAF 高频更新导致整页和列表产生无谓的 React 重新渲染（解决掉帧卡顿根因）
 */
function useAnimatedValue(targetValue: number, duration = 850): number {
  const [displayValue, setDisplayValue] = useState(0);
  const currentRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = currentRef.current;
    const endVal = targetValue;
    if (startVal === endVal) return;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic 曲线：1 - (1 - x)^3
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
  }, [targetValue, duration]);

  return displayValue;
}

/**
 * 独立隔离的今日执行度仪表盘卡片（内部自维护 60fps 缓动动画，不影响外层任务列表）
 */
const TodayExecutionCard = memo(function TodayExecutionCard({
  doneCount,
  totalCount,
}: {
  doneCount: number;
  totalCount: number;
}) {
  const targetRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const animatedRate = useAnimatedValue(targetRate, 850);

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
            项任务。
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

      {/* 3 指标小环/统计 */}
      <div className="grid grid-cols-3 gap-2 border-t border-slate-700/60 pt-3 text-center">
        <div className="rounded-control bg-white/5 p-2 backdrop-blur-xs border border-white/5">
          <div className="text-[10px] text-slate-400">任务达成</div>
          <div className="mt-0.5 text-xs font-bold text-white tabular-nums">
            {doneCount}/{totalCount}
          </div>
        </div>
        <div className="rounded-control bg-white/5 p-2 backdrop-blur-xs border border-white/5">
          <div className="text-[10px] text-slate-400">习惯打卡</div>
          <div className="mt-0.5 text-xs font-bold text-white tabular-nums">2/3</div>
        </div>
        <div className="rounded-control bg-white/5 p-2 backdrop-blur-xs border border-white/5">
          <div className="text-[10px] text-slate-400">预估耗时</div>
          <div className="mt-0.5 text-xs font-bold text-white tabular-nums">2.5h</div>
        </div>
      </div>
    </section>
  );
});

export type TaskRowAnimAction = 'complete' | 'uncomplete' | 'trash';

function TaskItemRow({
  task,
  isCurrent = false,
  animAction = null,
  onComplete,
  onEdit,
  onDetail,
  onTrash,
  disabled = false,
}: {
  task: TaskView;
  isCurrent?: boolean;
  animAction?: TaskRowAnimAction | null;
  onComplete: (id: string) => void;
  onEdit: (task: TaskView) => void;
  onDetail: (task: TaskView) => void;
  onTrash: (task: TaskView) => void;
  disabled?: boolean;
}) {
  const isTodo = task.sourceModule === TODO_MODULE_ID;
  const sourceLabel = useModuleLabel(task.sourceModule);
  const isCompleted = task.status === 'done';

  const isCompleting = animAction === 'complete';
  const isUncompleting = animAction === 'uncomplete';
  const isTrashing = animAction === 'trash';

  // 高性能 GPU 硬件加速时序动效样式类与新项平滑滑入动效
  let animContainerClass =
    'animate-item-enter border border-transparent hover:border-line hover:bg-surface-2/60 max-h-28 opacity-100 translate-x-0 transition-all duration-200 ease-out';

  if (isCompleting) {
    animContainerClass = 'animate-task-complete-out';
  } else if (isUncompleting) {
    animContainerClass = 'animate-task-uncomplete-out';
  } else if (isTrashing) {
    animContainerClass = 'animate-task-trash-out';
  } else if (isCurrent) {
    animContainerClass =
      'animate-item-enter border border-accent/30 bg-accent-soft/70 shadow-xs max-h-28 opacity-100 translate-x-0 transition-all duration-200';
  }

  const effectiveChecked = isCompleted ? !isUncompleting : isCompleting;

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-control px-3 py-3 ${animContainerClass}`}
    >
      {/* 完成复选按钮（按下打勾瞬间勾亮起，伴随微缩放与高亮反馈） */}
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
          title="外部模块事项"
          className="size-5 shrink-0 rounded-full border border-line bg-surface-2 flex items-center justify-center text-[10px] text-muted font-bold"
        >
          •
        </span>
      )}

      {/* 任务主体信息 */}
      <div
        className="min-w-0 flex-1 cursor-pointer select-none"
        onClick={() => onDetail(task)}
        title="点击查看任务详情"
      >
        <div className="flex items-center gap-2">
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
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {task.dueAt && (
            <span className="flex items-center gap-1">
              <IconClock size={11} />
              <span>{task.dueAt.slice(0, 10)}</span>
            </span>
          )}
          <span>权重分: {task.priorityScore}</span>
        </div>
      </div>

      {/* 悬浮操作按钮组与状态徽标 */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* 鼠标悬浮时呈现的操作按钮 */}
        <div className="hidden items-center gap-1 group-hover:flex transition-all">
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
  );
}

export function TodayPage() {
  const queryClient = useQueryClient();
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(false);
  // 已完成事项默认收起
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

  // 动画状态映射: taskId -> Action
  const [taskAnimActions, setTaskAnimActions] = useState<Map<string, TaskRowAnimAction>>(new Map());
  const [trashAnimActions, setTrashAnimActions] = useState<Map<string, 'restore' | 'delete'>>(
    new Map(),
  );

  // 弹窗与详情状态
  const [detailTask, setDetailTask] = useState<TaskView | null>(null);
  const [editingTask, setEditingTask] = useState<TaskView | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  // 回收站多选状态
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());

  // 编辑表单字段
  const [editTitle, setEditTitle] = useState('');
  const [editImportance, setEditImportance] = useState<TaskView['importance']>('normal');
  const [editDueDate, setEditDueDate] = useState('');

  // 撤销 Toast
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (editingTask) {
      setEditTitle(editingTask.title);
      setEditImportance(editingTask.importance);
      setEditDueDate(editingTask.dueAt ? editingTask.dueAt.slice(0, 10) : '');
    }
  }, [editingTask]);

  const today = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday });
  const trashQuery = useQuery({
    queryKey: TRASH_KEY,
    queryFn: fetchTrash,
    enabled: isTrashOpen,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: TODAY_KEY });
    void queryClient.invalidateQueries({ queryKey: TRASH_KEY });
  };

  const create = useMutation({
    mutationFn: postTask,
    onSuccess: () => invalidate(),
  });

  const complete = useMutation({
    mutationFn: postComplete,
    onSuccess: () => invalidate(),
  });

  const uncomplete = useMutation({
    mutationFn: postUncomplete,
    onSuccess: () => invalidate(),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => patchTask(id, input),
    onSuccess: () => {
      setEditingTask(null);
      invalidate();
    },
  });

  const trash = useMutation({
    mutationFn: postTrash,
    onSuccess: () => invalidate(),
  });

  const restore = useMutation({
    mutationFn: postRestore,
    onSuccess: () => invalidate(),
  });

  const deletePermanently = useMutation({
    mutationFn: deleteTaskPermanently,
    onSuccess: () => invalidate(),
  });

  const batchRestoreMut = useMutation({
    mutationFn: (ids: string[]) => postBatchRestore(ids),
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidate();
    },
  });

  const batchDeleteMut = useMutation({
    mutationFn: (ids: string[]) => postBatchDelete(ids),
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidate();
    },
  });

  const restoreAllMut = useMutation({
    mutationFn: postRestoreAll,
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidate();
    },
  });

  const clearTrashMut = useMutation({
    mutationFn: postClearTrash,
    onSuccess: () => {
      setSelectedTrashIds(new Set());
      invalidate();
    },
  });

  // 逾期横幅从 0 到 1 与从 1 到 0（清空）的过渡动画状态管理
  const currentOverdueCount = today.data?.overdue.length ?? 0;
  const [renderedOverdueItems, setRenderedOverdueItems] = useState<TaskView[]>(
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
      // 1 到 0：触发平滑收起高度与折叠淡出动画
      setOverdueAnimClass('animate-collapse-out');
      const timer = setTimeout(() => {
        setRenderedOverdueItems([]);
        setOverdueAnimClass('');
      }, 400);
      return () => clearTimeout(timer);
    }
    prevOverdueCountRef.current = currentOverdueCount;
  }, [currentOverdueCount, today.data?.overdue]);

  // 已完成折叠区从 0 到 1 与从 1 到 0 的过渡动画状态管理
  const currentDoneCount = (today.data?.completed ?? []).length;
  const [renderedDoneTasks, setRenderedDoneTasks] = useState<TaskView[]>(
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
      // 1 到 0：触发平滑收起高度与折叠淡出动画
      setDoneSectionAnimClass('animate-collapse-out');
      const timer = setTimeout(() => {
        setRenderedDoneTasks([]);
        setDoneSectionAnimClass('');
      }, 400);
      return () => clearTimeout(timer);
    }
    prevDoneCountRef.current = currentDoneCount;
  }, [currentDoneCount, today.data?.completed]);

  /**
   * 待办完成（乐观缓存同步 + 杜绝闪烁）：
   */
  function handleComplete(id: string) {
    setTaskAnimActions((prev) => new Map(prev).set(id, 'complete'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        const targetTask =
          old.tasks.find((t) => t.id === id) || old.overdue.find((t) => t.id === id);
        if (!targetTask) return old;
        const doneTask: TaskView = { ...targetTask, status: 'done' };
        return {
          ...old,
          tasks: old.tasks.filter((t) => t.id !== id),
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

  /**
   * 取消完成/重新打开待办（乐观缓存同步 + 杜绝闪烁）：
   */
  function handleUncomplete(id: string) {
    setTaskAnimActions((prev) => new Map(prev).set(id, 'uncomplete'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        const targetTask = (old.completed ?? []).find((t) => t.id === id);
        if (!targetTask) return old;
        const reopenedTask: TaskView = { ...targetTask, status: 'todo' };
        return {
          ...old,
          completed: (old.completed ?? []).filter((t) => t.id !== id),
          tasks: [...old.tasks.filter((t) => t.id !== id), reopenedTask],
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

  /**
   * 移至回收站（乐观缓存同步 + 杜绝闪烁）：
   */
  function handleTrash(taskItem: TaskView) {
    setTaskAnimActions((prev) => new Map(prev).set(taskItem.id, 'trash'));

    setTimeout(() => {
      queryClient.setQueryData<TodayResponse>(TODAY_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.filter((t) => t.id !== taskItem.id),
          overdue: old.overdue.filter((t) => t.id !== taskItem.id),
          completed: (old.completed ?? []).filter((t) => t.id !== taskItem.id),
        };
      });

      queryClient.setQueryData<TrashResponse>(TRASH_KEY, (old) => {
        if (!old) return old;
        const trashedItem: TaskView = { ...taskItem, status: 'cancelled' };
        return {
          ...old,
          items: [trashedItem, ...old.items.filter((i) => i.id !== taskItem.id)],
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

  function handleTrashSingleRestore(id: string) {
    setTrashAnimActions((prev) => new Map(prev).set(id, 'restore'));
    setTimeout(() => {
      queryClient.setQueryData<TrashResponse>(TRASH_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((i) => i.id !== id),
        };
      });

      setTrashAnimActions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      restore.mutate(id);
    }, 730);
  }

  function handleTrashSingleDelete(id: string) {
    setTrashAnimActions((prev) => new Map(prev).set(id, 'delete'));
    setTimeout(() => {
      queryClient.setQueryData<TrashResponse>(TRASH_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((i) => i.id !== id),
        };
      });

      setTrashAnimActions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      deletePermanently.mutate(id);
    }, 730);
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
        <p className="mt-3 text-xs font-medium text-muted">正在加载今日数据…</p>
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

  const { date, tasks, completed: completedTasks = [] } = today.data;
  const greeting = getGreeting(date);

  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks = completedTasks;
  const totalTasksCount = pendingTasks.length + doneTasks.length;
  const targetCompletionRate =
    totalTasksCount > 0 ? Math.round((doneTasks.length / totalTasksCount) * 100) : 0;

  const trashItems = trashQuery.data?.items ?? [];
  const trashIds = trashItems.map((i) => i.id);
  const isAllTrashSelected = trashItems.length > 0 && selectedTrashIds.size === trashItems.length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 左侧 2 栏：统一定义一次自上而下划入动效 */}
      <div className="space-y-6 lg:col-span-2 animate-slide-down-in">
        {/* 头部：今日问候与日期聚焦 */}
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-wider text-accent uppercase">
              {date} · 今日执行舱
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {greeting.title}
            </h1>
            <p className="mt-1 text-xs text-secondary">
              今日共 {totalTasksCount} 项任务，已达成 {doneTasks.length} 项（
              {targetCompletionRate}%）
            </p>
          </div>

          {/* 回收站入口按钮 */}
          <button
            type="button"
            onClick={() => setIsTrashOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-secondary hover:border-line hover:bg-surface-2 hover:text-ink transition shadow-2xs self-start sm:self-auto"
          >
            <IconTrash size={13} className="text-muted" />
            <span>回收站</span>
          </button>
        </div>

        {/* 逾期任务智能折叠横幅（从 0 到 1 展开滑入，从 1 到 0 清空平滑折叠收起） */}
        {renderedOverdueItems.length > 0 && (
          <section
            className={`overflow-hidden rounded-panel border border-critical/30 bg-critical-soft/60 transition-all shadow-xs ${overdueAnimClass}`}
            aria-label="逾期任务警告"
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
                  有 {renderedOverdueItems.length} 项已逾期任务，建议优先推进或调整计划
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-critical">
                <span>{isOverdueExpanded ? '收起' : '展开查看'}</span>
                {isOverdueExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </div>
            </button>

            {isOverdueExpanded && (
              <div className="border-t border-critical/20 px-3 py-3 space-y-1 bg-surface/80">
                {renderedOverdueItems.map((t) => (
                  <TaskItemRow
                    key={t.id}
                    task={t}
                    animAction={taskAnimActions.get(t.id) ?? null}
                    onComplete={handleComplete}
                    onEdit={setEditingTask}
                    onDetail={setDetailTask}
                    onTrash={handleTrash}
                    disabled={complete.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 待办事项列表卡片 */}
        <Panel
          className="hover-lift"
          title="今日待办事项"
          hint={`${pendingTasks.length} 项进行中 · ${doneTasks.length} 项已完成`}
        >
          {pendingTasks.length === 0 && renderedDoneTasks.length === 0 ? (
            <div className="animate-fade-in">
              <EmptyState
                title="今天还没有任何安排"
                description="随手在下方记录第一件事，开始充实高效的一天吧。"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* 进行中待办列表 */}
              {pendingTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {pendingTasks.map((task, idx) => {
                    const isCurrent = idx === 0;
                    return (
                      <TaskItemRow
                        key={task.id}
                        task={task}
                        isCurrent={isCurrent}
                        animAction={taskAnimActions.get(task.id) ?? null}
                        onComplete={handleComplete}
                        onEdit={setEditingTask}
                        onDetail={setDetailTask}
                        onTrash={handleTrash}
                        disabled={complete.isPending}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-control border border-good/30 bg-good-soft/40 p-3.5 text-center animate-expand-in">
                  <span className="text-sm font-bold text-good">
                    🎉 棒极了！今日待办已全部完成，尽情享受专注带来的成果吧。
                  </span>
                </div>
              )}

              {/* 已完成事项分组折叠区（从 0 到 1 展开，从 1 到 0 平滑折叠收起） */}
              {renderedDoneTasks.length > 0 && (
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
                      {renderedDoneTasks.map((task) => (
                        <TaskItemRow
                          key={task.id}
                          task={task}
                          animAction={taskAnimActions.get(task.id) ?? null}
                          onComplete={handleUncomplete}
                          onEdit={setEditingTask}
                          onDetail={setDetailTask}
                          onTrash={handleTrash}
                          disabled={uncomplete.isPending}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* 快速收集栏 */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-secondary">
            <span>快速收集箱</span>
            <span className="text-[11px] text-muted">随时捕捉灵感与事务</span>
          </div>
          <QuickAddBar
            onAdd={({ title, importance, dueDate }) =>
              create.mutate({ title, importance, dueDate })
            }
            disabled={create.isPending}
          />
        </div>

        {/* 错误提示条 */}
        {create.isError && (
          <div className="rounded-control border border-critical/30 bg-critical-soft p-3 text-xs text-critical">
            添加任务失败：{create.error.message}
          </div>
        )}
        {update.isError && (
          <div className="rounded-control border border-critical/30 bg-critical-soft p-3 text-xs text-critical">
            更新任务失败：{update.error.message}
          </div>
        )}
      </div>

      {/* 右侧 1 栏：统一定义一次自右向左划入动效 */}
      <div className="space-y-5 animate-slide-right-in">
        {/* 今日实时时分秒与日期卡片 */}
        <TodayClockCard />

        {/* 今日执行度仪表盘卡片（内部隔离 60fps 缓动动画，保障列表极致丝滑） */}
        <TodayExecutionCard doneCount={doneTasks.length} totalCount={totalTasksCount} />

        {/* 目标推进概览 */}
        <Panel
          className="hover-lift"
          title={
            <div className="flex items-center gap-2">
              <IconTarget size={16} className="text-goal" />
              <span>目标推进</span>
            </div>
          }
        >
          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-ink">个人工作台正式版</span>
                <span className="text-goal tabular-nums">75%</span>
              </div>
              <ProgressBar value={75} tone="goal" size="sm" className="mt-1.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-ink">秋招投递与面试攻坚</span>
                <span className="text-accent tabular-nums">48%</span>
              </div>
              <ProgressBar value={48} tone="accent" size="sm" className="mt-1.5" />
            </div>
          </div>
        </Panel>

        {/* 习惯打卡上下文 */}
        <Panel
          className="hover-lift"
          title={
            <div className="flex items-center gap-2">
              <IconFlame size={16} className="text-habit" />
              <span>今日习惯</span>
            </div>
          }
          hint="2 / 3 完成"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-control bg-surface-2/60 p-2">
              <div className="flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-good text-white text-[10px]">
                  ✓
                </span>
                <span className="font-medium text-ink">深度阅读 30 分钟</span>
              </div>
              <Chip tone="good">已完成</Chip>
            </div>
            <div className="flex items-center justify-between rounded-control bg-surface-2/60 p-2">
              <div className="flex items-center gap-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-good text-white text-[10px]">
                  ✓
                </span>
                <span className="font-medium text-ink">有氧运动 40 分钟</span>
              </div>
              <Chip tone="good">已完成</Chip>
            </div>
            <div className="flex items-center justify-between rounded-control bg-surface-2/60 p-2">
              <div className="flex items-center gap-2">
                <span className="size-4 rounded-full border border-line bg-surface" />
                <span className="font-medium text-ink">晚间复盘与明日规划</span>
              </div>
              <Chip tone="neutral">待完成</Chip>
            </div>
          </div>
        </Panel>

        {/* 复盘引导小卡片 */}
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

      {/* 任务详情弹窗 */}
      <Modal
        isOpen={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        title="待办事项详情"
        description={`来源模块：${detailTask ? detailTask.sourceModule : ''}`}
      >
        {detailTask && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="text-sm font-bold text-ink">{detailTask.title}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={detailTask.status === 'done' ? 'good' : 'accent'}>
                  {detailTask.status === 'done' ? '已完成' : '待办中'}
                </Chip>
                {detailTask.isImportantQuadrant && <Chip tone="warning">重要事项</Chip>}
                <Chip tone={URGENCY_TONE[detailTask.urgency]}>
                  {URGENCY_LABEL[detailTask.urgency]}
                </Chip>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-control bg-surface-2 p-3 border border-line/60">
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
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              {detailTask.sourceModule === TODO_MODULE_ID && (
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
              {detailTask.status !== 'done' && detailTask.sourceModule === TODO_MODULE_ID ? (
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
                detailTask.sourceModule === TODO_MODULE_ID && (
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
        )}
      </Modal>

      {/* 任务编辑弹窗 */}
      <Modal
        isOpen={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        title="编辑待办事项"
        description="修改任务标题、重要程度与截止时间"
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
                },
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

      {/* 待办回收站弹窗（带出现与离开过渡动画、支持多选批量操作与全部恢复/删除） */}
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
              {/* 操作控制工具栏 */}
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

              {/* 回收站待办列表 */}
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {trashItems.map((item) => {
                  const isSelected = selectedTrashIds.has(item.id);
                  const trashAction = trashAnimActions.get(item.id);
                  const isRestoring = trashAction === 'restore';
                  const isDeleting = trashAction === 'delete';

                  let itemClass =
                    'border-line bg-surface-2/50 hover:border-line hover:bg-surface-2 max-h-28 opacity-100 translate-x-0 transition-all duration-200 ease-out';

                  if (isRestoring) {
                    itemClass = 'animate-task-complete-out';
                  } else if (isDeleting) {
                    itemClass = 'animate-task-trash-out';
                  } else if (isSelected) {
                    itemClass =
                      'border-accent/40 bg-accent-soft/40 shadow-2xs max-h-28 opacity-100 translate-x-0 transition-all duration-150';
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
                          onClick={() => handleTrashSingleRestore(item.id)}
                          disabled={restore.isPending}
                        >
                          恢复
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTrashSingleDelete(item.id)}
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
