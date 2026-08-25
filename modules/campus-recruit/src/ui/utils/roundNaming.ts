import { ROUND_KINDS, type RoundKind } from '../../contract.js';

export const ROUND_KIND_LABEL: Record<RoundKind, string> = {
  screening: '简历初筛',
  assessment: '测评',
  written: '笔试',
  technical: '专业面',
  hr: 'HR面',
  other: '其他',
};

/** 从手打的轮次名反推类型。名称先行时用它，与下面的 nameForKindChange 是反方向的一对 */
export function suggestRoundKind(name: string): RoundKind {
  if (name.includes('简历') || name.includes('初筛') || name.includes('网申')) return 'screening';
  if (name.includes('笔试')) return 'written';
  if (name.includes('测评')) return 'assessment';
  if (/hr/i.test(name)) return 'hr';
  if (name.includes('面')) return 'technical';
  return 'other';
}

const AUTO_FILLED_NAMES: ReadonlySet<string> = new Set(
  ROUND_KINDS.map((kind) => ROUND_KIND_LABEL[kind]),
);

/**
 * 选完轮次类型后，轮次名称该变成什么。返回 `null` 表示**别动名称**。
 *
 * 两者绝大多数时候是重叠的（选「笔试」，名字就叫「笔试」），所以默认把类型名带过去。
 * 两条例外，都是为了不把人已经输入的东西吃掉：
 *
 * - **「其他」不填**：那是个占位分类，不是名字。
 * - **手打过的名字不覆盖**：只有名称为空、或它正好还是上一次自动填进去的类型名时才改写。
 *   「技术二面」不该因为把类型从专业面改成 HR面 就被抹掉。
 */
export function nameForKindChange(kind: RoundKind, currentName: string): string | null {
  if (kind === 'other') return null;
  const trimmed = currentName.trim();
  if (trimmed !== '' && !AUTO_FILLED_NAMES.has(trimmed)) return null;
  const next = ROUND_KIND_LABEL[kind];
  return next === trimmed ? null : next;
}
