import { describe, expect, it } from 'vitest';
import {
  annotationToolForKey,
  cycleReaderLayer,
  isPointerAnnotationTool,
  isTextAnnotationTool,
} from './tools.js';

describe('reader annotation tools', () => {
  it('映射不占用修饰键的单键工具快捷键', () => {
    expect(['v', 'h', 'u', 's', 'a', 'n', 'b', 'Escape'].map(annotationToolForKey)).toEqual([
      'cursor',
      'highlight',
      'underline',
      'strikeout',
      'area',
      'note',
      'bookmark',
      'cursor',
    ]);
    expect(annotationToolForKey('x')).toBeNull();
  });

  it('文本选择工具与指针绘制工具互斥', () => {
    expect(isTextAnnotationTool('highlight')).toBe(true);
    expect(isTextAnnotationTool('area')).toBe(false);
    expect(isPointerAnnotationTool('area')).toBe(true);
    expect(isPointerAnnotationTool('underline')).toBe(false);
  });

  it('用方括号在通用层和命名上下文间循环', () => {
    expect(cycleReaderLayer(null, ['context-a', 'context-b'], 1)).toBe('context-a');
    expect(cycleReaderLayer('context-b', ['context-a', 'context-b'], 1)).toBeNull();
    expect(cycleReaderLayer(null, ['context-a', 'context-b'], -1)).toBe('context-b');
    expect(cycleReaderLayer('removed', ['context-a'], 1)).toBe('context-a');
  });
});
