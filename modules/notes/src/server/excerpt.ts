import { EXCERPT_LENGTH } from '../contract.js';

/**
 * 从 Markdown 正文派生纯文本摘要。**纯函数，零 IO。**
 *
 * 摘要是**冗余存储**的（`notes_records.excerpt`）：卡片流一屏几十张卡，
 * 现算摘要要把每条便签的完整正文都读出来再解析；用一列换掉那次全表读。
 * 冗余的代价是它必须与 `content` 同步更新——所以只有这一个函数负责生成它。
 *
 * 这里**不做完整的 Markdown 解析**。摘要只要「看着像正文」，不需要正确；
 * 真正的渲染在前端（TASK-063）。为一句摘要在服务端引一个解析器，是把
 * 渲染逻辑拆成两份、两份还会渐渐对不上。
 */
export function deriveExcerpt(content: string, limit = EXCERPT_LENGTH): string {
  const stripped = content
    // 围栏代码块整块丢掉——摘要里出现半截代码比空着更糟
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // 容器指令的开合行（::: tip / :::），只丢标记行本身，保留里面的正文
    .replace(/^:::.*$/gm, ' ')
    // 图片整体丢掉，链接只留可见文字
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Obsidian 双链只留显示名
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_match, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    // 行首标记：标题、引用、列表、水平线
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ')
    // 行内标记：加粗、斜体、删除线、马克笔高亮、刮刮乐、行内代码
    .replace(/(\*\*|__|~~|==|!!)/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_]/g, '')
    // 折叠所有空白：摘要是一行，换行在卡片上不成立
    .replace(/\s+/g, ' ')
    .trim();

  // 按 Unicode 码点截断，不按 UTF-16 码元——否则会把 emoji 劈成两半
  const points = [...stripped];
  return points.length <= limit ? stripped : `${points.slice(0, limit).join('')}…`;
}
