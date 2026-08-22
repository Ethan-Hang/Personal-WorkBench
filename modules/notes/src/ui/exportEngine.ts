import type { NoteView } from '../contract.js';
import { parseMarkdown } from './markdown/parser.js';
import { generateQrSvg } from './markdown/qrcode.js';
import type { BlockNode, InlineNode } from './markdown/types.js';

export interface ExportOptions {
  includeFrontmatter?: boolean;
  includeTimestamp?: boolean;
  includeWatermark?: boolean;
  theme?: 'light' | 'dark';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInlinesToHtml(inlines: InlineNode[]): string {
  return inlines
    .map((node) => {
      switch (node.type) {
        case 'text':
          return escapeHtml(node.value);
        case 'bold':
          return `<strong>${renderInlinesToHtml(node.children)}</strong>`;
        case 'italic':
          return `<em>${renderInlinesToHtml(node.children)}</em>`;
        case 'strike':
          return `<del>${renderInlinesToHtml(node.children)}</del>`;
        case 'highlight':
          return `<mark class="bg-amber-200 dark:bg-amber-800/60 px-1 py-0.5 rounded text-amber-950 dark:text-amber-100 font-medium">${renderInlinesToHtml(
            node.children,
          )}</mark>`;
        case 'spoiler':
          return `<span class="bg-zinc-800 text-transparent hover:text-white transition-colors px-1 py-0.5 rounded cursor-pointer select-none">${renderInlinesToHtml(
            node.children,
          )}</span>`;
        case 'code':
          return `<code class="bg-zinc-100 dark:bg-zinc-800 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded text-xs font-mono">${escapeHtml(
            node.code,
          )}</code>`;
        case 'link':
          return `<a href="${escapeHtml(node.href)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(
            node.text,
          )}</a>`;
        case 'image':
          return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}" class="max-w-full rounded-lg my-2 shadow-xs" />`;
        case 'wikilink':
          return `<span class="text-accent underline font-medium">[[${escapeHtml(
            node.alias || node.target,
          )}]]</span>`;
        case 'math':
          return `<span class="inline-math font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-xs">$${escapeHtml(
            node.formula,
          )}$</span>`;
        case 'badge':
          return `<span class="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">${escapeHtml(
            node.text,
          )}</span>`;
        case 'icon':
          return `<span class="inline-block text-xs text-muted">:${escapeHtml(node.icon)}:</span>`;
        case 'abbr':
          return `<abbr title="${escapeHtml(node.explanation)}" class="underline decoration-dotted cursor-help">${escapeHtml(
            node.term,
          )}</abbr>`;
        case 'kbd':
          return `<kbd>${escapeHtml(node.text)}</kbd>`;
        case 'sub':
          return `<sub>${renderInlinesToHtml(node.children)}</sub>`;
        case 'sup':
          return `<sup>${renderInlinesToHtml(node.children)}</sup>`;
        default: {
          // **不要把这里改回 `return ''`。**
          // 那正是 kbd / sub / sup 被导出静默丢掉而无人发现的原因：
          // 编辑器渲染正常，导出少一段，没有任何报错。
          // 保持穷尽检查，新增 inline 节点类型时这里会**编译报错**，
          // 与 core 处理 ScheduledTime 的 switch 不加 default 是同一条道理。
          const exhaustive: never = node;
          return exhaustive;
        }
      }
    })
    .join('');
}

