import React, { useState, useRef, useEffect } from 'react';

export type FormatType =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'underline'
  | 'code'
  | 'highlight'
  | 'spoiler'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'task'
  | 'hr'
  | 'link'
  | 'image'
  | 'wikilink'
  | 'table'
  | 'codeblock'
  | 'math-inline'
  | 'math-block'
  | 'mermaid'
  | 'container-tip'
  | 'container-warning'
  | 'container-danger'
  | 'container-note'
  | 'container-info'
  | 'container-steps'
  | 'container-tabs'
  | 'container-card'
  | 'container-collapse'
  | 'container-window'
  | 'container-flex'
  | 'container-file-tree'
  | 'container-timeline'
  | 'container-chat'
  | 'container-qrcode';

export interface ApplyFormatOptions {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  format: FormatType;
  url?: string;
  customSnippet?: string;
}

export interface ApplyFormatResult {
  text: string;
  newSelectionStart: number;
  newSelectionEnd: number;
}

/**
 * 获取预设的代码片段或容器模板
 */
export function getFormatSnippet(format: FormatType): string {
  switch (format) {
    case 'table':
      return '\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 1 | 内容 2 | 内容 3 |\n| 内容 4 | 内容 5 | 内容 6 |\n';
    case 'codeblock':
      return '\n```typescript\n// 在此输入代码\nconst greeting = "Hello Notes!";\nconsole.log(greeting);\n```\n';
    case 'math-inline':
      return '$E=mc^2$';
    case 'math-block':
      return '\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n';
    case 'mermaid':
      return '\n```mermaid\ngraph TD;\n  A[开始] --> B{是否确认?};\n  B -- 是 --> C[执行操作];\n  B -- 否 --> D[取消返回];\n```\n';
    case 'container-tip':
      return '\n::: tip 提示\n这里是温馨提示内容。\n:::\n';
    case 'container-warning':
      return '\n::: warning 注意\n这里是需要留意的注意事项。\n:::\n';
    case 'container-danger':
      return '\n::: danger 危险\n这里是高风险操作警告。\n:::\n';
    case 'container-note':
      return '\n::: note 便签\n这里是补充说明记录。\n:::\n';
    case 'container-info':
      return '\n::: info 详情\n这里是详细说明信息。\n:::\n';
    case 'container-steps':
      return '\n::: steps\n1. 第一步：准备运行环境\n2. 第二步：执行安装命令\n3. 第三步：启动本地服务\n:::\n';
    case 'container-tabs':
      return '\n::: tabs\n@tab npm\n```bash\nnpm install\n```\n@tab pnpm\n```bash\npnpm install\n```\n:::\n';
    case 'container-card':
      return '\n::: card title="项目文档" link="https://github.com" icon="rocket"\n点击跳转至项目 GitHub 仓库主页。\n:::\n';
    case 'container-collapse':
      return '\n::: collapse title="点击展开查看详情"\n这里是折叠在内部的详细说明文字。\n:::\n';
    case 'container-window':
      return '\n::: window title="Terminal"\n$ npm run dev\n> ready in 250ms\n:::\n';
    case 'container-flex':
      return '\n::: flex\n这里是左侧栏内容\n+++\n这里是右侧栏内容\n:::\n';
    case 'container-file-tree':
      return '\n::: file-tree\n- src/\n  - index.ts\n  - styles.css\n- package.json\n- README.md\n:::\n';
    case 'container-timeline':
      return '\n::: timeline\n@ 2026-08-21 项目立项\n完成便签模块架构设计\n@ 2026-08-22 功能交付\n全流程端到端上线验证\n:::\n';
    case 'container-chat':
      return '\n::: chat\n(left: User) 你好，请帮我整理这份笔记！\n(right: Antigravity) 没问题，已为您自动提取大纲与标签。\n:::\n';
    case 'container-qrcode':
      return '\n::: qrcode https://github.com\n扫描二维码访问链接\n:::\n';
    case 'hr':
      return '\n---\n';
    default:
      return '';
  }
}

/**
 * 纯函数：根据当前输入框文本、光标选区和格式化类型，生成新文本并计算新光标选区
 */
