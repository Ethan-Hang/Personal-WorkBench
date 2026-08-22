import { parseInline } from './inlineParser.js';
import type {
  BlockNode,
  ChatItem,
  ContainerDirective,
  ContainerNode,
  FileTreeItem,
  ListItemNode,
  StepItem,
  TabItem,
  TableAlignment,
  TableCellNode,
  TimelineItem,
} from './types.js';

const KNOWN_DIRECTIVES: Set<ContainerDirective> = new Set([
  'tip',
  'warning',
  'danger',
  'note',
  'info',
  'details',
  'card',
  'steps',
  'file-tree',
  'tabs',
  'code-tree',
  'timeline',
  'chat',
  'qrcode',
  'collapse',
  'window',
  'flex',
  'bilibili',
  'youtube',
  'pdf',
]);

/**
 * 将 Markdown 纯文本解析为结构化 BlockNode AST 数组。
 */
export function parseMarkdown(content: string): BlockNode[] {
  if (!content || !content.trim()) return [];

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    // 1. 空行跳过
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. 容器指令 ::: <directive> [params/title]
    if (trimmed.startsWith(':::')) {
      const containerMatch = trimmed.match(/^:::\s*([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
      if (containerMatch && containerMatch[1] !== undefined) {
        const rawDirective = containerMatch[1].toLowerCase() as ContainerDirective;
        if (KNOWN_DIRECTIVES.has(rawDirective)) {
          const restArgs = (containerMatch[2] ?? '').trim();
          const bodyLines: string[] = [];
          i++;

          // 收集容器内容直到匹配闭合的 :::
          while (i < lines.length) {
            const curLine = lines[i] ?? '';
            if (curLine.trim() === ':::') {
              i++;
              break;
            }
            bodyLines.push(curLine);
            i++;
          }

          const containerNode = parseContainer(rawDirective, restArgs, bodyLines.join('\n'));
          blocks.push(containerNode);
          continue;
        }
      }
    }

    // 3. 围栏代码块 ``` 或 ~~~
    const codeFenceMatch = line.match(/^(\s*)(```|~~~)(.*)$/);
    if (codeFenceMatch && codeFenceMatch[2] !== undefined) {
      const fence = codeFenceMatch[2];
      const info = (codeFenceMatch[3] ?? '').trim();
      const [lang = '', ...metaParts] = info.split(/\s+/);
      const meta = metaParts.join(' ');
      const codeLines: string[] = [];
      i++;

      while (i < lines.length) {
        const curLine = lines[i] ?? '';
        if (curLine.trim() === fence) {
          i++;
          break;
        }
        codeLines.push(curLine);
        i++;
      }

      const rawCode = codeLines.join('\n');
      if (lang.toLowerCase() === 'mermaid') {
        blocks.push({
          type: 'mermaid',
          code: rawCode,
        });
      } else {
        blocks.push({
          type: 'code-block',
          lang,
          meta: meta || undefined,
          code: rawCode,
        });
      }
      continue;
    }

    // 4. 数学公式块 $$
    if (trimmed === '$$') {
      const mathLines: string[] = [];
      i++;
      while (i < lines.length) {
        const curLine = lines[i] ?? '';
        if (curLine.trim() === '$$') {
          i++;
          break;
        }
        mathLines.push(curLine);
        i++;
      }
      blocks.push({
        type: 'math-block',
        formula: mathLines.join('\n').trim(),
      });
      continue;
    }

    // 5. 标题 # ~ ######
    const headingMatch = line.match(/^(\s{0,3})(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[2] !== undefined && headingMatch[3] !== undefined) {
      const level = headingMatch[2].length as 1 | 2 | 3 | 4 | 5 | 6;
      const headingText = headingMatch[3].trim();
      blocks.push({
        type: 'heading',
        level,
        id: slugify(headingText),
        text: headingText,
        inlines: parseInline(headingText),
      });
      i++;
      continue;
    }

    // 6. 分割线 / Thematic Break (---, ***, ___)
    if (/^(\s{0,3})([-*_])\s*(?:\2\s*){2,}$/.test(line)) {
      blocks.push({ type: 'thematic-break' });
      i++;
      continue;
    }

    // 7. 表格 Table (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length) {
      const nextLine = (lines[i + 1] ?? '').trim();
      if (isTableDelimiterRow(nextLine)) {
        const headerRow = parseTableRow(trimmed);
        const alignments = parseTableAlignments(nextLine);
        const dataRows: TableCellNode[][] = [];
        i += 2;

        while (i < lines.length) {
          const curLine = (lines[i] ?? '').trim();
          if (curLine.startsWith('|') && curLine.endsWith('|')) {
            dataRows.push(parseTableRow(curLine));
            i++;
          } else {
            break;
          }
        }

        blocks.push({
          type: 'table',
          headers: headerRow,
          alignments,
          rows: dataRows,
        });
        continue;
      }
    }

    // 8. 列表 List (- / * / + / 1.)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch && listMatch[2] !== undefined && listMatch[3] !== undefined) {
      const isOrdered = /^\d+\./.test(listMatch[2]);
      const items: ListItemNode[] = [];

      while (i < lines.length) {
        const curLine = lines[i] ?? '';
        const curMatch = curLine.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!curMatch || curMatch[2] === undefined || curMatch[3] === undefined) {
          break;
        }

        const rawItemText = curMatch[3];
        const taskMatch = rawItemText.match(/^\[([ xX])\]\s+(.*)$/);

        if (taskMatch && taskMatch[1] !== undefined && taskMatch[2] !== undefined) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          const text = taskMatch[2];
          items.push({
            inlines: parseInline(text),
            checked,
          });
        } else {
          items.push({
            inlines: parseInline(rawItemText),
            checked: null,
          });
        }
        i++;
      }

      blocks.push({
        type: 'list',
        ordered: isOrdered,
        items,
      });
      continue;
    }

    // 9. 引用 Blockquote (> quote)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const curLine = (lines[i] ?? '').trim();
        if (curLine.startsWith('>')) {
          quoteLines.push(curLine.replace(/^>\s?/, ''));
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: 'blockquote',
        children: parseMarkdown(quoteLines.join('\n')),
      });
      continue;
    }

    // 10. 普通段落 Paragraph
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const curLine = lines[i] ?? '';
      const curTrimmed = curLine.trim();

      // 遇到空行或任何块级前缀时断开
      if (!curTrimmed) break;
      if (
        curTrimmed.startsWith(':::') ||
        curTrimmed.startsWith('```') ||
        curTrimmed.startsWith('~~~') ||
        curTrimmed === '$$' ||
        /^#{1,6}\s+/.test(curTrimmed) ||
        curTrimmed.startsWith('>') ||
        /^([-*+]|\d+\.)\s+/.test(curTrimmed) ||
        (curTrimmed.startsWith('|') && curTrimmed.endsWith('|')) ||
        /^([-*_])\s*(?:\1\s*){2,}$/.test(curTrimmed)
      ) {
        break;
      }

      paragraphLines.push(curLine);
      i++;
    }

    if (paragraphLines.length > 0) {
      const pText = paragraphLines.join(' ').trim();
      blocks.push({
        type: 'paragraph',
        inlines: parseInline(pText),
      });
    }
  }

  return blocks;
}

/**
 * 结构化解析 11 类 Plume 容器与媒体嵌入
 */
function parseContainer(
  directive: ContainerDirective,
  rawArgs: string,
  rawBody: string,
): ContainerNode {
  const params: Record<string, string> = {};
  const kvMatches = rawArgs.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g);
  for (const match of kvMatches) {
    if (match[1] && match[2] !== undefined) {
      params[match[1]] = match[2];
    }
  }

  let title = params['title'];
  if (!title) {
    const plainTitle = rawArgs.replace(/([a-zA-Z0-9_-]+)="[^"]*"/g, '').trim();
    if (plainTitle) {
      title = plainTitle;
    } else if (['tip', 'warning', 'danger', 'note', 'info', 'details'].includes(directive)) {
      title = directive.charAt(0).toUpperCase() + directive.slice(1);
    }
  }

  const baseNode: ContainerNode = {
    type: 'container',
    directive,
    title,
    params,
    rawContent: rawBody.trim() || rawArgs.trim(),
  };

  // 针对特殊容器进行专用结构化解析
  switch (directive) {
    case 'tabs':
    case 'code-tree': {
      baseNode.tabItems = parseTabItems(rawBody);
      break;
    }
    case 'file-tree': {
      baseNode.fileTreeItems = parseFileTreeItems(rawBody);
      break;
    }
    case 'timeline': {
      baseNode.timelineItems = parseTimelineItems(rawBody);
      break;
    }
    case 'chat': {
      baseNode.chatItems = parseChatItems(rawBody);
      break;
    }
    case 'steps': {
      baseNode.stepItems = parseStepItems(rawBody);
      break;
    }
    case 'collapse':
    case 'flex':
    case 'window':
    case 'tip':
    case 'warning':
    case 'danger':
    case 'note':
    case 'info':
    case 'details': {
      if (rawBody.trim()) {
        baseNode.children = parseMarkdown(rawBody);
      }
      break;
    }
    default:
      break;
  }

  return baseNode;
}

function parseTabItems(content: string): TabItem[] {
  const tabs: TabItem[] = [];
  const lines = content.split('\n');
  let currentTitle = 'Tab';
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^@tab\s+(.*)$/);
    if (match && match[1] !== undefined) {
      if (currentLines.length > 0) {
        tabs.push({
          title: currentTitle,
          children: parseMarkdown(currentLines.join('\n')),
        });
        currentLines = [];
      }
      currentTitle = match[1].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    tabs.push({
      title: currentTitle,
      children: parseMarkdown(currentLines.join('\n')),
    });
  }

  return tabs;
}

