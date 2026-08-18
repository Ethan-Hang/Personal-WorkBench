import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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

export const DEFAULT_PREFERENCES: Readonly<WorkbenchPreferences> = {
  showGreeting: true,
  autoExpandOverdue: false,
  enableAnimations: true,
  showCompletedTasks: true,
};

export const PREFERENCES_STORAGE_KEY = 'workbench_preferences';

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

function loadSavedPreferences(): WorkbenchPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      showGreeting:
        typeof parsed.showGreeting === 'boolean'
          ? parsed.showGreeting
          : DEFAULT_PREFERENCES.showGreeting,
      autoExpandOverdue:
        typeof parsed.autoExpandOverdue === 'boolean'
          ? parsed.autoExpandOverdue
          : DEFAULT_PREFERENCES.autoExpandOverdue,
      enableAnimations:
        typeof parsed.enableAnimations === 'boolean'
          ? parsed.enableAnimations
          : DEFAULT_PREFERENCES.enableAnimations,
      showCompletedTasks:
        typeof parsed.showCompletedTasks === 'boolean'
          ? parsed.showCompletedTasks
          : DEFAULT_PREFERENCES.showCompletedTasks,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function savePreferencesToStorage(prefs: WorkbenchPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 容错处理（如浏览器隐身模式或配额超限）
  }
}

export function PreferencesProvider({
  children,
  initialPreferences,
}: {
  children: ReactNode;
  initialPreferences?: Partial<WorkbenchPreferences>;
}) {
  const [preferences, setPreferencesState] = useState<WorkbenchPreferences>(() => {
    const loaded = loadSavedPreferences();
    return initialPreferences ? { ...loaded, ...initialPreferences } : loaded;
  });

  // 同步动效属性到 document.documentElement
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-animations', preferences.enableAnimations ? 'enabled' : 'disabled');
    root.setAttribute('data-reduced-motion', preferences.enableAnimations ? 'false' : 'true');
  }, [preferences.enableAnimations]);

  const setPreference = useCallback(
    <K extends keyof WorkbenchPreferences>(
      key: K,
      valueOrUpdater:
        WorkbenchPreferences[K] | ((prev: WorkbenchPreferences[K]) => WorkbenchPreferences[K]),
    ) => {
      setPreferencesState((prev) => {
        const nextVal =
          typeof valueOrUpdater === 'function'
            ? (valueOrUpdater as (prev: WorkbenchPreferences[K]) => WorkbenchPreferences[K])(
                prev[key],
              )
            : valueOrUpdater;
        const next = { ...prev, [key]: nextVal };
        savePreferencesToStorage(next);
        return next;
      });
    },
    [],
  );

  const togglePreference = useCallback((key: keyof WorkbenchPreferences) => {
    setPreferencesState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      savePreferencesToStorage(next);
      return next;
    });
  }, []);

  const updatePreferences = useCallback(
    (
      patchOrUpdater:
        | Partial<WorkbenchPreferences>
        | ((prev: WorkbenchPreferences) => Partial<WorkbenchPreferences>),
    ) => {
      setPreferencesState((prev) => {
        const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(prev) : patchOrUpdater;
        const next = { ...prev, ...patch };
        savePreferencesToStorage(next);
        return next;
      });
    },
    [],
  );

  const resetPreferences = useCallback(() => {
    const next = { ...DEFAULT_PREFERENCES };
    setPreferencesState(next);
    savePreferencesToStorage(next);
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      setPreference,
      togglePreference,
      updatePreferences,
      resetPreferences,
    }),
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
