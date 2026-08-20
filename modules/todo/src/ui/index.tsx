import type { UiModuleDefinition } from '@workbench/core';
import { TODO_MODULE_ID } from '../contract.js';
import { TodayPage } from './TodayPage.js';

export const todoUiModule: UiModuleDefinition = {
  id: TODO_MODULE_ID,
  title: '待办',
  nav: [],
  routes: [],
};

export { TodayPage };
