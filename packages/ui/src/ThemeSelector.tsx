import { useState, useRef, useEffect } from 'react';
import { useTheme, PALETTES, type ThemeMode } from './ThemeContext.js';
import { IconSun, IconMoon, IconMonitor, IconPalette, IconCheck } from './icons.js';

export function ThemeSelector({ className = '' }: { className?: string }) {
  const { mode, palette, resolvedMode, setMode, setPalette } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentPalette =
    PALETTES.find((p) => p.id === palette) ?? (PALETTES[0] as (typeof PALETTES)[number]);

  const modeOptions: Array<{ id: ThemeMode; label: string; icon: typeof IconSun }> = [
    { id: 'light', label: '浅色', icon: IconSun },
    { id: 'dark', label: '深色', icon: IconMoon },
    { id: 'system', label: '跟随系统', icon: IconMonitor },
  ];

  return (
    <div className={`relative inline-block text-left ${className}`} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="切换主题与模式"
        title="个性化与主题外观"
        className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-xs transition hover:bg-surface-2 focus:outline-none"
      >
        <span
          className="size-3 rounded-full border border-black/10 transition-colors dark:border-white/20"
          style={{ backgroundColor: currentPalette.primaryColor }}
        />
        <span className="hidden sm:inline">{currentPalette.name}</span>
        <span className="text-muted">
          {resolvedMode === 'dark' ? <IconMoon size={14} /> : <IconSun size={14} />}
        </span>
      </button>

      {isOpen && (
        <div
          className="animate-in fade-in zoom-in-95 absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-panel border border-line bg-surface p-3.5 shadow-xl duration-150"
          role="dialog"
          aria-label="主题偏好设置"
        >
          {/* 模式选择 */}
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted uppercase">
              <span>显示模式</span>
              <span className="text-[10px] lowercase text-muted/80">Mode</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-2 p-1">
              {modeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-xs font-semibold transition ${
                      active ? 'bg-surface text-ink shadow-xs' : 'text-secondary hover:text-ink'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 配色方案选择 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted uppercase">
              <span>配色方案</span>
              <IconPalette size={13} className="text-muted" />
            </div>
            <div className="space-y-1">
              {PALETTES.map((p) => {
                const isSelected = palette === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPalette(p.id)}
                    className={`flex w-full items-center justify-between rounded-control p-2 text-left transition ${
                      isSelected
                        ? 'border border-accent/30 bg-accent-soft text-ink'
                        : 'border border-transparent hover:bg-surface-2 text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* 色块预览圆点 */}
                      <span
                        className="size-4 shrink-0 rounded-full border border-black/10 shadow-inner dark:border-white/20"
                        style={{ backgroundColor: p.primaryColor }}
                      />
                      <div>
                        <div className="text-xs font-semibold leading-tight">{p.name}</div>
                        <div className="text-[10px] text-muted leading-tight">{p.description}</div>
                      </div>
                    </div>
                    {isSelected && <IconCheck size={14} className="text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
