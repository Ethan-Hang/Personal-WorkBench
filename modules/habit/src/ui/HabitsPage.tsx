import { useState, useMemo, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  DatePicker,
  EmptyState,
  Field,
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconFlame,
  IconPlus,
  IconTrash,
  Modal,
  PageHeader,
  Panel,
  Switch,
  controlClass,
  useTimezone,
} from '@workbench/ui';
import {
  CHECKIN_BACKFILL_DAYS,
  type CreateHabitInput,
  type FreqKind,
  type HabitView,
  type UpdateHabitInput,
} from '../contract.js';
import {
  deleteCheckin,
  deleteHabit,
  fetchHabits,
  fetchHistory,
  patchHabit,
  postArchive,
  postHabit,
  postUnarchive,
  putCheckin,
  type HistoryResponse,
} from './api.js';
import { addDays, isDueOn, progressFor, startOfWeek, streakOf } from '../server/frequency.js';

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
const COLOR_TOKENS = ['habit', 'good', 'accent', 'goal', 'warning', 'critical'] as const;

function formatFrequency(habit: HabitView): string {
  switch (habit.freqKind) {
    case 'daily':
      return habit.targetValue > 1 ? `每天 ${habit.targetValue} ${habit.unit ?? ''}` : '每天打卡';
    case 'weekdays': {
      const days = (habit.weekdays ?? [])
        .slice()
        .sort((a, b) => a - b)
        .map((d) => `周${WEEKDAY_NAMES[d - 1]}`)
        .join('、');
      return `每周 ${days}`;
    }
    case 'weekly-count':
      return `每周 ${habit.weeklyCount ?? 1} 次`;
  }
}

