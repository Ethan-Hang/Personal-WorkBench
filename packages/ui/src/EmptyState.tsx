import type { ReactNode } from 'react';
import { IconCheckSquare } from './icons.js';

export function EmptyState({
  icon: Icon = IconCheckSquare,
  title,
  description,
  action,
  className = '',
}: {
  icon?: typeof IconCheckSquare;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-panel border border-dashed border-line/80 bg-surface/50 p-8 text-center ${className}`}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={24} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-muted leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
