import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings, type SettingKey } from '@workbench/core';
import { useSettings } from './SettingsContext.js';

export interface WorkbenchPreferences {
  /** 在今日执行舱顶部显示时段问候语（如「早上好，今天专注三件事」） */
  showGreeting: boolean;
  /** 进入今日执行舱时默认自动展开逾期任务列表 */
  autoExpandOverdue: boolean;
  /** 开启组件进入滑行动效、数字缓动与卡片微悬浮 */
  enableAnimations: boolean;
  /** 在今日执行舱待办列表底部展示已完成任务折叠分组 */
  showCompletedTasks: boolean;
}

const PREF_KEYS = {
  showGreeting: 'workbench.showGreeting',
  autoExpandOverdue: 'workbench.autoExpandOverdue',
  enableAnimations: 'workbench.enableAnimations',
  showCompletedTasks: 'workbench.showCompletedTasks',
} as const satisfies Record<keyof WorkbenchPreferences, SettingKey>;

function toPreferences(settings: AppSettings): WorkbenchPreferences {
  return {
    showGreeting: settings['workbench.showGreeting'],
    autoExpandOverdue: settings['workbench.autoExpandOverdue'],
    enableAnimations: settings['workbench.enableAnimations'],
    showCompletedTasks: settings['workbench.showCompletedTasks'],
  };
}

function toPatch(patch: Partial<WorkbenchPreferences>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const [uiKey, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[PREF_KEYS[uiKey as keyof WorkbenchPreferences]] = value;
  }
  return out;
}

export const DEFAULT_PREFERENCES: Readonly<WorkbenchPreferences> = toPreferences(DEFAULT_SETTINGS);

export interface PreferencesContextValue {
  preferences: WorkbenchPreferences;
  setPreference: <K extends keyof WorkbenchPreferences>(
    key: K,
    value: WorkbenchPreferences[K] | ((prev: WorkbenchPreferences[K]) => WorkbenchPreferences[K]),
  ) => void;
  togglePreference: (key: keyof WorkbenchPreferences) => void;
  updatePreferences: (
    patch:
      | Partial<WorkbenchPreferences>
      | ((prev: WorkbenchPreferences) => Partial<WorkbenchPreferences>),
  ) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const preferences = useMemo(() => toPreferences(settings), [settings]);

  // 同步动效属性到 document.documentElement
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-animations', preferences.enableAnimations ? 'enabled' : 'disabled');
    root.setAttribute('data-reduced-motion', preferences.enableAnimations ? 'false' : 'true');
  }, [preferences.enableAnimations]);

  const setPreference = useCallback<PreferencesContextValue['setPreference']>(
    (key, valueOrUpdater) => {
      const next =
        typeof valueOrUpdater === 'function'
          ? (
              valueOrUpdater as (
                prev: WorkbenchPreferences[typeof key],
              ) => WorkbenchPreferences[typeof key]
            )(preferences[key])
          : valueOrUpdater;
      update(toPatch({ [key]: next } as Partial<WorkbenchPreferences>));
    },
    [preferences, update],
  );

  const togglePreference = useCallback(
    (key: keyof WorkbenchPreferences) => {
      update(toPatch({ [key]: !preferences[key] } as Partial<WorkbenchPreferences>));
    },
    [preferences, update],
  );

  const updatePreferences = useCallback<PreferencesContextValue['updatePreferences']>(
    (patchOrUpdater) => {
      const patch =
        typeof patchOrUpdater === 'function' ? patchOrUpdater(preferences) : patchOrUpdater;
      update(toPatch(patch));
    },
    [preferences, update],
  );

  const resetPreferences = useCallback(() => {
    update(toPatch(DEFAULT_PREFERENCES));
  }, [update]);

  const value = useMemo<PreferencesContextValue>(
    () => ({ preferences, setPreference, togglePreference, updatePreferences, resetPreferences }),
    [preferences, setPreference, togglePreference, updatePreferences, resetPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences 必须在 PreferencesProvider 内部使用');
  }
  return context;
}
