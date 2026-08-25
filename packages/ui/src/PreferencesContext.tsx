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
  /**
   * 侧边栏「专业模块」的展示顺序，存模块 id。空数组 = 按注册表原序。
   * 注册表才是真相，这里只是偏好：对不上的 id 忽略，没提到的模块追加在末尾。
   */
  moduleOrder: string[];
  /**
   * 被关掉的模块 id。只影响界面，不停止后端与 core Item 投影（关掉 ≠ 卸载）。
   * 核心模块永远不在这里生效，由 web 的 moduleLayout 强制。
   */
  disabledModules: string[];
}

const PREF_KEYS = {
  showGreeting: 'workbench.showGreeting',
  autoExpandOverdue: 'workbench.autoExpandOverdue',
  enableAnimations: 'workbench.enableAnimations',
  showCompletedTasks: 'workbench.showCompletedTasks',
  moduleOrder: 'workbench.moduleOrder',
  disabledModules: 'workbench.disabledModules',
} as const satisfies Record<keyof WorkbenchPreferences, SettingKey>;

function toPreferences(settings: AppSettings): WorkbenchPreferences {
  return {
    showGreeting: settings['workbench.showGreeting'],
    autoExpandOverdue: settings['workbench.autoExpandOverdue'],
    enableAnimations: settings['workbench.enableAnimations'],
    showCompletedTasks: settings['workbench.showCompletedTasks'],
    moduleOrder: settings['workbench.moduleOrder'],
    disabledModules: settings['workbench.disabledModules'],
  };
}

function toPatch(patch: Partial<WorkbenchPreferences>): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const [uiKey, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    // 每个键的值类型各不相同，索引写入需要一次收窄；PREF_KEYS 的
    // `satisfies Record<keyof WorkbenchPreferences, SettingKey>` 已经保证了键的对应关系。
    (out as Record<SettingKey, unknown>)[PREF_KEYS[uiKey as keyof WorkbenchPreferences]] = value;
  }
  return out;
}

export const DEFAULT_PREFERENCES: Readonly<WorkbenchPreferences> = toPreferences(DEFAULT_SETTINGS);

/**
 * 只有布尔项能「切换」。不收窄的话 `togglePreference('moduleOrder')` 会把整条顺序
 * 变成 `false`，且类型检查放行。
 */
export type BooleanPreferenceKey = {
  [K in keyof WorkbenchPreferences]: WorkbenchPreferences[K] extends boolean ? K : never;
}[keyof WorkbenchPreferences];

export interface PreferencesContextValue {
  preferences: WorkbenchPreferences;
  setPreference: <K extends keyof WorkbenchPreferences>(
    key: K,
    value: WorkbenchPreferences[K] | ((prev: WorkbenchPreferences[K]) => WorkbenchPreferences[K]),
  ) => void;
  togglePreference: (key: BooleanPreferenceKey) => void;
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
    (key: BooleanPreferenceKey) => {
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