/** 单个习惯的热力图与统计卡片 */
function HabitCard({
  habit,
  clientToday,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onArchiveToggle,
  onDelete,
}: {
  habit: HabitView;
  clientToday: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();

  // 热力图区间：展示最近 16 周（112 天）
  const { fromDate, toDate, weeks } = useMemo(() => {
    const end = clientToday;
    const currentWeekStart = startOfWeek(end);
    const start = addDays(currentWeekStart, -15 * 7); // 16 周的周一

    const weekList: { weekStart: string; days: string[] }[] = [];
    for (let w = 0; w < 16; w += 1) {
      const wStart = addDays(start, w * 7);
      const days: string[] = [];
      for (let d = 0; d < 7; d += 1) {
        days.push(addDays(wStart, d));
      }
      weekList.push({ weekStart: wStart, days });
    }

    return { fromDate: start, toDate: end, weeks: weekList };
  }, [clientToday]);

  const historyQuery = useQuery({
    queryKey: ['habit', 'history', habit.id, fromDate, toDate],
    queryFn: () => fetchHistory(habit.id, fromDate, toDate),
  });

  const checkins = useMemo(() => historyQuery.data?.checkins ?? [], [historyQuery.data]);

  const checkinMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of checkins) {
      map.set(c.date, c.value);
    }
    return map;
  }, [checkins]);

  // 派生各项统计数据
  const freqObj = useMemo(
    () => ({
      freqKind: habit.freqKind,
      weekdays: habit.weekdays,
      weeklyCount: habit.weeklyCount,
      startDate: habit.startDate,
      targetValue: habit.targetValue,
    }),
    [habit],
  );

  const currentStreak = useMemo(() => {
    return streakOf(
      freqObj,
      checkins.map((c) => ({ habitId: habit.id, date: c.date, value: c.value })),
      clientToday,
    );
  }, [freqObj, checkins, habit.id, clientToday]);

  // 本周完成率
  const weekRate = useMemo(() => {
    if (habit.freqKind === 'weekly-count') {
      const p = progressFor(
        freqObj,
        clientToday,
        checkins.map((c) => ({ habitId: habit.id, date: c.date, value: c.value })),
      );
      return p.target > 0 ? Math.min(100, Math.round((p.current / p.target) * 100)) : 100;
    }
    const currentMonday = startOfWeek(clientToday);
    let dueCount = 0;
    let metCount = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(currentMonday, i);
      if (d > clientToday) break;
      if (isDueOn(freqObj, d)) {
        dueCount += 1;
        if ((checkinMap.get(d) ?? 0) >= habit.targetValue) {
          metCount += 1;
        }
      }
    }
    return dueCount > 0 ? Math.round((metCount / dueCount) * 100) : 100;
  }, [freqObj, habit.freqKind, habit.targetValue, clientToday, checkins, checkinMap]);

  // 本月完成率
  const monthRate = useMemo(() => {
    const monthStart = `${clientToday.slice(0, 7)}-01`;
    let dueCount = 0;
    let metCount = 0;
    let cursor = monthStart;
    while (cursor <= clientToday) {
      if (isDueOn(freqObj, cursor)) {
        dueCount += 1;
        if ((checkinMap.get(cursor) ?? 0) >= habit.targetValue) {
          metCount += 1;
        }
      }
      cursor = addDays(cursor, 1);
    }
    return dueCount > 0 ? Math.round((metCount / dueCount) * 100) : 100;
  }, [freqObj, habit.targetValue, clientToday, checkinMap]);

  // 7 天窗口内允许补卡，窗口外渲染为禁用态
  const backfillStart = useMemo(
    () => addDays(clientToday, -(CHECKIN_BACKFILL_DAYS - 1)),
    [clientToday],
  );

  const checkinMutation = useMutation({
    mutationFn: async ({ date, value }: { date: string; value: number }) => {
      if (value <= 0) {
        await deleteCheckin(habit.id, date, clientToday);
      } else {
        await putCheckin(habit.id, date, { value, clientToday });
      }
    },
    onMutate: async ({ date, value }) => {
      const qKey = ['habit', 'history', habit.id, fromDate, toDate];
      await queryClient.cancelQueries({ queryKey: qKey });
      const previousData = queryClient.getQueryData<HistoryResponse>(qKey);

      queryClient.setQueryData<HistoryResponse>(qKey, (old) => {
        if (!old) return old;
        const exists = old.checkins.some((c) => c.date === date);
        const nextCheckins =
          value <= 0
            ? old.checkins.filter((c) => c.date !== date)
            : exists
              ? old.checkins.map((c) => (c.date === date ? { ...c, value } : c))
              : [...old.checkins, { date, value }];
        return { ...old, checkins: nextCheckins };
      });

      return { previousData, qKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(context.qKey, context.previousData);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const handleCellClick = (date: string) => {
    if (date > clientToday || date < backfillStart) return;
    const currentVal = checkinMap.get(date) ?? 0;
    const isDone = currentVal >= habit.targetValue;
    const nextVal = isDone ? 0 : habit.targetValue;
    checkinMutation.mutate({ date, value: nextVal });
  };

  const isArchived = Boolean(habit.archivedAt);

  return (
    <Panel className="transition-all duration-200 hover:border-line-strong">
      {/* 习惯头部信息 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-control border ${
              isArchived
                ? 'bg-surface-2 text-muted border-line'
                : 'bg-habit-soft text-habit border-habit/30'
            }`}
          >
            <IconFlame size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-bold ${
                  isArchived ? 'text-muted line-through' : 'text-ink'
                }`}
              >
                {habit.name}
              </h3>
              {isArchived ? (
                <Chip tone="neutral">已归档</Chip>
              ) : (
                <Chip tone="habit">{formatFrequency(habit)}</Chip>
              )}
            </div>
            {habit.notes && (
              <p className="text-xs text-secondary mt-0.5 line-clamp-1">{habit.notes}</p>
            )}
          </div>
        </div>

        {/* 顶部操作条 */}
        <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            disabled={isFirst}
            onClick={onMoveUp}
            className="flex size-7 items-center justify-center rounded-control border border-line bg-surface text-secondary hover:bg-surface-2 hover:text-ink disabled:opacity-30 transition-colors cursor-pointer"
            title="上移"
          >
            <IconArrowUp size={14} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={onMoveDown}
            className="flex size-7 items-center justify-center rounded-control border border-line bg-surface text-secondary hover:bg-surface-2 hover:text-ink disabled:opacity-30 transition-colors cursor-pointer"
            title="下移"
          >
            <IconArrowDown size={14} />
          </button>
          <Button variant="ghost" size="sm" onClick={onEdit} icon={<IconEdit size={14} />}>
            编辑
          </Button>
          <Button variant="ghost" size="sm" onClick={onArchiveToggle}>
            {isArchived ? '恢复' : '归档'}
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete} icon={<IconTrash size={14} />}>
            删除
          </Button>
        </div>
      </div>

      {/* KPI 概览指标 */}
      <div className="grid grid-cols-3 gap-2 my-3 rounded-control bg-surface-2/50 p-2.5 text-center">
        <div>
          <div className="text-[11px] text-muted font-medium">连续达标</div>
          <div className="text-sm font-bold text-habit tabular-nums mt-0.5 flex items-center justify-center gap-1">
            <IconFlame size={14} />
            <span>{currentStreak} 天</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted font-medium">本周完成率</div>
          <div className="text-sm font-bold text-ink tabular-nums mt-0.5">{weekRate}%</div>
        </div>
        <div>
          <div className="text-[11px] text-muted font-medium">本月完成率</div>
          <div className="text-sm font-bold text-ink tabular-nums mt-0.5">{monthRate}%</div>
        </div>
      </div>

      {/* 热力图看板 */}
      <div className="mt-3 pt-3 border-t border-line/60">
        <div className="flex items-center justify-between text-[11px] text-muted mb-2">
          <span>
            打卡热力图（近 16 周）·{' '}
            <span className="text-ink font-medium">仅最近 7 天可点选补卡</span>
          </span>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="size-2.5 rounded-xs bg-surface-2 border border-line" />
            <span>未打卡</span>
            <span className="size-2.5 rounded-xs bg-good" />
            <span>已达标</span>
          </div>
        </div>

        {/* 热力图网格 */}
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex gap-1 min-w-full">
            {/* 星期标签列 */}
            <div className="flex flex-col gap-1 pr-1 text-[9px] text-muted shrink-0 select-none">
              {WEEKDAY_NAMES.map((name, i) => (
                <div key={name} className="size-3.5 flex items-center justify-center font-medium">
                  {i % 2 === 0 ? name : ''}
                </div>
              ))}
            </div>

            {/* 各周列 */}
            {weeks.map((w) => (
              <div key={w.weekStart} className="flex flex-col gap-1 shrink-0">
                {w.days.map((date) => {
                  const val = checkinMap.get(date) ?? 0;
                  const isDone = val >= habit.targetValue;
                  const isFuture = date > clientToday;
                  const isBackfillable = !isFuture && date >= backfillStart && date <= clientToday;
                  const isToday = date === clientToday;

                  let bgClass = 'bg-surface-2/60 border-line/40';
                  if (isDone) {
                    bgClass = 'bg-good text-white border-good shadow-xs';
                  } else if (val > 0) {
                    bgClass = 'bg-good-soft text-good border-good/40';
                  }

                  let cursorClass = 'cursor-pointer hover:scale-125 hover:z-10';
                  if (isFuture) {
                    cursorClass = 'opacity-20 cursor-not-allowed';
                  } else if (!isBackfillable) {
                    cursorClass = 'cursor-not-allowed opacity-60 hover:ring-0';
                  }

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={!isBackfillable}
                      onClick={() => handleCellClick(date)}
                      title={`${date} ${isDone ? '已达标' : '未打卡'}${
                        !isBackfillable && !isFuture ? '（已超出 7 天补卡窗口）' : ''
                      }`}
                      className={`size-3.5 rounded-xs border transition-transform relative ${bgClass} ${cursorClass} ${
                        isToday ? 'ring-1.5 ring-accent' : ''
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** 习惯创建 / 编辑表单弹窗 */
function HabitModal({
  isOpen,
  initialData,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  initialData?: HabitView | null;
  onClose: () => void;
  onSubmit: (input: CreateHabitInput) => Promise<void>;
}) {
  const { formatUtcToLocal } = useTimezone();
  const todayStr = useMemo(
    () => formatUtcToLocal(new Date().toISOString()).date || new Date().toISOString().slice(0, 10),
    [formatUtcToLocal],
  );

  const [name, setName] = useState(initialData?.name ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [targetValue, setTargetValue] = useState(initialData?.targetValue ?? 1);
  const [unit, setUnit] = useState(initialData?.unit ?? '次');
  const [freqKind, setFreqKind] = useState<FreqKind>(initialData?.freqKind ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(initialData?.weekdays ?? [1, 2, 3, 4, 5]);
  const [weeklyCount, setWeeklyCount] = useState(initialData?.weeklyCount ?? 3);
  const [startDate, setStartDate] = useState(initialData?.startDate ?? todayStr);
  const [colorToken, setColorToken] = useState(initialData?.colorToken ?? 'habit');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('请输入习惯名称');
      return;
    }
    if (freqKind === 'weekdays' && weekdays.length === 0) {
      setErrorMsg('请至少选择一个周几');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onSubmit({
        name: name.trim(),
        notes: notes.trim() || undefined,
        targetValue: Math.max(1, Number(targetValue) || 1),
        unit: unit.trim() || undefined,
        freqKind,
        weekdays: freqKind === 'weekdays' ? weekdays : undefined,
        weeklyCount: freqKind === 'weekly-count' ? weeklyCount : undefined,
        startDate,
        colorToken,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? '编辑习惯' : '新建习惯'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-2.5 rounded-control bg-danger/10 border border-danger/20 text-xs text-danger flex items-center gap-2">
            <IconAlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <Field label="习惯名称（必填）">
          <input
            type="text"
            className={controlClass}
            placeholder="例如：每日背单词、晨跑、深度阅读"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="目标数值（默认 1）">
            <input
              type="number"
              min={1}
              max={9999}
              className={controlClass}
              value={targetValue}
              onChange={(e) => setTargetValue(Number(e.target.value))}
            />
          </Field>
          <Field label="计量单位（如：次、分钟、页、杯）">
            <input
              type="text"
              className={controlClass}
              placeholder="次"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={16}
            />
          </Field>
        </div>

        <Field label="打卡频率">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setFreqKind('daily')}
              className={`p-2 rounded-control border text-xs font-semibold transition-colors cursor-pointer ${
                freqKind === 'daily'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-line text-ink hover:bg-surface-2'
              }`}
            >
              每天
            </button>
            <button
              type="button"
              onClick={() => setFreqKind('weekdays')}
              className={`p-2 rounded-control border text-xs font-semibold transition-colors cursor-pointer ${
                freqKind === 'weekdays'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-line text-ink hover:bg-surface-2'
              }`}
            >
              特定周几
            </button>
            <button
              type="button"
              onClick={() => setFreqKind('weekly-count')}
              className={`p-2 rounded-control border text-xs font-semibold transition-colors cursor-pointer ${
                freqKind === 'weekly-count'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-line text-ink hover:bg-surface-2'
              }`}
            >
              每周次数
            </button>
          </div>
        </Field>

        {freqKind === 'weekdays' && (
          <Field label="选择周几（至少选一项）">
            <div className="flex gap-1.5 justify-between">
              {WEEKDAY_NAMES.map((wName, idx) => {
                const dayNum = idx + 1;
                const isSelected = weekdays.includes(dayNum);
                return (
                  <button
                    key={wName}
                    type="button"
                    onClick={() => toggleWeekday(dayNum)}
                    className={`size-9 rounded-control border text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-habit text-white border-habit shadow-xs'
                        : 'bg-surface border-line text-secondary hover:bg-surface-2'
                    }`}
                  >
                    {wName}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {freqKind === 'weekly-count' && (
          <Field label="每周达标天数">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={7}
                value={weeklyCount}
                onChange={(e) => setWeeklyCount(Number(e.target.value))}
                className="flex-1 accent-habit cursor-pointer"
              />
              <span className="text-xs font-bold text-ink tabular-nums w-12 text-right">
                每周 {weeklyCount} 天
              </span>
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="开始日期">
            <DatePicker value={startDate} onChange={(val) => setStartDate(val || todayStr)} />
          </Field>
          <Field label="主题色调">
            <div className="flex items-center gap-2 pt-1">
              {COLOR_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setColorToken(token)}
                  className={`size-6 rounded-full border-2 transition-transform cursor-pointer ${
                    token === 'habit'
                      ? 'bg-[#167c65]'
                      : token === 'good'
                        ? 'bg-good'
                        : token === 'accent'
                          ? 'bg-accent'
                          : token === 'goal'
                            ? 'bg-[#7a4db1]'
                            : token === 'warning'
                              ? 'bg-warning'
                              : 'bg-critical'
                  } ${
                    colorToken === token
                      ? 'scale-125 border-ink'
                      : 'border-transparent hover:scale-110 opacity-75'
                  }`}
                  title={token}
                />
              ))}
            </div>
          </Field>
        </div>

        <Field label="备注说明（选填，记录习惯动机或奖励）">
          <textarea
            className={`${controlClass} h-18 resize-none`}
            placeholder="例如：完成后奖励自己看一集纪录片"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-line/60">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : initialData ? '更新习惯' : '创建习惯'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** 习惯模块一级页面 */
export function HabitsPage() {
  const { formatUtcToLocal } = useTimezone();
  const clientToday = useMemo(
    () => formatUtcToLocal(new Date().toISOString()).date || new Date().toISOString().slice(0, 10),
    [formatUtcToLocal],
  );

  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitView | null>(null);
  const [deletingHabit, setDeletingHabit] = useState<HabitView | null>(null);

  const habitsQuery = useQuery({
    queryKey: ['habit', 'habits', { includeArchived }],
    queryFn: () => fetchHabits({ includeArchived }),
  });

  const habits = useMemo(() => {
    return (habitsQuery.data?.habits ?? []).slice().sort((a, b) => a.position - b.position);
  }, [habitsQuery.data]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: postHabit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHabitInput }) => patchHabit(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => postArchive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => postUnarchive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHabit(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['habit'] });
      setDeletingHabit(null);
    },
  });

  // 排序上移与下移
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= habits.length) return;

    const current = habits[index];
    const target = habits[targetIndex];
    if (!current || !target) return;

    // 互换 position
    await updateMutation.mutateAsync({
      id: current.id,
      input: { position: target.position },
    });
    await updateMutation.mutateAsync({
      id: target.id,
      input: { position: current.position },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        title="习惯管理"
        subtitle="跟踪每日自律节律，查看 16 周连续打卡热力图与完成率统计。"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-secondary">
              <span>显示归档</span>
              <Switch checked={includeArchived} onChange={setIncludeArchived} />
            </div>
            <Button
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              icon={<IconPlus size={16} />}
            >
              新建习惯
            </Button>
          </div>
        }
      />

      {/* 习惯列表 */}
      {habitsQuery.isLoading && (
        <div className="py-12 text-center text-muted text-sm animate-pulse">
          正在加载习惯列表...
        </div>
      )}

      {habitsQuery.error && (
        <Panel className="border-danger/30 bg-danger/5">
          <div className="text-center py-4 text-xs text-danger">
            加载失败: {habitsQuery.error.message}
          </div>
        </Panel>
      )}

      {!habitsQuery.isLoading && !habitsQuery.error && habits.length === 0 && (
        <EmptyState
          icon={IconFlame}
          title={includeArchived ? '暂无任何习惯' : '暂无活跃习惯'}
          description="点击右上角「新建习惯」，建立你的第一个每日习惯吧！"
          action={
            <Button
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              icon={<IconPlus size={15} />}
            >
              立即新建
            </Button>
          }
        />
      )}

      {!habitsQuery.isLoading && habits.length > 0 && (
        <div className="space-y-4">
          {habits.map((habit, index) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              clientToday={clientToday}
              isFirst={index === 0}
              isLast={index === habits.length - 1}
              onMoveUp={() => handleMove(index, 'up')}
              onMoveDown={() => handleMove(index, 'down')}
              onEdit={() => setEditingHabit(habit)}
              onArchiveToggle={() => {
                if (habit.archivedAt) {
                  unarchiveMutation.mutate(habit.id);
                } else {
                  archiveMutation.mutate(habit.id);
                }
              }}
              onDelete={() => setDeletingHabit(habit)}
            />
          ))}
        </div>
      )}

      {/* 新建习惯 Modal */}
      {isCreateOpen && (
        <HabitModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
          }}
        />
      )}

      {/* 编辑习惯 Modal */}
      {editingHabit && (
        <HabitModal
          isOpen={Boolean(editingHabit)}
          initialData={editingHabit}
          onClose={() => setEditingHabit(null)}
          onSubmit={async (input) => {
            await updateMutation.mutateAsync({
              id: editingHabit.id,
              input,
            });
          }}
        />
      )}

      {/* 彻底删除确认 Modal */}
      {deletingHabit && (
        <Modal
          isOpen={Boolean(deletingHabit)}
          onClose={() => setDeletingHabit(null)}
          title="彻底删除习惯"
        >
          <div className="space-y-4 text-xs">
            <p className="text-ink">
              确定要彻底删除习惯「
              <strong className="font-bold">{deletingHabit.name}</strong>
              」吗？
            </p>
            <div className="rounded-control bg-danger/10 border border-danger/20 p-3 text-danger leading-relaxed">
              <strong>警告：</strong>
              删除操作将连同清除该习惯的所有历史打卡记录，不可撤销。如需保留历史打卡数据，建议使用「归档」功能。
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-line/60">
              <Button
                variant="secondary"
                onClick={() => setDeletingHabit(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(deletingHabit.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? '正在删除...' : '确认彻底删除'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
