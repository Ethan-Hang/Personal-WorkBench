import { NavLink, Route, Routes, Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { ModuleLabelProvider } from '@workbench/ui';
import { uiModules } from './modules';

/**
 * 模块 id → 展示名，由注册表直接得出。
 * 外壳是唯一同时认识所有模块的地方，因此这张表只能在这里组装；
 * 模块自己去认识同级模块的名字，会让加第 N 个模块时又要回头改前面的。
 */
const MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  uiModules.map((m) => [m.id, m.title]),
);

export function App() {
  const navEntries = uiModules.flatMap((m) => m.nav);
  // 首页重定向到「第一个模块的第一个导航项」。注册表为空时不注册这条重定向——
  // 外壳不得对任何具体模块的 URL 命名做假设，哪怕只是一个兜底默认值。
  const firstPath = navEntries[0]?.path;

  return (
    <ModuleLabelProvider labels={MODULE_LABELS}>
      <div className="min-h-screen bg-page font-sans text-ink">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-3xl items-center gap-5 px-6 py-4">
            <span className="font-bold tracking-tight">个人工作台</span>
            {navEntries.map((entry) => (
              <NavLink
                key={entry.path}
                to={entry.path}
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-accent' : 'text-secondary hover:text-ink'
                }
              >
                {entry.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-3xl px-6 py-8">
          <Routes>
            {firstPath !== undefined && (
              <Route path="/" element={<Navigate to={firstPath} replace />} />
            )}
            {uiModules.flatMap((m) =>
              m.routes.map((r) => (
                <Route key={r.path} path={r.path} element={r.element as ReactNode} />
              )),
            )}
          </Routes>
        </main>
      </div>
    </ModuleLabelProvider>
  );
}
