import { describe, it, expect } from 'vitest';
import { CheckinAmountInput } from './CheckinAmountInput.js';

describe('CheckinAmountInput component', () => {
  it('正确导出 CheckinAmountInput 组件', () => {
    expect(CheckinAmountInput).toBeDefined();
    expect(typeof CheckinAmountInput).toBe('function');
  });
});
