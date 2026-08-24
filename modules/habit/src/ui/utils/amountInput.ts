/**
 * 打卡值直接编辑的纯逻辑。
 *
 * 放在 `.ts` 而不是组件里，是因为仓库的 Vitest `include` 只收集 `.ts`：
 * 写进 `.tsx` 就没有测试护着（与 campus-recruit 的 outcomeSelect 同理）。
 */

/** 打卡值最多 6 位——手滑长按或粘贴一长串数字不会写出天文数字 */
export const MAX_AMOUNT_DIGITS = 6;

/** 净化后可表示的最大打卡值 */
export const MAX_AMOUNT_VALUE = 10 ** MAX_AMOUNT_DIGITS - 1;

export type AmountCommit = { kind: 'commit'; value: number } | { kind: 'cancel' };

/**
 * 逐次键入时的过滤：只留数字、去前导零、限位数。
 * 空串是合法中间态——用户要能先清空再重新键入。
 */
export function sanitizeAmountInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
  if (digits === '') return '';
  const trimmed = digits.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

/** 进入编辑态时的初始草稿文本 */
export function formatAmountDraft(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return String(Math.floor(value));
}

/**
 * 提交（回车 / 失焦）时把草稿解析成要写入的值。
 *
 * - 空或纯非数字 → 放弃编辑，保留原值；
 * - 与原值相同 → 也不提交，省掉一次无谓的写请求与乐观更新回滚风险；
 * - `0` 是合法值，语义是撤销当日打卡（调用方据此走 DELETE）。
 */
export function resolveAmountCommit(draft: string, currentValue: number): AmountCommit {
  const sanitized = sanitizeAmountInput(draft);
  if (sanitized === '') return { kind: 'cancel' };

  const value = Number(sanitized);
  if (!Number.isInteger(value) || value < 0) return { kind: 'cancel' };
  if (value === currentValue) return { kind: 'cancel' };

  return { kind: 'commit', value };
}
