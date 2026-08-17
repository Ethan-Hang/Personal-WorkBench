import type { ReactNode } from 'react';

/**
 * 内容卡片。可选的头部承载标题与右侧动作。
 * 对应原型里的 .panel / .panel-header。
 */
export function Panel({
  title,
  hint,
  action,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasHeader = title !== undefined || action !== undefined;

  return (
    <section className="rounded-panel border border-line bg-surface">
      {hasHeader && (
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-[18px] py-4">
          <div>
            {title !== undefined && <h2 className="text-[17px] tracking-tight">{title}</h2>}
            {hint !== undefined && <small className="text-muted">{hint}</small>}
          </div>
          {action}
        </header>
      )}
      <div className="px-[18px] py-4">{children}</div>
    </section>
  );
}
