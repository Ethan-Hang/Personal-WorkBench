import { useEffect, useRef, useState } from 'react';
import {
  clampSliderValue,
  formatAmountDraft,
  resolveAmountCommit,
  sanitizeAmountInput,
  sliderMaxFor,
} from '../utils/amountInput.js';

export interface CheckinAmountInputProps {
  /** 当前打卡值 */
  value: number;
  /** 目标值，只作展示后缀，不可编辑 */
  target: number;
  /** 单位（次 / 分钟 / 页…），可为空 */
  unit?: string | null;
  disabled?: boolean;
  /** 尺寸：今日卡片用 sm，习惯详情页用 md */
  size?: 'sm' | 'md';
  /** 解析成功且与原值不同才会触发 */
  onCommit: (value: number) => void;
  className?: string;
}

/** 鼠标移出后延迟收起滑条的毫秒数 */
const HOVER_CLOSE_DELAY_MS = 180;

const SIZE_CLASS = {
  sm: { text: 'text-xs', width: 'min-w-[32px]', input: 'w-10', slider: 'w-28' },
  md: { text: 'text-xs font-bold', width: 'min-w-[36px]', input: 'w-12', slider: 'w-36' },
} as const;

/**
 * 打卡值显示 + 两种就地改值方式。
 *
 * - 鼠标靠近：浮出滑条，拖到目标刻度，**松手才提交**——拖动过程只做本地预览，
 *   否则一次拖拽会打出几十个写请求。
 * - 点数字：切成文本框直接键入，回车 / 失焦提交，Esc 取消。
 *
 * 100 分钟的习惯不必按 100 次「+」。
 */
export function CheckinAmountInput({
  value,
  target,
  unit,
  disabled = false,
  size = 'sm',
  onCommit,
  className = '',
}: CheckinAmountInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 用 Esc 退出时不能再走 blur 的提交路径，否则「取消」会被立刻覆盖成「提交」 */
  const cancelledRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = SIZE_CLASS[size];
  const isEditing = draft !== null;
  const sliderMax = sliderMaxFor(target, value);
  /** 拖动中显示预览值，松手后跟回真实值 */
  const displayValue = dragValue ?? value;
  /** 拖动时鼠标可能已经滑出包裹层，此时不能收起滑条，否则会丢掉 pointerup */
  const sliderOpen = !disabled && !isEditing && (hovered || dragging);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openSlider = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHovered(true);
  };

  /**
   * 延迟收起。间隙已经用 padding 补上了，这里再兜一层：鼠标划过浮层边缘的一两帧
   * 抖动不至于让滑条直接消失。
   */
  const scheduleClose = () => {
    if (dragging) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHovered(false);
    }, HOVER_CLOSE_DELAY_MS);
  };

  const beginEdit = () => {
    if (disabled) return;
    cancelledRef.current = false;
    setDraft(formatAmountDraft(value));
  };

  const commitDraft = () => {
    if (draft === null) return;
    const result = resolveAmountCommit(draft, value);
    setDraft(null);
    if (result.kind === 'commit') onCommit(result.value);
  };

  const cancelDraft = () => {
    cancelledRef.current = true;
    setDraft(null);
  };

  const commitDrag = () => {
    setDragging(false);
    if (dragValue === null) return;
    const next = dragValue;
    setDragValue(null);
    if (next !== value) onCommit(next);
    // 松手位置可能已在包裹层之外，那一次 mouseleave 被拖动状态吞掉了，这里补上收起
    if (!wrapperRef.current?.matches(':hover')) setHovered(false);
  };

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={openSlider}
      onMouseLeave={scheduleClose}
    >
      {sliderOpen && (
        /*
         * 浮层与数字之间那道缝必须用 padding 而不是 margin：margin 在元素盒子之外、
         * 不接收鼠标事件，鼠标往上移的那一刻会既不在数字上也不在浮层上，
         * mouseleave 立刻触发，滑条还没够到就消失了。
         * 外层只负责定位与那道可悬停的缝，内层才是可见的浮层。
         */
        <span className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 pb-1.5">
          <span className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 shadow-md animate-fade-in">
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={1}
              value={displayValue}
              aria-label="拖动设置打卡值"
              onChange={(e) => setDragValue(clampSliderValue(Number(e.target.value), sliderMax))}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={() => setDragging(true)}
              onPointerUp={commitDrag}
              onKeyUp={commitDrag}
              onBlur={commitDrag}
              className={`${styles.slider} h-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-habit`}
            />
            <span className="tabular-nums text-[11px] font-semibold text-ink whitespace-nowrap">
              {displayValue}
              {unit ? <span className="text-muted ml-0.5">{unit}</span> : null}
            </span>
          </span>
        </span>
      )}

      {isEditing ? (
        <span className={`flex items-center gap-0.5 ${styles.text} text-ink`}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={draft}
            aria-label="打卡值"
            onChange={(e) => setDraft(sanitizeAmountInput(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              if (cancelledRef.current) return;
              commitDraft();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelDraft();
              }
            }}
            className={`${styles.input} rounded-control border border-accent bg-surface px-1 py-0 text-center tabular-nums text-ink outline-none`}
          />
          <span className="tabular-nums text-muted">/{target}</span>
          {unit ? <span className="text-[10px] text-muted">{unit}</span> : null}
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            beginEdit();
          }}
          title={disabled ? undefined : '拖动上方滑条，或点击直接输入'}
          className={`tabular-nums ${styles.text} font-semibold text-ink px-1 ${styles.width} text-center rounded-control hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent cursor-pointer transition-colors`}
        >
          {displayValue}/{target}
          {unit ? <span className="text-[10px] text-muted ml-0.5">{unit}</span> : null}
        </button>
      )}
    </span>
  );
}
