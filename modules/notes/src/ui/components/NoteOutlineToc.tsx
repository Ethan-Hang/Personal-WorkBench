import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { extractToc } from '../markdown/toc.js';
import type { TocItem } from '../markdown/types.js';

export function filterTocItems(items: TocItem[], query: string): TocItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  return items.filter((item) => item.text.toLowerCase().includes(trimmed));
}

export interface HeadingPosition {
  id: string;
  top: number;
}

export function calculateActiveHeadingId(
  headings: HeadingPosition[],
  scrollTop: number,
  offset = 80,
): string | null {
  if (headings.length === 0) return null;

  let activeId = headings[0]?.id ?? null;
  for (const h of headings) {
    if (scrollTop + offset >= h.top) {
      activeId = h.id;
    } else {
      break;
    }
  }
  return activeId;
}

export interface NoteOutlineTocProps {
  content: string;
  containerRef?: React.RefObject<HTMLElement | null>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectHeading?: (id: string) => void;
  className?: string;
}

export function NoteOutlineToc({
  content,
  containerRef,
  isCollapsed = false,
  onToggleCollapse,
  onSelectHeading,
  className = '',
}: NoteOutlineTocProps) {
  const [filterText, setFilterText] = useState('');
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  const tocItems = useMemo(() => extractToc(content), [content]);
  const filteredItems = useMemo(() => filterTocItems(tocItems, filterText), [tocItems, filterText]);

  // 监听容器滚动，计算当前视口内的激活标题 (Scroll Spy)
  const updateActiveHeading = useCallback(() => {
    const container = containerRef?.current;
    if (!container || tocItems.length === 0) return;

    const headingElements: HeadingPosition[] = [];
    for (const item of tocItems) {
      const el = container.querySelector(`[id="${CSS.escape(item.id)}"]`);
      if (el instanceof HTMLElement) {
        headingElements.push({
          id: item.id,
          top: el.offsetTop,
        });
      }
    }

    if (headingElements.length === 0) return;
    const currentActive = calculateActiveHeadingId(headingElements, container.scrollTop, 90);
    if (currentActive) {
      setActiveHeadingId(currentActive);
    }
  }, [containerRef, tocItems]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    updateActiveHeading();
    container.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveHeading);
  }, [containerRef, updateActiveHeading]);

  const handleHeadingClick = (id: string) => {
    setActiveHeadingId(id);
    onSelectHeading?.(id);

    const container = containerRef?.current;
    if (container) {
      const targetEl = container.querySelector(`[id="${CSS.escape(id)}"]`);
      if (targetEl instanceof HTMLElement) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 短暂高亮视觉提示
        targetEl.classList.add('bg-amber-100/60', 'dark:bg-amber-900/30', 'transition-colors');
        setTimeout(() => {
          targetEl.classList.remove('bg-amber-100/60', 'dark:bg-amber-900/30');
        }, 1200);
      }
    }
  };

  if (isCollapsed) {
    return (
      <div
        className={`flex flex-col items-center py-3 px-1 border-l border-line/60 bg-surface/80 backdrop-blur select-none ${className}`}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 rounded hover:bg-surface-2 text-secondary hover:text-ink transition"
          title={`展开大纲目录 (${tocItems.length} 个标题)`}
        >
          <span className="text-sm font-semibold">📑</span>
          {tocItems.length > 0 && (
            <span className="block mt-1 text-[10px] font-mono font-medium px-1 rounded-full bg-surface-3 text-secondary text-center">
              {tocItems.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`flex flex-col h-full border-l border-line/60 bg-surface/90 backdrop-blur w-64 text-xs select-none transition-all duration-200 ${className}`}
      aria-label="文档大纲"
    >
      {/* 头部：标题与折叠开关 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-line/60">
        <div className="flex items-center gap-1.5 font-semibold text-ink">
          <span>📑</span>
          <span>大纲目录</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-secondary font-mono">
            {tocItems.length}
          </span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-surface-2 text-muted hover:text-ink transition"
            title="折叠大纲"
            aria-label="折叠大纲"
          >
            <span className="text-xs">▶</span>
          </button>
        )}
      </div>

      {/* 搜索过滤框（超过 4 个标题时显示） */}
      {tocItems.length > 4 && (
        <div className="px-3 pt-2 pb-1.5">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="搜索目录大纲..."
            className="w-full px-2 py-1 text-xs rounded border border-line bg-surface-2/60 text-ink placeholder:text-muted focus:outline-none focus:border-amber-500 transition"
          />
        </div>
      )}

      {/* 大纲目录列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 custom-scrollbar">
        {tocItems.length === 0 ? (
          <div className="py-8 text-center text-muted">
            <p className="text-sm mb-1">📝</p>
            <p>正文中暂无标题</p>
            <p className="text-[10px] text-muted/80 mt-1">使用 # ~ ###### 添加标题</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-6 text-center text-muted">
            <p>无匹配标题</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isActive = activeHeadingId === item.id;
            const indentLevel = Math.max(0, Math.min(item.level - 1, 5));
            const indentPadding = `${indentLevel * 12 + 6}px`;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleHeadingClick(item.id)}
                style={{ paddingLeft: indentPadding }}
                className={`w-full text-left py-1 pr-2 rounded text-xs truncate transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-amber-100/80 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 font-semibold border-l-2 border-amber-500'
                    : 'text-secondary hover:text-ink hover:bg-surface-2'
                }`}
                title={`H${item.level}: ${item.text}`}
              >
                <span
                  className={`text-[9px] font-mono shrink-0 ${
                    isActive ? 'text-amber-600 dark:text-amber-400' : 'text-muted'
                  }`}
                >
                  H{item.level}
                </span>
                <span className="truncate">{item.text}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
