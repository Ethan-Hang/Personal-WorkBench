import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import {
  ModuleLabelProvider,
  SettingsProvider,
  ThemeProvider,
  TimezoneProvider,
  PreferencesProvider,
  AppShell,
  type ShellNavGroup,
} from '@workbench/ui';
import { uiModules } from './modules.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AboutPage } from './pages/AboutPage.js';
import { createHttpSettingsStore } from './settingsStore.js';

// 模块作用域建一次即可：store 无状态，重建会白白丢掉内部引用。
const settingsStore = createHttpSettingsStore();

/**
 * 模块 id → 展示名，由注册表直接得出。
 */
const MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  uiModules.map((m) => [m.id, m.title]),
);

export function App() {
  const location = useLocation();
  const navEntries = uiModules.flatMap((m) => m.nav);
  const firstPath = navEntries[0]?.path;

  // 将注册的 UI 模块组织为侧边栏导航分组
  const navGroups: ShellNavGroup[] = [
    {
      label: '核心工作',
      items: uiModules
        .filter((m) => m.id === 'workbench' || m.id === 'todo')
        .flatMap((m) => m.nav)
        .map((n) => ({ path: n.path, label: n.label })),
    },
    {
      label: '专业模块',
      items: uiModules
        .filter((m) => m.id !== 'workbench' && m.id !== 'todo')
        .flatMap((m) => m.nav)
        .map((n) => ({ path: n.path, label: n.label })),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <SettingsProvider store={settingsStore}>
      <ThemeProvider>
        <TimezoneProvider>
          <PreferencesProvider>
            <ModuleLabelProvider labels={MODULE_LABELS}>
              <AppShell
                navGroups={navGroups}
                activePath={location.pathname}
                LinkComponent={NavLink}
                dbStatus="本地 SQLite 已就绪 · 零延迟"
              >
                <Routes>
                  {firstPath !== undefined && (
                    <Route path="/" element={<Navigate to={firstPath} replace />} />
                  )}
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  {uiModules.flatMap((m) =>
                    m.routes.map((r) => (
                      <Route key={r.path} path={r.path} element={r.element as ReactNode} />
                    )),
                  )}
                </Routes>
              </AppShell>
            </ModuleLabelProvider>
          </PreferencesProvider>
        </TimezoneProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
