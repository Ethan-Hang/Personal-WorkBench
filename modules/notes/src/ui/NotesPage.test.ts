import { describe, it, expect } from 'vitest';
import {
  notesUiModule,
  NotesPage,
  NoteSidebar,
  NoteCard,
  NoteMasonryView,
  NoteListView,
  NotesToolbar,
  FolderModal,
  NoteEditor,
  NoteEditorModal,
  NoteFormatToolbar,
  NoteOutlineToc,
} from './index.js';

describe('NotesPage & UI Components Suite', () => {
  it('成功导出便签模块的所有核心 UI 组件与页面', () => {
    expect(NotesPage).toBeDefined();
    expect(typeof NotesPage).toBe('function');

    expect(NoteSidebar).toBeDefined();
    expect(typeof NoteSidebar).toBe('function');

    expect(NoteCard).toBeDefined();
    expect(typeof NoteCard).toBe('function');

    expect(NoteMasonryView).toBeDefined();
    expect(typeof NoteMasonryView).toBe('function');

    expect(NoteListView).toBeDefined();
    expect(typeof NoteListView).toBe('function');

    expect(NotesToolbar).toBeDefined();
    expect(typeof NotesToolbar).toBe('function');

    expect(FolderModal).toBeDefined();
    expect(typeof FolderModal).toBe('function');

    expect(NoteEditor).toBeDefined();
    expect(typeof NoteEditor).toBe('function');

    expect(NoteEditorModal).toBeDefined();
    expect(typeof NoteEditorModal).toBe('function');

    expect(NoteFormatToolbar).toBeDefined();
    expect(typeof NoteFormatToolbar).toBe('function');

    expect(NoteOutlineToc).toBeDefined();
    expect(typeof NoteOutlineToc).toBe('function');
  });

  it('notesUiModule 契约与路由声明完整合法', () => {
    expect(notesUiModule).toBeDefined();
    expect(notesUiModule.id).toBe('notes');
    expect(notesUiModule.title).toBe('便签');
    expect(notesUiModule.nav).toEqual([{ path: '/notes', label: '便签' }]);
    expect(notesUiModule.routes).toHaveLength(1);
    expect(notesUiModule.routes[0]?.path).toBe('/notes');
    expect(notesUiModule.routes[0]?.element).toBeDefined();
  });
});
