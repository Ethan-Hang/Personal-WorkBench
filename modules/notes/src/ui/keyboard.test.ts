import { describe, it, expect } from 'vitest';
import { isModifierPressed } from './keyboard.js';

describe('isModifierPressed', () => {
  it('Mac 上认 Cmd，不认 Ctrl', () => {
    expect(isModifierPressed({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(isModifierPressed({ metaKey: false, ctrlKey: true }, true)).toBe(false);
  });

  it('非 Mac 上认 Ctrl，不认 Meta', () => {
    // Windows 的 Meta 是 Win 键，把它当保存键会误触系统快捷键。
    expect(isModifierPressed({ metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(isModifierPressed({ metaKey: true, ctrlKey: false }, false)).toBe(false);
  });

  it('两个都没按就是没按', () => {
    expect(isModifierPressed({ metaKey: false, ctrlKey: false }, true)).toBe(false);
    expect(isModifierPressed({ metaKey: false, ctrlKey: false }, false)).toBe(false);
  });
});
