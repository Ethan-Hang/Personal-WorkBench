import type { ButtonHTMLAttributes } from 'react';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'onClick'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'accent' | 'good' | 'warning';
  label?: string;
}

const SIZE_CONFIG = {
  sm: {
    track: 'h-5 w-9',
    thumb: 'size-4',
    thumbTranslate: 'translate-x-4',
  },
  md: {
    track: 'h-6 w-11',
    thumb: 'size-5',
    thumbTranslate: 'translate-x-5',
  },
  lg: {
    track: 'h-7 w-13',
    thumb: 'size-6',
    thumbTranslate: 'translate-x-6',
  },
} as const;

const TONE_ON_BG = {
  accent: 'bg-accent shadow-accent/20',
  good: 'bg-good shadow-good/20',
  warning: 'bg-warning shadow-warning/20',
} as const;

/**
 * 苹果风格胶囊式切换开关（Apple-style Capsule Toggle Switch）
 * 纯 GPU 硬件加速位移（transition-transform + will-change），高频极速连击不掉帧、不吞动画。
 */
export function Switch({
  checked,
  onChange,
  size = 'md',
  tone = 'accent',
  disabled = false,
  label,
  className = '',
  ...props
}: SwitchProps) {
  const config = SIZE_CONFIG[size];
  const onBgClass = TONE_ON_BG[tone];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={`group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 border border-transparent transition-colors duration-250 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 select-none ${
        config.track
      } ${
        checked
          ? `${onBgClass} shadow-xs hover:brightness-105 active:brightness-95`
          : 'bg-line/90 hover:bg-line dark:bg-slate-700/90 dark:hover:bg-slate-700'
      } ${className}`}
      {...props}
    >
      {/* 内部移动滑块 (Thumb): 使用纯 GPU 组合变换，连击时不触发 Layout Reflow */}
      <span
        className={`pointer-events-none block rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.15)] transform-gpu transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
          config.thumb
        } ${
          checked ? config.thumbTranslate : 'translate-x-0'
        } group-hover/switch:scale-105 group-active/switch:scale-95`}
      />
    </button>
  );
}
