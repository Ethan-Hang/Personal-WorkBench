import { useState, useRef, useEffect } from 'react';
import { useTheme, PALETTES, type ThemeMode } from './ThemeContext.js';
import { IconSun, IconMoon, IconMonitor, IconPalette, IconCheck } from './icons.js';

export function ThemeSelector({ className = '' }: { className?: string }) {
  const { mode, palette, resolvedMode, setMode, setPalette } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 处理出现与消失的平滑动效生命周期
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 160);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  // 点击外部关闭与 ESC 按键监听
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
        aria-expanded={isOpen}
        title="个性化与主题外观"
        className={`flex items-center gap-2 rounded-control border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 focus:outline-none ${
          isOpen
            ? 'border-accent/40 bg-surface-2 text-ink shadow-xs ring-2 ring-accent/20'
            : 'border-line bg-surface text-ink shadow-2xs hover:bg-surface-2'
        }`}
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

      {shouldRender && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-panel border border-line/80 bg-surface/85 p-3.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 ${
            isClosing ? 'animate-popover-exit' : 'animate-popover-enter'
          }`}
          role="dialog"
          aria-label="主题偏好设置"
        >
          {/* 模式选择 */}
          <div className="mb-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold tracking-wider text-muted uppercase">
              <span>显示模式</span>
              <span className="text-[10px] lowercase text-muted/80">Mode</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-2/70 p-1 backdrop-blur-xs">
              {modeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-xs font-semibold transition-all duration-150 ${
                      active
                        ? 'bg-surface text-ink shadow-xs'
                        : 'text-secondary hover:text-ink hover:bg-surface/50'
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
                    className={`flex w-full items-center justify-between rounded-control p-2 text-left transition-all duration-150 ${
                      isSelected
                        ? 'border border-accent/40 bg-accent-soft/70 text-ink shadow-2xs'
                        : 'border border-transparent hover:bg-surface-2/70 text-ink'
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
