import { describe, it, expect } from 'vitest';
import { parseInline } from './inlineParser.js';

describe('inlineParser', () => {
  it('解析基础纯文本', () => {
    const nodes = parseInline('Hello world');
    expect(nodes).toEqual([{ type: 'text', value: 'Hello world' }]);
  });

  it('解析加粗、斜体与删除线', () => {
    const nodes = parseInline('**bold** and *italic* and ~~deleted~~');
    expect(nodes).toEqual([
      { type: 'bold', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' and ' },
      { type: 'italic', children: [{ type: 'text', value: 'italic' }] },
      { type: 'text', value: ' and ' },
      { type: 'strike', children: [{ type: 'text', value: 'deleted' }] },
    ]);
  });

  it('解析行内代码', () => {
    const nodes = parseInline('Run `npm run check` to verify');
    expect(nodes).toEqual([
      { type: 'text', value: 'Run ' },
      { type: 'code', code: 'npm run check' },
      { type: 'text', value: ' to verify' },
    ]);
  });

  it('解析超链接与图片', () => {
    const nodes = parseInline('[Workbench](https://github.com) and ![Avatar](/avatar.png)');
    expect(nodes).toEqual([
      { type: 'link', text: 'Workbench', href: 'https://github.com' },
      { type: 'text', value: ' and ' },
      { type: 'image', alt: 'Avatar', src: '/avatar.png' },
    ]);
  });

  it('解析马克笔高亮 ==highlight==', () => {
    const nodes = parseInline('This is ==critical information== to remember');
    expect(nodes).toEqual([
      { type: 'text', value: 'This is ' },
      { type: 'highlight', children: [{ type: 'text', value: 'critical information' }] },
      { type: 'text', value: ' to remember' },
    ]);
  });

  it('解析刮刮乐隐秘文本 !!spoiler!!', () => {
    const nodes = parseInline('The secret password is !!super-secret-123!!, click to reveal');
    expect(nodes).toEqual([
      { type: 'text', value: 'The secret password is ' },
      { type: 'spoiler', children: [{ type: 'text', value: 'super-secret-123' }] },
      { type: 'text', value: ', click to reveal' },
    ]);
  });

  it('解析 <Badge text="..." type="..." /> 徽章', () => {
    const nodes = parseInline('Feature <Badge text="Beta" type="warning" /> status');
    expect(nodes).toEqual([
      { type: 'text', value: 'Feature ' },
      { type: 'badge', text: 'Beta', badgeType: 'warning' },
      { type: 'text', value: ' status' },
    ]);
  });

  it('解析 :icon: 图标标记', () => {
    const nodes = parseInline('Launch :icon:lucide:rocket: right now');
    expect(nodes).toEqual([
      { type: 'text', value: 'Launch ' },
      { type: 'icon', icon: 'lucide:rocket' },
      { type: 'text', value: ' right now' },
    ]);
  });

  it('解析 Obsidian 兼容双向链接 [[Note]] 与 [[Note|Alias]]', () => {
    const nodes = parseInline('Reference [[2026-08-21-notes]] and [[Daily Plan|今日待办]]');
    expect(nodes).toEqual([
      { type: 'text', value: 'Reference ' },
      { type: 'wikilink', target: '2026-08-21-notes', alias: undefined },
      { type: 'text', value: ' and ' },
      { type: 'wikilink', target: 'Daily Plan', alias: '今日待办' },
    ]);
  });

  it('解析行内 KaTeX 数学公式 $E=mc^2$', () => {
    const nodes = parseInline('The mass-energy equivalence is $E=mc^2$ in physics');
    expect(nodes).toEqual([
      { type: 'text', value: 'The mass-energy equivalence is ' },
      { type: 'math', formula: 'E=mc^2' },
      { type: 'text', value: ' in physics' },
    ]);
  });

  it('解析缩写解释 *[HTML](Hypertext Markup Language)', () => {
    const nodes = parseInline('The *[HTML](Hypertext Markup Language) standard');
    expect(nodes).toEqual([
      { type: 'text', value: 'The ' },
      { type: 'abbr', term: 'HTML', explanation: 'Hypertext Markup Language' },
      { type: 'text', value: ' standard' },
    ]);
  });

  it('解析 <kbd> 按键组件与下标/上标', () => {
    const nodes = parseInline('Press <kbd>Ctrl+C</kbd> or H~2~O or E=mc^2^');
    expect(nodes).toEqual([
      { type: 'text', value: 'Press ' },
      { type: 'kbd', text: 'Ctrl+C' },
      { type: 'text', value: ' or H' },
      { type: 'sub', children: [{ type: 'text', value: '2' }] },
      { type: 'text', value: 'O or E=mc' },
      { type: 'sup', children: [{ type: 'text', value: '2' }] },
    ]);
  });

  it('解析 Plume 风格 :badge[text]{type="tip"} 与 @badge(text, tip)', () => {
    const nodes = parseInline('Status: :badge[v2.0]{type="success"} and @badge(Beta, warning)');
    expect(nodes).toEqual([
      { type: 'text', value: 'Status: ' },
      { type: 'badge', text: 'v2.0', badgeType: 'success' },
      { type: 'text', value: ' and ' },
      { type: 'badge', text: 'Beta', badgeType: 'warning' },
    ]);
  });

  it('正确处理嵌套与混合行内元素', () => {
    const nodes = parseInline('**==High Priority==** with `code` and $x_1$');
    expect(nodes).toEqual([
      {
        type: 'bold',
        children: [{ type: 'highlight', children: [{ type: 'text', value: 'High Priority' }] }],
      },
      { type: 'text', value: ' with ' },
      { type: 'code', code: 'code' },
      { type: 'text', value: ' and ' },
      { type: 'math', formula: 'x_1' },
    ]);
  });
});
