import { lazy, Suspense } from 'react';
import type { UiModuleDefinition } from '@workbench/core';
import { RESEARCH_MODULE_ID } from '../contract.js';
import { ResearchLibraryPage } from './ResearchLibraryPage.js';

const ResearchReaderPage = lazy(async () => {
  const module = await import('./reader/ResearchReaderPage.js');
  return { default: module.ResearchReaderPage };
});

const ResearchKnowledgePage = lazy(async () => {
  const module = await import('./knowledge/ResearchKnowledgePage.js');
  return { default: module.ResearchKnowledgePage };
});

export const researchUiModule: UiModuleDefinition = {
  id: RESEARCH_MODULE_ID,
  title: '文献库',
  nav: [{ path: '/research', label: '文献库' }],
  routes: [
    { path: '/research', element: <ResearchLibraryPage /> },
    {
      path: '/research/knowledge',
      element: (
        <Suspense
          fallback={
            <div className="grid h-full min-h-80 place-items-center bg-surface text-xs font-semibold text-secondary">
              正在加载研究知识…
            </div>
          }
        >
          <ResearchKnowledgePage />
        </Suspense>
      ),
    },
    {
      path: '/research/read/:assetId',
      element: (
        <Suspense
          fallback={
            <div className="grid h-full min-h-80 place-items-center bg-surface text-xs font-semibold text-secondary">
              正在准备阅读器…
            </div>
          }
        >
          <ResearchReaderPage />
        </Suspense>
      ),
    },
  ],
};

export { ResearchLibraryPage } from './ResearchLibraryPage.js';
export * from './api.js';
