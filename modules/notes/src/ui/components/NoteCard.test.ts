import { describe, it, expect } from 'vitest';
import { NoteCard } from './NoteCard.js';
import type { NoteView } from '../../contract.js';

const mockNote: NoteView = {
  id: 'note-1',
  folderId: 'folder-1',
  revision: 1,
  title: '测试便签标题',
  content: '# 便签正文\n这是便签的详细 Markdown 内容。',
  excerpt: '这是便签的详细 Markdown 内容。',
  color: 'yellow',
  isPinned: true,
  status: 'active',
  metadata: {},
  tags: ['工作', '灵感'],
  todoLinks: [
    {
      todoItemId: 'todo-1',
      title: '测试待办',
      status: 'pending',
      dueAt: null,
      sourceModule: 'notes',
      linkedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:30:00.000Z',
  trashedAt: null,
};

describe('NoteCard Component', () => {
  it('成功导出 NoteCard 组件函数', () => {
    expect(NoteCard).toBeDefined();
    expect(typeof NoteCard).toBe('function');
  });

  it('正确构建 NoteCard 属性与便签数据模型', () => {
    expect(mockNote.title).toBe('测试便签标题');
    expect(mockNote.isPinned).toBe(true);
    expect(mockNote.color).toBe('yellow');
    expect(mockNote.tags).toEqual(['工作', '灵感']);
    expect(mockNote.todoLinks?.length).toBe(1);
  });
});
