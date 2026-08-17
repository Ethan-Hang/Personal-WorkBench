import type { ReactNode } from 'react';

type Tone = 'neutral' | 'good' | 'warning' | 'critical';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-secondary',
  good: 'bg-good-soft text-good',
  warning: 'bg-warning-soft text-warning',
  critical: 'bg-critical-soft text-critical',
};

/**
 * 小标签。四种色调各自配对了前景色与柔和底色，
 * 调用方只选语义，不选颜色。对应原型里的 .chip。
 */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
