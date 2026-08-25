import type { UiModuleDefinition } from '@workbench/core';
import { WORKBENCH_MODULE_ID } from '../contract.js';
import { TodayPage } from './TodayPage.js';
import { CalendarPage } from './CalendarPage.js';

export const workbenchUiModule: UiModuleDefinition = {
  id: WORKBENCH_MODULE_ID,
  title: '工作台',
  nav: [
    { path: '/today', label: '今日' },
    { path: '/calendar', label: '周历' },
  ],
  routes: [
    { path: '/today', element: <TodayPage /> },
    { path: '/calendar', element: <CalendarPage /> },
  ],
};

export { TodayPage, CalendarPage };
export { fetchToday, fetchUnscheduled } from './api.js';
export { WORKBENCH_SLOTS } from './slots.js';
