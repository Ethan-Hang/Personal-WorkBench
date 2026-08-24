import { describe, it, expect } from 'vitest';
import {
  MAX_AMOUNT_DIGITS,
  formatAmountDraft,
  resolveAmountCommit,
  sanitizeAmountInput,
} from './amountInput.js';

describe('sanitizeAmountInput', () => {
  it('只保留数字字符', () => {
    expect(sanitizeAmountInput('12a3')).toBe('123');
    expect(sanitizeAmountInput('分钟')).toBe('');
    expect(sanitizeAmountInput('-5')).toBe('5');
    expect(sanitizeAmountInput(' 4 2 ')).toBe('42');
  });

  it('去掉前导零，但单独的零要保留', () => {
    expect(sanitizeAmountInput('0012')).toBe('12');
    expect(sanitizeAmountInput('0')).toBe('0');
    expect(sanitizeAmountInput('000')).toBe('0');
  });

  it('超过位数上限时截断，避免打卡值溢出成天文数字', () => {
    expect(sanitizeAmountInput('1234567890')).toBe('123456');
    expect(sanitizeAmountInput('1234567890').length).toBe(MAX_AMOUNT_DIGITS);
  });

  it('空输入保持为空——允许用户清空后重新键入', () => {
    expect(sanitizeAmountInput('')).toBe('');
  });
});

describe('formatAmountDraft', () => {
  it('把当前打卡值转成初始草稿文本', () => {
    expect(formatAmountDraft(0)).toBe('0');
    expect(formatAmountDraft(5)).toBe('5');
  });

  it('负值与小数被规整成合法整数文本', () => {
    expect(formatAmountDraft(-3)).toBe('0');
    expect(formatAmountDraft(4.7)).toBe('4');
  });
});

describe('resolveAmountCommit', () => {
  it('输入新数字时提交该值', () => {
    expect(resolveAmountCommit('60', 5)).toEqual({ kind: 'commit', value: 60 });
  });

  it('输入 0 是合法的——代表撤销今日打卡', () => {
    expect(resolveAmountCommit('0', 5)).toEqual({ kind: 'commit', value: 0 });
  });

  it('值没变则不提交，避免一次无谓的写请求', () => {
    expect(resolveAmountCommit('5', 5)).toEqual({ kind: 'cancel' });
  });

  it('清空或全是非数字时放弃编辑，保留原值', () => {
    expect(resolveAmountCommit('', 5)).toEqual({ kind: 'cancel' });
    expect(resolveAmountCommit('   ', 5)).toEqual({ kind: 'cancel' });
    expect(resolveAmountCommit('分钟', 5)).toEqual({ kind: 'cancel' });
  });

  it('提交前同样做净化，粘贴进来的脏文本不会变成 NaN', () => {
    expect(resolveAmountCommit('0042', 5)).toEqual({ kind: 'commit', value: 42 });
    expect(resolveAmountCommit('3天', 5)).toEqual({ kind: 'commit', value: 3 });
    expect(resolveAmountCommit('9999999', 5)).toEqual({ kind: 'commit', value: 999999 });
  });
});
