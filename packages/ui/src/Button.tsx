import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'secondary' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-white font-bold hover:opacity-90 active:scale-[0.98]',
  ghost: 'border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-2/80',
  secondary: 'border-transparent bg-surface-2 text-ink hover:bg-line/60 active:scale-[0.98]',
  danger: 'border-critical bg-critical text-white font-bold hover:opacity-90 active:scale-[0.98]',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-[7px] text-xs font-semibold',
  lg: 'px-4 py-2 text-sm font-semibold',
};

/**
 * 主按钮、次按钮与危险按钮。对应原型里的 .primary-button / .ghost-button。
 */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-control border transition duration-150 disabled:pointer-events-none disabled:opacity-50 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
