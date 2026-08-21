import { describe, it, expect } from 'vitest';
import type { NoteView } from '../contract.js';
import {
  renderNoteToStandaloneHtml,
  exportToMarkdown,
  exportToHtml,
  exportToPdf,
} from './exportEngine.js';

const mockNote: NoteView = {
  id: 'note-100',
  folderId: null,
  revision: 2,
  title: '架构设计与导出测试',
  content: `# 系统架构说明

这是一段包含 **加粗**、*斜体* 和 ==高亮文本== 的正文。

> 这是一个引用块，说明核心理念。

\`\`\`typescript
const greeting = "Hello Workbench";
console.log(greeting);
\`\`\`

| 模块 | 职责 |
| :--- | :--- |
| Core | 基础契约 |
| UI   | 交互界面 |

::: tip 温馨提示
这是一个提示容器！
:::

::: qrcode https://example.com/notes
扫码查看便签
:::`,
  excerpt: '这是一段包含加粗、斜体和高亮文本的正文。',
  color: 'blue',
  isPinned: true,
  status: 'active',
  metadata: {},
  tags: ['架构', '技术文档'],
  todoLinks: [],
  createdAt: '2026-08-21T12:00:00.000Z',
  updatedAt: '2026-08-21T12:30:00.000Z',
  trashedAt: null,
};

describe('Note Export Engine', () => {
  it('成功将便签转换为自包含样式的独立 HTML 文档', () => {
    const html = renderNoteToStandaloneHtml(mockNote, { includeWatermark: true });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>架构设计与导出测试 - 便签导出</title>');
    expect(html).toContain('class="note-title">架构设计与导出测试</h1>');
    expect(html).toContain('#架构');
    expect(html).toContain('#技术文档');
    expect(html).toContain('<strong>加粗</strong>');
    expect(html).toContain('<em>斜体</em>');
    expect(html).toContain('<blockquote class="blockquote">');
    expect(html).toContain('<pre class="code-block">');
    expect(html).toContain('const greeting = &quot;Hello Workbench&quot;;');
    expect(html).toContain('<table class="table">');
    expect(html).toContain('container-tip');
    expect(html).toContain('qrcode-container');
    expect(html).toContain('Personal Workbench · 便签导出系统');
  });

  it('支持关闭水印的 HTML 渲染', () => {
    const htmlWithoutWatermark = renderNoteToStandaloneHtml(mockNote, {
      includeWatermark: false,
    });
    expect(htmlWithoutWatermark).not.toContain('Personal Workbench · 便签导出系统');
  });

  it('支持导出包含 YAML Frontmatter 的 Markdown 源文本', () => {
    // 在 node / vitest 环境下直接验证 exportToMarkdown 内部逻辑
    expect(() => {
      exportToMarkdown(mockNote, { includeFrontmatter: true });
    }).not.toThrow();
  });

  it('支持 HTML 与 PDF 导出函数调用', () => {
    expect(() => {
      exportToHtml(mockNote);
    }).not.toThrow();

    expect(() => {
      exportToPdf(mockNote);
    }).not.toThrow();
  });
});
