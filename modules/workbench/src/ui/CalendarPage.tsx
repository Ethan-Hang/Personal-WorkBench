import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  DatePicker,
  Field,
  Modal,
  ProgressBar,
  useTimezone,
  useModuleLabel,
  useSlotEntries,
  IconCalendar,
  IconCheck,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconTrash,
  IconSearch,
  IconPlus,
  IconTarget,
  IconAlertCircle,
} from '@workbench/ui';
import { type WorkbenchItem, type ScheduleInput } from '../contract.js';
import { WORKBENCH_SLOTS } from './slots.js';
import {
  fetchCalendar,
  fetchUnscheduled,
  patchSchedule,
  postTodoTask,
  postTodoComplete,
  postTodoUncomplete,
  postTodoTrash,
  type CreateTodoInput,
} from './api.js';
import {
  getWeekRange,
  getWeekRangeByYearAndWeek,
  getWeeksInYear,
  getAvailableYears,
  formatWeekHeaderTitle,
  calculateEventTimelinePosition,
  localTimeToUtcIso,
  formatPlainDate,
  type WeekRange,
} from './weekUtils.js';
import { DateTime } from 'luxon';

const HOUR_HEIGHT = 64; // 1 小时 64px 行高，垂直更舒展
const START_HOUR = 0; // 00:00
const END_HOUR = 24; // 24:00
const DEFAULT_SCROLL_HOUR = 8; // 默认滚动聚焦 08:00

