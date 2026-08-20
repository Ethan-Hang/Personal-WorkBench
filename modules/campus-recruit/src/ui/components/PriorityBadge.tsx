import type { ApplicationPriority } from '../../contract.js';

const PRIORITY_STYLES: Record<ApplicationPriority, { bg: string; text: string; border: string }> = {
  S: {
    bg: 'bg-critical-soft text-critical border-critical/30',
    text: 'text-critical',
    border: 'border-critical',
  },
  A: {
    bg: 'bg-warning-soft text-warning border-warning/30',
    text: 'text-warning',
    border: 'border-warning',
  },
  B: {
    bg: 'bg-accent/10 text-accent border-accent/30',
    text: 'text-accent',
    border: 'border-accent',
  },
  C: {
    bg: 'bg-surface-2 text-muted border-line',
    text: 'text-muted',
    border: 'border-line',
  },
};

export function PriorityBadge({
  priority,
  size = 'md',
}: {
  priority: ApplicationPriority;
  size?: 'sm' | 'md';
}) {
  const style = PRIORITY_STYLES[priority];
  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[10px] font-bold'
      : 'px-2 py-0.5 text-[11px] font-bold tracking-wide';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm border tabular-nums ${style.bg} ${sizeClasses}`}
      title={`优先级 ${priority} 级`}
    >
      {priority}
    </span>
  );
}

export function getPriorityRailClass(priority: ApplicationPriority): string {
  return PRIORITY_STYLES[priority].border;
}
