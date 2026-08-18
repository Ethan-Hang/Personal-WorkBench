import type { ReactNode } from 'react';

type Tone = 'neutral' | 'good' | 'warning' | 'critical' | 'accent' | 'goal' | 'habit';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-secondary border-transparent',
  good: 'bg-good-soft text-good border-good/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  critical: 'bg-critical-soft text-critical border-critical/20',
  accent: 'bg-accent-soft text-accent border-accent/20',
  goal: 'bg-[#f0e9f8] text-[#5a3481] border-[#7a4db1]/20 dark:bg-[#2e1d44] dark:text-[#c4a4f0]',
  habit: 'bg-[#e5f4ef] text-[#167c65] border-[#167c65]/20 dark:bg-[#13332a] dark:text-[#6ee7b7]',
};

/**
 * 小标签。七种语义色调各自配对了前景色与柔和底色。对应原型里的 .chip。
 */
export function Chip({
  tone = 'neutral',
  icon,
  className = '',
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight transition-colors ${TONE_CLASS[tone]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
