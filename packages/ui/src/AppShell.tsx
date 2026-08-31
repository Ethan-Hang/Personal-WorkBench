import { useState, type ElementType, type ReactNode } from 'react';
import { ThemeSelector } from './ThemeSelector.js';
import { CommandPalette, type CommandItemDescriptor } from './CommandPalette.js';
import {
  IconDatabase,
  IconHome,
  IconBriefcase,
  IconCheckSquare,
  IconBarChart,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
  IconSettings,
  IconInfo,
  IconCalendar,
  IconBookOpen,
  IconMenu,
} from './icons.js';

export interface ShellNavItem {
  path: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

export function AppShell({
  navGroups,
  activePath,
  LinkComponent = 'a',
  topActions,
  commandItems,
  onCommandPaletteOpenChange,
  children,
  dbStatus = '本地 SQLite 已就绪',
  sidebarFooter,
}: {
  navGroups: ShellNavGroup[];
  activePath?: string;
  LinkComponent?: ElementType;
  topActions?: ReactNode;
  commandItems?: CommandItemDescriptor[];
  onCommandPaletteOpenChange?: (open: boolean) => void;
  children: ReactNode;
  dbStatus?: string;
  sidebarFooter?: ReactNode | ((props: { isCollapsed: boolean }) => ReactNode);
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isFullHeightModule =
    activePath === '/notes' ||
    activePath === '/research' ||
    activePath?.startsWith('/research/') === true;
  const activeModuleLabel = navGroups
    .flatMap((group) => group.items)
    .find(
      (item) =>
        item.path === activePath ||
        (item.path === '/research' && activePath?.startsWith('/research/') === true),
    )?.label;

  const handleSearchOpenChange = (open: boolean) => {
    setIsSearchOpen(open);
    onCommandPaletteOpenChange?.(open);
  };

  const Link = LinkComponent;

  const defaultIconForPath = (path: string) => {
    if (path === '/today' || path === '/') return <IconHome size={16} />;
    if (path === '/calendar') return <IconCalendar size={16} />;
    if (path === '/campus') return <IconBriefcase size={16} />;
    if (path === '/campus/stats') return <IconBarChart size={16} />;
    if (path === '/research') return <IconBookOpen size={16} />;
    if (path === '/settings') return <IconSettings size={16} />;
    if (path === '/about') return <IconInfo size={16} />;
    return <IconCheckSquare size={16} />;
  };

  return (
    <div className="h-screen max-h-screen w-full bg-page text-ink transition-colors duration-200 flex overflow-hidden">
      {isMobileSidebarOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar text-sidebar-ink transition-all duration-300 ease-out lg:sticky lg:top-0 lg:h-full lg:shrink-0 lg:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        {/* 顶部品牌与折叠按钮区 */}
        <div className="flex h-16 items-center px-3 border-b border-sidebar-line/40 shrink-0">
          {isSidebarCollapsed ? (
            /* 折叠状态下：居中单独展示展开按钮 */
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              aria-label="展开侧边栏"
              title="展开侧边栏"
              className="mx-auto flex size-8 items-center justify-center rounded-lg border border-sidebar-line/50 bg-sidebar-active/40 text-sidebar-muted transition-all hover:border-sidebar-line hover:bg-sidebar-active hover:text-white"
            >
              <IconChevronRight size={16} />
            </button>
          ) : (
            /* 展开状态下：左侧品牌，右侧折叠按钮 */
            <div className="flex w-full items-center justify-between">
              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="text-sm font-bold tracking-tight text-white truncate leading-tight">
                  个人工作台
                </h1>
                <p className="text-[10px] text-sidebar-muted truncate leading-tight">
                  把计划变成真实行动
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                aria-label="收起侧边栏"
                title="收起侧边栏"
                className="ml-2 hidden size-7 shrink-0 items-center justify-center rounded-lg border border-sidebar-line/50 bg-sidebar-active/40 text-sidebar-muted shadow-2xs transition-all hover:border-sidebar-line hover:bg-sidebar-active hover:text-white lg:flex"
              >
                <IconChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                aria-label="关闭导航"
                className="ml-2 flex size-7 shrink-0 items-center justify-center rounded-lg border border-sidebar-line/50 bg-sidebar-active/40 text-sidebar-muted lg:hidden"
              >
                <IconChevronLeft size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 顶部主导航分组列表 */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-4">
          {navGroups.map((group, gIdx) => (
            <div key={group.label || gIdx} className="space-y-1">
              {!isSidebarCollapsed && group.label && (
                <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-sidebar-muted uppercase">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const isActive =
                  activePath === item.path ||
                  (item.path === '/research' && activePath?.startsWith('/research/') === true);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    href={item.path}
                    onClick={() => setIsMobileSidebarOpen(false)}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-medium transition-all duration-200 ease-out ${
                      isActive
                        ? 'bg-sidebar-active text-white shadow-xs font-semibold translate-x-0.5'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white hover:translate-x-0.5'
                    } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                  >
                    {/* 当前激活项的左侧高亮指示条 */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent animate-scale-in" />
                    )}

                    <span
                      className={`shrink-0 transition-colors duration-200 ${
                        isActive ? 'text-white' : 'text-sidebar-icon'
                      }`}
                    >
                      {item.icon ?? defaultIconForPath(item.path)}
                    </span>
                    {!isSidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!isSidebarCollapsed && item.badge !== undefined && (
                      <span className="rounded-full bg-sidebar-line px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 底部固定系统导航项：设置与关于（置于底部，紧挨在本地 SQLite 数据库状态上方） */}
        <div className="mt-auto border-t border-sidebar-line/40 px-2.5 py-2.5 space-y-1 shrink-0">
          {!isSidebarCollapsed && (
            <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-sidebar-muted uppercase">
              系统
            </div>
          )}

          {/* 倒数第二条：偏好设置 */}
          <Link
            to="/settings"
            href="/settings"
            onClick={() => setIsMobileSidebarOpen(false)}
            title={isSidebarCollapsed ? '偏好设置' : undefined}
            className={`relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-medium transition-all duration-200 ease-out ${
              activePath === '/settings'
                ? 'bg-sidebar-active text-white shadow-xs font-semibold translate-x-0.5'
                : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white hover:translate-x-0.5'
            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            {activePath === '/settings' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent animate-scale-in" />
            )}
            <span
              className={`shrink-0 transition-colors duration-200 ${
                activePath === '/settings' ? 'text-white' : 'text-sidebar-icon'
              }`}
            >
              <IconSettings size={16} />
            </span>
            {!isSidebarCollapsed && <span className="flex-1 truncate">偏好设置</span>}
          </Link>

          {/* 倒数第一条：关于工作台 */}
          <Link
            to="/about"
            href="/about"
            onClick={() => setIsMobileSidebarOpen(false)}
            title={isSidebarCollapsed ? '关于工作台' : undefined}
            className={`relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-medium transition-all duration-200 ease-out ${
              activePath === '/about'
                ? 'bg-sidebar-active text-white shadow-xs font-semibold translate-x-0.5'
                : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white hover:translate-x-0.5'
            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            {activePath === '/about' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent animate-scale-in" />
            )}
            <span
              className={`shrink-0 transition-colors duration-200 ${
                activePath === '/about' ? 'text-white' : 'text-sidebar-icon'
              }`}
            >
              <IconInfo size={16} />
            </span>
            {!isSidebarCollapsed && <span className="flex-1 truncate">关于工作台</span>}
          </Link>
        </div>

        {/* 侧边栏底部状态 */}
        <div className="border-t border-sidebar-line/40 p-2.5 space-y-2 shrink-0">
          {typeof sidebarFooter === 'function'
            ? sidebarFooter({ isCollapsed: isSidebarCollapsed })
            : sidebarFooter}

          <div
            className={`flex items-center gap-2 text-[11px] text-sidebar-muted ${
              isSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="本地 SQLite 数据库已就绪"
          >
            <IconDatabase size={13} className="text-good shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">{dbStatus}</span>}
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex flex-1 flex-col min-w-0 h-full min-h-0 overflow-hidden">
        {/* 顶栏 */}
        {/*
          `relative z-30` 是承重的，不是装饰：`backdrop-blur-md` 会让本元素自成一个层叠
          上下文，主题选择器那类从顶栏往下弹的面板（z-50）因此被关在里面，比不过
          主内容区里任何带 z-index 的定位元素——秋招页那条 `sticky z-10` 的筛选栏就正好
          把它盖住。给顶栏本身一个高于内容、低于侧边栏（z-40）的层级，整层一起抬上来。
        */}
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/80 px-3 backdrop-blur-md transition-colors duration-200 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="打开导航"
              onClick={() => {
                setIsSidebarCollapsed(false);
                setIsMobileSidebarOpen(true);
              }}
              className="flex size-8 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-secondary lg:hidden"
            >
              <IconMenu size={16} />
            </button>
            <div className="text-xs font-medium text-muted">
              <span>工作台</span>
              <span className="mx-1.5">/</span>
              <span className="font-semibold text-ink">
                {activePath === '/settings'
                  ? '偏好设置'
                  : activePath === '/about'
                    ? '关于工作台'
                    : (activeModuleLabel ?? '概览')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 搜索快捷触发按钮 (⌘K) */}
            <button
              type="button"
              onClick={() => handleSearchOpenChange(true)}
              className="hidden items-center gap-2 rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs text-muted hover:border-line hover:text-secondary sm:inline-flex cursor-pointer transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              <IconSearch size={13} />
              <span>搜索任务或公司…</span>
              <kbd className="rounded border border-line bg-surface px-1 py-0.2 text-[10px] font-semibold text-muted">
                ⌘K
              </kbd>
            </button>

            {/* 主题配色与深浅模式选择器 */}
            <ThemeSelector />

            {/* 顶部附加动作 */}
            {topActions}
          </div>
        </header>

        {/* 页面主内容 */}
        <main
          className={`flex-1 flex flex-col min-h-0 ${
            isFullHeightModule ? 'p-0 overflow-hidden' : 'px-4 py-4 sm:px-6 lg:px-8 overflow-y-auto'
          }`}
        >
          <div
            className={`mx-auto w-full flex-1 flex flex-col min-h-0 ${
              isFullHeightModule ? 'h-full' : 'max-w-[1680px]'
            }`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* 全局命令中枢 (Command Palette ⌘K) */}
      {commandItems && (
        <CommandPalette
          open={isSearchOpen}
          onOpenChange={handleSearchOpenChange}
          items={commandItems}
        />
      )}
    </div>
  );
}
