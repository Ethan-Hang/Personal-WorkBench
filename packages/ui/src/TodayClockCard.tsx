import { memo, useState, useEffect, useMemo } from 'react';
import { useTimezone } from './TimezoneContext.js';
import { IconCalendar, IconClock } from './icons.js';

interface TodayClockCardProps {
  className?: string;
}

/**
 * 单个数字平滑翻滚动效组件
 */
const RollingDigit = memo(function RollingDigit({
  char,
  className = '',
}: {
  char: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-block overflow-hidden tabular-nums ${className}`}>
      <span key={char} className="inline-block animate-digit-roll">
        {char}
      </span>
    </span>
  );
});

/**
 * 呼吸跳动冒号组件
 */
const BlinkingColon = memo(function BlinkingColon({
  className = 'text-muted/60',
}: {
  className?: string;
}) {
  return (
    <span className={`inline-block select-none animate-colon-blink px-0.5 sm:px-1 ${className}`}>
      :
    </span>
  );
});

/**
 * 农历与节日解析辅助函数
 */
export function getLunarAndFestivalInfo(date: Date, timeZone: string) {
  try {
    // 1. 公历年月日数字解析
    const gregorianFmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'long',
    });
    const gParts = gregorianFmt.formatToParts(date);
    const gYear = Number(gParts.find((p) => p.type === 'year')?.value || date.getFullYear());
    const gMonth = Number(gParts.find((p) => p.type === 'month')?.value || date.getMonth() + 1);
    const gDay = Number(gParts.find((p) => p.type === 'day')?.value || date.getDate());

    const weekdayFmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      weekday: 'long',
    });
    const weekday = weekdayFmt.format(date);

    // 标准中文公历全称与短称：如 2026年8月18日 / 8月18日
    const dateFormatted = `${gYear}年${gMonth}月${gDay}日`;

    // 2. 农历月日解析 (利用浏览器原生 Intl Chinese Calendar 引擎)
    const lunarFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      timeZone,
      month: 'long',
      day: 'numeric',
    });
    const lParts = lunarFmt.formatToParts(date);
    const rawLunarMonth = lParts.find((p) => p.type === 'month')?.value || '一月';
    const rawLunarDay = Number(lParts.find((p) => p.type === 'day')?.value || '1');

    const LUNAR_DAY_NAMES = [
      '',
      '初一',
      '初二',
      '初三',
      '初四',
      '初五',
      '初六',
      '初七',
      '初八',
      '初九',
      '初十',
      '十一',
      '十二',
      '十三',
      '十四',
      '十五',
      '十六',
      '十七',
      '十八',
      '十九',
      '二十',
      '廿一',
      '廿二',
      '廿三',
      '廿四',
      '廿五',
      '廿六',
      '廿七',
      '廿八',
      '廿九',
      '三十',
    ];

    let lunarMonthName = rawLunarMonth;
    if (rawLunarMonth === '1月' || rawLunarMonth === '一月') lunarMonthName = '正月';
    else if (rawLunarMonth === '11月' || rawLunarMonth === '十一月') lunarMonthName = '冬月';
    else if (rawLunarMonth === '12月' || rawLunarMonth === '十二月') lunarMonthName = '腊月';

    const lunarDayName = LUNAR_DAY_NAMES[rawLunarDay] || `初${rawLunarDay}`;
    const lunarText = `农历${lunarMonthName}${lunarDayName}`;

    // 3. 公历节日
    const GREGORIAN_FESTIVALS: Record<string, string> = {
      '1-1': '元旦',
      '2-14': '情人节',
      '3-8': '妇女节',
      '3-12': '植树节',
      '4-1': '愚人节',
      '5-1': '劳动节',
      '5-4': '青年节',
      '6-1': '儿童节',
      '7-1': '建党节',
      '8-1': '建军节',
      '9-10': '教师节',
      '10-1': '国庆节',
      '10-24': '程序员节',
      '12-24': '平安夜',
      '12-25': '圣诞节',
    };

    // 4. 传统农历节日
    const LUNAR_FESTIVALS: Record<string, string> = {
      正月初一: '春节',
      正月十五: '元宵节',
      二月初二: '龙抬头',
      五月初五: '端午节',
      七月初七: '七夕节',
      七月十五: '中元节',
      八月十五: '中秋节',
      九月初九: '重阳节',
      十月初一: '寒衣节',
      十月十五: '下元节',
      腊月初八: '腊八节',
      腊月廿三: '小年',
      腊月廿四: '小年',
      腊月廿九: '除夕',
      腊月三十: '除夕',
    };

    // 5. 二十四节气天文算法
    const SOLAR_TERMS = [
      { month: 1, name: '小寒', c: 5.4055 },
      { month: 1, name: '大寒', c: 20.12 },
      { month: 2, name: '立春', c: 3.87 },
      { month: 2, name: '雨水', c: 18.73 },
      { month: 3, name: '惊蛰', c: 5.63 },
      { month: 3, name: '春分', c: 20.646 },
      { month: 4, name: '清明', c: 4.81 },
      { month: 4, name: '谷雨', c: 20.1 },
      { month: 5, name: '立夏', c: 5.52 },
      { month: 5, name: '小满', c: 21.04 },
      { month: 6, name: '芒种', c: 5.678 },
      { month: 6, name: '夏至', c: 21.37 },
      { month: 7, name: '小暑', c: 7.108 },
      { month: 7, name: '大暑', c: 22.83 },
      { month: 8, name: '立秋', c: 7.5 },
      { month: 8, name: '处暑', c: 23.13 },
      { month: 9, name: '白露', c: 7.646 },
      { month: 9, name: '秋分', c: 23.042 },
      { month: 10, name: '寒露', c: 8.318 },
      { month: 10, name: '霜降', c: 23.438 },
      { month: 11, name: '立冬', c: 7.438 },
      { month: 11, name: '小雪', c: 22.36 },
      { month: 12, name: '大雪', c: 7.18 },
      { month: 12, name: '冬至', c: 21.94 },
    ];

    let solarTerm: string | null = null;
    const yCentury = gYear % 100;
    for (const term of SOLAR_TERMS) {
      if (term.month === gMonth) {
        const termDay = Math.floor(yCentury * 0.2422 + term.c) - Math.floor((yCentury - 1) / 4);
        if (termDay === gDay) {
          solarTerm = term.name;
          break;
        }
      }
    }

    const gKey = `${gMonth}-${gDay}`;
    const lKey = `${lunarMonthName}${lunarDayName}`;
    const festival = LUNAR_FESTIVALS[lKey] || GREGORIAN_FESTIVALS[gKey] || solarTerm || null;

    return {
      dateFormatted,
      weekday,
      lunarText,
      festival,
    };
  } catch {
    return {
      dateFormatted: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
      weekday: '星期一',
      lunarText: '',
      festival: null,
    };
  }
}

/**
 * 极简时钟与日期卡片（展示公历X月X日、星期、农历、节日与时分秒翻滚动效）
 */
export const TodayClockCard = memo(function TodayClockCard({
  className = '',
}: TodayClockCardProps) {
  const { timezone } = useTimezone();
  const [now, setNow] = useState<Date>(() => new Date());
  const [is24Hour, setIs24Hour] = useState<boolean>(true);

  // 1 秒心跳更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 解析并格式化时区对应的时间部件
  const timeData = useMemo(() => {
    try {
      const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = timeFormatter.formatToParts(now);
      const rawHour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
      const minuteStr = parts.find((p) => p.type === 'minute')?.value || '00';
      const secondStr = parts.find((p) => p.type === 'second')?.value || '00';

      const hour12Num = rawHour % 12 === 0 ? 12 : rawHour % 12;
      const hourStr = is24Hour
        ? String(rawHour).padStart(2, '0')
        : String(hour12Num).padStart(2, '0');
      const ampm = rawHour >= 12 ? 'PM' : 'AM';

      const { dateFormatted, weekday, lunarText, festival } = getLunarAndFestivalInfo(
        now,
        timezone,
      );

      return {
        hourStr,
        minuteStr,
        secondStr,
        ampm,
        dateFormatted,
        weekday,
        lunarText,
        festival,
      };
    } catch {
      return {
        hourStr: '00',
        minuteStr: '00',
        secondStr: '00',
        ampm: 'AM',
        dateFormatted: '',
        weekday: '',
        lunarText: '',
        festival: null,
      };
    }
  }, [now, timezone, is24Hour]);

  return (
    <section
      className={`rounded-panel border border-line bg-surface p-4 shadow-xs transition-all duration-300 hover-lift ${className}`}
    >
      {/* 顶部日期与农历节日栏 */}
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
        <div className="flex flex-col gap-0.5">
          {/* 主日期：2026年8月18日 · 星期二 */}
          <div className="flex items-center gap-1.5 text-xs">
            <IconCalendar size={13} className="text-accent" />
            <span className="font-bold text-ink tracking-tight">{timeData.dateFormatted}</span>
            <span className="text-muted font-medium">·</span>
            <span className="text-secondary font-medium">{timeData.weekday}</span>
          </div>

          {/* 农历与节日指示 */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted pl-4.5">
            {timeData.lunarText && <span>{timeData.lunarText}</span>}
            {timeData.festival && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.2 text-[10px] font-bold text-accent border border-accent/20">
                {timeData.festival}
              </span>
            )}
          </div>
        </div>

        {/* 12H / 24H 切换 */}
        <button
          type="button"
          onClick={() => setIs24Hour((prev) => !prev)}
          title={is24Hour ? '切换为 12 小时制' : '切换为 24 小时制'}
          className="flex items-center gap-1 rounded-[5px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-secondary transition-colors hover:bg-surface-3 hover:text-ink cursor-pointer self-start"
        >
          <IconClock size={10} className="text-muted" />
          <span>{is24Hour ? '24H' : timeData.ampm}</span>
        </button>
      </div>

      {/* 核心时分秒翻滚时钟 */}
      <div className="mt-3 flex items-center justify-center font-mono tracking-tight select-none">
        <div className="flex items-center rounded-control bg-surface-2/80 px-2 py-1 border border-line/70 shadow-xs">
          <RollingDigit
            char={timeData.hourStr[0] || '0'}
            className="text-3xl sm:text-4xl font-extrabold text-ink"
          />
          <RollingDigit
            char={timeData.hourStr[1] || '0'}
            className="text-3xl sm:text-4xl font-extrabold text-ink"
          />
        </div>

        <BlinkingColon className="text-2xl sm:text-3xl font-bold text-secondary/60" />

        <div className="flex items-center rounded-control bg-surface-2/80 px-2 py-1 border border-line/70 shadow-xs">
          <RollingDigit
            char={timeData.minuteStr[0] || '0'}
            className="text-3xl sm:text-4xl font-extrabold text-ink"
          />
          <RollingDigit
            char={timeData.minuteStr[1] || '0'}
            className="text-3xl sm:text-4xl font-extrabold text-ink"
          />
        </div>

        <BlinkingColon className="text-2xl sm:text-3xl font-bold text-accent/60" />

        <div className="flex items-center rounded-control bg-accent/10 px-2 py-1 border border-accent/25 shadow-xs">
          <RollingDigit
            char={timeData.secondStr[0] || '0'}
            className="text-3xl sm:text-4xl font-black text-accent"
          />
          <RollingDigit
            char={timeData.secondStr[1] || '0'}
            className="text-3xl sm:text-4xl font-black text-accent"
          />
        </div>
      </div>
    </section>
  );
});
