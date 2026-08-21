import type { BadgeType, InlineNode } from './types.js';

/**
 * 递归解析行内富文本标记，支持标准 GFM 与 VuePress Plume / Obsidian 语法增强。
 */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  const results: InlineNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 1. 行内代码 `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch && codeMatch[1] !== undefined) {
      results.push({ type: 'code', code: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. 图片 ![alt](src "title")
    const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgMatch && imgMatch[2] !== undefined) {
      results.push({
        type: 'image',
        alt: imgMatch[1] ?? '',
        src: imgMatch[2],
        title: imgMatch[3],
      });
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    // 3. 链接 [text](href "title")
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (linkMatch && linkMatch[1] !== undefined && linkMatch[2] !== undefined) {
      results.push({
        type: 'link',
        text: linkMatch[1],
        href: linkMatch[2],
        title: linkMatch[3],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 4. <Badge text="..." type="..." />
    const badgeMatch = remaining.match(/^<Badge\s+([^/>]+)\/>/);
    if (badgeMatch && badgeMatch[1] !== undefined) {
      const attrsStr = badgeMatch[1];
      const textAttr = attrsStr.match(/text="([^"]+)"/)?.[1] ?? '';
      const typeAttr = (attrsStr.match(/type="([^"]+)"/)?.[1] ?? 'tip') as BadgeType;
      results.push({
        type: 'badge',
        text: textAttr,
        badgeType: typeAttr,
      });
      remaining = remaining.slice(badgeMatch[0].length);
      continue;
    }

    // 5. :icon: 图标标记 :icon:lucide:rocket: 或 :icon:rocket:
    const iconMatch = remaining.match(/^:icon:([a-zA-Z0-9_:-]+):/);
    if (iconMatch && iconMatch[1] !== undefined) {
      results.push({
        type: 'icon',
        icon: iconMatch[1],
      });
      remaining = remaining.slice(iconMatch[0].length);
      continue;
    }

    // 6. Obsidian 双链 [[Target]] 或 [[Target|Alias]]
    const wikiMatch = remaining.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (wikiMatch && wikiMatch[1] !== undefined) {
      results.push({
        type: 'wikilink',
        target: wikiMatch[1].trim(),
        alias: wikiMatch[2]?.trim(),
      });
      remaining = remaining.slice(wikiMatch[0].length);
      continue;
    }

    // 7. 缩写解释 *[HTML](Hypertext Markup Language)
    const abbrMatch = remaining.match(/^\*\[([^\]]+)\]\(([^)]+)\)/);
    if (abbrMatch && abbrMatch[1] !== undefined && abbrMatch[2] !== undefined) {
      results.push({
        type: 'abbr',
        term: abbrMatch[1].trim(),
        explanation: abbrMatch[2].trim(),
      });
      remaining = remaining.slice(abbrMatch[0].length);
      continue;
    }

    // 8. 行内 KaTeX 数学公式 $formula$
    const mathMatch = remaining.match(/^\$([^$\n]+)\$/);
    if (mathMatch && mathMatch[1] !== undefined) {
      results.push({
        type: 'math',
        formula: mathMatch[1].trim(),
      });
      remaining = remaining.slice(mathMatch[0].length);
      continue;
    }

    // 9. 马克笔高亮 ==highlight==
    const highlightMatch = remaining.match(/^==([\s\S]+?)==/);
    if (highlightMatch && highlightMatch[1] !== undefined) {
      results.push({
        type: 'highlight',
        children: parseInline(highlightMatch[1]),
      });
      remaining = remaining.slice(highlightMatch[0].length);
      continue;
    }

    // 10. 刮刮乐隐秘文本 !!spoiler!!
    const spoilerMatch = remaining.match(/^!!([\s\S]+?)!!/);
    if (spoilerMatch && spoilerMatch[1] !== undefined) {
      results.push({
        type: 'spoiler',
        children: parseInline(spoilerMatch[1]),
      });
      remaining = remaining.slice(spoilerMatch[0].length);
      continue;
    }

    // 11. 加粗 + 斜体 ***text*** 或 ___text___
    const boldItalicMatch = remaining.match(/^(\*\*\*|___)([\s\S]+?)\1/);
    if (boldItalicMatch && boldItalicMatch[2] !== undefined) {
      results.push({
        type: 'bold',
        children: [
          {
            type: 'italic',
            children: parseInline(boldItalicMatch[2]),
          },
        ],
      });
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // 12. 加粗 **text** 或 __text__
    const boldMatch = remaining.match(/^(\*\*|__)([\s\S]+?)\1/);
    if (boldMatch && boldMatch[2] !== undefined) {
      results.push({
        type: 'bold',
        children: parseInline(boldMatch[2]),
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 13. 斜体 *text* 或 _text_
    const italicMatch = remaining.match(/^(\*|_)([\s\S]+?)\1/);
    if (italicMatch && italicMatch[2] !== undefined) {
      results.push({
        type: 'italic',
        children: parseInline(italicMatch[2]),
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 14. 删除线 ~~text~~
    const strikeMatch = remaining.match(/^~~([\s\S]+?)~~/);
    if (strikeMatch && strikeMatch[1] !== undefined) {
      results.push({
        type: 'strike',
        children: parseInline(strikeMatch[1]),
      });
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // 15. 纯文本分词：吞掉直到下一个可能的分隔符起始
    const delimiterIndex = remaining.search(
      /[`!<:*$=_~[\]]|(?:\*\*)|(?:\*\[)|(?:==)|(?:!!)|(?:~~)/,
    );
    if (delimiterIndex === -1) {
      results.push({ type: 'text', value: remaining });
      break;
    } else if (delimiterIndex === 0) {
      // 遇到了无法匹配成特定语法的单字符（例如单独的 * 或 [），当作纯文本消费 1 个字符
      results.push({ type: 'text', value: remaining.charAt(0) });
      remaining = remaining.slice(1);
    } else {
      results.push({ type: 'text', value: remaining.slice(0, delimiterIndex) });
      remaining = remaining.slice(delimiterIndex);
    }
  }

  // 合并相邻连续的 text 节点
  return mergeAdjacentTextNodes(results);
}

function mergeAdjacentTextNodes(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (node.type === 'text' && prev?.type === 'text') {
      prev.value += node.value;
    } else {
      merged.push(node);
    }
  }
  return merged;
}
