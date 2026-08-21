import type { UiModuleDefinition } from '@workbench/core';
import { campusRecruitUiModule } from '@workbench/module-campus-recruit/ui';
import { habitUiModule } from '@workbench/module-habit/ui';
import { notesUiModule } from '@workbench/module-notes/ui';
import { workbenchUiModule } from '@workbench/module-workbench/ui';

/**
 * 前端模块注册表。加模块 = 在此加一行 import 与一个数组项。
 * 与服务端注册表对称，两侧都不需要改 core（spec §9 OCP）。
 */
export const uiModules: UiModuleDefinition[] = [
  workbenchUiModule,
  habitUiModule,
  campusRecruitUiModule,
  notesUiModule,
];
