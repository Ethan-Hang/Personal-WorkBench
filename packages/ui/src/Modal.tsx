import { useEffect, useState, type ReactNode } from 'react';
import { IconX } from './icons.js';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);

      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    if (!shouldRender) return;

    setIsClosing(true);
    const timer = setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [isOpen, shouldRender]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景遮罩：平滑淡入淡出过渡 */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200 ease-out ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗实体：平滑缩放与透明度过渡（允许内部 DatePicker 等浮层正常溢出置顶） */}
      <div
        className={`relative z-10 w-full ${maxWidth} rounded-panel border border-line bg-surface p-6 shadow-2xl transition-all duration-200 ease-out ${
          isClosing
            ? 'scale-95 opacity-0 translate-y-2'
            : 'scale-100 opacity-100 translate-y-0 animate-scale-in'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-lg font-bold tracking-tight text-ink">{title}</h3>}
            {description && <p className="mt-1 text-xs text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-8 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink transition"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
