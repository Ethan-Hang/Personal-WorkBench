import type { TocItem } from './types.js';

/**
 * 从 Markdown 源码中提取 H1 ~ H6 标题目录大纲，自动处理代码块跳过与 slug 重名去重。
 */
export function extractToc(content: string): TocItem[] {
  if (!content || !content.trim()) return [];

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const items: TocItem[] = [];
  const slugCounts = new Map<string, number>();
  let inCodeFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过代码块内部
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const headingMatch = line.match(/^(\s{0,3})(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[2] !== undefined && headingMatch[3] !== undefined) {
      const level = headingMatch[2].length;
      const rawText = headingMatch[3].trim();
      // 去除行内标记获得纯文本
      const cleanText = rawText
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/==([^=]+)==/g, '$1')
        .replace(/!!([^!]+)!!/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
          (alias ?? target).trim(),
        )
        .replace(/<Badge[^/>]*\/>/g, '')
        .replace(/:icon:[^:]+:/g, '')
        .trim();

      if (!cleanText) continue;

      const baseSlug = slugify(cleanText);
      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);

      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      items.push({
        id,
        level,
        text: cleanText,
      });
    }
  }

  return items;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'heading'
  );
}
