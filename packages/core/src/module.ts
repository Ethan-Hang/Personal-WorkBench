import type { ItemRepository } from './repository.js';

/** 模块自带的迁移来源。folder 为相对仓库根的路径。 */
export interface MigrationSource {
  folder: string;
}

/**
 * 模块能触达 core 的唯一通道（spec §8.2）。
 * 刻意不暴露数据库句柄 —— 模块间零依赖因此在接口层面即不可违反（ISP）。
 */
export interface ModuleContext {
  moduleId: string;
  items: ItemRepository;
}

export interface ServerModuleDefinition {
  id: string;
  /** 无自有表的模块传空数组；注册表会逐个执行。 */
  migrations: MigrationSource[];
  registerRoutes(app: unknown, ctx: ModuleContext): void | Promise<void>;
}

export interface NavEntry {
  path: string;
  label: string;
}

export interface UiRoute {
  path: string;
  element: unknown;
}

export interface UiModuleDefinition {
  id: string;
  title: string;
  nav: NavEntry[];
  routes: UiRoute[];
}
