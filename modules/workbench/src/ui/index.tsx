import type { UiModuleDefinition } from '@workbench/core';
import { WORKBENCH_MODULE_ID } from '../contract.js';
import { TodayPage } from './TodayPage.js';

export const workbenchUiModule: UiModuleDefinition = {
  id: WORKBENCH_MODULE_ID,
  title: '工作台',
  nav: [{ path: '/today', label: '今日' }],
  routes: [{ path: '/today', element: <TodayPage /> }],
};

export { TodayPage };
