import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Chip,
  Panel,
  ProgressBar,
  MetricRing,
  QuickAddBar,
  EmptyState,
  useModuleLabel,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconTarget,
  IconFlame,
  IconBookOpen,
} from '@workbench/ui';
import { TODO_MODULE_ID, type TaskView } from '../contract.js';
import { fetchToday, postComplete, postTask } from './api.js';

const TODAY_KEY = ['todo', 'today'] as const;

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

function TaskItemRow({
  task,
  isCurrent = false,
  onComplete,
  disabled = false,
}: {
  task: TaskView;
  isCurrent?: boolean;
  onComplete: (id: string) => void;
  disabled?: boolean;
}) {
  const isTodo = task.sourceModule === TODO_MODULE_ID;
  const sourceLabel = useModuleLabel(task.sourceModule);
  const isCompleted = task.status === 'done';

  return (
    <div
      className={`group flex items-center gap-3 rounded-control px-3 py-3 transition-all duration-200 ${
        isCurrent
          ? 'border border-accent/30 bg-accent-soft/70 shadow-xs'
          : 'border border-transparent hover:border-line hover:bg-surface-2/60'
      }`}
    >
      {/* 完成复选按钮 */}
      {isTodo ? (
        <button
          type="button"
          onClick={() => !disabled && onComplete(task.id)}
          disabled={disabled || isCompleted}
          aria-label={`完成任务：${task.title}`}
          className={`flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-all ${
            isCompleted
              ? 'border-good bg-good text-white'
              : 'border-line bg-surface hover:border-accent hover:bg-accent-soft'
          }`}
        >
          {isCompleted && <IconCheck size={13} />}
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
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-semibold tracking-tight transition-colors ${
              isCompleted
                ? 'text-muted line-through'
                : isCurrent
                  ? 'text-ink font-bold'
                  : 'text-ink'
            }`}
          >
            {task.title}
          </span>
          {isCurrent && (
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

      {/* 状态徽标与标签 */}
      <div className="flex shrink-0 items-center gap-1.5">
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

  const today = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: TODAY_KEY });

  const create = useMutation({
    mutationFn: postTask,
    onSuccess: () => {
      void invalidate();
    },
  });

  const complete = useMutation({
    mutationFn: postComplete,
    onSuccess: () => {
      void invalidate();
    },
  });

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

  const { date, tasks, overdue } = today.data;
  const greeting = getGreeting(date);

  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const totalTasksCount = tasks.length;
  const completionRate =
    totalTasksCount > 0 ? Math.round((doneTasks.length / totalTasksCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* 左侧 2 栏：统一定义一次优雅的自上而下划入动效 */}
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
              今日计划 {totalTasksCount} 个任务，其中 {pendingTasks.length} 项待处理
            </p>
          </div>
        </div>

        {/* 逾期任务智能折叠横幅 */}
        {overdue.length > 0 && (
          <section
            className="overflow-hidden rounded-panel border border-critical/30 bg-critical-soft/60 transition-all shadow-xs"
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
                  有 {overdue.length} 项已逾期任务，建议优先推进或调整计划
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-critical">
                <span>{isOverdueExpanded ? '收起' : '展开查看'}</span>
                {isOverdueExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </div>
            </button>

            {isOverdueExpanded && (
              <div className="border-t border-critical/20 px-3 py-3 space-y-1 bg-surface/80">
                {overdue.map((t) => (
                  <TaskItemRow
                    key={t.id}
                    task={t}
                    onComplete={(id) => complete.mutate(id)}
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
          {tasks.length === 0 ? (
            <EmptyState
              title="今天还没有任何安排"
              description="随手在下方记录第一件事，开始充实高效的一天吧。"
            />
          ) : (
            <div className="space-y-1.5">
              {tasks.map((task, idx) => {
                const isCurrent = idx === 0 && task.status !== 'done';
                return (
                  <TaskItemRow
                    key={task.id}
                    task={task}
                    isCurrent={isCurrent}
                    onComplete={(id) => complete.mutate(id)}
                    disabled={complete.isPending}
                  />
                );
              })}
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
        {complete.isError && (
          <div className="rounded-control border border-critical/30 bg-critical-soft p-3 text-xs text-critical">
            完成任务失败：{complete.error.message}
          </div>
        )}
      </div>

      {/* 右侧 1 栏：统一定义一次优雅的自右向左划入动效 */}
      <div className="space-y-5 animate-slide-right-in">
        {/* 今日执行度仪表盘卡片 */}
        <section className="relative overflow-hidden rounded-panel border border-slate-700/60 bg-gradient-to-br from-slate-900 via-[#182338] to-[#0f172a] text-white p-5 shadow-lg hover-lift">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
            <span>今日执行度</span>
            <span className="rounded-full bg-good/20 px-2 py-0.5 text-good font-bold text-[11px] border border-good/30">
              {completionRate >= 80 ? '节奏极佳' : completionRate >= 40 ? '稳步推进' : '蓄势待发'}
            </span>
          </div>

          <div className="my-4 flex items-center justify-between">
            <div>
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-white tabular-nums drop-shadow-sm">
                {completionRate}%
              </div>
              <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                已完成 <strong className="text-white font-bold">{doneTasks.length}</strong> /{' '}
                {totalTasksCount} 项任务。
                <br />
                <span className="text-slate-400">保持专注节奏，不必追赶。</span>
              </p>
            </div>
            <MetricRing
              value={completionRate}
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
                {doneTasks.length}/{totalTasksCount}
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
    </div>
  );
}
