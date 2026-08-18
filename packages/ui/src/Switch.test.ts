import { describe, it, expect } from 'vitest';
import { Switch } from './Switch.js';

describe('Switch component', () => {
  it('成功导出 Switch 函数式组件', () => {
    expect(Switch).toBeDefined();
    expect(typeof Switch).toBe('function');
  });
});
