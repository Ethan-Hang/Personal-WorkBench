import { describe, expect, it } from 'vitest';
import { clampPage, clampZoom, nextRotation, pageWindow } from './reader-controls.js';

describe('reader controls', () => {
  it('页码和缩放保持在阅读器允许范围内', () => {
    expect(clampPage(-4, 20)).toBe(1);
    expect(clampPage(4.8, 20)).toBe(4);
    expect(clampPage(80, 20)).toBe(20);
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(1.234)).toBe(1.23);
    expect(clampZoom(8)).toBe(4);
  });

  it('旋转按四个直角状态循环', () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(270)).toBe(0);
  });

  it('连续布局只挂载当前页附近的有界窗口', () => {
    expect(pageWindow(1, 12, 'continuous')).toEqual([1, 2]);
    expect(pageWindow(6, 12, 'continuous')).toEqual([5, 6, 7]);
    expect(pageWindow(12, 12, 'continuous')).toEqual([11, 12]);
    expect(pageWindow(6, 12, 'single-page')).toEqual([6]);
  });
});
