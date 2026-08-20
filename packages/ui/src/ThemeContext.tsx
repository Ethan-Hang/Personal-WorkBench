import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppSettings } from '@workbench/core';
import { useSettings } from './SettingsContext.js';

export type ThemeMode = AppSettings['theme.mode'];

export type ThemePalette = AppSettings['theme.palette'];

export interface ThemeConfig {
  mode: ThemeMode;
  palette: ThemePalette;
  resolvedMode: 'light' | 'dark';
}

export interface PaletteMeta {
  id: ThemePalette;
  name: string;
  description: string;
  primaryColor: string;
  previewBg: string;
  previewCard: string;
}

export const PALETTES: readonly PaletteMeta[] = [
  {
    id: 'warm',
    name: '现代温暖',
    description: '暖米底色与深蓝强调，生活与执行的平衡',
    primaryColor: '#2a78d6',
    previewBg: '#f6f5f1',
    previewCard: '#fcfcfb',
  },
  {
    id: 'forest',
    name: '松针森林',
    description: '鼠尾草绿与沉稳墨绿，舒缓视觉，专注宁静',
    primaryColor: '#1e7a56',
    previewBg: '#f2f6f3',
    previewCard: '#fafcfa',
  },
  {
    id: 'ocean',
    name: '深蓝海岸',
    description: '冷石板灰与科技靛蓝，理性干练，沉着高效',
    primaryColor: '#2463eb',
    previewBg: '#f1f5f9',
    previewCard: '#fbfcfe',
  },
  {
    id: 'amber',
    name: '琥珀暖阳',
    description: '陶土与琥珀暖金色调，温暖治愈，启发灵感',
    primaryColor: '#c2641a',
    previewBg: '#f8f4ee',
    previewCard: '#fefcf9',
  },
  {
    id: 'mono',
    name: '极简素简',
    description: '极简黑白灰阶与冷钢色，纯粹专注，极高密度',
    primaryColor: '#383d47',
    previewBg: '#f4f4f4',
    previewCard: '#ffffff',
  },
] as const;

interface ThemeContextValue {
  mode: ThemeMode;
  palette: ThemePalette;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const mode = settings['theme.mode'];
  const palette = settings['theme.palette'];

  const [systemMode, setSystemMode] = useState<'light' | 'dark'>(getSystemMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedMode = mode === 'system' ? systemMode : mode;

  // 同步 CSS 类名与属性到 document.documentElement
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // 更新 dark 类
    if (resolvedMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // 更新 data-theme
    root.setAttribute('data-theme', palette);
    root.setAttribute('data-mode', resolvedMode);
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode, palette]);

  const setMode = useCallback((newMode: ThemeMode) => update({ 'theme.mode': newMode }), [update]);
  const setPalette = useCallback(
    (newPalette: ThemePalette) => update({ 'theme.palette': newPalette }),
    [update],
  );
  const toggleMode = useCallback(() => {
    const next: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    update({ 'theme.mode': next });
  }, [mode, update]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      palette,
      resolvedMode,
      setMode,
      setPalette,
      toggleMode,
    }),
    [mode, palette, resolvedMode, setMode, setPalette, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme 必须在 ThemeProvider 内部使用');
  }
  return context;
}
