import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Chip, IconFlame, Panel, ProgressBar, useTimezone } from '@workbench/ui';
import {
  deleteCheckin,
  fetchToday,
  putCheckin,
  type TodayHabit,
  type TodayResponse,
} from '../api.js';

export interface TodayHabitCardProps {
  variant?: 'panel' | 'calendar';
  className?: string;
}

export function TodayHabitCard({ variant = 'panel', className = '' }: TodayHabitCardProps) {
  const { formatUtcToLocal } = useTimezone();
  const clientToday = useMemo(
    () => formatUtcToLocal(new Date().toISOString()).date || new Date().toISOString().slice(0, 10),
    [formatUtcToLocal],
  );

  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['habit', 'today', clientToday] as const, [clientToday]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchToday(clientToday),
  });

  const dueTodayHabits = useMemo(() => {
    return (data?.habits ?? []).filter((h) => h.dueToday && !h.habit.archivedAt);
  }, [data]);

  const totalCount = dueTodayHabits.length;
  const completedCount = useMemo(() => {
    return dueTodayHabits.filter((h) => h.progress.current >= h.progress.target).length;
  }, [dueTodayHabits]);

  const checkinMutation = useMutation({
    mutationFn: async ({
      habitId,
      date,
      value,
    }: {
      habitId: string;
      date: string;
      value: number;
    }) => {
      if (value <= 0) {
        await deleteCheckin(habitId, date, clientToday);
      } else {
        await putCheckin(habitId, date, { value, clientToday });
      }
    },
    onMutate: async ({ habitId, value }) => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TodayResponse>(queryKey);

      queryClient.setQueryData<TodayResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          habits: old.habits.map((item) => {
            if (item.habit.id !== habitId) return item;
            const newCurrent = Math.max(0, value);
            const target = item.progress.target;
            const wasDone = item.progress.current >= target;
            const isNowDone = newCurrent >= target;
            let streakDelta = 0;
            if (isNowDone && !wasDone) streakDelta = 1;
            else if (!isNowDone && wasDone) streakDelta = -1;

            return {
              ...item,
              progress: { ...item.progress, current: newCurrent },
              streak: Math.max(0, item.streak + streakDelta),
            };
          }),
        };
      });

      return { previousData };
    },
    onError: (err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      const msg = err instanceof Error ? err.message : '打卡失败';
      setErrorMessage(msg);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const handleToggleBoolean = (item: TodayHabit) => {
    const isCompleted = item.progress.current >= item.progress.target;
    const nextValue = isCompleted ? 0 : item.progress.target;
    checkinMutation.mutate({
      habitId: item.habit.id,
      date: clientToday,
      value: nextValue,
    });
  };

  const handleStep = (item: TodayHabit, delta: number) => {
    const nextValue = Math.max(0, item.progress.current + delta);
    checkinMutation.mutate({
      habitId: item.habit.id,
      date: clientToday,
      value: nextValue,
    });
  };

  const isAllCompleted = totalCount > 0 && completedCount === totalCount;
  const hintText = `${completedCount} / ${totalCount} 完成`;

  const content = (
    <div className="space-y-2 text-xs">
      {errorMessage && (
        <div className="flex items-center justify-between rounded-control bg-danger/10 border border-danger/20 px-2.5 py-1.5 text-[11px] text-danger animate-fade-in">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="hover:opacity-75 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading && (
        <div className="py-4 text-center text-muted text-xs animate-pulse">正在加载习惯...</div>
      )}

      {error && !isLoading && (
        <div className="py-3 text-center text-danger text-xs">
          加载习惯失败: {error instanceof Error ? error.message : '未知错误'}
        </div>
      )}

      {!isLoading && !error && dueTodayHabits.length === 0 && (
        <div className="py-4 text-center text-muted text-xs">今日暂无待完成习惯</div>
      )}

      {!isLoading &&
        !error &&
        dueTodayHabits.map((item) => {
          const isDone = item.progress.current >= item.progress.target;
          const isBoolean = item.habit.targetValue === 1;

          return (
            <div
              key={item.habit.id}
              className="flex flex-col gap-1 rounded-control bg-surface-2/60 p-2 transition-all duration-150 hover:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none"
                  onClick={() => handleToggleBoolean(item)}
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-full transition-colors text-[10px] ${
                      isDone
                        ? 'bg-good text-white font-bold shadow-xs'
                        : 'border border-line bg-surface hover:border-accent'
                    }`}
                  >
                    {isDone ? '✓' : ''}
                  </span>
                  <span
                    className={`font-medium truncate ${
                      isDone ? 'text-ink line-through opacity-75' : 'text-ink'
                    }`}
                  >
                    {item.habit.name}
                  </span>
                  {item.streak > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-habit shrink-0"
                      title={`连续 ${item.streak} 天达标`}
                    >
                      <IconFlame size={11} className="text-habit" />
                      {item.streak}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isBoolean ? (
                    <button
                      type="button"
                      className="cursor-pointer transition-transform active:scale-95"
                      onClick={() => handleToggleBoolean(item)}
                    >
                      <Chip tone={isDone ? 'good' : 'neutral'}>{isDone ? '已完成' : '待完成'}</Chip>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={checkinMutation.isPending || item.progress.current <= 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStep(item, -1);
                        }}
                        className="flex size-5 items-center justify-center rounded-control bg-surface border border-line hover:bg-surface-2 disabled:opacity-30 text-ink text-xs font-bold transition-colors cursor-pointer"
                        title="减少"
                      >
                        -
                      </button>
                      <span className="tabular-nums text-xs font-semibold text-ink px-1 min-w-[32px] text-center">
                        {item.progress.current}/{item.progress.target}
                        {item.habit.unit ? (
                          <span className="text-[10px] text-muted ml-0.5">{item.habit.unit}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        disabled={checkinMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStep(item, 1);
                        }}
                        className="flex size-5 items-center justify-center rounded-control bg-surface border border-line hover:bg-surface-2 disabled:opacity-30 text-ink text-xs font-bold transition-colors cursor-pointer"
                        title="增加"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer ml-1 transition-transform active:scale-95"
                        onClick={() => handleToggleBoolean(item)}
                      >
                        <Chip tone={isDone ? 'good' : 'neutral'}>{isDone ? '已达标' : '打卡'}</Chip>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!isBoolean && item.progress.target > 1 && (
                <ProgressBar
                  value={Math.min(
                    100,
                    Math.round((item.progress.current / item.progress.target) * 100),
                  )}
                  tone={isDone ? 'good' : 'habit'}
                  size="sm"
                  className="mt-0.5"
                />
              )}
            </div>
          );
        })}
    </div>
  );

  if (variant === 'calendar') {
    return (
      <div
        className={`rounded-panel border border-line bg-surface p-3.5 shadow-xs space-y-2 animate-slide-right-in stagger-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <IconFlame size={14} className="text-habit" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">今日习惯</h3>
          </div>
          <Chip tone={isAllCompleted ? 'good' : 'neutral'}>{hintText}</Chip>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Panel
      className={`hover-lift ${className}`}
      title={
        <div className="flex items-center gap-2">
          <IconFlame size={16} className="text-habit" />
          <span>今日习惯</span>
        </div>
      }
      hint={hintText}
    >
      {content}
    </Panel>
  );
}
