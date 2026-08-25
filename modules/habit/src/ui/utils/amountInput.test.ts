import { describe, it, expect } from 'vitest';
import {
  MAX_AMOUNT_DIGITS,
  MAX_AMOUNT_VALUE,
  clampSliderValue,
  formatAmountDraft,
  resolveAmountCommit,
  sanitizeAmountInput,
  sliderMaxFor,
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

describe('sliderMaxFor', () => {
  it('常规情况下上限就是目标值', () => {
    expect(sliderMaxFor(100, 5)).toBe(100);
  });

  it('已超额打卡时上限跟到当前值——滑条不能把超额部分截掉', () => {
    expect(sliderMaxFor(100, 130)).toBe(130);
  });

  it('目标值为 1 或异常值时上限至少为 1，避免出现零长度滑轨', () => {
    expect(sliderMaxFor(1, 0)).toBe(1);
    expect(sliderMaxFor(0, 0)).toBe(1);
    expect(sliderMaxFor(Number.NaN, Number.NaN)).toBe(1);
  });

  it('上限不超过打卡值本身的上限', () => {
    expect(sliderMaxFor(MAX_AMOUNT_VALUE + 100, 0)).toBe(MAX_AMOUNT_VALUE);
  });
});

describe('clampSliderValue', () => {
  it('落在区间内的值原样返回', () => {
    expect(clampSliderValue(42, 100)).toBe(42);
  });

  it('越界值被夹到 [0, max]', () => {
    expect(clampSliderValue(-8, 100)).toBe(0);
    expect(clampSliderValue(140, 100)).toBe(100);
  });

  it('小数与非法值被规整成整数——打卡值在服务端是 int', () => {
    expect(clampSliderValue(7.9, 100)).toBe(7);
    expect(clampSliderValue(Number.NaN, 100)).toBe(0);
  });
});
