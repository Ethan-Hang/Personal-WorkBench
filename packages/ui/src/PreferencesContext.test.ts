import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, PreferencesProvider, usePreferences } from './PreferencesContext.js';

describe('PreferencesContext defaults & structure', () => {
  it('默认偏好符合预期标准配置', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      showGreeting: true,
      autoExpandOverdue: false,
      enableAnimations: true,
      showCompletedTasks: true,
      moduleOrder: [],
    });
  });

  it('成功导出 PreferencesProvider 与 usePreferences', () => {
    expect(PreferencesProvider).toBeDefined();
    expect(typeof PreferencesProvider).toBe('function');
    expect(usePreferences).toBeDefined();
    expect(typeof usePreferences).toBe('function');
  });
});