function parseFileTreeItems(content: string): FileTreeItem[] {
  const items: FileTreeItem[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const indentMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (indentMatch && indentMatch[1] !== undefined && indentMatch[2] !== undefined) {
      const indentLength = indentMatch[1].length;
      const level = Math.floor(indentLength / 2);
      const rawName = indentMatch[2].trim();
      const isDir = rawName.endsWith('/');
      const name = isDir ? rawName.slice(0, -1) : rawName;
      items.push({ name, isDir, level });
    }
  }

  return items;
}

function parseTimelineItems(content: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const lines = content.split('\n');
  let currentItem: TimelineItem | null = null;
  let currentDescLines: string[] = [];

  const flushCurrent = () => {
    if (currentItem) {
      if (currentDescLines.length > 0) {
        const descText = currentDescLines.join('\n').trim();
        if (descText) {
          currentItem.description = descText;
          currentItem.descriptionInlines = parseInline(descText);
        }
      }
      items.push(currentItem);
      currentItem = null;
      currentDescLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 匹配 @ 2026-08-21 标题 或 @ 标题
    const atMatch = line.match(
      /^@\s+(?:(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?(?:\s+\d{1,2}:\d{2})?|[0-9a-zA-Z_\s-]+?)(?::|\s+))\s*(.*)$/,
    );
    // 匹配 - 2026-08-21: 标题 或 - 2026-08-21 标题 或 - 标题
    const listMatch = line.match(
      /^[-*•]\s+(?:(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?(?:\s+\d{1,2}:\d{2})?|[0-9a-zA-Z_\s-]+?):)?\s*(.*)$/,
    );
    // 匹配 ### 2026-08-21 标题
    const headingMatch = line.match(
      /^#{1,4}\s+(?:(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?(?:\s+\d{1,2}:\d{2})?|[0-9a-zA-Z_\s-]+?)(?::|\s+))\s*(.*)$/,
    );
    // 匹配 2026-08-21: 标题
    const dateColonMatch = line.match(
      /^(\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?(?:\s+\d{1,2}:\d{2})?):\s*(.*)$/,
    );

    if (atMatch) {
      flushCurrent();
      const date = atMatch[1]?.trim();
      const rawTitle = atMatch[2]?.trim() || '';
      currentItem = {
        date,
        title: rawTitle,
        inlines: parseInline(rawTitle),
      };
    } else if (listMatch) {
      flushCurrent();
      const date = listMatch[1]?.trim();
      const rawTitle = listMatch[2]?.trim() || '';
      currentItem = {
        date,
        title: rawTitle,
        inlines: parseInline(rawTitle),
      };
    } else if (headingMatch) {
      flushCurrent();
      const date = headingMatch[1]?.trim();
      const rawTitle = headingMatch[2]?.trim() || '';
      currentItem = {
        date,
        title: rawTitle,
        inlines: parseInline(rawTitle),
      };
    } else if (dateColonMatch) {
      flushCurrent();
      const date = dateColonMatch[1]?.trim();
      const rawTitle = dateColonMatch[2]?.trim() || '';
      currentItem = {
        date,
        title: rawTitle,
        inlines: parseInline(rawTitle),
      };
    } else {
      if (currentItem) {
        currentDescLines.push(trimmed);
      } else {
        currentItem = {
          title: trimmed,
          inlines: parseInline(trimmed),
        };
      }
    }
  }

  flushCurrent();
  return items;
}

function parseChatItems(content: string): ChatItem[] {
  const items: ChatItem[] = [];
  const lines = content.split('\n');
  let currentChat: ChatItem | null = null;
  let currentLines: string[] = [];

  const flushCurrent = () => {
    if (currentChat) {
      const fullText = currentLines.join('\n').trim();
      currentChat.inlines = parseInline(fullText);
      currentChat.rawText = fullText;
      items.push(currentChat);
      currentChat = null;
      currentLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern 1: (left: User) message / (right: Bot) message
    const parenMatch = line.match(/^\(([a-zA-Z]+)(?::\s*([^)]+))?\)\s*(.*)$/);
    // Pattern 2: [left: User] message / [User]: message
    const bracketMatch = line.match(
      /^\[([a-zA-Z0-9_\u4e00-\u9fa5]+)(?::\s*([^\]]+))?\]\s*:?\s*(.*)$/,
    );
    // Pattern 3: role: message (user:, bot:, left:, right:, ai:, assistant:, system:, me:)
    const colonMatch = line.match(
      /^(user|bot|left|right|ai|assistant|system|me|client|server):\s*(.*)$/i,
    );
    // Pattern 4: Name: message
    const nameColonMatch = line.match(/^([a-zA-Z0-9_\u4e00-\u9fa5]{1,16}):\s*(.*)$/);

    if (parenMatch) {
      flushCurrent();
      const rawRole = parenMatch[1]?.toLowerCase() ?? '';
      const author = parenMatch[2]?.trim();
      const text = parenMatch[3]?.trim() ?? '';
      const isRight = rawRole === 'right' || rawRole === 'user' || rawRole === 'me';
      currentChat = {
        role: isRight ? 'user' : 'bot',
        author: author || (isRight ? 'User' : 'Assistant'),
        inlines: [],
      };
      if (text) currentLines.push(text);
    } else if (bracketMatch) {
      flushCurrent();
      const rawRole = bracketMatch[1]?.toLowerCase() ?? '';
      const author = bracketMatch[2]?.trim();
      const text = bracketMatch[3]?.trim() ?? '';
      const isRight = rawRole === 'right' || rawRole === 'user' || rawRole === 'me';
      currentChat = {
        role: isRight ? 'user' : 'bot',
        author: author || bracketMatch[1]?.trim() || (isRight ? 'User' : 'Assistant'),
        inlines: [],
      };
      if (text) currentLines.push(text);
    } else if (colonMatch) {
      flushCurrent();
      const rawRole = colonMatch[1]?.toLowerCase() ?? '';
      const text = colonMatch[2]?.trim() ?? '';
      const isRight = rawRole === 'user' || rawRole === 'right' || rawRole === 'me';
      currentChat = {
        role: isRight ? 'user' : 'bot',
        author: isRight
          ? 'User'
          : rawRole === 'ai' || rawRole === 'bot' || rawRole === 'assistant'
            ? 'Assistant'
            : rawRole,
        inlines: [],
      };
      if (text) currentLines.push(text);
    } else if (nameColonMatch) {
      flushCurrent();
      const name = nameColonMatch[1]?.trim() ?? '';
      const text = nameColonMatch[2]?.trim() ?? '';
      const lower = name.toLowerCase();
      const isRight = lower === 'user' || lower === 'me' || lower === '我' || lower === 'right';
      currentChat = {
        role: isRight ? 'user' : 'bot',
        author: name,
        inlines: [],
      };
      if (text) currentLines.push(text);
    } else {
      if (currentChat) {
        currentLines.push(trimmed);
      } else {
        currentChat = {
          role: 'user',
          inlines: [],
        };
        currentLines.push(trimmed);
      }
    }
  }

  flushCurrent();
  return items;
}

function parseStepItems(content: string): StepItem[] {
  const items: StepItem[] = [];
  const lines = content.split('\n');
  let stepCounter = 1;

  for (const line of lines) {
    if (!line.trim()) continue;
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/);
    const listMatch = line.match(/^[-*]\s+(.*)$/);
    const text = numMatch?.[2] ?? listMatch?.[1] ?? line.trim();
    const stepNum = numMatch?.[1] ? parseInt(numMatch[1], 10) : stepCounter;

    items.push({
      stepNumber: stepNum,
      title: text,
      inlines: parseInline(text),
    });
    stepCounter = stepNum + 1;
  }

  return items;
}

function isTableDelimiterRow(line: string): boolean {
  if (!line.startsWith('|') || !line.endsWith('|')) return false;
  const cells = line
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseTableAlignments(delimiterLine: string): TableAlignment[] {
  const cells = delimiterLine
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
  return cells.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (left) return 'left';
    if (right) return 'right';
    return null;
  });
}

function parseTableRow(rowLine: string): TableCellNode[] {
  const cells = rowLine
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
  return cells.map((cell) => ({
    inlines: parseInline(cell),
  }));
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'heading'
  );
}
