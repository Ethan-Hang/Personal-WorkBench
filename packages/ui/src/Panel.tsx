import type { ReactNode } from 'react';

type PanelVariant = 'default' | 'subtle' | 'dark' | 'ghost';

/**
 * 内容卡片。可选的头部承载标题与右侧动作。
 * 对应原型里的 .panel / .panel-header。
 */
export function Panel({
  title,
  hint,
  action,
  children,
  variant = 'default',
  className = '',
  headerClassName = '',
  bodyClassName = 'px-[18px] py-4',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  variant?: PanelVariant;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title !== undefined || action !== undefined;

  const variantClasses: Record<PanelVariant, string> = {
    default: 'border border-line bg-surface shadow-xs',
    subtle: 'border border-line/60 bg-surface-2/40',
    dark: 'border-0 bg-[#1e293b] text-white dark:bg-[#18202f]',
    ghost: 'border-0 bg-transparent',
  };

  return (
    <section
      className={`rounded-panel transition-colors duration-200 ${variantClasses[variant]} ${className}`}
    >
      {hasHeader && (
        <header
          className={`flex min-h-14 items-center justify-between gap-3 border-b border-line px-[18px] py-3.5 ${headerClassName}`}
        >
          <div className="flex items-baseline gap-2">
            {title !== undefined && (
              <h2 className="text-[16px] font-bold tracking-tight text-ink">{title}</h2>
            )}
            {hint !== undefined && <small className="text-xs text-muted">{hint}</small>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
