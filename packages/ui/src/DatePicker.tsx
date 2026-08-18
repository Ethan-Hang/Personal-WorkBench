import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconAlertCircle,
} from './icons.js';

export interface DatePickerProps {
  value?: string | null; // Format: 'YYYY-MM-DD'
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parts = dateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
    return date;
  }
  return null;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  return `${y}-${m}-${d}`;
}

function formatDisplayString(raw: string): string {
  // raw is string of digits up to 8 chars: YYYYMMDD
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)} / ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}`;
}

interface ValidationResult {
  isValid: boolean;
  error: string | null;
  formattedDate: string;
}

function validateDateInput(text: string): ValidationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { isValid: true, error: null, formattedDate: '' };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) {
    return { isValid: true, error: null, formattedDate: '' };
  }

  if (digits.length < 8) {
    return {
      isValid: false,
      error: '日期不完整，请输入 8 位数字（如 2026/08/18）',
      formattedDate: '',
    };
  }

  if (digits.length > 8) {
    return {
      isValid: false,
      error: '输入位数过多，请输入正确的年月日',
      formattedDate: '',
    };
  }

  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const d = parseInt(digits.slice(6, 8), 10);

  if (y < 1900 || y > 2100) {
    return {
      isValid: false,
      error: `年份超出范围（当前 ${y}，请输入 1900 - 2100 年）`,
      formattedDate: '',
    };
  }

  if (m < 1 || m > 12) {
    return {
      isValid: false,
      error: `月份无效（当前 ${m} 月，月份需在 01 至 12 之间）`,
      formattedDate: '',
    };
  }

  const maxDays = new Date(y, m, 0).getDate();
  if (d < 1 || d > maxDays) {
    return {
      isValid: false,
      error: `${y}年${m}月最多只有 ${maxDays} 天（当前输入为 ${d} 日）`,
      formattedDate: '',
    };
  }

  return {
    isValid: true,
    error: null,
    formattedDate: `${y}-${padZero(m)}-${padZero(d)}`,
  };
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function DatePicker({
  value = '',
  onChange,
  placeholder = '年 / 月 / 日',
  disabled = false,
  className = '',
  size = 'md',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openUpward, setOpenUpward] = useState(false);

  const [inputText, setInputText] = useState(() => {
    if (!value) return '';
    const d = parseDate(value);
    if (!d) return '';
    return `${d.getFullYear()} / ${padZero(d.getMonth() + 1)} / ${padZero(d.getDate())}`;
  });

  const parsedVal = parseDate(value);
  const today = new Date();

  // Calendar view year and month
  const [viewYear, setViewYear] = useState(() => parsedVal?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedVal?.getMonth() ?? today.getMonth());
  const [monthSlideDirection, setMonthSlideDirection] = useState<'left' | 'right' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value to input text & clear error if value is valid
  useEffect(() => {
    if (!value) {
      setInputText('');
      setErrorMessage(null);
    } else {
      const d = parseDate(value);
      if (d) {
        setInputText(`${d.getFullYear()} / ${padZero(d.getMonth() + 1)} / ${padZero(d.getDate())}`);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
        setErrorMessage(null);
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Check orientation (open upward if below space is constrained)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 340 && rect.top > 340) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const formatted = formatDisplayString(digits);
    setInputText(formatted);

    // If typing, re-validate if we had an error or if 8 digits typed
    if (digits.length === 8) {
      const res = validateDateInput(formatted);
      if (res.isValid) {
        setErrorMessage(null);
        onChange(res.formattedDate);
        const parsed = parseDate(res.formattedDate);
        if (parsed) {
          setViewYear(parsed.getFullYear());
          setViewMonth(parsed.getMonth());
        }
      } else {
        setErrorMessage(res.error);
      }
    } else if (digits.length === 0) {
      setErrorMessage(null);
      onChange('');
    } else if (errorMessage) {
      // Clear premature error while still actively typing
      setErrorMessage(null);
    }
  }

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    // If focus is moving within the DatePicker container (e.g. to calendar button or date cell), don't trigger blur check yet
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }

    // When focus leaves the whole component, check validation
    const res = validateDateInput(inputText);
    if (!res.isValid) {
      setErrorMessage(res.error);
    } else {
      setErrorMessage(null);
      if (res.formattedDate !== (value ?? '')) {
        onChange(res.formattedDate);
      }
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const res = validateDateInput(inputText);
      if (!res.isValid) {
        setErrorMessage(res.error);
      } else {
        setErrorMessage(null);
        onChange(res.formattedDate);
        setIsOpen(false);
      }
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  }

  function selectDate(date: Date) {
    const str = formatDate(date);
    onChange(str);
    setInputText(
      `${date.getFullYear()} / ${padZero(date.getMonth() + 1)} / ${padZero(date.getDate())}`,
    );
    setErrorMessage(null);
    setIsOpen(false);
  }

  function handlePrevMonth() {
    setMonthSlideDirection('right');
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    setMonthSlideDirection('left');
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleQuickPreset(offsetDays: number | 'clear') {
    if (offsetDays === 'clear') {
      onChange('');
      setInputText('');
      setErrorMessage(null);
      setIsOpen(false);
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    selectDate(d);
  }

  // Calculate calendar days matrix
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

  // Day of week: 0 = Mon, ..., 6 = Sun
  const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getDate();

  // Previous month tail days
  const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
  const prevDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    prevDays.push({
      day,
      date: new Date(viewYear, viewMonth - 1, day),
      isCurrentMonth: false,
    });
  }

  // Current month days
  const currentDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentDays.push({
      day: i,
      date: new Date(viewYear, viewMonth, i),
      isCurrentMonth: true,
    });
  }

  // Next month head days to fill 42 cells (6 rows)
  const remainingCells = 42 - (prevDays.length + currentDays.length);
  const nextDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = 1; i <= remainingCells; i++) {
    nextDays.push({
      day: i,
      date: new Date(viewYear, viewMonth + 1, i),
      isCurrentMonth: false,
    });
  }

  const allCalendarDays = [...prevDays, ...currentDays, ...nextDays];

  const inputHeight = size === 'sm' ? 'h-7 text-xs px-2' : 'h-9 text-xs px-2.5';

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      className={`relative inline-block ${isOpen ? 'z-30' : ''} ${className}`}
    >
      {/* 触发输入框（失焦校验错误时细框变红，带温和红色光晕） */}
      <div
        className={`group relative flex items-center justify-between gap-1.5 rounded-control border bg-surface transition-all duration-150 ${
          errorMessage
            ? 'border-critical shadow-2xs ring-2 ring-critical/20'
            : isOpen
              ? 'border-accent shadow-xs ring-2 ring-accent/20'
              : 'border-line hover:border-line hover:bg-surface-2/40'
        } ${inputHeight}`}
      >
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <IconCalendar
            size={13}
            className={`shrink-0 transition-colors ${
              errorMessage
                ? 'text-critical'
                : isOpen || value
                  ? 'text-accent'
                  : 'text-muted group-hover:text-secondary'
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full bg-transparent font-medium tracking-wide text-ink placeholder:text-muted placeholder:font-normal focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {(value || inputText) && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setInputText('');
                setErrorMessage(null);
              }}
              title="清空日期"
              className="flex size-5 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-critical transition"
            >
              <IconX size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className="flex size-5 items-center justify-center rounded text-muted hover:text-ink transition"
            aria-label="打开日历"
          >
            <span className="text-[9px] opacity-70">▼</span>
          </button>
        </div>
      </div>

      {/* 错误提示小微标（失焦校验不通过时平滑滑出，提示具体错误原因） */}
      {errorMessage && (
        <div
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-critical animate-slide-down-in"
          role="alert"
        >
          <IconAlertCircle size={12} className="shrink-0 text-critical" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 弹出式专属日历下拉面板（z-[60] 置顶，拥有平滑缩放、方向划入与主题色映衬动效） */}
      {isOpen && (
        <div
          className={`absolute left-0 z-[60] w-72 rounded-panel border border-line bg-surface p-3.5 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 ${
            openUpward
              ? 'bottom-full mb-1.5 animate-scale-in origin-bottom-left'
              : 'top-full mt-1.5 animate-scale-in origin-top-left'
          }`}
          role="dialog"
          aria-modal="true"
        >
          {/* 日历顶栏：年月切换与翻月控制 */}
          <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-ink">
                {viewYear}年 {viewMonth + 1}月
              </span>
              <button
                type="button"
                onClick={() => {
                  setViewYear(today.getFullYear());
                  setViewMonth(today.getMonth());
                }}
                className="rounded px-1.5 py-0.2 text-[10px] font-semibold text-accent hover:bg-accent-soft transition"
              >
                今日
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="上个月"
                className="flex size-6 items-center justify-center rounded-control text-secondary hover:bg-surface-2 hover:text-ink transition"
              >
                <IconChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="下个月"
                className="flex size-6 items-center justify-center rounded-control text-secondary hover:bg-surface-2 hover:text-ink transition"
              >
                <IconChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* 星期行标 */}
          <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold text-muted">
            {WEEKDAYS.map((w, idx) => (
              <div key={w} className={`py-1 ${idx >= 5 ? 'text-accent/80' : ''}`}>
                {w}
              </div>
            ))}
          </div>

          {/* 42 宫格日历日期面板 */}
          <div
            key={`${viewYear}-${viewMonth}`}
            className={`mt-1 grid grid-cols-7 gap-1 text-center text-xs ${
              monthSlideDirection === 'left'
                ? 'animate-slide-left-in'
                : monthSlideDirection === 'right'
                  ? 'animate-slide-right-in'
                  : 'animate-fade-in'
            }`}
          >
            {allCalendarDays.map((item, index) => {
              const isSelected =
                parsedVal &&
                item.date.getFullYear() === parsedVal.getFullYear() &&
                item.date.getMonth() === parsedVal.getMonth() &&
                item.date.getDate() === parsedVal.getDate();

              const isToday =
                item.date.getFullYear() === today.getFullYear() &&
                item.date.getMonth() === today.getMonth() &&
                item.date.getDate() === today.getDate();

              return (
                <button
                  key={`${item.date.toISOString()}-${index}`}
                  type="button"
                  onClick={() => selectDate(item.date)}
                  className={`relative flex size-8 mx-auto items-center justify-center rounded-full text-xs transition-all duration-150 ${
                    isSelected
                      ? 'bg-accent font-bold text-white shadow-xs scale-105'
                      : item.isCurrentMonth
                        ? 'text-ink hover:bg-accent-soft hover:text-accent font-medium'
                        : 'text-muted/50 hover:bg-surface-2 hover:text-muted'
                  } ${isToday && !isSelected ? 'ring-1.5 ring-accent/60 font-bold text-accent' : ''}`}
                >
                  <span>{item.day}</span>
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 size-1 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 底部快捷选择预设胶囊 */}
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickPreset(0)}
                className="rounded-control bg-surface-2 px-2 py-0.8 font-medium text-secondary hover:bg-accent-soft hover:text-accent transition"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(1)}
                className="rounded-control bg-surface-2 px-2 py-0.8 font-medium text-secondary hover:bg-accent-soft hover:text-accent transition"
              >
                明天
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset(3)}
                className="rounded-control bg-surface-2 px-2 py-0.8 font-medium text-secondary hover:bg-accent-soft hover:text-accent transition"
              >
                3天后
              </button>
            </div>

            {(value || inputText) && (
              <button
                type="button"
                onClick={() => handleQuickPreset('clear')}
                className="font-medium text-muted hover:text-critical transition"
              >
                清空
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
