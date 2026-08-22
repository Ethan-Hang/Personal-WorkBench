import { describe, it, expect } from 'vitest';
import {
  computeNoteStats,
  formatReadingTime,
  getNoteColorBgClass,
  getNoteColorDotClass,
  getNoteColorLabel,
  NoteEditor,
} from './NoteEditor.js';
import { NoteEditorModal } from './NoteEditorModal.js';
import { NoteFormatToolbar } from './NoteFormatToolbar.js';
import { NoteOutlineToc } from './NoteOutlineToc.js';

describe('NoteEditor - computeNoteStats', () => {
  it('正确统计纯中文文本的字数、字符数与阅读时间', () => {
    const text = '这是便签模块的沉浸式编辑器测试文本，用于验证字数统计功能。';
    const stats = computeNoteStats(text);

    expect(stats.chars).toBe(text.length); // 29 字符（含标点）
    expect(stats.words).toBe(27); // 27 个中文字词
    expect(stats.lines).toBe(1);
    expect(stats.readingTimeMinutes).toBe(1);
    expect(formatReadingTime(stats.readingTimeMinutes)).toBe('约 1 分钟阅读');
  });

  it('正确统计中英文混排及多行文本的字数', () => {
    const text = 'Hello world! 这是第二行。\n\n```typescript\nconst a = 1;\n```';
    const stats = computeNoteStats(text);

    expect(stats.lines).toBe(5);
    expect(stats.words).toBeGreaterThan(5);
    expect(stats.chars).toBe(text.length);
  });

  it('空文本统计返回 0', () => {
    const stats = computeNoteStats('');
    expect(stats.words).toBe(0);
    expect(stats.chars).toBe(0);
    expect(stats.lines).toBe(1);
    expect(stats.readingTimeMinutes).toBe(1);
  });

  it('getNoteColorBgClass 返回对应的语义主题样式类', () => {
    expect(getNoteColorBgClass('yellow')).toContain('amber');
    expect(getNoteColorBgClass('green')).toContain('emerald');
    expect(getNoteColorBgClass('blue')).toContain('sky');
    expect(getNoteColorBgClass('purple')).toContain('purple');
    expect(getNoteColorBgClass('pink')).toContain('rose');
    expect(getNoteColorBgClass('gray')).toContain('zinc');
  });

  it('getNoteColorDotClass 返回对应的色点样式类', () => {
    expect(getNoteColorDotClass('yellow')).toContain('amber');
    expect(getNoteColorDotClass('green')).toContain('emerald');
    expect(getNoteColorDotClass('blue')).toContain('sky');
    expect(getNoteColorDotClass('purple')).toContain('purple');
    expect(getNoteColorDotClass('pink')).toContain('rose');
    expect(getNoteColorDotClass('gray')).toContain('zinc');
  });

  it('getNoteColorLabel 返回友好的中文色彩名称', () => {
    expect(getNoteColorLabel('yellow')).toBe('暖阳黄');
    expect(getNoteColorLabel('green')).toBe('薄荷绿');
    expect(getNoteColorLabel('blue')).toBe('清泉蓝');
    expect(getNoteColorLabel('purple')).toBe('薰衣草');
    expect(getNoteColorLabel('pink')).toBe('樱花粉');
    expect(getNoteColorLabel('gray')).toBe('极简灰');
  });

  it('成功导出所有编辑器核心 React 组件', () => {
    expect(NoteEditor).toBeDefined();
    expect(typeof NoteEditor).toBe('function');
    expect(NoteEditorModal).toBeDefined();
    expect(typeof NoteEditorModal).toBe('function');
    expect(NoteFormatToolbar).toBeDefined();
    expect(typeof NoteFormatToolbar).toBe('function');
    expect(NoteOutlineToc).toBeDefined();
    expect(typeof NoteOutlineToc).toBe('function');
  });
});
