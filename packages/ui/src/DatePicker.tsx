import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  IconCalendar,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
  IconX,
  IconAlertCircle,
} from './icons.js';

export interface DatePickerProps {
  value?: string | null; // Format: 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm' or ISO8601
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  showTime?: boolean; // When false, hide clock & time input completely (default: true)
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

export interface ParsedDateTime {
  date: Date | null;
  hour: number | null;
  minute: number | null;
}

export function parseDateTime(str?: string | null): ParsedDateTime {
  if (!str) return { date: null, hour: null, minute: null };
  const trimmed = str.trim();

  // Match 'YYYY-MM-DD HH:mm' or 'YYYY-MM-DDTHH:mm'
  const matchDateTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (matchDateTime) {
    const y = Number(matchDateTime[1]);
    const m = Number(matchDateTime[2]);
    const d = Number(matchDateTime[3]);
    const hour = Number(matchDateTime[4]);
    const min = Number(matchDateTime[5]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
      return { date, hour, minute: min };
    }
  }

  // Match 'YYYY-MM-DD'
  const matchDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchDate) {
    const y = Number(matchDate[1]);
    const m = Number(matchDate[2]);
    const d = Number(matchDate[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
      return { date, hour: null, minute: null };
    }
  }

  return { date: null, hour: null, minute: null };
}

function formatValue(date: Date, hour: number | null, minute: number | null): string {
  const y = date.getFullYear();
  const m = padZero(date.getMonth() + 1);
  const d = padZero(date.getDate());
  if (hour !== null && minute !== null) {
    return `${y}-${m}-${d} ${padZero(hour)}:${padZero(minute)}`;
  }
  return `${y}-${m}-${d}`;
}

/**
 * 格式化输入框展示内容：
 * - showTime=false 时仅处理 8 位年月日
 * - showTime=true 时支持 24 小时制与 12 小时制（带 AM/PM 自动大写转换）
 */
function formatDisplayString(raw: string, showTime = true): string {
  if (!showTime) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)} / ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}`;
  }

  let hasAM = false;
  let hasPM = false;
  if (/am/i.test(raw)) hasAM = true;
  if (/pm/i.test(raw)) hasPM = true;

  const digits = raw.replace(/\D/g, '').slice(0, 12);
  let res = '';
  if (digits.length <= 4) res = digits;
  else if (digits.length <= 6) res = `${digits.slice(0, 4)} / ${digits.slice(4)}`;
  else if (digits.length <= 8) {
    res = `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}`;
  } else if (digits.length <= 10) {
    res = `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}  ${digits.slice(8)}`;
  } else {
    res = `${digits.slice(0, 4)} / ${digits.slice(4, 6)} / ${digits.slice(6, 8)}  ${digits.slice(8, 10)} : ${digits.slice(10, 12)}`;
  }

  if (digits.length >= 9) {
    if (hasPM) res += ' PM';
    else if (hasAM) res += ' AM';
  }

  return res;
}

interface ValidationResult {
  isValid: boolean;
  error: string | null;
  formattedValue: string;
}

/**
 * 严格校验并提供精准错误提示：
 * - 年份 1900 - 2100
 * - 月份 01 - 12
 * - 日期有效性（匹配对应月份实际天数，含闰年）
 * - 时分有效性（00-23 时，00-59 分，或 12 小时制 01-12 AM/PM）
 */
function validateDateTimeInput(text: string, showTime = true): ValidationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { isValid: true, error: null, formattedValue: '' };
  }

  const isPM = /pm/i.test(trimmed);
  const isAM = /am/i.test(trimmed);
  const hasMeridiem = isPM || isAM;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) {
    return { isValid: true, error: null, formattedValue: '' };
  }

  if (digits.length < 8) {
    return {
      isValid: false,
      error: '日期不完整，请输入 8 位年月日（如 2026/08/18）',
      formattedValue: '',
    };
  }

  if (showTime && digits.length > 8 && digits.length < 12) {
    return {
      isValid: false,
      error: '时间不完整，请输入完整 4 位时分（如 14:30）或仅输入日期',
      formattedValue: '',
    };
  }

  const y = parseInt(digits.slice(0, 4), 10);
  const m = parseInt(digits.slice(4, 6), 10);
  const d = parseInt(digits.slice(6, 8), 10);

  if (y < 1900 || y > 2100) {
    return {
      isValid: false,
      error: `年份超出合理范围（当前 ${y}，请输入 1900 至 2100 年）`,
      formattedValue: '',
    };
  }

  if (m < 1 || m > 12) {
    return {
      isValid: false,
      error: `月份无效（当前输入 ${m} 月，需在 01 至 12 之间）`,
      formattedValue: '',
    };
  }

  const maxDays = new Date(y, m, 0).getDate();
  if (d < 1 || d > maxDays) {
    return {
      isValid: false,
      error: `${y}年${m}月最多只有 ${maxDays} 天（当前输入为 ${d} 日）`,
      formattedValue: '',
    };
  }

  // 纯日期模式或只输入了 8 位日期
  if (!showTime || digits.length === 8) {
    return {
      isValid: true,
      error: null,
      formattedValue: `${y}-${padZero(m)}-${padZero(d)}`,
    };
  }

  // 带时间输入
  let hour = parseInt(digits.slice(8, 10), 10);
  const min = parseInt(digits.slice(10, 12), 10);

  if (hasMeridiem) {
    if (hour < 1 || hour > 12) {
      return {
        isValid: false,
        error: `12小时制小时需在 01 至 12 之间（当前输入为 ${hour}）`,
        formattedValue: '',
      };
    }
    if (isPM) {
      hour = hour === 12 ? 12 : hour + 12;
    } else {
      hour = hour === 12 ? 0 : hour;
    }
  } else {
    if (hour < 0 || hour > 23) {
      return {
        isValid: false,
        error: `24小时制小时需在 00 至 23 之间（当前输入为 ${hour} 时）`,
        formattedValue: '',
      };
    }
  }

  if (min < 0 || min > 59) {
    return {
      isValid: false,
      error: `分钟无效（当前输入为 ${min} 分，需在 00 至 59 之间）`,
      formattedValue: '',
    };
  }

  return {
    isValid: true,
    error: null,
    formattedValue: `${y}-${padZero(m)}-${padZero(d)} ${padZero(hour)}:${padZero(min)}`,
  };
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 极简现代交互式模拟钟表表盘（Minimalist Direct-Grab Clock Dial）：
 * 1. 解决指针切换与拖拽冲突：时针与分针拥有独立直接捕获热区，用户「按住任意指针即可直接拖动」，无需先选中再拖动；
 * 2. 点按表盘内圈自动抓取时针，点按外圈自动抓取分针，告别误触跳变；
 * 3. 极简呼吸高亮，仅保留 12/3/6/9 核心刻度与 8 个微点。
 */
interface MinimalistClockProps {
  hour: number;
  minute: number;
  activeField: 'hour' | 'minute';
  onSelectField: (field: 'hour' | 'minute') => void;
  onChangeTime: (hour: number, minute: number) => void;
  disabled?: boolean;
}

function MinimalistClockDial({
  hour,
  minute,
  activeField,
  onSelectField,
  onChangeTime,
  disabled = false,
}: MinimalistClockProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);
  const dragTargetRef = useRef<'hour' | 'minute'>('hour');

  const isPM = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const hourAngle = ((hour % 12) + minute / 60) * 30;
  const minuteAngle = minute * 6;

  // 根据当前坐标及拖拽目标计算时间
  const updateTimeByTarget = useCallback(
    (targetField: 'hour' | 'minute', clientX: number, clientY: number) => {
      if (!svgRef.current || disabled) return;
      const rect = svgRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;

      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (deg < 0) deg += 360;

      if (targetField === 'hour') {
        let rawH = Math.round(deg / 30) % 12;
        if (isPM) {
          rawH = rawH === 0 ? 12 : rawH + 12;
        } else {
          rawH = rawH === 12 ? 0 : rawH;
        }
        onChangeTime(rawH, minute);
      } else {
        const newM = Math.round(deg / 6) % 60;
        onChangeTime(hour, newM);
      }
    },
    [disabled, hour, isPM, minute, onChangeTime],
  );

  // 开始拖拽某根特定指针（直接抓取拖动）
  function startDraggingHand(targetField: 'hour' | 'minute', e: ReactPointerEvent) {
    if (disabled) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    dragTargetRef.current = targetField;
    onSelectField(targetField);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateTimeByTarget(targetField, e.clientX, e.clientY);
  }

  // 点击表盘背景区域时的智能分流（内圈归时针，外圈归分针）
  function handleDialBackgroundPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const radius = Math.hypot(dx, dy);

    // 半径 <= 42 为内圈（抓时针），> 42 为外圈（抓分针）
    const targetField: 'hour' | 'minute' = radius <= 42 ? 'hour' : 'minute';
    startDraggingHand(targetField, e);
  }

  function handleGlobalPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!isDraggingRef.current || disabled) return;
    updateTimeByTarget(dragTargetRef.current, e.clientX, e.clientY);
  }

  function handleGlobalPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    isDraggingRef.current = false;
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col items-center select-none">
      {/* 顶部数字时分卡片（微透轻量选中态） */}
      <div className="mb-2.5 flex items-center justify-between w-full px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectField('hour')}
            className={`rounded-control px-2 py-0.5 text-xs font-bold tabular-nums border transition-all ${
              activeField === 'hour'
                ? 'border-accent bg-accent-soft/70 text-accent font-black ring-1 ring-accent/30 shadow-2xs'
                : 'border-line/60 bg-surface text-ink hover:bg-surface-2'
            }`}
            title="点击切换调节小时（或直接按住时针拖拽）"
          >
            {padZero(hour)}
          </button>
          <span className="text-xs font-bold text-muted animate-pulse">:</span>
          <button
            type="button"
            onClick={() => onSelectField('minute')}
            className={`rounded-control px-2 py-0.5 text-xs font-bold tabular-nums border transition-all ${
              activeField === 'minute'
                ? 'border-accent bg-accent-soft/70 text-accent font-black ring-1 ring-accent/30 shadow-2xs'
                : 'border-line/60 bg-surface text-ink hover:bg-surface-2'
            }`}
            title="点击切换调节分钟（或直接按住分针拖拽）"
          >
            {padZero(minute)}
          </button>
        </div>

        {/* 极简 AM / PM 切换胶囊 */}
        <div className="flex items-center rounded-control bg-surface-2 p-0.5 border border-line/60 text-[10px]">
          <button
            type="button"
            onClick={() => {
              if (isPM) onChangeTime(hour - 12, minute);
            }}
            className={`rounded-[4px] px-1.5 py-0.5 font-bold transition ${
              !isPM
                ? 'bg-surface text-accent shadow-2xs font-black'
                : 'text-muted hover:text-ink font-medium'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isPM) onChangeTime(hour + 12, minute);
            }}
            className={`rounded-[4px] px-1.5 py-0.5 font-bold transition ${
              isPM
                ? 'bg-surface text-accent shadow-2xs font-black'
                : 'text-muted hover:text-ink font-medium'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* 现代极简双指针可直接抓取表盘 */}
      <div className="relative">
        <svg
          ref={svgRef}
          width={136}
          height={136}
          viewBox="0 0 140 140"
          className="touch-none select-none"
          onPointerDown={handleDialBackgroundPointerDown}
          onPointerMove={handleGlobalPointerMove}
          onPointerUp={handleGlobalPointerUp}
        >
          {/* 表盘背景 */}
          <circle
            cx="70"
            cy="70"
            r="66"
            className="fill-surface stroke-line/60 hover:stroke-accent/40 transition-colors"
            strokeWidth="1.5"
          />
          <circle cx="70" cy="70" r="62" className="fill-surface-2/30" />

          {/* 12 点、3 点、6 点、9 点四大核心极简刻度数字 */}
          {[
            { label: '12', x: 70, y: 19, val: 12 },
            { label: '3', x: 121, y: 70, val: 3 },
            { label: '6', x: 70, y: 121, val: 6 },
            { label: '9', x: 19, y: 70, val: 9 },
          ].map((item) => (
            <text
              key={item.label}
              x={item.x}
              y={item.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`text-[9px] font-bold select-none transition-colors ${
                (activeField === 'hour' && hour12 === item.val) ||
                (activeField === 'minute' &&
                  Math.round(minute / 15) * 3 === (item.val === 12 ? 0 : item.val))
                  ? 'fill-accent font-black'
                  : 'fill-muted/80 hover:fill-ink'
              }`}
            >
              {activeField === 'minute' ? padZero(item.val === 12 ? 0 : item.val * 5) : item.label}
            </text>
          ))}

          {/* 其余 8 个小时极简刻度微点 */}
          {[1, 2, 4, 5, 7, 8, 10, 11].map((h) => {
            const angleDeg = h * 30;
            const rad = ((angleDeg - 90) * Math.PI) / 180;
            const x = 70 + 51 * Math.cos(rad);
            const y = 70 + 51 * Math.sin(rad);
            return (
              <circle
                key={h}
                cx={x}
                cy={y}
                r="1.5"
                className="fill-muted/40 hover:fill-accent/80 transition-colors"
              />
            );
          })}

          {/* 时针组（带独立加大手势抓取透明热区，按住即可直接拖动） */}
          <g
            transform={`rotate(${hourAngle} 70 70)`}
            onPointerDown={(e) => startDraggingHand('hour', e)}
            className="cursor-grab active:cursor-grabbing"
          >
            {/* 隐藏的加大捕获热区 */}
            <line
              x1="70"
              y1="70"
              x2="70"
              y2="34"
              stroke="transparent"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* 可见的时针 */}
            <line
              x1="70"
              y1="70"
              x2="70"
              y2="36"
              className={`transition-colors duration-150 ${
                activeField === 'hour'
                  ? 'stroke-accent stroke-[3]'
                  : 'stroke-ink dark:stroke-slate-300 stroke-[2.5]'
              }`}
              strokeLinecap="round"
            />
            {activeField === 'hour' && (
              <circle cx="70" cy="36" r="3" className="fill-accent animate-scale-in" />
            )}
          </g>

          {/* 分针组（带独立加大手势抓取透明热区，按住即可直接拖动） */}
          <g
            transform={`rotate(${minuteAngle} 70 70)`}
            onPointerDown={(e) => startDraggingHand('minute', e)}
            className="cursor-grab active:cursor-grabbing"
          >
            {/* 隐藏的加大捕获热区 */}
            <line
              x1="70"
              y1="70"
              x2="70"
              y2="20"
              stroke="transparent"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* 可见的分针 */}
            <line
              x1="70"
              y1="70"
              x2="70"
              y2="22"
              className={`transition-colors duration-150 ${
                activeField === 'minute'
                  ? 'stroke-accent stroke-[2.2]'
                  : 'stroke-muted dark:stroke-slate-400 stroke-[1.8]'
              }`}
              strokeLinecap="round"
            />
            {activeField === 'minute' && (
              <circle cx="70" cy="22" r="2.5" className="fill-accent animate-scale-in" />
            )}
          </g>

          {/* 中心轴微点 */}
          <circle cx="70" cy="70" r="3.5" className="fill-accent shadow-xs pointer-events-none" />
          <circle cx="70" cy="70" r="1.5" className="fill-white pointer-events-none" />
        </svg>
      </div>

      {/* 底部常用时间快捷小胶囊 */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-[10px]">
        {[
          { label: '09:00', h: 9, m: 0 },
          { label: '14:00', h: 14, m: 0 },
          { label: '18:00', h: 18, m: 0 },
          { label: '21:30', h: 21, m: 30 },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onChangeTime(t.h, t.m)}
            className="rounded-control bg-surface-2/70 px-1.5 py-0.5 font-medium text-secondary hover:bg-accent-soft hover:text-accent transition"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DatePicker({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  className = '',
  size = 'md',
  showTime = true,
}: DatePickerProps) {
  const defaultPlaceholder = showTime ? '年 / 月 / 日  时 : 分' : '年 / 月 / 日';
  const effectivePlaceholder = placeholder ?? defaultPlaceholder;

  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openUpward, setOpenUpward] = useState(false);

  // 解析初始 value
  const initialParsed = parseDateTime(value);
  const today = new Date();

  // 自动判断时分状态（有输入/选定时分即自动激活）
  const [hasTime, setHasTime] = useState<boolean>(
    showTime && initialParsed.hour !== null && initialParsed.minute !== null,
  );
  const [selectedHour, setSelectedHour] = useState<number>(() => initialParsed.hour ?? 9);
  const [selectedMinute, setSelectedMinute] = useState<number>(() => initialParsed.minute ?? 0);

  // 当前聚焦输入的指针类型：'hour'（时针高亮） | 'minute'（分针高亮）
  const [activeTimeField, setActiveTimeField] = useState<'hour' | 'minute'>('hour');

  const [inputText, setInputText] = useState(() => {
    if (!initialParsed.date) return '';
    const datePart = `${initialParsed.date.getFullYear()} / ${padZero(
      initialParsed.date.getMonth() + 1,
    )} / ${padZero(initialParsed.date.getDate())}`;
    if (showTime && initialParsed.hour !== null && initialParsed.minute !== null) {
      return `${datePart}  ${padZero(initialParsed.hour)} : ${padZero(initialParsed.minute)}`;
    }
    return datePart;
  });

  const [viewYear, setViewYear] = useState(
    () => initialParsed.date?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    () => initialParsed.date?.getMonth() ?? today.getMonth(),
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => initialParsed.date);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步外部 value 变化
  useEffect(() => {
    const parsed = parseDateTime(value);
    setSelectedDate(parsed.date);
    if (showTime && parsed.hour !== null && parsed.minute !== null) {
      setHasTime(true);
      setSelectedHour(parsed.hour);
      setSelectedMinute(parsed.minute);
    } else {
      setHasTime(false);
    }

    if (parsed.date) {
      const datePart = `${parsed.date.getFullYear()} / ${padZero(
        parsed.date.getMonth() + 1,
      )} / ${padZero(parsed.date.getDate())}`;
      if (showTime && parsed.hour !== null && parsed.minute !== null) {
        setInputText(`${datePart}  ${padZero(parsed.hour)} : ${padZero(parsed.minute)}`);
      } else {
        setInputText(datePart);
      }
      setViewYear(parsed.date.getFullYear());
      setViewMonth(parsed.date.getMonth());
      setErrorMessage(null);
    } else {
      setInputText('');
      setErrorMessage(null);
    }
  }, [showTime, value]);

  // 点击外部关闭弹窗
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

  // 视口感知
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 380 && rect.top > 380) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  // 提交并同步最新选中状态给上层
  function commitChange(
    targetDate: Date | null,
    includeTime: boolean,
    targetHour: number,
    targetMinute: number,
  ) {
    if (!targetDate) {
      onChange('');
      setInputText('');
      setErrorMessage(null);
      return;
    }

    const formatted = formatValue(
      targetDate,
      showTime && includeTime ? targetHour : null,
      showTime && includeTime ? targetMinute : null,
    );
    onChange(formatted);

    const datePart = `${targetDate.getFullYear()} / ${padZero(
      targetDate.getMonth() + 1,
    )} / ${padZero(targetDate.getDate())}`;
    if (showTime && includeTime) {
      setInputText(`${datePart}  ${padZero(targetHour)} : ${padZero(targetMinute)}`);
    } else {
      setInputText(datePart);
    }
    setErrorMessage(null);
  }

  // 输入框文字输入联动与即时错误校验
  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const formatted = formatDisplayString(raw, showTime);
    setInputText(formatted);

    const digits = formatted.replace(/\D/g, '');

    // 检查输入光标位置并自动联动指针高亮变色
    if (showTime && digits.length >= 8) {
      if (digits.length > 8 && digits.length <= 10) {
        setActiveTimeField('hour');
      } else if (digits.length > 10) {
        setActiveTimeField('minute');
      }
    }

    // 自动判断时分状态并校验合法性
    if (digits.length === 8 || (showTime && digits.length === 12)) {
      const res = validateDateTimeInput(formatted, showTime);
      if (res.isValid) {
        setErrorMessage(null);
        onChange(res.formattedValue);
        const parsed = parseDateTime(res.formattedValue);
        if (parsed.date) {
          setSelectedDate(parsed.date);
          setViewYear(parsed.date.getFullYear());
          setViewMonth(parsed.date.getMonth());
          if (showTime && parsed.hour !== null && parsed.minute !== null) {
            setHasTime(true);
            setSelectedHour(parsed.hour);
            setSelectedMinute(parsed.minute);
          } else {
            setHasTime(false);
          }
        }
      } else {
        setErrorMessage(res.error);
      }
    } else if (digits.length === 0) {
      setErrorMessage(null);
      onChange('');
    } else if (errorMessage) {
      setErrorMessage(null);
    }
  }

  function handleInputKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showTime) return;
    const target = e.currentTarget;
    const selStart = target.selectionStart ?? 0;
    if (selStart >= 15 && selStart <= 17) {
      setActiveTimeField('hour');
    } else if (selStart >= 18) {
      setActiveTimeField('minute');
    }
  }

  function handleInputBlur(e: FocusEvent<HTMLDivElement>) {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    const res = validateDateTimeInput(inputText, showTime);
    if (!res.isValid) {
      setErrorMessage(res.error);
    } else {
      setErrorMessage(null);
      if (res.formattedValue !== (value ?? '')) {
        onChange(res.formattedValue);
      }
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const res = validateDateTimeInput(inputText, showTime);
      if (!res.isValid) {
        setErrorMessage(res.error);
      } else {
        setErrorMessage(null);
        onChange(res.formattedValue);
        setIsOpen(false);
      }
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  }

  function selectDate(d: Date) {
    setSelectedDate(d);
    commitChange(d, hasTime, selectedHour, selectedMinute);
  }

  function handleTimeChange(newH: number, newM: number) {
    if (!showTime) return;
    setSelectedHour(newH);
    setSelectedMinute(newM);
    setHasTime(true);
    const dateToUse = selectedDate ?? new Date();
    setSelectedDate(dateToUse);
    commitChange(dateToUse, true, newH, newM);
  }

  function handleClearTimeOnly() {
    setHasTime(false);
    const dateToUse = selectedDate ?? new Date();
    setSelectedDate(dateToUse);
    commitChange(dateToUse, false, selectedHour, selectedMinute);
  }

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // 计算 42 格日历矩阵
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
  const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getDate();
  const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();

  const prevDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    prevDays.push({
      day: d,
      date: new Date(viewYear, viewMonth - 1, d),
      isCurrentMonth: false,
    });
  }

  const currentDays: Array<{ day: number; date: Date; isCurrentMonth: boolean }> = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentDays.push({
      day: i,
      date: new Date(viewYear, viewMonth, i),
      isCurrentMonth: true,
    });
  }

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
      onBlur={handleInputBlur}
      className={`relative inline-block ${isOpen ? 'z-30' : ''} ${className}`}
    >
      {/* 触发输入框（存在错误时边框变红并带有轻度光晕） */}
      <div
        className={`group relative flex items-center justify-between gap-1.5 rounded-control border bg-surface transition-all duration-150 ${
          errorMessage
            ? 'border-critical shadow-2xs ring-2 ring-critical/20 bg-critical-soft/10 text-critical'
            : isOpen
              ? 'border-accent shadow-xs ring-2 ring-accent/20'
              : 'border-line hover:border-line hover:bg-surface-2/40'
        } ${inputHeight}`}
      >
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          {showTime && hasTime ? (
            <IconClock
              size={13}
              className={`shrink-0 transition-colors ${
                errorMessage ? 'text-critical' : 'text-accent'
              }`}
            />
          ) : (
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
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyUp={handleInputKeyUp}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder={effectivePlaceholder}
            disabled={disabled}
            className={`w-full bg-transparent font-medium tracking-wide placeholder:text-muted placeholder:font-normal focus:outline-none ${
              errorMessage ? 'text-critical' : 'text-ink'
            }`}
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {(value || inputText) && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                commitChange(null, false, 9, 0);
              }}
              title="清空"
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
            aria-label="打开日历面板"
          >
            <span className="text-[9px] opacity-70">▼</span>
          </button>
        </div>
      </div>

      {/* 错误提示小微标（输入或格式错误时弹出） */}
      {errorMessage && (
        <div
          className="mt-1 flex items-center gap-1 text-[11px] font-medium text-critical animate-slide-down-in"
          role="alert"
        >
          <IconAlertCircle size={12} className="shrink-0 text-critical" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 日历（以及可选的模拟钟表）下拉面板 */}
      {isOpen && (
        <div
          className={`absolute left-0 z-[60] rounded-panel border border-line bg-surface p-3.5 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 ${
            showTime ? 'w-full sm:w-[490px]' : 'w-72'
          } ${
            openUpward
              ? 'bottom-full mb-1.5 animate-scale-in origin-bottom-left'
              : 'top-full mt-1.5 animate-scale-in origin-top-left'
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div className={`flex ${showTime ? 'flex-col sm:flex-row gap-3.5' : 'flex-col'}`}>
            {/* 日历面板 */}
            <div className={`flex-1 ${showTime ? 'min-w-[230px]' : 'w-full'}`}>
              <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
                <span className="text-xs font-bold text-ink">
                  {viewYear}年 {viewMonth + 1}月
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink transition"
                    title="上个月"
                  >
                    <IconChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink transition"
                    title="下个月"
                  >
                    <IconChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* 星期标头 */}
              <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold text-muted">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>

              {/* 日期矩阵 */}
              <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
                {allCalendarDays.map(({ day, date: cellDate, isCurrentMonth }, idx) => {
                  const isSelected =
                    selectedDate &&
                    selectedDate.getFullYear() === cellDate.getFullYear() &&
                    selectedDate.getMonth() === cellDate.getMonth() &&
                    selectedDate.getDate() === cellDate.getDate();

                  const isToday =
                    today.getFullYear() === cellDate.getFullYear() &&
                    today.getMonth() === cellDate.getMonth() &&
                    today.getDate() === cellDate.getDate();

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectDate(cellDate)}
                      className={`relative flex size-7 items-center justify-center rounded-control font-medium transition-all ${
                        isSelected
                          ? 'bg-accent font-bold text-white shadow-xs scale-105 ring-2 ring-accent/30'
                          : isCurrentMonth
                            ? 'text-ink hover:bg-surface-2 hover:font-bold'
                            : 'text-muted/40 hover:bg-surface-2/40'
                      }`}
                    >
                      <span>{day}</span>
                      {isToday && !isSelected && (
                        <span className="absolute bottom-0.5 size-1 rounded-full bg-accent" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 快捷日期预设 */}
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => selectDate(new Date())}
                  className="font-medium text-accent hover:underline"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    selectDate(d);
                  }}
                  className="text-muted hover:text-ink"
                >
                  明天
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const day = d.getDay();
                    const diff = day === 0 ? 0 : 7 - day;
                    d.setDate(d.getDate() + diff);
                    selectDate(d);
                  }}
                  className="text-muted hover:text-ink"
                >
                  本周末
                </button>
              </div>
            </div>

            {/* showTime=true 时的右侧时钟分栏 */}
            {showTime && (
              <>
                <div className="hidden sm:block w-[1px] bg-line/60 self-stretch" />

                <div className="w-full sm:w-[210px] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-line/60 pb-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                        <IconClock size={13} className="text-accent" />
                        <span>时间设置</span>
                      </div>

                      {hasTime ? (
                        <button
                          type="button"
                          onClick={handleClearTimeOnly}
                          className="text-[11px] text-muted hover:text-critical transition"
                          title="清除时分，仅保留日期"
                        >
                          仅保留日期
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted">拖动指针即开启</span>
                      )}
                    </div>

                    <MinimalistClockDial
                      hour={selectedHour}
                      minute={selectedMinute}
                      activeField={activeTimeField}
                      onSelectField={setActiveTimeField}
                      onChangeTime={handleTimeChange}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        commitChange(null, false, 9, 0);
                        setIsOpen(false);
                      }}
                      className="text-critical hover:underline"
                    >
                      清空全部
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-control bg-accent px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-accent/90 transition"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* showTime=false 时的底部确定栏 */}
            {!showTime && (
              <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    commitChange(null, false, 9, 0);
                    setIsOpen(false);
                  }}
                  className="text-critical hover:underline"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-control bg-accent px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-accent/90 transition"
                >
                  确定
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
