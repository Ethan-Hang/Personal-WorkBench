import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '@workbench/core';
import { SettingsSync, type SettingsStore } from './settingsSync.js';

export interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** 最近一次写失败的信息，含服务端返回的请求编号。设置页据此提示。 */
  lastError: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  store,
  children,
}: {
  store: SettingsStore;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [lastError, setLastError] = useState<string | null>(null);

  const syncRef = useRef<SettingsSync | null>(null);
  if (syncRef.current === null) {
    syncRef.current = new SettingsSync(store, setSettings, setLastError);
    // 首屏同步取快照，避免第一帧渲染默认主题再闪一下。
    setSettings(syncRef.current.current);
  }
  const sync = syncRef.current;

  useEffect(() => {
    void sync.init();
  }, [sync]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      update: (patch) => sync.update(patch),
      lastError,
    }),
    [settings, lastError, sync],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内部使用');
  }
  return ctx;
}
