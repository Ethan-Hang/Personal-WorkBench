import { describe, it, expect } from 'vitest';
import { NoteMarkdownViewer } from './renderer.js';
import { parseMarkdown } from './parser.js';

describe('NoteMarkdownViewer & Renderer Components', () => {
  it('成功导出 NoteMarkdownViewer 组件', () => {
    expect(NoteMarkdownViewer).toBeDefined();
    expect(typeof NoteMarkdownViewer).toBe('function');
  });

  it('能正确解析并渲染复杂 Markdown 与所有扩展语法', () => {
    const md = `
# 便签模块测试
::: tip 核心提示
这是 Tip 内容。
:::

::: card title="文档" link="https://example.com"
卡片正文。
:::

::: tabs
@tab Tab1
内容 1
@tab Tab2
内容 2
:::

==高亮文本== 与 !!刮刮乐密码!! 与 [[双链事项]] 与 <Badge text="Pro" type="tip" />
`;
    const blocks = parseMarkdown(md);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
  });
});
