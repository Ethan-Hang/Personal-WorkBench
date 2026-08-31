import { describe, expect, it } from 'vitest';
import {
  buildPageLayout,
  computeVirtualWindow,
  positionAtViewportCenter,
  scrollTopForPosition,
} from './virtualizer.js';

const base = {
  pageCount: 1_000,
  pageGap: 20,
  defaultPageSize: { width: 612, height: 780 },
};

describe('reader virtualizer', () => {
  it('一千页文档只返回 viewport 与预取区附近的页面', () => {
    const result = computeVirtualWindow({
      ...base,
      scrollTop: 400 * 800,
      viewportHeight: 900,
      overscan: 900,
    });

    expect(result.pages.length).toBeLessThanOrEqual(5);
    expect(result.visiblePages.length).toBeLessThanOrEqual(3);
    expect(result.totalHeight).toBe(799_980);
    expect(result.pages[0]!.pageNumber).toBeGreaterThan(398);
  });

  it('使用已测页面尺寸修正后续偏移', () => {
    const layout = buildPageLayout({
      pageCount: 3,
      pageGap: 10,
      defaultPageSize: { width: 600, height: 800 },
      pageSizes: new Map([[2, { width: 600, height: 1_000 }]]),
    });

    expect(layout.map((page) => page.top)).toEqual([0, 810, 1_820]);
    expect(layout[2]!.height).toBe(800);
  });

  it('低缩放和超高 viewport 也不会突破八页表面上限', () => {
    const result = computeVirtualWindow({
      pageCount: 1_000,
      pageGap: 20,
      defaultPageSize: { width: 153, height: 198 },
      scrollTop: 50_000,
      viewportHeight: 2_160,
      overscan: 2_160,
    });

    expect(result.pages).toHaveLength(8);
    expect(result.pages.map((page) => page.pageNumber)).toEqual(
      [...result.pages.map((page) => page.pageNumber)].sort((left, right) => left - right),
    );
  });

  it('阅读位置能在 viewport 中心坐标和页内比例间往返', () => {
    const layout = buildPageLayout(base);
    const scrollTop = scrollTopForPosition(layout, 40, 0.25, 900);
    const restored = positionAtViewportCenter(layout, scrollTop, 900);

    expect(restored.pageNumber).toBe(40);
    expect(restored.pageOffsetRatio).toBeCloseTo(0.25, 5);
  });
});
