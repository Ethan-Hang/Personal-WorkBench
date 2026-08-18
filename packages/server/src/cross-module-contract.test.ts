import { describe, expect, it } from 'vitest';
import { taskViewSchema } from '@workbench/module-todo/contract';
import { workbenchItemSchema } from '@workbench/module-workbench/contract';

/**
 * 工作台今日页会拿 workbenchItemSchema 去解析 todo 端点返回的 TaskView。
 * 两个 schema 由两个模块各自维护（铁律 1：模块间零依赖），因此谁都不会
 * 因为对方改了形状而编译报错——2026-08 就是这样漏掉了一个 kind 字段，
 * 让六个写操作在生产里必抛，而 npm run check 全绿。
 *
 * 这条测试是那道缝的守卫。它放在 packages/server 而不是任一模块内：
 * server 是组合根，本就合法地依赖所有模块，因此不需要 lint 豁免，
 * 也不给 modules/* 开先例。
 */
describe('跨模块接缝：todo 的 TaskView 能被工作台消费', () => {
  const todoTaskView = {
    id: 'item-1',
    title: '写周报',
    sourceModule: 'todo',
    kind: 'task',
    status: 'todo',
    importance: 'normal',
    dueAt: null,
    scheduled: { kind: 'all-day', date: '2026-08-18' },
    urgency: 'none',
    priorityScore: 1,
    isImportantQuadrant: false,
    isUrgentQuadrant: false,
  };

  it('todo 的 taskViewSchema 认这个形状', () => {
    expect(taskViewSchema.safeParse(todoTaskView).success).toBe(true);
  });

  it('工作台的 workbenchItemSchema 也认——两个 schema 没有分叉', () => {
    const result = workbenchItemSchema.safeParse(todoTaskView);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('定时排程分支同样两边都认', () => {
    const timed = {
      ...todoTaskView,
      scheduled: { kind: 'timed', start: '2026-08-18T01:00:00.000Z' },
    };
    expect(taskViewSchema.safeParse(timed).success).toBe(true);
    expect(workbenchItemSchema.safeParse(timed).success).toBe(true);
  });
});
