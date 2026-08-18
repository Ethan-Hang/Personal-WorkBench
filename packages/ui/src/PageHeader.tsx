import type { ReactNode } from 'react';

/**
 * 页面标题区：小标签 + 主标题 + 副标题 + 右侧动作。
 * 对应原型里的 .eyebrow + h1 + .top-actions。
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}
    >
      <div>
        {eyebrow !== undefined && (
          <p className="text-[11px] font-bold tracking-[0.08em] text-accent uppercase">{eyebrow}</p>
        )}
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink sm:text-[26px]">
          {title}
        </h1>
        {subtitle !== undefined && <p className="mt-1 text-xs text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
