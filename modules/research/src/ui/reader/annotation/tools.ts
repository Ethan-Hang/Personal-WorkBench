import type { AnnotationKind } from '../../../contract.js';

export type ReaderAnnotationTool = 'cursor' | AnnotationKind | 'evidence-text' | 'evidence-area';

export function isTextAnnotationTool(
  tool: ReaderAnnotationTool,
): tool is 'highlight' | 'underline' | 'strikeout' | 'evidence-text' {
  return (
    tool === 'highlight' || tool === 'underline' || tool === 'strikeout' || tool === 'evidence-text'
  );
}

export function isPointerAnnotationTool(
  tool: ReaderAnnotationTool,
): tool is 'area' | 'note' | 'bookmark' | 'evidence-area' {
  return tool === 'area' || tool === 'note' || tool === 'bookmark' || tool === 'evidence-area';
}

const KEY_TO_TOOL: Record<string, ReaderAnnotationTool> = {
  v: 'cursor',
  h: 'highlight',
  u: 'underline',
  s: 'strikeout',
  a: 'area',
  n: 'note',
  b: 'bookmark',
  e: 'evidence-text',
  g: 'evidence-area',
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