function renderBlocksToHtml(blocks: BlockNode[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const content = renderInlinesToHtml(block.inlines);
          const id = block.id ? ` id="${escapeHtml(block.id)}"` : '';
          return `<h${block.level}${id} class="heading-h${block.level}">${content}</h${block.level}>`;
        }
        case 'paragraph':
          return `<p class="paragraph">${renderInlinesToHtml(block.inlines)}</p>`;
        case 'blockquote':
          return `<blockquote class="blockquote">${renderBlocksToHtml(block.children)}</blockquote>`;
        case 'code-block':
          return `<pre class="code-block"><div class="code-header"><span class="code-lang">${escapeHtml(
            block.lang || 'text',
          )}</span></div><code class="code-content">${escapeHtml(block.code)}</code></pre>`;
        case 'math-block':
          return `<div class="math-block"><div class="math-formula">$$ ${escapeHtml(
            block.formula,
          )} $$</div></div>`;
        case 'mermaid':
          return `<div class="mermaid-block"><div class="mermaid-diagram"><pre class="mermaid">${escapeHtml(
            block.code,
          )}</pre></div></div>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items
            .map((item) => {
              const taskPrefix =
                item.checked !== undefined && item.checked !== null
                  ? `<input type="checkbox" disabled ${item.checked ? 'checked' : ''} class="task-checkbox" /> `
                  : '';
              const childrenHtml = item.children ? renderBlocksToHtml(item.children) : '';
              return `<li>${taskPrefix}${renderInlinesToHtml(item.inlines)}${childrenHtml}</li>`;
            })
            .join('');
          return `<${tag} class="list ${block.ordered ? 'ordered-list' : 'unordered-list'}">${items}</${tag}>`;
        }
        case 'table': {
          const headers = block.headers
            .map(
              (h, i) =>
                `<th style="text-align: ${block.alignments[i] || 'left'}">${renderInlinesToHtml(
                  h.inlines,
                )}</th>`,
            )
            .join('');
          const rows = block.rows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (cell, i) =>
                      `<td style="text-align: ${block.alignments[i] || 'left'}">${renderInlinesToHtml(
                        cell.inlines,
                      )}</td>`,
                  )
                  .join('')}</tr>`,
            )
            .join('');
          return `<div class="table-wrapper"><table class="table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
        }
        case 'thematic-break':
          return `<hr class="divider" />`;
        case 'container': {
          const title = block.title
            ? `<div class="container-title">${escapeHtml(block.title)}</div>`
            : '';
          const children = block.children ? renderBlocksToHtml(block.children) : '';
          if (block.directive === 'qrcode') {
            const qrSvg = generateQrSvg(block.title || 'https://personal-workbench.local');
            return `<div class="qrcode-container">${qrSvg}<p class="qrcode-label">${escapeHtml(
              block.title || '',
            )}</p></div>`;
          }
          return `<div class="container-directive container-${escapeHtml(
            block.directive,
          )}">${title}<div class="container-body">${children}</div></div>`;
        }
        default: {
          // 同上：宁可编译不过，也不要在导出里静默少一整块内容。
          const exhaustive: never = block;
          return exhaustive;
        }
      }
    })
    .join('\n');
}

/**
 * 将便签渲染为完整自包含样式的独立 HTML 文档。
 */