export function CalendarPage() {
  const queryClient = useQueryClient();
  const { timezone } = useTimezone();
  const asideEntries = useSlotEntries(WORKBENCH_SLOTS.calendarAside);

  // 当前选中的基准日期（本地 YYYY-MM-DD）
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd'),
  );

  // 用户通过“特定日期锁定周”时高亮的特定日期
  const [highlightDate, setHighlightDate] = useState<string | null>(null);

  // 年份与周次快速跳转 Popover
  const [isYearWeekPickerOpen, setIsYearWeekPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(() => DateTime.now().setZone(timezone).year);

  // 指定日期锁定周 Popover
  const [isDateLockPickerOpen, setIsDateLockPickerOpen] = useState(false);
  const [dateLockInput, setDateLockInput] = useState<string>('');

  // 待排程抽屉搜索与展开
  const [unscheduledSearch, setUnscheduledSearch] = useState('');
  const [isSideDrawerOpen, setIsSideDrawerOpen] = useState(true);

  // 快速新增待排程任务
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddImportance] = useState<'high' | 'normal' | 'low'>('normal');

  // 【左键单击】打开的事项详情弹窗状态
  const [detailItem, setDetailItem] = useState<WorkbenchItem | null>(null);

  // 【右键单击】打开的专属排期/调整排程弹窗状态
  const [scheduleItem, setScheduleItem] = useState<WorkbenchItem | null>(null);

  // 快速新建/排程对话框状态（点击时间轴空白处触发）
  const [createSlotData, setCreateSlotData] = useState<{
    date: string;
    hour: number;
    kind: 'all-day' | 'timed';
  } | null>(null);
  const [newSlotTitle, setNewSlotTitle] = useState('');
  const [newSlotImportance, setNewSlotImportance] = useState<'high' | 'normal' | 'low'>('normal');

  // 全天栏高度可调节状态 (默认 64px, 范围 44px - 260px，支持本地持久化)
  const [allDayHeight, setAllDayHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('workbench_calendar_all_day_height');
      if (saved) {
        const num = Number(saved);
        if (num >= 44 && num <= 260) return num;
      }
    } catch {
      // ignore
    }
    return 64;
  });
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);

  // 拖拽调整全天栏高度处理函数
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplitter(true);
    const startY = e.clientY;
    const startH = allDayHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const nextH = Math.min(260, Math.max(44, startH + delta));
      setAllDayHeight(nextH);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      const delta = upEvent.clientY - startY;
      const finalH = Math.min(260, Math.max(44, startH + delta));
      setAllDayHeight(finalH);
      setIsDraggingSplitter(false);
      try {
        localStorage.setItem('workbench_calendar_all_day_height', String(finalH));
      } catch {
        // ignore
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 拖拽传输状态
  const [draggedItem, setDraggedItem] = useState<WorkbenchItem | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; hour?: number } | null>(null);

  // 计算当前周区间信息
  const weekRange: WeekRange = useMemo(
    () => getWeekRange(selectedDate, timezone),
    [selectedDate, timezone],
  );

  // 日历网格滚动容器引用
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  // 年份横向滚动条引用
  const yearBarRef = useRef<HTMLDivElement>(null);
  // 快速切周 Popover 容器引用
  const yearWeekPopoverRef = useRef<HTMLDivElement>(null);
  // 定位日期 Popover 容器引用
  const dateLockPopoverRef = useRef<HTMLDivElement>(null);

  // 挂载或时区切换时，自动滚动到工作时段 (08:00)
  useEffect(() => {
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    }
  }, []);

  // 浮层外部点击时自动关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        isYearWeekPickerOpen &&
        yearWeekPopoverRef.current &&
        !yearWeekPopoverRef.current.contains(e.target as Node)
      ) {
        setIsYearWeekPickerOpen(false);
      }
      if (
        isDateLockPickerOpen &&
        dateLockPopoverRef.current &&
        !dateLockPopoverRef.current.contains(e.target as Node)
      ) {
        setIsDateLockPickerOpen(false);
      }
    }

    if (isYearWeekPickerOpen || isDateLockPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isYearWeekPickerOpen, isDateLockPickerOpen]);

  // 拦截年份横向滚动容器上的鼠标滚轮事件（必须用 non-passive listener 才能阻止整页纵向滚动）
  useEffect(() => {
    const el = yearBarRef.current;
    if (!el || !isYearWeekPickerOpen) return;

    function handleWheel(e: WheelEvent) {
      if (e.deltaY !== 0 && el) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollLeft += e.deltaY;
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [isYearWeekPickerOpen]);

  // 当年份选择浮层展开或年份变动时，自动平滑将选中年份滚动到水平居中
  useEffect(() => {
    if (isYearWeekPickerOpen && yearBarRef.current) {
      const activeEl = yearBarRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [isYearWeekPickerOpen, pickerYear]);

  // 快捷键支持：← 上一周，→ 下一周，T 回到今天
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft') {
        goToPreviousWeek();
      } else if (e.key === 'ArrowRight') {
        goToNextWeek();
      } else if (e.key.toLowerCase() === 't') {
        goToToday();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate, timezone]);

  // 1. 获取日历区间数据
  const {
    data: calendarData,
    isPending: isCalendarPending,
    isError: isCalendarError,
    error: calendarError,
  } = useQuery({
    queryKey: ['workbench', 'calendar', weekRange.from, weekRange.to],
    queryFn: () => fetchCalendar(weekRange.from, weekRange.to),
    staleTime: 5000,
  });

  // 2. 获取待排程抽屉数据
  const { data: unscheduledData } = useQuery({
    queryKey: ['workbench', 'unscheduled'],
    queryFn: fetchUnscheduled,
    staleTime: 5000,
  });

  // 3. 排程变异（颗粒度 1 分钟，跨模块）
  const scheduleMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleInput }) => patchSchedule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'unscheduled'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'today'] });
    },
  });

  // 4. Todo 动作变异（完成/取消完成/删除/新建）
  const completeMutation = useMutation({
    mutationFn: (id: string) => postTodoComplete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'unscheduled'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'today'] });
    },
  });

  const uncompleteMutation = useMutation({
    mutationFn: (id: string) => postTodoUncomplete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'unscheduled'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'today'] });
    },
  });

  const trashMutation = useMutation({
    mutationFn: (id: string) => postTodoTrash(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'unscheduled'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'today'] });
      setDetailItem(null);
      setScheduleItem(null);
    },
  });

  const createTodoMutation = useMutation({
    mutationFn: (input: CreateTodoInput) => postTodoTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbench', 'calendar'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'unscheduled'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'today'] });
    },
  });

  // 周导航控制
  function goToPreviousWeek() {
    const currentStart = DateTime.fromFormat(weekRange.from, 'yyyy-MM-dd', { zone: timezone });
    const prevWeek = currentStart.minus({ weeks: 1 });
    setSelectedDate(formatPlainDate(prevWeek));
    setHighlightDate(null);
  }

  function goToNextWeek() {
    const currentStart = DateTime.fromFormat(weekRange.from, 'yyyy-MM-dd', { zone: timezone });
    const nextWeek = currentStart.plus({ weeks: 1 });
    setSelectedDate(formatPlainDate(nextWeek));
    setHighlightDate(null);
  }

  function goToToday() {
    const today = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
    setSelectedDate(today);
    setHighlightDate(today);
  }

  // 快速跳转至指定年份和周
  function handleSelectYearWeek(year: number, weekNum: number) {
    const targetRange = getWeekRangeByYearAndWeek(year, weekNum, timezone);
    setSelectedDate(targetRange.from);
    setHighlightDate(null);
    setIsYearWeekPickerOpen(false);
  }

  // 通过特定日期锁定周
  function handleLockToSpecificDate(dateStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return;
    const target = dateStr.trim();
    setSelectedDate(target);
    setHighlightDate(target);
    setIsDateLockPickerOpen(false);
  }

  // 拖拽相关操作
  function handleDragStart(item: WorkbenchItem, e: React.DragEvent) {
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, date: string, hour?: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragOverSlot || dragOverSlot.date !== date || dragOverSlot.hour !== hour) {
      setDragOverSlot({ date, hour });
    }
  }

  function handleDragLeave() {
    setDragOverSlot(null);
  }

  async function handleDropOnAllDay(date: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverSlot(null);
    if (!draggedItem) return;

    await scheduleMutation.mutateAsync({
      id: draggedItem.id,
      input: {
        scheduled: { kind: 'all-day', date },
      },
    });
    setDraggedItem(null);
  }

  async function handleDropOnTimedSlot(date: string, hour: number, e: React.DragEvent) {
    e.preventDefault();
    setDragOverSlot(null);
    if (!draggedItem) return;

    const startIso = localTimeToUtcIso(date, hour, 0, timezone);
    const endIso = localTimeToUtcIso(date, Math.min(23, hour + 1), 0, timezone);

    await scheduleMutation.mutateAsync({
      id: draggedItem.id,
      input: {
        scheduled: { kind: 'timed', start: startIso, end: endIso },
      },
    });
    setDraggedItem(null);
  }

  async function handleDropBackToUnscheduled(e: React.DragEvent) {
    e.preventDefault();
    if (!draggedItem) return;

    await scheduleMutation.mutateAsync({
      id: draggedItem.id,
      input: { scheduled: null },
    });
    setDraggedItem(null);
  }

  // 快速创建并排程到指定时间槽
  async function handleConfirmCreateSlot() {
    if (!createSlotData || !newSlotTitle.trim()) return;

    const created = await createTodoMutation.mutateAsync({
      title: newSlotTitle.trim(),
      importance: newSlotImportance,
      dueDate: createSlotData.date,
    });

    if (createSlotData.kind === 'all-day') {
      await scheduleMutation.mutateAsync({
        id: created.id,
        input: { scheduled: { kind: 'all-day', date: createSlotData.date } },
      });
    } else {
      const startIso = localTimeToUtcIso(createSlotData.date, createSlotData.hour, 0, timezone);
      const endIso = localTimeToUtcIso(
        createSlotData.date,
        Math.min(23, createSlotData.hour + 1),
        0,
        timezone,
      );
      await scheduleMutation.mutateAsync({
        id: created.id,
        input: { scheduled: { kind: 'timed', start: startIso, end: endIso } },
      });
    }

    setCreateSlotData(null);
    setNewSlotTitle('');
  }

  // 快速添加未排程任务
  async function handleQuickAddUnscheduled() {
    if (!quickAddTitle.trim()) return;
    await createTodoMutation.mutateAsync({
      title: quickAddTitle.trim(),
      importance: quickAddImportance,
      dueDate: null,
    });
    setQuickAddTitle('');
  }

  // 计算按日期归类的全天与定时事项
  const { allDayMap, timedMap, totalPlannedCount, totalDoneCount } = useMemo(() => {
    const allDay: Record<string, WorkbenchItem[]> = {};
    const timed: Record<string, WorkbenchItem[]> = {};
    weekRange.days.forEach((d) => {
      allDay[d.date] = [];
      timed[d.date] = [];
    });

    let planned = 0;
    let done = 0;

    const items = calendarData?.items ?? [];
    items.forEach((item) => {
      planned++;
      if (item.status === 'done') done++;

      if (!item.scheduled) return;

      if (item.scheduled.kind === 'all-day') {
        const d = item.scheduled.date;
        if (allDay[d]) {
          allDay[d].push(item);
        }
      } else if (item.scheduled.kind === 'timed') {
        const itemDate = DateTime.fromISO(item.scheduled.start, { zone: timezone }).toFormat(
          'yyyy-MM-dd',
        );
        if (timed[itemDate]) {
          timed[itemDate].push(item);
        }
      }
    });

    return {
      allDayMap: allDay,
      timedMap: timed,
      totalPlannedCount: planned,
      totalDoneCount: done,
    };
  }, [calendarData, weekRange.days, timezone]);

  // 待排程抽屉过滤
  const filteredUnscheduled = useMemo(() => {
    const list = unscheduledData?.items ?? [];
    if (!unscheduledSearch.trim()) return list;
    const query = unscheduledSearch.toLowerCase().trim();
    return list.filter((i) => i.title.toLowerCase().includes(query));
  }, [unscheduledData?.items, unscheduledSearch]);

  // 实时当前时间（定时器每 10 秒刷新一次，保证红线位置与时钟实时前进）
  const [currentRealTime, setCurrentRealTime] = useState(() => DateTime.now().setZone(timezone));

  useEffect(() => {
    setCurrentRealTime(DateTime.now().setZone(timezone));

    const timer = setInterval(() => {
      setCurrentRealTime(DateTime.now().setZone(timezone));
    }, 10000);

    return () => clearInterval(timer);
  }, [timezone]);

  // 实时红线当前时间位置计算（根据 currentRealTime 驱动实时位移）
  const nowIndicator = useMemo(() => {
    const todayStr = currentRealTime.toFormat('yyyy-MM-dd');
    const isTodayInWeek = weekRange.days.some((d) => d.date === todayStr);

    if (!isTodayInWeek) return null;

    const currentMinutes =
      currentRealTime.hour * 60 + currentRealTime.minute + currentRealTime.second / 60;
    const topPx = (currentMinutes / 60) * HOUR_HEIGHT;

    return {
      todayStr,
      topPx,
      timeStr: currentRealTime.toFormat('HH:mm'),
    };
  }, [weekRange.days, currentRealTime]);

  const availableYears = useMemo(() => getAvailableYears(weekRange.year, 8), [weekRange.year]);
  const yearWeeks = useMemo(() => getWeeksInYear(pickerYear, timezone), [pickerYear, timezone]);

  if (isCalendarPending && !calendarData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="size-10 rounded-full border-3 border-line border-t-accent animate-spin-ring" />
        <p className="mt-3 text-xs font-medium text-muted">正在加载周历工作台数据…</p>
      </div>
    );
  }

  if (isCalendarError) {
    return (
      <div className="rounded-panel border border-critical-soft bg-critical-soft p-6 text-center text-critical animate-slide-down-in">
        <IconAlertCircle size={28} className="mx-auto mb-2" />
        <h3 className="font-bold">加载周历数据失败</h3>
        <p className="mt-1 text-xs">{calendarError?.message || '网络或数据加载异常'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-92px)] max-h-[calc(100vh-92px)] min-h-0 gap-3 overflow-hidden">
      {/* 顶部周历控制条 (高度固定，不参与滚动) */}
      <div className="relative z-30 shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2.5 animate-slide-down-in">
        {/* 左侧：周导航与标题 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 上下周切换按钮组 */}
          <div className="flex items-center rounded-control border border-line bg-surface p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={goToPreviousWeek}
              title="上一周 (快捷键: ←)"
              className="flex size-7 items-center justify-center rounded-control text-secondary hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              title="回到本周 (快捷键: T)"
              className="px-2.5 py-1 text-xs font-semibold text-secondary hover:bg-surface-2 hover:text-ink transition-colors border-x border-line/60"
            >
              今天
            </button>
            <button
              type="button"
              onClick={goToNextWeek}
              title="下一周 (快捷键: →)"
              className="flex size-7 items-center justify-center rounded-control text-secondary hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <IconChevronRight size={16} />
            </button>
          </div>

          {/* 周范围标题 */}
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-ink flex items-center gap-2">
              <span>{formatWeekHeaderTitle(weekRange)}</span>
              {weekRange.days.some((d) => d.isToday) && <Chip tone="good">本周</Chip>}
            </h1>
          </div>
        </div>

        {/* 右侧：快速选周、特定日期锁定与抽屉切换 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. 快速切换年份与周次 Popover 触发器 */}
          <div
            ref={yearWeekPopoverRef}
            className={`relative ${isYearWeekPickerOpen ? 'z-50' : ''}`}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsYearWeekPickerOpen((prev) => !prev)}
              className="flex items-center gap-1.5"
            >
              <IconCalendar size={13} className="text-secondary" />
              <span>
                {weekRange.year}年 第{weekRange.weekNumber}周
              </span>
              <IconChevronDown size={13} className="opacity-70" />
            </Button>

            {/* 年份/周次浮层 (宽屏 4 列布局 + 鼠标滚轮横向切年) */}
            {isYearWeekPickerOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-[450px] sm:w-[490px] rounded-card border border-line bg-surface p-4 shadow-xl animate-fade-in"
                style={{ backdropFilter: 'blur(12px)' }}
              >
                <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3">
                  <span className="text-xs font-bold text-ink">快速切换年份与周次</span>
                  <button
                    type="button"
                    onClick={() => setIsYearWeekPickerOpen(false)}
                    className="text-muted hover:text-ink text-xs"
                  >
                    <IconX size={14} />
                  </button>
                </div>

                {/* 年份导航栏：支持鼠标滚轮横向滚动，页面绝不滚动 */}
                <div className="flex items-center gap-1.5 bg-surface-2/70 p-1.5 rounded-control mb-3">
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y - 1)}
                    title="上一年"
                    className="flex size-7 items-center justify-center rounded-control text-secondary hover:bg-surface hover:text-ink shrink-0 transition-colors"
                  >
                    <IconChevronLeft size={15} />
                  </button>

                  {/* 鼠标滚轮横向滚动年份胶囊列表 */}
                  <div
                    ref={yearBarRef}
                    className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5 px-0.5 scrollbar-thin select-none"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {availableYears.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        data-active={pickerYear === yr}
                        onClick={() => setPickerYear(yr)}
                        className={`rounded-control px-2.5 py-1 text-xs font-semibold shrink-0 transition-all ${
                          pickerYear === yr
                            ? 'bg-accent text-white font-bold shadow-xs scale-105'
                            : 'text-secondary hover:bg-surface hover:text-ink'
                        }`}
                      >
                        {yr}年
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y + 1)}
                    title="下一年"
                    className="flex size-7 items-center justify-center rounded-control text-secondary hover:bg-surface hover:text-ink shrink-0 transition-colors"
                  >
                    <IconChevronRight size={15} />
                  </button>
                </div>

                {/* 4 列周次网格，清晰展示全年周次与起止日期 */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto pr-1">
                  {yearWeeks.map((w) => {
                    const isCurrent =
                      w.year === weekRange.year && w.weekNumber === weekRange.weekNumber;
                    return (
                      <button
                        key={w.weekNumber}
                        type="button"
                        onClick={() => handleSelectYearWeek(w.year, w.weekNumber)}
                        className={`flex flex-col items-start p-2 rounded-control text-xs text-left border transition-all ${
                          isCurrent
                            ? 'bg-accent/15 border-accent text-accent font-bold shadow-2xs'
                            : 'bg-surface-2/40 border-line hover:border-accent/50 hover:bg-surface-2 text-secondary hover:text-ink'
                        }`}
                      >
                        <span className="font-bold">第 {w.weekNumber} 周</span>
                        <span className="text-[10px] opacity-75 mt-0.5">
                          {w.label.split('(')[1]?.replace(')', '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 2. 特定日期锁定周 Popover 触发器 */}
          <div
            ref={dateLockPopoverRef}
            className={`relative ${isDateLockPickerOpen ? 'z-50' : ''}`}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDateLockInput(selectedDate);
                setIsDateLockPickerOpen((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 ${
                highlightDate ? 'border-accent text-accent font-semibold' : ''
              }`}
            >
              <IconTarget size={13} />
              <span>{highlightDate ? `锁定: ${highlightDate}` : '定位日期'}</span>
            </Button>

            {/* 定位日期浮层 */}
            {isDateLockPickerOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 w-72 rounded-card border border-line bg-surface p-3.5 shadow-xl animate-fade-in"
                style={{ backdropFilter: 'blur(12px)' }}
              >
                <div className="flex items-center justify-between border-b border-line pb-2 mb-2.5">
                  <span className="text-xs font-bold text-ink">通过指定日期锁定周</span>
                  <button
                    type="button"
                    onClick={() => setIsDateLockPickerOpen(false)}
                    className="text-muted hover:text-ink text-xs"
                  >
                    <IconX size={14} />
                  </button>
                </div>

                <p className="text-[11px] text-muted mb-2 leading-relaxed">
                  选择或输入任意具体日期，日历将立即切换并锁定至该日期所在周：
                </p>

                <div className="space-y-3">
                  <DatePicker
                    value={dateLockInput}
                    onChange={(d) => {
                      setDateLockInput(d ?? '');
                      if (d) handleLockToSpecificDate(d);
                    }}
                    placeholder="选择日期 YYYY-MM-DD"
                  />

                  <div className="flex justify-between items-center pt-1 border-t border-line/60">
                    {highlightDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setHighlightDate(null);
                          setIsDateLockPickerOpen(false);
                        }}
                        className="text-[11px] text-muted hover:text-critical"
                      >
                        清除锁定高亮
                      </button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleLockToSpecificDate(dateLockInput)}
                      disabled={!dateLockInput}
                      className="ml-auto"
                    >
                      定位并锁定
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 周度统计小药丸 */}
          <div className="hidden lg:flex items-center gap-2 rounded-control bg-surface-2 px-2.5 py-1 text-xs text-secondary border border-line">
            <span>
              已安排 <strong>{totalPlannedCount}</strong> 项
            </span>
            <span className="text-line">|</span>
            <span>
              已完成 <strong className="text-good">{totalDoneCount}</strong>
            </span>
          </div>

          {/* 待排程抽屉开关 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSideDrawerOpen((prev) => !prev)}
            className="text-xs"
          >
            {isSideDrawerOpen ? '收起抽屉' : '待排程抽屉'}
          </Button>
        </div>
      </div>

      {/* 主工作区：左侧 7 列周历时间轴网格 + 右侧常驻抽屉 (完全填充剩余视口高度) */}
      <div className="flex flex-col lg:flex-row gap-4 items-start flex-1 min-h-0 overflow-hidden w-full">
        {/* 左侧：周历主体（7 列日历 + 全天栏 + 24 小时时间轴） */}
        <div className="flex-1 min-w-0 w-full rounded-card border border-line bg-surface shadow-xs flex flex-col h-full min-h-0 overflow-hidden animate-slide-down-in stagger-1">
          {/* 横向滚动容器：保证在极端小屏下每列不低于 120px，在大屏下无缝完全展开 */}
          <div className="w-full h-full flex flex-col min-h-0 overflow-x-auto overflow-y-hidden">
            <div className="w-full min-w-[960px] h-full flex flex-col min-h-0">
              {/* 1. 表头：周一至周日 7 列 (固定在顶部，带 scrollbar-gutter: stable 保证和下方严格对齐) */}
              <div className="shrink-0 grid grid-cols-[64px_repeat(7,minmax(120px,1fr))] border-b border-line bg-surface-2/70 [scrollbar-gutter:stable]">
                {/* 时间列占位格 */}
                <div className="border-r border-line p-2 text-center text-[11px] font-bold text-muted flex items-center justify-center">
                  时段
                </div>

                {/* 7 列星期与日期 */}
                {weekRange.days.map((day) => {
                  const isHighlighted = highlightDate === day.date;
                  return (
                    <div
                      key={day.date}
                      className={`p-2 text-center border-r border-line last:border-r-0 transition-colors ${
                        day.isToday
                          ? 'bg-accent/8 font-bold'
                          : isHighlighted
                            ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset'
                            : ''
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-secondary">{day.dayName}</div>
                      <div className="mt-0.5 flex items-center justify-center gap-1.5">
                        <span
                          className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                            day.isToday
                              ? 'bg-accent text-white shadow-xs'
                              : isHighlighted
                                ? 'bg-primary text-white'
                                : 'text-ink'
                          }`}
                        >
                          {day.dayNumber}
                        </span>
                        {day.isToday && (
                          <span className="text-[10px] text-accent font-extrabold">今</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. 全天事项栏 (All-Day Bar)：高度支持手动拖拽调节，左侧表头固定不滚动，单元格内部独立垂直滚动 */}
              <div
                style={{ height: `${allDayHeight}px` }}
                className="shrink-0 border-b border-line bg-surface overflow-hidden transition-[height] duration-75 select-none"
              >
                <div className="h-full grid grid-cols-[64px_repeat(7,minmax(120px,1fr))] [scrollbar-gutter:stable]">
                  {/* 固定的 "全天" 表头单元格，永远居中稳定不跟随滚动 */}
                  <div className="h-full border-r border-line px-1 py-1 text-center text-[11px] font-bold text-muted flex flex-col items-center justify-center bg-surface-2/40 select-none">
                    <span>全天</span>
                    <span className="text-[9px] font-normal text-muted/60 scale-90 mt-0.5">
                      {allDayHeight}px
                    </span>
                  </div>

                  {weekRange.days.map((day) => {
                    const dayAllDayItems = allDayMap[day.date] ?? [];
                    const isOver =
                      dragOverSlot?.date === day.date && dragOverSlot.hour === undefined;

                    return (
                      <div
                        key={`allday-${day.date}`}
                        onDragOver={(e) => handleDragOver(e, day.date)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnAllDay(day.date, e)}
                        onClick={() =>
                          setCreateSlotData({ date: day.date, hour: 9, kind: 'all-day' })
                        }
                        className={`h-full border-r border-line last:border-r-0 p-1.5 transition-colors cursor-pointer group flex flex-col min-h-0 ${
                          isOver
                            ? 'bg-accent/20 border-dashed border-accent'
                            : 'hover:bg-surface-2/40'
                        }`}
                        title="点击在此添加全天事项，左键查看详情，右键调整排期"
                      >
                        {/* 单日独立垂直滚动区，占满当前设定的全天栏高度 */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
                          {dayAllDayItems.map((item) => (
                            <CalendarEventChip
                              key={item.id}
                              item={item}
                              onDragStart={(e) => handleDragStart(item, e)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailItem(item);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setScheduleItem(item);
                              }}
                              onToggleComplete={(e) => {
                                e.stopPropagation();
                                if (item.status === 'done') {
                                  uncompleteMutation.mutate(item.id);
                                } else {
                                  completeMutation.mutate(item.id);
                                }
                              }}
                            />
                          ))}
                        </div>
                        {dayAllDayItems.length === 0 && (
                          <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] text-muted transition-opacity">
                            + 全天
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 全天栏高度调节分割条 (Splitter Resizer Bar) */}
              <div
                onMouseDown={handleSplitterMouseDown}
                onDoubleClick={() => setAllDayHeight((h) => (h >= 110 ? 64 : 130))}
                className={`shrink-0 h-1.5 bg-line/60 hover:bg-accent/70 active:bg-accent cursor-row-resize flex items-center justify-center transition-colors select-none group relative z-20 ${
                  isDraggingSplitter ? 'bg-accent ring-1 ring-accent' : ''
                }`}
                title="上下拖拽调整全天栏高度（双击快捷展开/恢复）"
              >
                <div className="w-10 h-0.5 rounded-full bg-muted/40 group-hover:bg-white group-active:bg-white transition-colors" />
              </div>

              {/* 3. 24 小时时间轴网格 (纵向舒展自适应填满剩余高度，内部滚动，绝不造成整页滚动) */}
              <div
                ref={timelineScrollRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden select-none bg-surface [scrollbar-gutter:stable]"
              >
                <div className="grid grid-cols-[64px_repeat(7,minmax(120px,1fr))]">
                  {/* 3.1 左侧小时刻度 */}
                  <div className="border-r border-line bg-surface-2/30 shrink-0 select-none">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i).map(
                      (hour) => (
                        <div
                          key={hour}
                          style={{ height: HOUR_HEIGHT }}
                          className="border-b border-line/40 pr-2 text-right text-[11px] font-medium text-muted flex items-start justify-end pt-1"
                        >
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      ),
                    )}
                  </div>

                  {/* 3.2 7 列日时间槽与事件卡片 */}
                  {weekRange.days.map((day) => {
                    const dayTimedItems = timedMap[day.date] ?? [];
                    const isToday = day.isToday;

                    return (
                      <div
                        key={`timeline-${day.date}`}
                        className="relative border-r border-line last:border-r-0"
                        style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
                      >
                        {/* 小时网格线与可放置槽 */}
                        {Array.from(
                          { length: END_HOUR - START_HOUR },
                          (_, i) => START_HOUR + i,
                        ).map((hour) => {
                          const isSlotOver =
                            dragOverSlot?.date === day.date && dragOverSlot.hour === hour;

                          return (
                            <div
                              key={hour}
                              style={{ height: HOUR_HEIGHT }}
                              onDragOver={(e) => handleDragOver(e, day.date, hour)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDropOnTimedSlot(day.date, hour, e)}
                              onClick={() =>
                                setCreateSlotData({ date: day.date, hour, kind: 'timed' })
                              }
                              className={`border-b border-line/40 transition-colors cursor-pointer group relative ${
                                isSlotOver
                                  ? 'bg-accent/25 border-dashed border-accent'
                                  : 'hover:bg-surface-2/40'
                              }`}
                              title={`点击排程至 ${day.date} ${String(hour).padStart(2, '0')}:00`}
                            >
                              {/* 30分钟弱分割线 */}
                              <div className="absolute top-1/2 left-0 right-0 border-b border-line/20 pointer-events-none" />

                              {/* 悬停时的微弱提示 */}
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-none transition-opacity">
                                <span className="text-[10px] text-muted bg-surface/80 px-1.5 py-0.5 rounded shadow-2xs">
                                  {String(hour).padStart(2, '0')}:00
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* 实时红线（若该列为今天） */}
                        {isToday && nowIndicator && (
                          <div
                            className="absolute left-0 right-0 z-20 flex items-center pointer-events-none animate-fade-in"
                            style={{ top: nowIndicator.topPx }}
                          >
                            <div className="size-2 rounded-full bg-critical -ml-1 ring-2 ring-white" />
                            <div className="flex-1 h-[2px] bg-critical shadow-xs" />
                            <span className="text-[9px] font-bold text-critical bg-surface px-1 py-0.2 rounded border border-critical/30 shadow-2xs mr-1">
                              {nowIndicator.timeStr}
                            </span>
                          </div>
                        )}

                        {/* 定时事项卡片 */}
                        {dayTimedItems.map((item) => {
                          if (!item.scheduled || item.scheduled.kind !== 'timed') return null;

                          const pos = calculateEventTimelinePosition(
                            item.scheduled.start,
                            item.scheduled.end,
                            timezone,
                            HOUR_HEIGHT,
                          );

                          return (
                            <CalendarTimedEventCard
                              key={item.id}
                              item={item}
                              topPx={pos.topPx}
                              heightPx={pos.heightPx}
                              timeRangeStr={pos.timeRangeStr}
                              onDragStart={(e) => handleDragStart(item, e)}
                              onClick={() => setDetailItem(item)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setScheduleItem(item);
                              }}
                              onToggleComplete={(e) => {
                                e.stopPropagation();
                                if (item.status === 'done') {
                                  uncompleteMutation.mutate(item.id);
                                } else {
                                  completeMutation.mutate(item.id);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：常驻待排程任务抽屉与周度概览面板 (限制在视口高度内独立滚动) */}
        {isSideDrawerOpen && (
          <aside className="w-full lg:w-80 shrink-0 space-y-3.5 h-full max-h-full overflow-y-auto pr-1 animate-slide-right-in">
            {/* 1. 待排程抽屉卡片 */}
            <div
              className="rounded-panel border border-line bg-surface p-4 shadow-xs animate-slide-right-in stagger-1"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={handleDropBackToUnscheduled}
            >
              <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-ink">待排程抽屉</h2>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-secondary">
                    {filteredUnscheduled.length}
                  </span>
                </div>
                <span className="text-[10px] text-muted">左键详情 / 右键排期</span>
              </div>

              {/* 搜索与过滤 */}
              <div className="relative mb-3">
                <IconSearch
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  placeholder="搜索待排程事项..."
                  value={unscheduledSearch}
                  onChange={(e) => setUnscheduledSearch(e.target.value)}
                  className="w-full rounded-control border border-line bg-surface-2/60 pl-8 pr-2.5 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>

              {/* 快速新增事项（先收集、不排期） */}
              <div className="mb-3 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="快速记录一件事 (待排程)..."
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickAddUnscheduled();
                  }}
                  className="flex-1 rounded-control border border-line bg-surface pl-2.5 pr-2 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleQuickAddUnscheduled}
                  disabled={!quickAddTitle.trim()}
                  className="shrink-0 px-2 py-1"
                >
                  <IconPlus size={13} />
                </Button>
              </div>

              {/* 待排程事项列表 */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {filteredUnscheduled.map((item) => (
                  <UnscheduledItemCard
                    key={item.id}
                    item={item}
                    onDragStart={(e) => handleDragStart(item, e)}
                    onClick={() => setDetailItem(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setScheduleItem(item);
                    }}
                    onScheduleToday={() => {
                      const todayStr = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
                      scheduleMutation.mutate({
                        id: item.id,
                        input: { scheduled: { kind: 'all-day', date: todayStr } },
                      });
                    }}
                  />
                ))}

                {filteredUnscheduled.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted">
                    {unscheduledSearch ? '无匹配的事项' : '待排程抽屉暂无事项'}
                  </div>
                )}
              </div>
            </div>

            {/* 2. 本周执行度概览 */}
            <div className="rounded-panel border border-line bg-surface p-3.5 shadow-xs space-y-2.5 animate-slide-right-in stagger-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  本周执行度
                </h3>
                <span className="text-xs font-semibold text-accent">
                  {totalPlannedCount > 0
                    ? `${Math.round((totalDoneCount / totalPlannedCount) * 100)}%`
                    : '0%'}
                </span>
              </div>

              <ProgressBar
                value={totalDoneCount}
                max={Math.max(1, totalPlannedCount)}
                label="本周任务完成进度"
              />

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/60 text-xs">
                <div className="rounded-control bg-surface-2 p-2">
                  <div className="text-muted text-[10px]">已排程计划</div>
                  <div className="text-sm font-bold text-ink">{totalPlannedCount} 项</div>
                </div>
                <div className="rounded-control bg-surface-2 p-2">
                  <div className="text-muted text-[10px]">已按期完成</div>
                  <div className="text-sm font-bold text-good">{totalDoneCount} 项</div>
                </div>
              </div>
            </div>

            {/* 3. 别的模块贡献进来的边栏卡片（如今日习惯打卡预览），由组合根装配 */}
            {asideEntries.map((entry) => (
              <div key={entry.id}>{entry.node}</div>
            ))}
          </aside>
        )}
      </div>

      {/* 弹窗 1：【左键单击】事项详情 Modal */}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          timezone={timezone}
          onClose={() => setDetailItem(null)}
          onOpenSchedule={() => {
            const itm = detailItem;
            setDetailItem(null);
            setScheduleItem(itm);
          }}
          onToggleComplete={() => {
            if (detailItem.status === 'done') {
              uncompleteMutation.mutate(detailItem.id);
            } else {
              completeMutation.mutate(detailItem.id);
            }
            setDetailItem(null);
          }}
          onTrash={() => trashMutation.mutate(detailItem.id)}
        />
      )}

      {/* 弹窗 2：【右键单击】专属排期/调整排程 Modal */}
      {scheduleItem && (
        <ScheduleModal
          item={scheduleItem}
          timezone={timezone}
          onClose={() => setScheduleItem(null)}
          onScheduleChange={async (input) => {
            await scheduleMutation.mutateAsync({ id: scheduleItem.id, input });
            setScheduleItem(null);
          }}
        />
      )}

      {/* 弹窗 3：点击日历空白槽快速新建/排程 Modal */}
      {createSlotData && (
        <Modal
          isOpen={true}
          onClose={() => setCreateSlotData(null)}
          title={
            createSlotData.kind === 'all-day'
              ? `在 ${createSlotData.date} 添加全天计划`
              : `在 ${createSlotData.date} ${String(createSlotData.hour).padStart(2, '0')}:00 添加计划`
          }
        >
          <div className="space-y-4">
            <Field label="任务名称">
              <input
                type="text"
                placeholder="例如：准备项目周会材料..."
                value={newSlotTitle}
                onChange={(e) => setNewSlotTitle(e.target.value)}
                autoFocus
                className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </Field>

            <Field label="重要程度">
              <div className="flex gap-2">
                {(['normal', 'high', 'low'] as const).map((imp) => (
                  <button
                    key={imp}
                    type="button"
                    onClick={() => setNewSlotImportance(imp)}
                    className={`flex-1 rounded-control px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                      newSlotImportance === imp
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface-2 text-secondary border-line hover:bg-surface-3'
                    }`}
                  >
                    {imp === 'high' ? '重要' : imp === 'low' ? '低' : '普通'}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button variant="ghost" onClick={() => setCreateSlotData(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmCreateSlot}
                disabled={!newSlotTitle.trim()}
              >
                立即排程
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * 文本跑马灯滚动组件：内容溢出时鼠标悬停平滑水平滚动显示全部文字
 */
function ScrollableTitle({
  title,
  className = '',
  isDone = false,
}: {
  title: string;
  className?: string;
  isDone?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [title]);

  const offset =
    isOverflowing && isHovered && containerRef.current && textRef.current
      ? textRef.current.scrollWidth - containerRef.current.clientWidth
      : 0;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`overflow-hidden whitespace-nowrap relative ${className}`}
      title={title}
    >
      <span
        ref={textRef}
        className={`inline-block transition-transform ease-linear ${isDone ? 'line-through' : ''}`}
        style={{
          transform: isHovered && isOverflowing ? `translateX(-${offset}px)` : 'translateX(0)',
          transitionDuration: isOverflowing ? `${Math.max(600, offset * 30)}ms` : '0ms',
        }}
      >
        {title}
      </span>
    </div>
  );
}

/**
 * 全天事项小药丸组件 (支持左键查看详情，右键快捷排期，标题超出时悬停平滑滚动)
 */
function CalendarEventChip({
  item,
  onDragStart,
  onClick,
  onContextMenu,
  onToggleComplete,
}: {
  item: WorkbenchItem;
  onDragStart: (e: React.DragEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleComplete: (e: React.MouseEvent) => void;
}) {
  const isDone = item.status === 'done';
  const sourceLabel = useModuleLabel(item.sourceModule);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-1.5 rounded-control px-2 py-1 text-xs border shadow-2xs cursor-grab active:cursor-grabbing transition-all hover:scale-[1.01] animate-item-enter ${
        isDone
          ? 'bg-surface-2/60 text-muted border-line opacity-75'
          : item.importance === 'high'
            ? 'bg-critical/10 text-critical border-critical/30 font-medium'
            : 'bg-surface-2 text-ink border-line hover:border-accent/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggleComplete}
        className={`flex size-3.5 items-center justify-center rounded border transition-colors shrink-0 ${
          isDone ? 'bg-good border-good text-white' : 'border-line hover:border-accent'
        }`}
      >
        {isDone && <IconCheck size={10} />}
      </button>

      <ScrollableTitle title={item.title} isDone={isDone} className="flex-1 font-medium min-w-0" />

      {item.sourceModule !== 'todo' && (
        <span className="text-[9px] rounded bg-surface px-1 py-0.2 text-secondary shrink-0 border border-line/40">
          {sourceLabel}
        </span>
      )}
    </div>
  );
}

/**
 * 定时事项卡片组件 (基于绝对定位绘制在时间轴上，支持左键详情，右键排期，超长文本滚动)
 */
function CalendarTimedEventCard({
  item,
  topPx,
  heightPx,
  timeRangeStr,
  onDragStart,
  onClick,
  onContextMenu,
  onToggleComplete,
}: {
  item: WorkbenchItem;
  topPx: number;
  heightPx: number;
  timeRangeStr: string;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleComplete: (e: React.MouseEvent) => void;
}) {
  const isDone = item.status === 'done';
  const isCampus = item.sourceModule === 'campus-recruit';
  const sourceLabel = useModuleLabel(item.sourceModule);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        top: topPx,
        height: heightPx,
      }}
      className={`absolute left-1 right-1 z-10 rounded-control p-1.5 border shadow-2xs overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:z-30 hover:shadow-md animate-item-enter ${
        isDone
          ? 'bg-surface-2/80 text-muted border-line opacity-70'
          : isCampus
            ? 'bg-accent/15 border-accent/40 text-accent font-medium'
            : item.importance === 'high'
              ? 'bg-critical/15 border-critical/40 text-critical font-medium'
              : 'bg-surface text-ink border-line hover:border-accent/60'
      }`}
    >
      <div className="flex items-start justify-between gap-1 leading-tight">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleComplete}
            className={`flex size-3.5 items-center justify-center rounded border transition-colors shrink-0 ${
              isDone ? 'bg-good border-good text-white' : 'border-line hover:border-accent'
            }`}
          >
            {isDone && <IconCheck size={9} />}
          </button>
          <ScrollableTitle
            title={item.title}
            isDone={isDone}
            className="flex-1 text-xs font-bold min-w-0"
          />
        </div>
        <span className="text-[10px] text-muted shrink-0 font-mono ml-1">{timeRangeStr}</span>
      </div>

      {heightPx >= 38 && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-secondary">
          <span className="rounded bg-surface-2/80 px-1 py-0.2 border border-line/40">
            {sourceLabel}
          </span>
          {item.urgency === 'imminent' && (
            <span className="text-critical font-semibold">临近死线</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 待排程抽屉卡片组件
 */
function UnscheduledItemCard({
  item,
  onDragStart,
  onClick,
  onContextMenu,
  onScheduleToday,
}: {
  item: WorkbenchItem;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onScheduleToday: () => void;
}) {
  const sourceLabel = useModuleLabel(item.sourceModule);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="group rounded-control border border-line bg-surface p-2.5 text-xs shadow-2xs hover:border-accent/60 hover:shadow-xs transition-all cursor-grab active:cursor-grabbing space-y-1.5 animate-item-enter"
    >
      <div className="flex items-start justify-between gap-2">
        <ScrollableTitle
          title={item.title}
          className="font-semibold text-ink leading-snug group-hover:text-accent transition-colors flex-1 min-w-0"
        />
        {item.importance === 'high' && (
          <span className="rounded-full bg-critical/15 px-1.5 py-0.2 text-[10px] font-bold text-critical shrink-0">
            重要
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-line/40 text-[10px] text-muted">
        <span className="rounded bg-surface-2 px-1 py-0.2">{sourceLabel}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onScheduleToday();
          }}
          className="text-accent hover:underline font-medium"
        >
          排到今天 →
        </button>
      </div>
    </div>
  );
}

/**
 * 弹窗 1：【左键单击】事项详情弹窗 (只展示详情与快捷入口，支持跳转对应模块)
 */
function ItemDetailModal({
  item,
  timezone,
  onClose,
  onOpenSchedule,
  onToggleComplete,
  onTrash,
}: {
  item: WorkbenchItem;
  timezone: string;
  onClose: () => void;
  onOpenSchedule: () => void;
  onToggleComplete: () => void;
  onTrash: () => void;
}) {
  const sourceLabel = useModuleLabel(item.sourceModule);
  const isCampus = item.sourceModule === 'campus-recruit';
  const isDone = item.status === 'done';

  // 格式化当前排期说明
  const scheduleDescription = useMemo(() => {
    if (!item.scheduled) return '暂未安排（位于待排程抽屉）';
    if (item.scheduled.kind === 'all-day') {
      return `已排程：${item.scheduled.date} (全天)`;
    }
    const startDt = DateTime.fromISO(item.scheduled.start, { zone: timezone });
    const endDt = item.scheduled.end
      ? DateTime.fromISO(item.scheduled.end, { zone: timezone })
      : null;
    return `已排程：${startDt.toFormat('yyyy-MM-dd HH:mm')} ${endDt ? `— ${endDt.toFormat('HH:mm')}` : ''}`;
  }, [item.scheduled, timezone]);

  return (
    <Modal isOpen={true} onClose={onClose} title="事项详情">
      <div className="space-y-4 text-xs">
        {/* 顶部标题与状态标签 */}
        <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div className="space-y-1 flex-1 min-w-0">
            <h2 className="text-base font-bold text-ink break-words">{item.title}</h2>
            <div className="flex flex-wrap items-center gap-2 text-muted text-[11px]">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink">
                来源: {sourceLabel}
              </span>
              <Chip tone={isDone ? 'good' : 'neutral'}>{isDone ? '已完成' : '待处理'}</Chip>
              {item.importance === 'high' && <Chip tone="critical">重要事项</Chip>}
              {item.urgency === 'imminent' && <Chip tone="warning">临近死线</Chip>}
            </div>
          </div>

          {item.sourceModule === 'todo' && (
            <Button
              variant={isDone ? 'secondary' : 'primary'}
              size="sm"
              onClick={onToggleComplete}
              className="shrink-0"
            >
              {isDone ? '标为未完成' : '标为已完成'}
            </Button>
          )}
        </div>

        {/* 核心信息面板 */}
        <div className="rounded-control bg-surface-2/60 border border-line p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted">当前排期：</span>
            <span className="font-semibold text-ink">{scheduleDescription}</span>
          </div>

          {item.dueAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted">截止时间 (Due)：</span>
              <span className="font-medium text-critical">
                {DateTime.fromISO(item.dueAt, { zone: timezone }).toFormat('yyyy-MM-dd HH:mm')}
              </span>
            </div>
          )}
        </div>

        {/* 秋招专属面板 */}
        {isCampus && (
          <div className="rounded-control bg-accent/10 border border-accent/20 p-3 space-y-2">
            <div className="text-xs font-bold text-accent">🎓 秋招求职联动</div>
            <p className="text-[11px] text-secondary leading-relaxed">
              该事项由秋招应聘模块自动同步。点击下方链接将自动跳转并定位展开该企业的完整投递档案与所有面试轮次。
            </p>
            <div className="pt-1">
              <a
                href={`/campus?targetItemId=${encodeURIComponent(item.id)}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
              >
                <span>跳转并展开该岗位档案详情</span>
                <span>→</span>
              </a>
            </div>
          </div>
        )}

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-between pt-3 border-t border-line">
          {item.sourceModule === 'todo' ? (
            <Button variant="ghost" size="sm" onClick={onTrash} className="text-critical">
              <IconTrash size={13} className="mr-1" />
              移入回收站
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={onOpenSchedule}>
              调整排期…
            </Button>
            <Button variant="primary" onClick={onClose}>
              完成
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 弹窗 2：【右键单击】专属排期与时段调整弹窗
 */
function ScheduleModal({
  item,
  timezone,
  onClose,
  onScheduleChange,
}: {
  item: WorkbenchItem;
  timezone: string;
  onClose: () => void;
  onScheduleChange: (input: ScheduleInput) => Promise<void>;
}) {
  const sourceLabel = useModuleLabel(item.sourceModule);

  // 排程形态选择
  const [scheduleKind, setScheduleKind] = useState<'all-day' | 'timed' | 'none'>(() => {
    if (!item.scheduled) return 'none';
    return item.scheduled.kind;
  });

  const [dateVal, setDateVal] = useState<string>(() => {
    if (!item.scheduled) return DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
    if (item.scheduled.kind === 'all-day') return item.scheduled.date;
    return DateTime.fromISO(item.scheduled.start, { zone: timezone }).toFormat('yyyy-MM-dd');
  });

  const [startHourVal, setStartHourVal] = useState<number>(() => {
    if (item.scheduled?.kind === 'timed') {
      return DateTime.fromISO(item.scheduled.start, { zone: timezone }).hour;
    }
    return 9;
  });

  const [startMinuteVal, setStartMinuteVal] = useState<number>(() => {
    if (item.scheduled?.kind === 'timed') {
      return DateTime.fromISO(item.scheduled.start, { zone: timezone }).minute;
    }
    return 0;
  });

  const [durationVal, setDurationVal] = useState<number>(60);

  async function handleSaveSchedule() {
    if (scheduleKind === 'none') {
      await onScheduleChange({ scheduled: null });
      return;
    }

    if (scheduleKind === 'all-day') {
      await onScheduleChange({
        scheduled: { kind: 'all-day', date: dateVal },
      });
      return;
    }

    const startIso = localTimeToUtcIso(dateVal, startHourVal, startMinuteVal, timezone);
    const startDt = DateTime.fromISO(startIso);
    const endIso = new Date(startDt.plus({ minutes: durationVal }).toMillis()).toISOString();

    await onScheduleChange({
      scheduled: { kind: 'timed', start: startIso, end: endIso },
    });
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="排期与时间安排">
      <div className="space-y-4 text-xs">
        {/* 顶部事项简要 */}
        <div className="border-b border-line pb-2.5">
          <div className="text-sm font-bold text-ink truncate">{item.title}</div>
          <div className="text-[11px] text-muted mt-0.5">来源：{sourceLabel}</div>
        </div>

        {/* 排程形式选择 */}
        <div className="space-y-3">
          <Field label="排程方式">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScheduleKind('all-day')}
                className={`flex-1 rounded-control px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                  scheduleKind === 'all-day'
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-2 text-secondary border-line hover:bg-surface-3'
                }`}
              >
                全天排程
              </button>
              <button
                type="button"
                onClick={() => setScheduleKind('timed')}
                className={`flex-1 rounded-control px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                  scheduleKind === 'timed'
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-2 text-secondary border-line hover:bg-surface-3'
                }`}
              >
                定时排程
              </button>
              <button
                type="button"
                onClick={() => setScheduleKind('none')}
                className={`flex-1 rounded-control px-2.5 py-1.5 text-xs font-semibold border transition-colors ${
                  scheduleKind === 'none'
                    ? 'bg-critical/15 text-critical border-critical/40 font-bold'
                    : 'bg-surface-2 text-secondary border-line hover:bg-surface-3'
                }`}
              >
                移入未排程
              </button>
            </div>
          </Field>

          {scheduleKind !== 'none' && (
            <Field label="排程日期">
              <DatePicker value={dateVal} onChange={(d) => setDateVal(d ?? dateVal)} />
            </Field>
          )}

          {scheduleKind === 'timed' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始时间">
                <div className="flex items-center gap-1">
                  <select
                    value={startHourVal}
                    onChange={(e) => setStartHourVal(Number(e.target.value))}
                    className="flex-1 rounded-control border border-line bg-surface p-1.5 text-xs text-ink"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                  <select
                    value={startMinuteVal}
                    onChange={(e) => setStartMinuteVal(Number(e.target.value))}
                    className="w-20 rounded-control border border-line bg-surface p-1.5 text-xs text-ink"
                  >
                    <option value={0}>00 分</option>
                    <option value={15}>15 分</option>
                    <option value={30}>30 分</option>
                    <option value={45}>45 分</option>
                  </select>
                </div>
              </Field>

              <Field label="预计时长">
                <select
                  value={durationVal}
                  onChange={(e) => setDurationVal(Number(e.target.value))}
                  className="w-full rounded-control border border-line bg-surface p-1.5 text-xs text-ink"
                >
                  <option value={15}>15 分钟</option>
                  <option value={30}>30 分钟</option>
                  <option value={45}>45 分钟</option>
                  <option value={60}>1 小时</option>
                  <option value={90}>1.5 小时</option>
                  <option value={120}>2 小时</option>
                  <option value={180}>3 小时</option>
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* 底部确认按钮 */}
        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSaveSchedule}>
            保存排期
          </Button>
        </div>
      </div>
    </Modal>
  );
}
