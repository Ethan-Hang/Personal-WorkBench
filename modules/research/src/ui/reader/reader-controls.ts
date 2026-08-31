import type { ReaderLayout, ReaderRotation } from '../../contract.js';

export function clampPage(pageNumber: number, pageCount: number): number {
  if (!Number.isFinite(pageNumber)) return 1;
  return Math.max(1, Math.min(Math.max(1, pageCount), Math.trunc(pageNumber)));
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(0.25, Math.min(4, Number(zoom.toFixed(2))));
}

export function nextRotation(rotation: ReaderRotation): ReaderRotation {
  return ((rotation + 90) % 360) as ReaderRotation;
}

export function pageWindow(pageNumber: number, pageCount: number, layout: ReaderLayout): number[] {
  const current = clampPage(pageNumber, pageCount);
  if (layout === 'single-page') return [current];
  return [current - 1, current, current + 1].filter((value) => value >= 1 && value <= pageCount);
}
