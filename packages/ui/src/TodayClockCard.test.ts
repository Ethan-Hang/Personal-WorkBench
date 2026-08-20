import { describe, it, expect } from 'vitest';
import { TodayClockCard, getLunarAndFestivalInfo } from './TodayClockCard.js';

describe('TodayClockCard component & Lunar/Festival helper', () => {
  it('成功导出 TodayClockCard 函数式 React 组件', () => {
    expect(TodayClockCard).toBeDefined();
    expect(typeof TodayClockCard).toBe('object'); // React memoized component
  });

  it('正确解析 2026年8月18日 公历年月日与农历七月初六', () => {
    const d = new Date('2026-08-18T16:00:00+08:00');
    const info = getLunarAndFestivalInfo(d, 'Asia/Shanghai');

    expect(info.dateFormatted).toBe('2026年8月18日');
    expect(info.lunarText).toBe('农历七月初六');
  });

  it('正确识别农历传统节日 (如中秋节)', () => {
    const d = new Date('2026-09-25T12:00:00+08:00'); // 农历八月十五
    const info = getLunarAndFestivalInfo(d, 'Asia/Shanghai');

    expect(info.dateFormatted).toBe('2026年9月25日');
    expect(info.lunarText).toBe('农历八月十五');
    expect(info.festival).toBe('中秋节');
  });

  it('正确识别公历法定节日 (如国庆节)', () => {
    const d = new Date('2026-10-01T12:00:00+08:00');
    const info = getLunarAndFestivalInfo(d, 'Asia/Shanghai');

    expect(info.dateFormatted).toBe('2026年10月1日');
    expect(info.festival).toBe('国庆节');
  });

  it('正确识别二十四节气 (如处暑)', () => {
    const d = new Date('2026-08-23T12:00:00+08:00');
    const info = getLunarAndFestivalInfo(d, 'Asia/Shanghai');

    expect(info.dateFormatted).toBe('2026年8月23日');
    expect(info.festival).toBe('处暑');
  });
});
