import type { AnnotationKind } from '../../../contract.js';

export type ReaderAnnotationTool = 'cursor' | AnnotationKind;

export function isTextAnnotationTool(
  tool: ReaderAnnotationTool,
): tool is 'highlight' | 'underline' | 'strikeout' {
  return tool === 'highlight' || tool === 'underline' || tool === 'strikeout';
}

export function isPointerAnnotationTool(
  tool: ReaderAnnotationTool,
): tool is 'area' | 'note' | 'bookmark' {
  return tool === 'area' || tool === 'note' || tool === 'bookmark';
}

const KEY_TO_TOOL: Record<string, ReaderAnnotationTool> = {
  v: 'cursor',
  h: 'highlight',
  u: 'underline',
  s: 'strikeout',
  a: 'area',
  n: 'note',
  b: 'bookmark',
  escape: 'cursor',
};

export function annotationToolForKey(key: string): ReaderAnnotationTool | null {
  return KEY_TO_TOOL[key.toLocaleLowerCase()] ?? null;
}

export function cycleReaderLayer(
  activeContextId: string | null,
  contextIds: readonly string[],
  direction: -1 | 1,
): string | null {
  const layers: Array<string | null> = [null, ...contextIds];
  const currentIndex = Math.max(0, layers.indexOf(activeContextId));
  return layers[(currentIndex + direction + layers.length) % layers.length] ?? null;
}
