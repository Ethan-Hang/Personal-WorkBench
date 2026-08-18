import type { ReactNode } from 'react';

/**
 * 表单字段：标签包住控件，因此不需要在调用处生成并对齐 id。
 * label 留空时只做布局，用于本身已带 aria-label 的控件。
 */
export function Field({
  label,
  className = '',
  children,
}: {
  label?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label !== undefined && (
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

/** 输入类控件的统一外观，供 input / select 直接套用。 */
export const controlClass =
  'rounded-control border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted focus:border-accent focus:outline-none';
