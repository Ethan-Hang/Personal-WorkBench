import { describe, it, expect } from 'vitest';
import { calculateActiveHeadingId, filterTocItems } from './NoteOutlineToc.js';
import type { TocItem } from '../markdown/types.js';

describe('NoteOutlineToc', () => {
  const sampleItems: TocItem[] = [
    { id: 'section-1', level: 1, text: '第一章：架构设计' },
    { id: 'section-1-1', level: 2, text: '1.1 数据建模' },
    { id: 'section-1-2', level: 2, text: '1.2 接口契约' },
    { id: 'section-2', level: 1, text: '第二章：前端体验' },
    { id: 'section-2-1', level: 2, text: '2.1 沉浸式编辑器' },
    { id: 'section-2-2', level: 2, text: '2.2 大纲 TOC 交互' },
  ];

  it('filterTocItems 支持关键词过滤标题', () => {
    const matched = filterTocItems(sampleItems, '契约');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.text).toBe('1.2 接口契约');

    const matchedChapter = filterTocItems(sampleItems, '第二章');
    expect(matchedChapter).toHaveLength(1);
    expect(matchedChapter[0]?.id).toBe('section-2');

    const emptyFilter = filterTocItems(sampleItems, '');
    expect(emptyFilter).toHaveLength(6);
  });

  it('calculateActiveHeadingId 根据滚动位置准确判定当前激活标题', () => {
    const headings = [
      { id: 'section-1', top: 0 },
      { id: 'section-1-1', top: 300 },
      { id: 'section-1-2', top: 650 },
      { id: 'section-2', top: 1200 },
      { id: 'section-2-1', top: 1500 },
      { id: 'section-2-2', top: 1900 },
    ];

    // 在页面顶部 (scrollTop = 50)，应激活 section-1
    expect(calculateActiveHeadingId(headings, 50, 80)).toBe('section-1');

    // 滚动到 400 (超过 300 - 80)，应激活 section-1-1
    expect(calculateActiveHeadingId(headings, 400, 80)).toBe('section-1-1');

    // 滚动到 1300，应激活 section-2
    expect(calculateActiveHeadingId(headings, 1300, 80)).toBe('section-2');

    // 空标题列表返回 null
    expect(calculateActiveHeadingId([], 100, 80)).toBeNull();
  });
});
