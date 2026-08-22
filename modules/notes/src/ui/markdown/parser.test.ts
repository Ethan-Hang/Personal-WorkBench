import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './parser.js';

describe('parser (Block & Container Parser)', () => {
  it('解析基础标题与段落', () => {
    const md = '# 架构设计\n\n这是正文内容。';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'heading',
      level: 1,
      text: '架构设计',
    });
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('解析代码块与 Mermaid 图表', () => {
    const md = '```typescript\nconst a = 1;\n```\n\n```mermaid\ngraph TD\nA --> B\n```';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'code-block',
      lang: 'typescript',
      code: 'const a = 1;',
    });
    expect(blocks[1]).toMatchObject({
      type: 'mermaid',
      code: 'graph TD\nA --> B',
    });
  });

  it('解析数学公式块 $$ ... $$', () => {
    const md = '$$\n\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'math-block',
      formula: '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
    });
  });

  it('解析 GFM 表格与对齐方式', () => {
    const md = '| 模块 | 状态 | 优先级 |\n| :--- | :---: | ---: |\n| Notes | 待测试 | P1 |';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const table = blocks[0];
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      expect(table.alignments).toEqual(['left', 'center', 'right']);
      expect(table.headers).toHaveLength(3);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]).toHaveLength(3);
    }
  });

  it('解析无序列表、有序列表与任务列表 Checkbox', () => {
    const md = '- [ ] 待办 1\n- [x] 已完成 2\n- 纯文本 3\n\n1. 第一步\n2. 第二步';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(2);
    const list1 = blocks[0];
    const list2 = blocks[1];
    expect(list1?.type).toBe('list');
    expect(list2?.type).toBe('list');
    if (list1?.type === 'list' && list2?.type === 'list') {
      expect(list1.ordered).toBe(false);
      expect(list1.items[0]?.checked).toBe(false);
      expect(list1.items[1]?.checked).toBe(true);
      expect(list1.items[2]?.checked).toBeNull();
      expect(list2.ordered).toBe(true);
    }
  });

  it('解析标准 Callout 提示容器（tip / warning / danger / note / info / details）', () => {
    const md =
      '::: tip 核心提示\n请注意这行提示信息。\n:::\n\n::: warning\n请勿在 SQL 中转时区。\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      type: 'container',
      directive: 'tip',
      title: '核心提示',
    });
    expect(blocks[1]).toMatchObject({
      type: 'container',
      directive: 'warning',
      title: 'Warning',
    });
  });

  it('解析 ::: card 卡片容器', () => {
    const md =
      '::: card title="VuePress Plume" link="https://plume.vuepress.net" icon="lucide:book"\n现代化的主题设计。\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'container',
      directive: 'card',
      params: {
        title: 'VuePress Plume',
        link: 'https://plume.vuepress.net',
        icon: 'lucide:book',
      },
    });
  });

  it('解析 ::: steps 步骤容器', () => {
    const md = '::: steps\n1. 创建便签\n2. 撰写 Markdown\n3. 导出或关联待办\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    expect(container?.type).toBe('container');
    if (container?.type === 'container') {
      expect(container.directive).toBe('steps');
      expect(container.stepItems).toHaveLength(3);
      expect(container.stepItems?.[0]?.stepNumber).toBe(1);
      expect(container.stepItems?.[0]?.title).toBe('创建便签');
    }
  });

  it('解析 ::: file-tree 目录树容器', () => {
    const md =
      '::: file-tree\n- modules/\n  - notes/\n    - src/\n      - contract.ts\n      - ui/\n- package.json\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    expect(container?.type).toBe('container');
    if (container?.type === 'container') {
      expect(container.directive).toBe('file-tree');
      expect(container.fileTreeItems).toBeDefined();
      expect(container.fileTreeItems?.length).toBeGreaterThan(3);
      expect(container.fileTreeItems?.[0]).toMatchObject({
        name: 'modules',
        isDir: true,
        level: 0,
      });
    }
  });

  it('解析 ::: tabs 选项卡容器与 @tab 指令', () => {
    const md =
      '::: tabs\n@tab TypeScript\n```ts\nconst x: number = 1;\n```\n@tab Rust\n```rust\nlet x: i32 = 1;\n```\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    expect(container?.type).toBe('container');
    if (container?.type === 'container') {
      expect(container.directive).toBe('tabs');
      expect(container.tabItems).toHaveLength(2);
      expect(container.tabItems?.[0]?.title).toBe('TypeScript');
      expect(container.tabItems?.[1]?.title).toBe('Rust');
    }
  });

  it('解析 ::: timeline 时间线容器', () => {
    const md =
      '::: timeline\n- 2026-08-17: Walking Skeleton 完成\n- 2026-08-19: 凭据零知识加密与同步\n- 2026-08-21: 便签模块全面落地\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    expect(container?.type).toBe('container');
    if (container?.type === 'container') {
      expect(container.directive).toBe('timeline');
      expect(container.timelineItems).toHaveLength(3);
      expect(container.timelineItems?.[0]?.date).toBe('2026-08-17');
      expect(container.timelineItems?.[0]?.title).toBe('Walking Skeleton 完成');
    }
  });

  it('解析 @ 语法与多行描述的 ::: timeline 容器', () => {
    const md =
      '::: timeline\n@ 2026-08-21 项目立项\n完成便签模块架构设计\n@ 2026-08-22 功能交付\n全流程端到端上线验证\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    if (container?.type === 'container') {
      expect(container.directive).toBe('timeline');
      expect(container.timelineItems).toHaveLength(2);
      expect(container.timelineItems?.[0]?.date).toBe('2026-08-21');
      expect(container.timelineItems?.[0]?.title).toBe('项目立项');
      expect(container.timelineItems?.[0]?.description).toBe('完成便签模块架构设计');
    }
  });

  it('解析 ::: chat 双向对话气泡容器', () => {
    const md =
      '::: chat\nuser: 你好，请帮我规划一下便签功能。\nbot: 没问题，已为你拆解 TASK-060 至 TASK-067。\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    expect(container?.type).toBe('container');
    if (container?.type === 'container') {
      expect(container.directive).toBe('chat');
      expect(container.chatItems).toHaveLength(2);
      expect(container.chatItems?.[0]?.role).toBe('user');
      expect(container.chatItems?.[1]?.role).toBe('bot');
    }
  });

  it('解析带角色名与括号语法的 ::: chat 容器', () => {
    const md =
      '::: chat\n(left: Ethan) 你好，请帮我整理这份便签！\n(right: Antigravity) 没问题，已为您提取大纲。\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    const container = blocks[0];
    if (container?.type === 'container') {
      expect(container.directive).toBe('chat');
      expect(container.chatItems).toHaveLength(2);
      expect(container.chatItems?.[0]?.author).toBe('Ethan');
      expect(container.chatItems?.[1]?.author).toBe('Antigravity');
      expect(container.chatItems?.[0]?.role).toBe('bot');
      expect(container.chatItems?.[1]?.role).toBe('user');
    }
  });

  it('解析 ::: qrcode 二维码容器', () => {
    const md = '::: qrcode https://github.com/Ethan-Hang/Personal-WorkBench\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'container',
      directive: 'qrcode',
      rawContent: 'https://github.com/Ethan-Hang/Personal-WorkBench',
    });
  });

  it('解析 ::: collapse 手风琴折叠与 ::: window macOS拟态窗口与 ::: flex 布局容器', () => {
    const md =
      '::: collapse title="详细技术规范"\n内部内容折叠展开。\n:::\n\n::: window title="terminal"\n`npm run check`\n:::\n\n::: flex\n- 卡片A\n- 卡片B\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      type: 'container',
      directive: 'collapse',
      params: { title: '详细技术规范' },
    });
    expect(blocks[1]).toMatchObject({
      type: 'container',
      directive: 'window',
      params: { title: 'terminal' },
    });
    expect(blocks[2]).toMatchObject({
      type: 'container',
      directive: 'flex',
    });
  });

  it('解析媒体嵌入容器（bilibili, youtube, pdf）', () => {
    const md =
      '::: bilibili BV1xx411c7mD\n:::\n\n::: youtube dQw4w9WgXcQ\n:::\n\n::: pdf https://example.com/doc.pdf\n:::';
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'container', directive: 'bilibili' });
    expect(blocks[1]).toMatchObject({ type: 'container', directive: 'youtube' });
    expect(blocks[2]).toMatchObject({ type: 'container', directive: 'pdf' });
  });
});
