import { describe, expect, it } from 'vitest';
import {
  annotationPageOffsetRatio,
  buildAreaAnchor,
  buildTextAnchor,
  pdfQuadToViewportBounds,
  pdfRectToViewportBounds,
  viewportBoundsToPdfQuad,
  viewportBoundsToPdfRect,
} from './anchor.js';

const page = { left: 100, top: 50, right: 500, bottom: 650 };
const viewport = {
  convertToPdfPoint(x: number, y: number): [number, number] {
    return [x / 2, 300 - y / 2];
  },
  convertToViewportPoint(x: number, y: number): [number, number] {
    return [x * 2, (300 - y) * 2];
  },
};

describe('reader annotation anchors', () => {
  it('把屏幕矩形转换为 PDF quad，并能在 viewport 中重建边界', () => {
    const quad = viewportBoundsToPdfQuad(
      { left: 120, top: 90, right: 220, bottom: 130 },
      page,
      viewport,
    );
    expect(quad).toEqual({ x1: 10, y1: 280, x2: 60, y2: 280, x3: 10, y3: 260, x4: 60, y4: 260 });
    expect(pdfQuadToViewportBounds(quad!, viewport)).toEqual({
      left: 20,
      top: 40,
      width: 100,
      height: 40,
    });
  });

  it('裁剪超出页面的拖拽区域并保存未旋转 PDF 坐标', () => {
    expect(
      viewportBoundsToPdfRect({ left: 80, top: 30, right: 180, bottom: 110 }, page, viewport),
    ).toEqual({ x: 0, y: 270, width: 40, height: 30 });
    const anchor = buildAreaAnchor({
      bounds: { left: 80, top: 30, right: 180, bottom: 110 },
      pageBounds: page,
      viewport,
      pageNumber: 8,
      pageSize: { width: 200, height: 300 },
      assetHash: 'a'.repeat(64),
      editionId: null,
    });
    expect(anchor).toMatchObject({
      pageNumber: 8,
      rect: { x: 0, y: 270, width: 40, height: 30 },
      quads: [],
    });
    expect(pdfRectToViewportBounds(anchor!.rect!, viewport)).toEqual({
      left: 0,
      top: 0,
      width: 80,
      height: 60,
    });
  });

  it('完全位于页面外的矩形不会生成锚点', () => {
    expect(
      viewportBoundsToPdfQuad({ left: 0, top: 0, right: 50, bottom: 40 }, page, viewport),
    ).toBeNull();
  });

  it('文本锚点保存引用上下文和稳定 SHA-256 指纹', async () => {
    const anchor = await buildTextAnchor({
      bounds: [{ left: 120, top: 90, right: 220, bottom: 130 }],
      pageBounds: page,
      viewport,
      pageNumber: 2,
      pageSize: { width: 200, height: 300 },
      assetHash: 'a'.repeat(64),
      editionId: 'edition-1',
      exact: 'selected text',
      pageText: 'prefix selected text suffix',
    });
    expect(anchor).toMatchObject({
      pageNumber: 2,
      editionId: 'edition-1',
      textQuote: { exact: 'selected text', prefix: 'prefix ', suffix: ' suffix' },
    });
    expect(anchor?.textQuote?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('按当前旋转方向把批注中心转换为页面滚动比例', () => {
    const anchor = {
      pageSize: { width: 200, height: 300 },
      rect: { x: 40, y: 210, width: 20, height: 30 },
      quads: [],
    };
    expect(annotationPageOffsetRatio(anchor, 0)).toBeCloseTo(0.25);
    expect(annotationPageOffsetRatio(anchor, 90)).toBeCloseTo(0.25);
    expect(annotationPageOffsetRatio(anchor, 180)).toBeCloseTo(0.75);
    expect(annotationPageOffsetRatio(anchor, 270)).toBeCloseTo(0.75);
    expect(annotationPageOffsetRatio({ ...anchor, rect: null, quads: [] }, 0)).toBeCloseTo(0.05);
  });
});
