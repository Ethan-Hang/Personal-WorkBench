import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-white font-bold hover:brightness-105',
  ghost: 'border-line bg-surface text-ink hover:bg-surface-2',
};

/**
 * 主按钮与次按钮。对应原型里的 .primary-button / .ghost-button。
 */
export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-control border px-3 py-[9px] transition disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
