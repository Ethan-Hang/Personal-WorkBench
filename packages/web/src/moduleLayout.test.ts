import { describe, it, expect } from 'vitest';
import {
  applyModuleOrder,
  enabledModules,
  isModuleDisabled,
  moveInList,
  toggleDisabled,
} from './moduleLayout.js';

const registry = [{ id: 'habit' }, { id: 'campus-recruit' }, { id: 'notes' }, { id: 'research' }];

describe('applyModuleOrder', () => {
  it('空顺序 = 没表达过偏好，按注册表原序', () => {
    expect(applyModuleOrder(registry, []).map((m) => m.id)).toEqual([
      'habit',
      'campus-recruit',
      'notes',
      'research',
    ]);
  });

  it('按存好的顺序重排', () => {
    const order = ['notes', 'research', 'habit', 'campus-recruit'];
    expect(applyModuleOrder(registry, order).map((m) => m.id)).toEqual(order);
  });

  it('顺序里没提到的新模块追加在末尾——刚装的模块不该从侧边栏消失', () => {
    expect(applyModuleOrder(registry, ['notes', 'habit']).map((m) => m.id)).toEqual([
      'notes',
      'habit',
      'campus-recruit',
      'research',
    ]);
  });

  it('顺序里对不上注册表的 id 直接忽略——删掉的模块不该占一个空位', () => {
    expect(applyModuleOrder(registry, ['已卸载', 'notes']).map((m) => m.id)).toEqual([
      'notes',
      'habit',
      'campus-recruit',
      'research',
    ]);
  });

  it('不改动传入的数组', () => {
    const order = ['notes'];
    applyModuleOrder(registry, order);
    expect(order).toEqual(['notes']);
    expect(registry.map((m) => m.id)).toEqual(['habit', 'campus-recruit', 'notes', 'research']);
  });
});

describe('moveInList', () => {
  it('上移与下移交换相邻两项', () => {
    expect(moveInList(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInList(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b']);
  });

  it('首项上移与末项下移原样返回，不是错误', () => {
    expect(moveInList(['a', 'b'], 0, 'up')).toEqual(['a', 'b']);
    expect(moveInList(['a', 'b'], 1, 'down')).toEqual(['a', 'b']);
  });

  it('越界索引原样返回', () => {
    expect(moveInList(['a', 'b'], 5, 'up')).toEqual(['a', 'b']);
    expect(moveInList([], 0, 'down')).toEqual([]);
  });
});

describe('isModuleDisabled', () => {
  it('在名单里的模块算关掉', () => {
    expect(isModuleDisabled('notes', ['notes'])).toBe(true);
    expect(isModuleDisabled('notes', [])).toBe(false);
  });

  it('核心模块永远开着，哪怕设置里真的存着它——关了就没有今日与周历', () => {
    expect(isModuleDisabled('workbench', ['workbench'])).toBe(false);
    expect(isModuleDisabled('todo', ['todo', 'notes'])).toBe(false);
  });
});

describe('enabledModules', () => {
  it('滤掉关掉的，保留顺序', () => {
    expect(enabledModules(registry, ['campus-recruit', 'research']).map((m) => m.id)).toEqual([
      'habit',
      'notes',
    ]);
  });

  it('名单里有不存在的 id 不影响其余', () => {
    expect(enabledModules(registry, ['已卸载']).map((m) => m.id)).toEqual([
      'habit',
      'campus-recruit',
      'notes',
      'research',
    ]);
  });
});

describe('toggleDisabled', () => {
  it('关一个、再开回来', () => {
    const off = toggleDisabled([], 'notes', true);
    expect(off).toEqual(['notes']);
    expect(toggleDisabled(off, 'notes', false)).toEqual([]);
  });

  it('重复关不会写进两条——去重后消费方才不会看到两个同名条目', () => {
    expect(toggleDisabled(['notes'], 'notes', true)).toEqual(['notes']);
  });

  it('请求关掉核心模块时原样返回，不写进名单', () => {
    expect(toggleDisabled(['notes'], 'workbench', true)).toEqual(['notes']);
  });

  it('不改动传入的数组', () => {
    const before = ['notes'];
    toggleDisabled(before, 'habit', true);
    expect(before).toEqual(['notes']);
  });
});
