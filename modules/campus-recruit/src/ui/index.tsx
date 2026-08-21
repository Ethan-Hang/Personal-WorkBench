import type { UiModuleDefinition } from '@workbench/core';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { ApplicationsPage } from './ApplicationsPage.js';
import { StatsPage } from './StatsPage.js';

export const campusRecruitUiModule: UiModuleDefinition = {
  id: CAMPUS_RECRUIT_MODULE_ID,
  title: '秋招管理',
  nav: [
    { path: '/campus', label: '秋招' },
    { path: '/campus/stats', label: '秋招统计' },
  ],
  routes: [
    { path: '/campus', element: <ApplicationsPage /> },
    { path: '/campus/stats', element: <StatsPage /> },
  ],
};

export { ApplicationsPage, StatsPage };
export { fetchApplications } from './api.js';
