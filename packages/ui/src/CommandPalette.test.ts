import { describe, expect, it } from 'vitest';
import { matchCommandItem } from './CommandPalette.js';

describe('matchCommandItem', () => {
  it('匹配空查询返回 1', () => {
    expect(matchCommandItem({ title: '腾讯技术面' }, '')).toBe(1);
    expect(matchCommandItem({ title: '腾讯技术面' }, '   ')).toBe(1);
  });

  it('支持直接子串匹配（中英文忽略大小写）', () => {
    expect(matchCommandItem({ title: '腾讯技术面' }, '腾讯')).toBe(1);
    expect(matchCommandItem({ title: 'Settings Page' }, 'setting')).toBe(1);
    expect(matchCommandItem({ title: 'Settings Page' }, 'SETTING')).toBe(1);
  });

  it('支持副标题与关键词匹配', () => {
    expect(
      matchCommandItem(
        {
          title: '偏好设置',
          subtitle: '修改工作台主题与时区',
          keywords: ['settings', 'preferences', 'theme'],
        },
        'theme',
      ),
    ).toBe(1);
    expect(
      matchCommandItem(
        {
          title: '偏好设置',
          subtitle: '修改工作台主题与时区',
          keywords: ['settings'],
        },
        '时区',
      ),
    ).toBe(1);
  });

  it('支持拼音首字母匹配（如 tx -> 腾讯，db -> 待办）', () => {
    expect(matchCommandItem({ title: '腾讯技术一面' }, 'tx')).toBe(1);
    expect(matchCommandItem({ title: '字节跳动二面' }, 'zjtd')).toBe(1);
    expect(matchCommandItem({ title: '今日待办事项' }, 'db')).toBe(1);
  });

  it('支持中文全拼匹配（如 tengxun -> 腾讯）', () => {
    expect(matchCommandItem({ title: '腾讯控股' }, 'tengxun')).toBe(1);
    expect(matchCommandItem({ title: '阿里巴巴' }, 'alibaba')).toBe(1);
  });

  it('未命中时返回 0', () => {
    expect(matchCommandItem({ title: '腾讯技术一面' }, 'baidu')).toBe(0);
    expect(matchCommandItem({ title: '字节跳动' }, 'bd')).toBe(0);
  });
});
