import { createContext, useContext, type ReactNode } from 'react';

/**
 * 模块 id → 展示名。由外壳从注册表填充，模块 UI 消费。
 *
 * 存在的理由：一个模块的页面要显示另一个模块产生的条目时（今日工作台就是
 * 这种情况），不应该认识对方叫什么——否则每加一个模块，都要回头去改所有
 * 会显示跨模块条目的页面。这类耦合 lint 抓不到，因为它是字符串字面量而非
 * import。
 *
 * 这里只有 string → string，不含任何领域概念，因此不违反 packages/ui
 * 「纯展示、只依赖 react」的边界。
 */
const ModuleLabelContext = createContext<Readonly<Record<string, string>>>({});

export function ModuleLabelProvider({
  labels,
  children,
}: {
  labels: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return <ModuleLabelContext.Provider value={labels}>{children}</ModuleLabelContext.Provider>;
}

/** 取不到时回落到 id 本身：宁可显示 `campus-recruit`，也不显示空白。 */
export function useModuleLabel(moduleId: string): string {
  return useContext(ModuleLabelContext)[moduleId] ?? moduleId;
}
