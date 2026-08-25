import type { UiModuleDefinition } from '@workbench/core';
import { HABIT_MODULE_ID } from '../contract.js';
import { HabitsPage } from './HabitsPage.js';

export const habitUiModule: UiModuleDefinition = {
  id: HABIT_MODULE_ID,
  title: '今日习惯',
  nav: [{ path: '/habits', label: '习惯' }],
  routes: [{ path: '/habits', element: <HabitsPage /> }],
};

export { HabitsPage };
export { TodayHabitCard, type TodayHabitCardProps } from './components/TodayHabitCard.js';
export { TodayCheckinMetric } from './components/TodayCheckinMetric.js';
export * from './api.js';
