import { createContext, useContext, type ReactNode } from 'react';

/**
 * 一条插槽贡献。`id` 用于 React key 与去重，`node` 由贡献方自己渲染。
 */
export interface SlotEntry {
  id: string;
  node: ReactNode;
}

/** 插槽 id → 该插槽上的贡献列表。插槽 id 由消费方定义，装配由组合根完成。 */
export type SlotMap = Readonly<Record<string, readonly SlotEntry[]>>;

const EMPTY: readonly SlotEntry[] = [];

const SlotContext = createContext<SlotMap>({});

/**
 * 具名插槽注册表。
 *
 * 它存在的理由只有一条：**让一个模块的界面出现在另一个模块的页面上，
 * 而两个模块之间不产生任何依赖**（spec §4.2 铁律 1）。
 * 消费方声明一个插槽 id 并渲染它上面的贡献；贡献方导出一个自给自足的组件
 * （自己取数、自己处理加载与错误）；把两者接上的是唯一能同时 import 双方的
 * 组合根 `packages/web`。
 *
 * 这里刻意不出现任何领域词汇——插槽 id 是消费方传进来的字符串，
 * 本文件不认识「今日」「习惯」，否则 ui 就成了第二个 core。
 */
export function SlotProvider({ slots, children }: { slots: SlotMap; children: ReactNode }) {
  return <SlotContext.Provider value={slots}>{children}</SlotContext.Provider>;
}

/** 取某个插槽上的贡献；没有贡献时返回同一个空数组（引用稳定，可直接进依赖数组）。 */
export function useSlotEntries(slotId: string): readonly SlotEntry[] {
  return useContext(SlotContext)[slotId] ?? EMPTY;
}
