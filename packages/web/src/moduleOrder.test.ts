import { describe, it, expect } from 'vitest';
import { applyModuleOrder, moveInList } from './moduleOrder.js';

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
