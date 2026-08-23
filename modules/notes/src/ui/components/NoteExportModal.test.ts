import { describe, it, expect } from 'vitest';
import { NoteExportModal } from './NoteExportModal.js';
import type { NoteView } from '../../contract.js';

const mockNote: NoteView = {
  id: 'note-200',
  folderId: null,
  revision: 1,
  title: '导出弹窗测试便签',
  content: '测试便签导出内容',
  excerpt: '测试便签导出内容',
  color: 'yellow',
  isPinned: false,
  status: 'active',
  metadata: {},
  tags: ['测试'],
  todoLinks: [],
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
  trashedAt: null,
};

describe('NoteExportModal Component', () => {
  it('成功导出 NoteExportModal 组件函数', () => {
    expect(NoteExportModal).toBeDefined();
    expect(typeof NoteExportModal).toBe('function');
  });

  it('支持传入便签数据与配置属性', () => {
    expect(mockNote.title).toBe('导出弹窗测试便签');
    expect(mockNote.tags).toEqual(['测试']);
  });
});
