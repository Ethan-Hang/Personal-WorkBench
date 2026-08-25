import type { UiModuleDefinition } from '@workbench/core';
import { CAMPUS_RECRUIT_MODULE_ID } from '../contract.js';
import { ApplicationsPage } from './ApplicationsPage.js';
import { StatsPage } from './StatsPage.js';

export const campusRecruitUiModule: UiModuleDefinition = {
  id: CAMPUS_RECRUIT_MODULE_ID,
  title: '招聘管理',
  // 路由字符串刻意不动：改它要牵动 App.tsx 里 sourceModule === 'campus-recruit'
  // 的跳转与既有书签，收益为零（spec §7）
  nav: [
    { path: '/campus', label: '投递管理' },
    { path: '/campus/stats', label: '招聘统计' },
  ],
  routes: [
    { path: '/campus', element: <ApplicationsPage /> },
    { path: '/campus/stats', element: <StatsPage /> },
  ],
};

export { ApplicationsPage, StatsPage };
export { fetchApplications } from './api.js';