export function renderNoteToStandaloneHtml(note: NoteView, options: ExportOptions = {}): string {
  const blocks = parseMarkdown(note.content);
  const bodyHtml = renderBlocksToHtml(blocks);
  const title = note.title.trim() || '无标题便签';
  const color = note.color;
  const dateStr = new Date(note.updatedAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const tagBadges = note.tags
    .map((t) => `<span class="meta-tag">#${escapeHtml(t)}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - 便签导出</title>
  <style>
    :root {
      --bg-color: #ffffff;
      --card-bg: #fafafa;
      --text-main: #18181b;
      --text-muted: #71717a;
      --border-color: #e4e4e7;
      --accent-color: #3b82f6;
      --color-yellow: #fefce8;
      --color-green: #f0fdf4;
      --color-blue: #f0f9ff;
      --color-purple: #faf5ff;
      --color-pink: #fff1f2;
      --color-gray: #f4f4f5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #18181b;
        --card-bg: #27272a;
        --text-main: #f4f4f5;
        --text-muted: #a1a1aa;
        --border-color: #3f3f46;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      line-height: 1.65;
      padding: 32px 16px;
    }
    .note-container {
      max-width: 820px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .note-header {
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .note-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      color: var(--text-main);
    }
    .note-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .meta-tag {
      background: rgba(0, 0, 0, 0.06);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    }
    .note-body {
      font-size: 15px;
    }
    .heading-h1 { font-size: 24px; font-weight: 700; margin: 28px 0 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
    .heading-h2 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; }
    .heading-h3 { font-size: 18px; font-weight: 600; margin: 20px 0 10px; }
    .heading-h4 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }
    .paragraph { margin: 12px 0; }
    .blockquote {
      border-left: 4px solid var(--accent-color);
      background: rgba(59, 130, 246, 0.05);
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
      font-style: italic;
      color: var(--text-muted);
    }
    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 600;
      line-height: 1.4;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-color);
      color: var(--text-main);
      box-shadow: 0 1px 0 var(--border-color);
      vertical-align: middle;
    }
    sub, sup { font-size: 10px; line-height: 0; }
    sub { color: var(--text-muted); }
    sup { color: var(--accent-color); }
    .code-block {
      background: #1e1e24;
      color: #f8f8f2;
      border-radius: 8px;
      margin: 16px 0;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
    }
    .code-header {
      background: #282830;
      padding: 6px 12px;
      font-size: 11px;
      color: #888;
      border-bottom: 1px solid #333;
      text-transform: uppercase;
    }
    .code-content { padding: 14px; display: block; }
    .list { margin: 12px 0 12px 24px; }
    .list li { margin: 4px 0; }
    .task-checkbox { margin-right: 6px; }
    .table-wrapper { overflow-x: auto; margin: 16px 0; }
    .table { width: 100%; border-collapse: collapse; text-align: left; }
    .table th, .table td { border: 1px solid var(--border-color); padding: 8px 12px; }
    .table th { background: rgba(0, 0, 0, 0.03); font-weight: 600; }
    .divider { border: none; border-top: 1px solid var(--border-color); margin: 24px 0; }
    .container-directive {
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
      background: rgba(59, 130, 246, 0.05);
      padding: 14px 18px;
      margin: 16px 0;
    }
    .container-tip { border-left-color: #10b981; background: rgba(16, 185, 129, 0.05); }
    .container-warning { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.05); }
    .container-danger { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.05); }
    .container-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
    .qrcode-container { text-align: center; margin: 20px auto; }
    .note-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }
    @media print {
      body { background: #fff !important; color: #000 !important; padding: 0 !important; }
      .note-container { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
      .note-footer { display: none; }
    }
  </style>
</head>
<body>
  <div class="note-container theme-${color}">
    <header class="note-header">
      <h1 class="note-title">${escapeHtml(title)}</h1>
      <div class="note-meta">
        <span>更新于 ${dateStr}</span>
        ${note.isPinned ? '<span>📌 已置顶</span>' : ''}
        ${tagBadges}
      </div>
    </header>

    <main class="note-body">
      ${bodyHtml}
    </main>

    ${
      options.includeWatermark !== false
        ? `<footer class="note-footer">
      <span>Personal Workbench · 便签导出系统</span>
    </footer>`
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * 触发客户端文件下载。
 */
export function triggerFileDownload(
  content: string | Blob,
  filename: string,
  mimeType: string,
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导出为 Markdown (.md) 源文件。
 */
export function exportToMarkdown(note: NoteView, options: ExportOptions = {}): void {
  let output = '';
  if (options.includeFrontmatter !== false) {
    output += `---
title: "${note.title.replace(/"/g, '\\"')}"
date: "${note.updatedAt}"
color: "${note.color}"
tags: ${JSON.stringify(note.tags)}
isPinned: ${note.isPinned}
status: "${note.status}"
---

`;
  }
  output += note.content;

  const cleanTitle = (note.title.trim() || `note-${note.id.slice(0, 8)}`).replace(
    /[\\/:*?"<>|]/g,
    '_',
  );
  triggerFileDownload(output, `${cleanTitle}.md`, 'text/markdown;charset=utf-8');
}

/**
 * 导出为自包含样式的独立 HTML 文件。
 */
export function exportToHtml(note: NoteView, options: ExportOptions = {}): void {
  const htmlContent = renderNoteToStandaloneHtml(note, options);
  const cleanTitle = (note.title.trim() || `note-${note.id.slice(0, 8)}`).replace(
    /[\\/:*?"<>|]/g,
    '_',
  );
  triggerFileDownload(htmlContent, `${cleanTitle}.html`, 'text/html;charset=utf-8');
}

/**
 * 触发系统打印 / 导出为 PDF。
 */
export function exportToPdf(note: NoteView, options: ExportOptions = {}): void {
  if (typeof window === 'undefined') return;

  const htmlContent = renderNoteToStandaloneHtml(note, options);
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    // 延迟确保样式载入完毕后触发打印
    setTimeout(() => {
      printWindow.print();
    }, 250);
  } else {
    window.print();
  }
}

/**
 * 生成高清 PNG 长图分享卡片并下载。
 */
export async function exportToPng(note: NoteView, options: ExportOptions = {}): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const width = 800;
  const title = note.title.trim() || '无标题便签';
  const cleanTitle = (title || `note-${note.id.slice(0, 8)}`).replace(/[\\/:*?"<>|]/g, '_');

  // 构建离屏渲染容器与 SVG ForeignObject
  const htmlString = renderNoteToStandaloneHtml(note, options);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const noteContainer = doc.querySelector('.note-container');
  const innerHtml = noteContainer ? noteContainer.outerHTML : htmlString;

  // 使用 SVG 栅格化生成高清图片
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1200">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>
            ${doc.querySelector('style')?.textContent || ''}
            body { background: #ffffff; padding: 24px; }
            .note-container { max-width: 100%; border: 1px solid #e4e4e7; box-shadow: none; }
          </style>
          ${innerHtml}
        </div>
      </foreignObject>
    </svg>
  `;

  // 创建离屏 Canvas 并绘制
  const canvas = document.createElement('canvas');
  const scale = 2; // 2x 高清
  canvas.width = width * scale;
  canvas.height = 1200 * scale;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    // 降级使用 HTML 导出
    exportToHtml(note, options);
    return;
  }

  ctx.scale(scale, scale);

  const img = new Image();
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  return new Promise<void>((resolve) => {
    img.onload = () => {
      // 绘制背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, 1200);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (blob) {
          triggerFileDownload(blob, `${cleanTitle}.png`, 'image/png');
        }
        resolve();
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // 出现异常时降级为 HTML 导出
      exportToHtml(note, options);
      resolve();
    };

    img.src = url;
  });
}
