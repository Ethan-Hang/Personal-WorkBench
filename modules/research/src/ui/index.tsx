import type { UiModuleDefinition } from '@workbench/core';
import { RESEARCH_MODULE_ID } from '../contract.js';
import { ResearchLibraryPage } from './ResearchLibraryPage.js';

export const researchUiModule: UiModuleDefinition = {
  id: RESEARCH_MODULE_ID,
  title: '文献库',
  nav: [{ path: '/research', label: '文献库' }],
  routes: [{ path: '/research', element: <ResearchLibraryPage /> }],
};

export { ResearchLibraryPage } from './ResearchLibraryPage.js';
export * from './api.js';
