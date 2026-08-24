import { useEffect, useRef, useState } from 'react';
import {
  formatAmountDraft,
  resolveAmountCommit,
  sanitizeAmountInput,
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

const SIZE_CLASS = {
  sm: { text: 'text-xs', width: 'min-w-[32px]', input: 'w-10' },
  md: { text: 'text-xs font-bold', width: 'min-w-[36px]', input: 'w-12' },
} as const;

/**
 * 打卡值显示 + 就地编辑。
 *
 * 点数字进入编辑态：回车 / 失焦提交，Esc 取消。
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
  const inputRef = useRef<HTMLInputElement>(null);
  /** 用 Esc 退出时不能再走 blur 的提交路径，否则「取消」会被立刻覆盖成「提交」 */
  const cancelledRef = useRef(false);
  const styles = SIZE_CLASS[size];
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const beginEdit = () => {
    if (disabled) return;
    cancelledRef.current = false;
    setDraft(formatAmountDraft(value));
  };

  const commit = () => {
    if (draft === null) return;
    const result = resolveAmountCommit(draft, value);
    setDraft(null);
    if (result.kind === 'commit') onCommit(result.value);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setDraft(null);
  };

  if (isEditing) {
    return (
      <span className={`flex items-center gap-0.5 ${styles.text} text-ink ${className}`}>
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
            commit();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className={`${styles.input} rounded-control border border-accent bg-surface px-1 py-0 text-center tabular-nums text-ink outline-none`}
        />
        <span className="tabular-nums text-muted">/{target}</span>
        {unit ? <span className="text-[10px] text-muted">{unit}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        beginEdit();
      }}
      title={disabled ? undefined : '点击直接输入打卡值'}
      className={`tabular-nums ${styles.text} font-semibold text-ink px-1 ${styles.width} text-center rounded-control hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent cursor-pointer transition-colors ${className}`}
    >
      {value}/{target}
      {unit ? <span className="text-[10px] text-muted ml-0.5">{unit}</span> : null}
    </button>
  );
}
