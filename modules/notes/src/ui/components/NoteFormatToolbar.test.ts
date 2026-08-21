import { describe, it, expect } from 'vitest';
import { applyMarkdownFormat, getFormatSnippet } from './NoteFormatToolbar.js';

describe('NoteFormatToolbar - applyMarkdownFormat', () => {
  it('无选区时正确插入加粗标记并选中占位文本', () => {
    const text = 'hello world';
    const result = applyMarkdownFormat({
      text,
      selectionStart: 5,
      selectionEnd: 5,
      format: 'bold',
    });

    expect(result.text).toBe('hello**加粗文字** world');
    expect(result.newSelectionStart).toBe(7);
    expect(result.newSelectionEnd).toBe(11);
  });

  it('有选区时用加粗标记包裹选中文字', () => {
    const text = 'hello world';
    const result = applyMarkdownFormat({
      text,
      selectionStart: 6,
      selectionEnd: 11,
      format: 'bold',
    });

    expect(result.text).toBe('hello **world**');
    expect(result.newSelectionStart).toBe(8);
    expect(result.newSelectionEnd).toBe(13);
  });

  it('正确处理行内扩展格式：高亮、刮刮乐与行内代码', () => {
    const highlight = applyMarkdownFormat({
      text: '测试文本',
      selectionStart: 0,
      selectionEnd: 4,
      format: 'highlight',
    });
    expect(highlight.text).toBe('==测试文本==');

    const spoiler = applyMarkdownFormat({
      text: '保密信息',
      selectionStart: 0,
      selectionEnd: 4,
      format: 'spoiler',
    });
    expect(spoiler.text).toBe('!!保密信息!!');

    const inlineCode = applyMarkdownFormat({
      text: 'const x = 1',
      selectionStart: 0,
      selectionEnd: 11,
      format: 'code',
    });
    expect(inlineCode.text).toBe('`const x = 1`');
  });

  it('正确插入双链、超链接与图片标记', () => {
    const wikilink = applyMarkdownFormat({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      format: 'wikilink',
    });
    expect(wikilink.text).toBe('[[便签标题]]');

    const link = applyMarkdownFormat({
      text: '谷歌',
      selectionStart: 0,
      selectionEnd: 2,
      format: 'link',
      url: 'https://google.com',
    });
    expect(link.text).toBe('[谷歌](https://google.com)');

    const image = applyMarkdownFormat({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      format: 'image',
      url: 'https://example.com/demo.png',
    });
    expect(image.text).toBe('![图片描述](https://example.com/demo.png)');
  });

  it('正确插入标题 H1~H6', () => {
    const h1 = applyMarkdownFormat({
      text: '主标题',
      selectionStart: 0,
      selectionEnd: 3,
      format: 'h1',
    });
    expect(h1.text).toBe('# 主标题');

    const h3 = applyMarkdownFormat({
      text: '小节标题',
      selectionStart: 0,
      selectionEnd: 4,
      format: 'h3',
    });
    expect(h3.text).toBe('### 小节标题');
  });

  it('正确插入列表、引用与待办清单', () => {
    const ul = applyMarkdownFormat({
      text: '项目一\n项目二',
      selectionStart: 0,
      selectionEnd: 7,
      format: 'ul',
    });
    expect(ul.text).toBe('- 项目一\n- 项目二');

    const ol = applyMarkdownFormat({
      text: '步骤一\n步骤二',
      selectionStart: 0,
      selectionEnd: 7,
      format: 'ol',
    });
    expect(ol.text).toBe('1. 步骤一\n2. 步骤二');

    const task = applyMarkdownFormat({
      text: '任务一',
      selectionStart: 0,
      selectionEnd: 3,
      format: 'task',
    });
    expect(task.text).toBe('- [ ] 任务一');

    const quote = applyMarkdownFormat({
      text: '名言警句',
      selectionStart: 0,
      selectionEnd: 4,
      format: 'quote',
    });
    expect(quote.text).toBe('> 名言警句');
  });

  it('正确插入 Plume 容器扩展、KaTeX 数学公式与 Mermaid 图表', () => {
    const tip = getFormatSnippet('container-tip');
    expect(tip).toContain('::: tip 提示');
    expect(tip).toContain(':::');

    const steps = getFormatSnippet('container-steps');
    expect(steps).toContain('::: steps');
    expect(steps).toContain(':::');

    const mathBlock = getFormatSnippet('math-block');
    expect(mathBlock).toContain('$$');

    const mermaid = getFormatSnippet('mermaid');
    expect(mermaid).toContain('```mermaid');

    const table = getFormatSnippet('table');
    expect(table).toContain('| 列 1 | 列 2 |');
  });
});
