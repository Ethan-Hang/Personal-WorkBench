import React, { useEffect, type ReactNode } from 'react';
import { Command } from 'cmdk';
import PinyinMatch from 'pinyin-match';
import { IconSearch } from './icons.js';

export type CommandCategory = 'command' | 'navigation' | 'item' | 'domain';

export interface CommandItemDescriptor {
  id: string;
  category: CommandCategory;
  /** 用于展示的标题 */
  title: string;
  /** 副标题或额外描述（如 "秋招模块 · 技术面"、"偏好设置"） */
  subtitle?: string;
  /** 参与检索的额外关键词（包含英文别名、缩写等） */
  keywords?: string[];
  /** 徽标列表，如 ['今日', 'S级', '飞书'] */
  badges?: string[];
  /** 图标组件 */
  icon?: ReactNode;
  /** 快捷键提示（如 "⌘,"） */
  shortcut?: string;
  /** 选中后的执行动作 */
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItemDescriptor[];
  placeholder?: string;
}

/**
 * 拼音与文本混合过滤函数。
 * 供 cmdk 的 filter 属性使用，返回 1 表示命中，0 表示未命中。
 */
export function matchCommandItem(
  item: Pick<CommandItemDescriptor, 'title' | 'subtitle' | 'keywords'>,
  search: string,
): number {
  if (!search.trim()) return 1;
  const query = search.trim().toLowerCase();

  // 1. 标题与副标题直接子串匹配
  const titleLower = item.title.toLowerCase();
  const subtitleLower = item.subtitle?.toLowerCase() ?? '';

  if (titleLower.includes(query) || subtitleLower.includes(query)) {
    return 1;
  }

  // 2. 关键词子串匹配
  if (item.keywords?.some((k) => k.toLowerCase().includes(query))) {
    return 1;
  }

  // 3. 拼音匹配（全拼、拼音首字母、多音字）
  if (PinyinMatch.match(item.title, query)) {
    return 1;
  }
  if (item.subtitle && PinyinMatch.match(item.subtitle, query)) {
    return 1;
  }
  if (item.keywords?.some((k) => PinyinMatch.match(k, query))) {
    return 1;
  }

  return 0;
}

const CATEGORY_TITLES: Record<CommandCategory, string> = {
  navigation: '快速导航',
  command: '快捷命令',
  item: '事项与日程',
  domain: '秋招与领域数据',
};

const CATEGORY_ORDER: CommandCategory[] = ['command', 'navigation', 'item', 'domain'];

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = '搜索事项、公司，或输入命令…',
}: CommandPaletteProps) {
  // 全局快捷键 ⌘K / Ctrl+K 监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  // 将传入项按 Category 分组
  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_TITLES[category],
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  // 构建用于 cmdk 快速查找 item 的 Map
  const itemMap = new Map<string, CommandItemDescriptor>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-16 sm:pt-24 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <Command
        filter={(value, search) => {
          const item = itemMap.get(value);
          if (!item) return 0;
          return matchCommandItem(item, search);
        }}
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl transition-all"
      >
        {/* 顶部搜索栏 */}
        <div className="flex h-14 items-center gap-3 border-b border-line px-4 shrink-0">
          <IconSearch size={18} className="text-muted shrink-0" />
          <Command.Input
            autoFocus
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted outline-hidden"
          />
          <kbd
            onClick={() => onOpenChange(false)}
            className="cursor-pointer select-none rounded-control border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted hover:text-ink"
          >
            ESC
          </kbd>
        </div>

        {/* 列表主体 */}
        <Command.List className="flex-1 overflow-y-auto p-2 scroll-py-2">
          <Command.Empty className="py-10 text-center text-xs text-muted">
            未找到匹配的命令或事项
          </Command.Empty>

          {groupedItems.map((group) => (
            <Command.Group
              key={group.category}
              heading={group.label}
              className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase"
            >
              {group.items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    void item.onSelect();
                    onOpenChange(false);
                  }}
                  className="relative flex cursor-pointer select-none items-center justify-between rounded-control px-2.5 py-2 text-xs text-ink transition-colors aria-selected:bg-accent aria-selected:text-white group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {item.icon && (
                      <span className="shrink-0 text-muted group-aria-selected:text-white">
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate font-medium">{item.title}</span>
                    {item.subtitle && (
                      <span className="truncate text-[11px] text-muted group-aria-selected:text-white/80">
                        {item.subtitle}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {item.badges?.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted group-aria-selected:bg-white/20 group-aria-selected:text-white"
                      >
                        {badge}
                      </span>
                    ))}
                    {item.shortcut && (
                      <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted group-aria-selected:border-white/30 group-aria-selected:bg-white/20 group-aria-selected:text-white">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>

        {/* 底部快捷键提示 */}
        <div className="flex items-center justify-between border-t border-line/60 bg-surface-2/40 px-4 py-2 text-[11px] text-muted shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[9px] border border-line">
                ↑
              </kbd>
              <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[9px] border border-line">
                ↓
              </kbd>
              <span>导航</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[9px] border border-line">
                ↵
              </kbd>
              <span>选择</span>
            </span>
          </div>
          <span className="text-[10px] opacity-70">按 ESC 退出</span>
        </div>
      </Command>
    </div>
  );
}
