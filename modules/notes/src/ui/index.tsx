import type { UiModuleDefinition } from '@workbench/core';
import { NOTES_MODULE_ID } from '../contract.js';
import { NotesPage } from './NotesPage.js';

export const notesUiModule: UiModuleDefinition = {
  id: NOTES_MODULE_ID,
  title: '便签',
  nav: [{ path: '/notes', label: '便签' }],
  routes: [{ path: '/notes', element: <NotesPage /> }],
};

export * from './NotesPage.js';
export * from './markdown/index.js';
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
