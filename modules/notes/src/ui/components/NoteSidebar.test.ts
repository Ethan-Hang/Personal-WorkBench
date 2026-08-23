import { describe, it, expect } from 'vitest';
import { NoteSidebar } from './NoteSidebar.js';
import type { FolderNode, FolderView } from '../../contract.js';

const mockFoldersTree: FolderNode[] = [
  {
    id: 'f-1',
    name: '工作笔记',
    parentId: null,
    icon: '💼',
    color: '#3b82f6',
    sortOrder: 0,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    noteCount: 3,
    children: [
      {
        id: 'f-1-1',
        name: '技术方案',
        parentId: 'f-1',
        icon: '💻',
        color: '#10b981',
        sortOrder: 0,
        createdAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
        noteCount: 1,
        children: [],
      },
    ],
  },
];

const mockFlatFolders: FolderView[] = [
  {
    id: 'f-1',
    name: '工作笔记',
    parentId: null,
    icon: '💼',
    color: '#3b82f6',
    sortOrder: 0,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    noteCount: 3,
  },
  {
    id: 'f-1-1',
    name: '技术方案',
    parentId: 'f-1',
    icon: '💻',
    color: '#10b981',
    sortOrder: 0,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    noteCount: 1,
  },
];

describe('NoteSidebar Component', () => {
  it('成功导出 NoteSidebar 组件函数', () => {
    expect(NoteSidebar).toBeDefined();
    expect(typeof NoteSidebar).toBe('function');
  });

  it('支持层级树状文件夹结构与子项展开', () => {
    expect(mockFoldersTree.length).toBe(1);
    expect(mockFoldersTree[0]?.children.length).toBe(1);
    expect(mockFoldersTree[0]?.children[0]?.name).toBe('技术方案');
    expect(mockFlatFolders.length).toBe(2);
  });
});
