import type { UiModuleDefinition } from '@workbench/core';
import { NOTES_MODULE_ID } from '../contract.js';
import { NotesPage } from './NotesPage.js';

export const notesUiModule: UiModuleDefinition = {
  id: NOTES_MODULE_ID,
  title: '便签',
  nav: [{ path: '/notes', label: '便签' }],
  routes: [{ path: '/notes', element: <NotesPage /> }],
};

// 刻意不再整份再导出 './markdown/*'：那会把约 30 个 AST 节点接口与四个内部函数
// 一并抬成模块 UI 的公开接口，而外部实际只消费 notesUiModule。
// markdown 的消费方（NoteEditor / NoteOutlineToc / exportEngine）一律直接
// import 内部文件，与此前的行为一致。
export * from './NotesPage.js';
export * from './api.js';
export * from './exportEngine.js';
export * from './components/NoteFormatToolbar.js';
export * from './components/NoteOutlineToc.js';
export * from './components/NoteEditor.js';
export * from './components/NoteEditorModal.js';
export * from './components/FolderModal.js';
export * from './components/NoteExportModal.js';
export * from './components/NoteCard.js';
export * from './components/NoteSidebar.js';
export * from './components/NoteMasonryView.js';
export * from './components/NoteListView.js';
export * from './components/NotesToolbar.js';
