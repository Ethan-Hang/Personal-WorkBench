import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from './Button.js';
import { DatePicker } from './DatePicker.js';
import { IconPlus, IconAlertCircle } from './icons.js';

export type QuickAddImportance = 'high' | 'normal' | 'low';

export function QuickAddBar({
  onAdd,
  placeholder = '想到什么，先记下来……（按 Enter 快速添加）',
  disabled = false,
  className = '',
}: {
  onAdd: (data: { title: string; importance: QuickAddImportance; dueDate: string | null }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [title, setTitle] = useState('');
  const [importance, setImportance] = useState<QuickAddImportance>('normal');
  const [dueDate, setDueDate] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || disabled) return;

    onAdd({
      title: trimmed,
      importance,
      dueDate: dueDate || null,
    });

    setTitle('');
    setDueDate('');
    setImportance('normal');
    setShowOptions(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className={`rounded-panel border border-line bg-surface p-2.5 shadow-xs transition-all focus-within:border-accent/50 focus-within:shadow-md ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center text-muted">
          <IconPlus size={16} />
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowOptions(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!title.trim() || disabled}
          onClick={() => handleSubmit()}
        >
          添加
        </Button>
      </div>

      {showOptions && (
        <div className="mt-2.5 flex flex-wrap items-center gap-4 border-t border-line/60 pt-2 text-xs">
          {/* 重要度 */}
          <div className="flex items-center gap-1.5 text-secondary">
            <IconAlertCircle size={13} className="text-muted" />
            <span className="text-[11px]">重要度:</span>
            <div className="inline-flex rounded-md bg-surface-2 p-0.5">
              {(['high', 'normal', 'low'] as const).map((imp) => {
                const labels: Record<QuickAddImportance, string> = {
                  high: '重要',
                  normal: '普通',
                  low: '低',
                };
                const active = importance === imp;
                return (
                  <button
                    key={imp}
                    type="button"
                    onClick={() => setImportance(imp)}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                      active
                        ? 'bg-surface font-semibold text-accent shadow-xs'
                        : 'text-secondary hover:text-ink'
                    }`}
                  >
                    {labels[imp]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 截止日：精致的自定义年月日与日历组件 */}
          <div className="flex items-center gap-1.5 text-secondary">
            <span className="text-[11px]">截止日:</span>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="年 / 月 / 日"
              size="sm"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
