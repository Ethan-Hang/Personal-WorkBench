import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

  const modalElement = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* 全屏毛玻璃背景遮罩：突破任何父容器 transform 限制，全屏弥散模糊 */}
      <div
        className={`fixed inset-0 bg-black/25 dark:bg-black/45 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-200 ease-out ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗实体：高质感亚克力毛玻璃 (Acrylic/Mica) 表面 */}
      <div
        className={`relative z-10 w-full ${maxWidth} rounded-panel border border-line/90 bg-surface/90 dark:bg-surface/90 backdrop-blur-2xl p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10 transition-all duration-200 ease-out ${
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

  if (typeof document !== 'undefined') {
    return createPortal(modalElement, document.body);
  }

  return modalElement;
}
