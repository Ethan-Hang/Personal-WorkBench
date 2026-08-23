import { describe, it, expect } from 'vitest';
import { NoteListView } from './NoteListView.js';

describe('NoteListView Component', () => {
  it('成功导出 NoteListView 组件函数', () => {
    expect(NoteListView).toBeDefined();
    expect(typeof NoteListView).toBe('function');
  });
});
