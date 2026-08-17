import { NavLink, Route, Routes, Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { uiModules } from './modules';

export function App() {
  const navEntries = uiModules.flatMap((m) => m.nav);
  // 首页重定向到「第一个模块的第一个导航项」。注册表为空时不注册这条重定向——
  // 外壳不得对任何具体模块的 URL 命名做假设，哪怕只是一个兜底默认值。
  const firstPath = navEntries[0]?.path;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-3xl gap-4 px-6 py-4">
          <span className="font-semibold">个人工作台</span>
          {navEntries.map((entry) => (
            <NavLink
              key={entry.path}
              to={entry.path}
              className={({ isActive }) =>
                isActive ? 'text-amber-700 underline' : 'text-stone-600 hover:text-stone-900'
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
  );
}