export function applyMarkdownFormat({
  text,
  selectionStart,
  selectionEnd,
  format,
  url,
  customSnippet,
}: ApplyFormatOptions): ApplyFormatResult {
  const selectedText = text.substring(selectionStart, selectionEnd);
  const before = text.substring(0, selectionStart);
  const after = text.substring(selectionEnd);

  if (customSnippet) {
    const newText = before + customSnippet + after;
    return {
      text: newText,
      newSelectionStart: selectionStart + customSnippet.length,
      newSelectionEnd: selectionStart + customSnippet.length,
    };
  }

  // 1. 行内对称包裹格式
  switch (format) {
    case 'bold': {
      const placeholder = selectedText || '加粗文字';
      const replacement = `**${placeholder}**`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + placeholder.length,
      };
    }
    case 'italic': {
      const placeholder = selectedText || '斜体文字';
      const replacement = `*${placeholder}*`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + placeholder.length,
      };
    }
    case 'strike': {
      const placeholder = selectedText || '删除线文字';
      const replacement = `~~${placeholder}~~`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + placeholder.length,
      };
    }
    case 'underline': {
      const placeholder = selectedText || '下划线文字';
      const replacement = `<u>${placeholder}</u>`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 3,
        newSelectionEnd: selectionStart + 3 + placeholder.length,
      };
    }
    case 'code': {
      const placeholder = selectedText || '行内代码';
      const replacement = `\`${placeholder}\``;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + placeholder.length,
      };
    }
    case 'highlight': {
      const placeholder = selectedText || '高亮文字';
      const replacement = `==${placeholder}==`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + placeholder.length,
      };
    }
    case 'spoiler': {
      const placeholder = selectedText || '刮刮乐文字';
      const replacement = `!!${placeholder}!!`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + placeholder.length,
      };
    }
    case 'wikilink': {
      const placeholder = selectedText || '便签标题';
      const replacement = `[[${placeholder}]]`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + placeholder.length,
      };
    }
    case 'link': {
      const linkText = selectedText || '链接文字';
      const targetUrl = url || 'https://example.com';
      const replacement = `[${linkText}](${targetUrl})`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + linkText.length,
      };
    }
    case 'image': {
      const altText = selectedText || '图片描述';
      const targetUrl = url || 'https://example.com/image.png';
      const replacement = `![${altText}](${targetUrl})`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 2,
        newSelectionEnd: selectionStart + 2 + altText.length,
      };
    }
    case 'math-inline': {
      const placeholder = selectedText || 'E=mc^2';
      const replacement = `$${placeholder}$`;
      const newText = before + replacement + after;
      return {
        text: newText,
        newSelectionStart: selectionStart + 1,
        newSelectionEnd: selectionStart + 1 + placeholder.length,
      };
    }
  }

  // 2. 标题 H1~H6
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(format)) {
    const level = parseInt(format.slice(1), 10);
    const hashes = '#'.repeat(level);
    const placeholder = selectedText || `${level}级标题`;
    const replacement = `${hashes} ${placeholder}`;
    const newText = before + replacement + after;
    return {
      text: newText,
      newSelectionStart: selectionStart + level + 1,
      newSelectionEnd: selectionStart + level + 1 + placeholder.length,
    };
  }

  // 3. 行前缀列表/引用/待办
  if (format === 'ul' || format === 'ol' || format === 'task' || format === 'quote') {
    const content = selectedText || (format === 'task' ? '待办事项' : '列表项');
    const lines = content.split('\n');
    const prefixFn = (idx: number) => {
      if (format === 'ul') return '- ';
      if (format === 'ol') return `${idx + 1}. `;
      if (format === 'task') return '- [ ] ';
      return '> ';
    };

    const transformed = lines.map((line, idx) => `${prefixFn(idx)}${line}`).join('\n');
    const newText = before + transformed + after;
    return {
      text: newText,
      newSelectionStart: selectionStart,
      newSelectionEnd: selectionStart + transformed.length,
    };
  }

  // 4. 复杂代码块 / 容器片段
  const snippet = getFormatSnippet(format);
  if (snippet) {
    const newText = before + snippet + after;
    return {
      text: newText,
      newSelectionStart: selectionStart + snippet.length,
      newSelectionEnd: selectionStart + snippet.length,
    };
  }

  return {
    text,
    newSelectionStart: selectionStart,
    newSelectionEnd: selectionEnd,
  };
}

export interface NoteFormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  className?: string;
}

