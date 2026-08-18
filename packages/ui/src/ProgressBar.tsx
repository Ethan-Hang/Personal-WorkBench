import type { ReactNode } from 'react';

type ProgressTone =
  'accent' | 'good' | 'warning' | 'critical' | 'goal' | 'habit' | 'neutral' | 'white';

const TONE_BAR_CLASS: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  good: 'bg-good',
  warning: 'bg-warning',
  critical: 'bg-critical',
  goal: 'bg-goal',
  habit: 'bg-habit',
  neutral: 'bg-secondary',
  white: 'bg-white',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  size = 'md',
  className = '',
  showLabel = false,
  label,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
  label?: string;
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const heightClass = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="mb-1 flex items-center justify-between text-xs text-secondary">
          <span>{label}</span>
          <span className="font-semibold tabular-nums text-ink">{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-surface-2 ${heightClass}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${TONE_BAR_CLASS[tone]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function MetricRing({
  value,
  max = 100,
  label,
  sublabel,
  size = 56,
  strokeWidth = 4.5,
  tone = 'accent',
  trackStroke,
  textColor = 'text-ink',
  children,
}: {
  value: number;
  max?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressTone;
  trackStroke?: string;
  textColor?: string;
  children?: ReactNode;
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const strokeColorMap: Record<ProgressTone, string> = {
    accent: 'var(--color-accent)',
    good: 'var(--color-good)',
    warning: 'var(--color-warning)',
    critical: 'var(--color-critical)',
    goal: 'var(--color-goal)',
    habit: 'var(--color-habit)',
    neutral: 'var(--color-secondary)',
    white: '#ffffff',
  };

  const defaultTrack = trackStroke ?? 'var(--color-line)';

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={defaultTrack}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColorMap[tone]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="none"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children ?? (
            <span className={`text-xs font-bold tabular-nums leading-none ${textColor}`}>
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
      {label && <div className={`mt-1 text-[11px] font-semibold ${textColor}`}>{label}</div>}
      {sublabel && <div className="text-[10px] opacity-75">{sublabel}</div>}
    </div>
  );
}
