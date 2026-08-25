import type {
  ApplicationOutcome,
  ApplicationView,
  UpdateApplicationInput,
} from '../../contract.js';

/**
 * 「终局状态」下拉把两件事合成一个控件：outcome（真终局）与 shelved（泡池子）。
 *
 * 泡池子刻意不是 outcome 的取值——它不是终局，今天泡着下周可能来面试，
 * 撤销它也不该是「清空终局结果」。两者互斥地呈现在同一个下拉里，
 * 因此选中一个就要显式清掉另一个，否则会留下「既 Offer 又泡池子」的记录。
 */
export function outcomeSelectValue(application: ApplicationView): string {
  return application.shelvedAt !== null ? 'shelved' : (application.outcome ?? '');
}

export function outcomeSelectChange(value: string): UpdateApplicationInput {
  if (value === 'shelved') return { outcome: null, shelved: true };
  return { outcome: value === '' ? null : (value as ApplicationOutcome), shelved: false };
}