export function NoteFormatToolbar({
  textareaRef,
  value,
  onChange,
  className = '',
}: NoteFormatToolbarProps) {
  const [activeDropdown, setActiveDropdown] = useState<'heading' | 'container' | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApplyFormat = (format: FormatType, url?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;

    const result = applyMarkdownFormat({
      text: value,
      selectionStart: start,
      selectionEnd: end,
      format,
      url,
    });

    onChange(result.text);
    setActiveDropdown(null);

    // 恢复焦点与选区
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(result.newSelectionStart, result.newSelectionEnd);
    }, 0);
  };

  return (
    <div
      ref={dropdownRef}
      className={`flex items-center flex-wrap gap-1 px-3 py-1.5 border-b border-line/60 bg-surface-2/60 backdrop-blur text-xs select-none ${className}`}
    >
      {/* 标题下拉菜单 */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setActiveDropdown(activeDropdown === 'heading' ? null : 'heading')}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-3 text-ink font-semibold transition"
          title="标题层级 (H1 ~ H6)"
        >
          <span>标题</span>
          <span className="text-[10px] text-muted">▼</span>
        </button>

        {activeDropdown === 'heading' && (
          <div className="absolute left-0 top-full mt-1 z-30 w-36 rounded-md border border-line bg-surface p-1 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => handleApplyFormat('h1')}
              className="w-full text-left px-2.5 py-1.5 text-base font-bold rounded hover:bg-surface-2 text-ink"
            >
              # 一级标题 (H1)
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('h2')}
              className="w-full text-left px-2.5 py-1.5 text-sm font-semibold rounded hover:bg-surface-2 text-ink"
            >
              ## 二级标题 (H2)
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('h3')}
              className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded hover:bg-surface-2 text-ink"
            >
              ### 三级标题 (H3)
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('h4')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-secondary"
            >
              #### 四级标题 (H4)
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('h5')}
              className="w-full text-left px-2.5 py-1.5 text-[11px] rounded hover:bg-surface-2 text-secondary"
            >
              ##### 五级标题 (H5)
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('h6')}
              className="w-full text-left px-2.5 py-1.5 text-[10px] rounded hover:bg-surface-2 text-muted"
            >
              ###### 六级标题 (H6)
            </button>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-line/80 mx-0.5" />

      {/* 文本修饰按钮 */}
      <button
        type="button"
        onClick={() => handleApplyFormat('bold')}
        className="px-2 py-1 rounded hover:bg-surface-3 font-bold text-ink transition"
        title="加粗 (Ctrl+B)"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('italic')}
        className="px-2 py-1 rounded hover:bg-surface-3 italic text-ink transition"
        title="斜体 (Ctrl+I)"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('strike')}
        className="px-2 py-1 rounded hover:bg-surface-3 line-through text-ink transition"
        title="删除线"
      >
        S
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('underline')}
        className="px-2 py-1 rounded hover:bg-surface-3 underline text-ink transition"
        title="下划线"
      >
        U
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('highlight')}
        className="px-2 py-1 rounded hover:bg-surface-3 bg-amber-200/40 dark:bg-amber-800/40 text-ink transition"
        title="高亮 (==高亮==)"
      >
        HL
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('spoiler')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-secondary transition"
        title="刮刮乐隐私文本 (!!保密!!)"
      >
        !!
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('code')}
        className="px-2 py-1 rounded hover:bg-surface-3 font-mono text-amber-600 dark:text-amber-400 transition"
        title="行内代码 (`code`)"
      >
        &lt;/&gt;
      </button>

      <div className="h-4 w-px bg-line/80 mx-0.5" />

      {/* 结构与列表 */}
      <button
        type="button"
        onClick={() => handleApplyFormat('ul')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="无序列表"
      >
        • 列表
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('ol')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="有序列表"
      >
        1. 列表
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('task')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="待办清单 (- [ ])"
      >
        ☑ 清单
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('quote')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="引用段落 (>)"
      >
        ❝ 引用
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('hr')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="分割线 (---)"
      >
        ― 分割
      </button>

      <div className="h-4 w-px bg-line/80 mx-0.5" />

      {/* 链接、双链与多媒体 */}
      <button
        type="button"
        onClick={() => handleApplyFormat('link')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="超链接 (Ctrl+K)"
      >
        🔗 链接
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('wikilink')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-purple-600 dark:text-purple-400 font-medium transition"
        title="便签双向链接 ([[便签]])"
      >
        [[双链]]
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('image')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="插入图片 (![描述](url))"
      >
        🖼 图片
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('table')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="插入表格"
      >
        ⊞ 表格
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('codeblock')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="代码块"
      >
        ⌨ 代码块
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('math-block')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-ink transition"
        title="KaTeX 数学公式 ($$)"
      >
        ∑ 公式
      </button>
      <button
        type="button"
        onClick={() => handleApplyFormat('mermaid')}
        className="px-2 py-1 rounded hover:bg-surface-3 text-teal-600 dark:text-teal-400 transition"
        title="Mermaid 流程图 / 图表"
      >
        📊 图表
      </button>

      <div className="h-4 w-px bg-line/80 mx-0.5" />

      {/* Plume 容器扩展下拉 */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setActiveDropdown(activeDropdown === 'container' ? null : 'container')}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-3 text-blue-600 dark:text-blue-400 font-medium transition"
          title="Plume 扩展容器组件 (tip, steps, tabs, card...)"
        >
          <span>📦 扩展容器</span>
          <span className="text-[10px]">▼</span>
        </button>

        {activeDropdown === 'container' && (
          <div className="absolute right-0 top-full mt-1 z-30 w-52 max-h-72 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => handleApplyFormat('container-tip')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>💡 提示框 (tip)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-warning')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>⚠️ 警告框 (warning)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-danger')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🚨 危险框 (danger)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-steps')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🪜 分步指南 (steps)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-tabs')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>📑 多标签组 (tabs)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-card')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🪪 卡片推荐 (card)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-collapse')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🔽 折叠面板 (collapse)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-window')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🪟 macOS 窗口 (window)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-flex')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>📐 多列排版 (flex)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-file-tree')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>🌲 目录文件树 (file-tree)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-timeline')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>⏳ 垂直时间线 (timeline)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-chat')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>💬 对话气泡 (chat)</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFormat('container-qrcode')}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-surface-2 text-ink flex items-center justify-between"
            >
              <span>📱 离线二维码 (qrcode)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
