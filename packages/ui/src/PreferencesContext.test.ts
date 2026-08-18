import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  PreferencesProvider,
  usePreferences,
  type WorkbenchPreferences,
} from './PreferencesContext.js';

describe('PreferencesContext defaults & structure', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  });

  it('默认偏好符合预期标准配置', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      showGreeting: true,
      autoExpandOverdue: false,
      enableAnimations: true,
      showCompletedTasks: true,
    });
  });

  it('PREFERENCES_STORAGE_KEY 常量正确', () => {
    expect(PREFERENCES_STORAGE_KEY).toBe('workbench_preferences');
  });

  it('成功导出 PreferencesProvider 与 usePreferences', () => {
    expect(PreferencesProvider).toBeDefined();
    expect(typeof PreferencesProvider).toBe('function');
    expect(usePreferences).toBeDefined();
    expect(typeof usePreferences).toBe('function');
  });

  it('能够序列化与反序列化完整的偏好结构', () => {
    const customPrefs: WorkbenchPreferences = {
      showGreeting: false,
      autoExpandOverdue: true,
      enableAnimations: false,
      showCompletedTasks: false,
    };
    globalThis.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(customPrefs));

    const saved = JSON.parse(globalThis.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}');
    expect(saved).toEqual(customPrefs);
  });
});
