import { useState, type ElementType, type ReactNode } from 'react';
import { ThemeSelector } from './ThemeSelector.js';
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
  children,
  dbStatus = '本地 SQLite 已就绪',
}: {
  navGroups: ShellNavGroup[];
  activePath?: string;
  LinkComponent?: ElementType;
  topActions?: ReactNode;
  children: ReactNode;
  dbStatus?: string;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const Link = LinkComponent;

  const defaultIconForPath = (path: string) => {
    if (path === '/today' || path === '/') return <IconHome size={16} />;
    if (path === '/campus') return <IconBriefcase size={16} />;
    if (path === '/campus/stats') return <IconBarChart size={16} />;
    if (path === '/settings') return <IconSettings size={16} />;
    return <IconCheckSquare size={16} />;
  };

  return (
    <div className="min-h-screen bg-page text-ink transition-colors duration-200 flex">
      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-line bg-sidebar text-sidebar-ink transition-all duration-300 ${
          isSidebarCollapsed ? 'w-16' : 'w-64'
        } sm:static`}
      >
        {/* 品牌标识与顶部折叠按钮 */}
        <div className="flex h-16 items-center justify-between px-3.5 border-b border-sidebar-line/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white font-extrabold text-sm shadow-xs">
              序
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="text-sm font-bold tracking-tight text-white truncate leading-tight">
                  个人工作台
                </h1>
                <p className="text-[10px] text-sidebar-muted truncate leading-tight">
                  把计划变成真实行动
                </p>
              </div>
            )}
          </div>

          {/* 醒目的顶部收起/展开按钮 */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            className="flex size-7 items-center justify-center rounded-lg border border-sidebar-line/50 bg-sidebar-active/40 text-sidebar-muted hover:bg-sidebar-active hover:text-white hover:border-sidebar-line transition-all shadow-2xs"
          >
            {isSidebarCollapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
          </button>
        </div>

        {/* 导航分组列表 */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {navGroups.map((group, gIdx) => (
            <div key={group.label || gIdx} className="space-y-1">
              {!isSidebarCollapsed && group.label && (
                <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-sidebar-muted uppercase">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    href={item.path}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`group flex items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-sidebar-active text-white shadow-xs font-semibold'
                        : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                    }`}
                  >
                    <span className="shrink-0 text-sidebar-icon group-hover:text-white transition-colors">
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

          {/* 系统设置入口 */}
          <div className="pt-2 border-t border-sidebar-line/30 space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-sidebar-muted uppercase">
                系统
              </div>
            )}
            <Link
              to="/settings"
              href="/settings"
              title={isSidebarCollapsed ? '系统设置' : undefined}
              className={`group flex items-center gap-2.5 rounded-control px-2.5 py-2 text-xs font-medium transition-all ${
                activePath === '/settings'
                  ? 'bg-sidebar-active text-white shadow-xs font-semibold'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              }`}
            >
              <span className="shrink-0 text-sidebar-icon group-hover:text-white transition-colors">
                <IconSettings size={16} />
              </span>
              {!isSidebarCollapsed && <span className="flex-1 truncate">偏好设置</span>}
            </Link>
          </div>
        </nav>

        {/* 侧边栏底部状态 */}
        <div className="border-t border-sidebar-line/40 p-3">
          <div className="flex items-center gap-2 text-[11px] text-sidebar-muted">
            <IconDatabase size={13} className="text-good shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">{dbStatus}</span>}
          </div>
        </div>
      </aside>

      {/* 主工作区 */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* 顶栏 */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/80 px-6 backdrop-blur-md transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-muted">
              <span>工作台</span>
              <span className="mx-1.5">/</span>
              <span className="font-semibold text-ink">
                {activePath === '/settings'
                  ? '偏好设置'
                  : (navGroups.flatMap((g) => g.items).find((i) => i.path === activePath)?.label ??
                    '概览')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 搜索快捷触发按钮 (⌘K) */}
            <button
              type="button"
              className="hidden items-center gap-2 rounded-control border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs text-muted hover:border-line hover:text-secondary sm:inline-flex"
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
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 animate-fade-in">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
