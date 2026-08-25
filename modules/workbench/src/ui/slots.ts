/**
 * 本模块页面上开放给别的模块的插槽 id。
 *
 * 工作台的两个页面天生是跨模块视图，界面上难免要摆别的模块的东西
 * （今日的习惯打卡卡片就是）。直接 import 对方的组件会破铁律 1，
 * 相对路径 import 更是连 lint 都拦不住（`no-restricted-imports` 只认包名）。
 *
 * 所以工作台只声明「这里有个位置」，谁来填由唯一能同时 import 双方的组合根
 * `packages/web` 决定。装配机制见 `@workbench/ui` 的 SlotRegistry。
 */
export const WORKBENCH_SLOTS = {
  /** 今日执行度仪表盘底部的指标格。贡献方应渲染 ui 的 `MetricTile`。 */
  todayMetrics: 'workbench.today.metrics',
  /** 今日页右栏，执行度卡片之下。 */
  todayAside: 'workbench.today.aside',
  /** 周历页右侧边栏底部。 */
  calendarAside: 'workbench.calendar.aside',
} as const;
