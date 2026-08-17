import type { ReactNode } from 'react';

/**
 * 页面标题区：小标签 + 主标题 + 右侧动作。
 * 对应原型里的 .eyebrow + h1。
 */
export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        {eyebrow !== undefined && (
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-[27px] font-semibold tracking-[-0.035em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}
