import { describe, expect, it } from 'vitest';
import type { ApplicationView } from '../../contract.js';
import { outcomeSelectChange, outcomeSelectValue } from './outcomeSelect.js';

function view(partial: Partial<ApplicationView>): ApplicationView {
  return { outcome: null, shelvedAt: null, ...partial } as ApplicationView;
}

describe('终局状态下拉', () => {
  it('泡池子盖过 outcome 显示——两者互斥地共用一个控件', () => {
    expect(outcomeSelectValue(view({ shelvedAt: '2026-08-23T00:00:00.000Z' }))).toBe('shelved');
    expect(outcomeSelectValue(view({ outcome: 'offer' }))).toBe('offer');
    expect(outcomeSelectValue(view({}))).toBe('');
  });

  it('选中一个必须显式清掉另一个，否则会留下「既 Offer 又泡池子」的记录', () => {
    expect(outcomeSelectChange('shelved')).toEqual({ outcome: null, shelved: true });
    expect(outcomeSelectChange('offer')).toEqual({ outcome: 'offer', shelved: false });
    expect(outcomeSelectChange('')).toEqual({ outcome: null, shelved: false });
  });
});
