import { describe, it, expect } from 'vitest';
import { NoteMasonryView } from './NoteMasonryView.js';

describe('NoteMasonryView Component', () => {
  it('成功导出 NoteMasonryView 组件函数', () => {
    expect(NoteMasonryView).toBeDefined();
    expect(typeof NoteMasonryView).toBe('function');
  });
});
