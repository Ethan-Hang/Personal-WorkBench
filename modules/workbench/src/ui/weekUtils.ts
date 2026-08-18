import { DateTime } from 'luxon';

export interface DayInfo {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1 = Monday, 7 = Sunday
  dayName: string; // 周一, 周二, etc.
  dayShortName: string; // 一, 二, etc.
  dayNumber: number; // 1 ~ 31
  month: number; // 1 ~ 12
  year: number;
  isToday: boolean;
}

export interface WeekRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  year: number; // ISO week year
  weekNumber: number; // 1 ~ 53
  days: DayInfo[];
}

export interface YearWeekOption {
  year: number;
  weekNumber: number;
  from: string;
  to: string;
  label: string; // e.g. "第 34 周 (08/17 - 08/23)"
  isCurrentWeek: boolean;
}

/**
 * 格式化 YYYY-MM-DD
 */
export function formatPlainDate(dt: DateTime): string {
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * 获取某个日期所在的完整周信息（默认以周一为一周起始日）
 * @param dateStr 本地日期 YYYY-MM-DD 或 ISO 字符串或 Date 对象，若缺省则为当前本地日期
 * @param zone 可选时区
 */
export function getWeekRange(dateStr?: string | Date | null, zone?: string): WeekRange {
  let dt: DateTime;
  if (!dateStr) {
    dt = zone ? DateTime.now().setZone(zone) : DateTime.now();
  } else if (dateStr instanceof Date) {
    dt = DateTime.fromJSDate(dateStr, zone ? { zone } : undefined);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dt = DateTime.fromFormat(dateStr, 'yyyy-MM-dd', zone ? { zone } : undefined);
  } else {
    dt = DateTime.fromISO(dateStr, zone ? { zone } : undefined);
  }

  if (!dt.isValid) {
    dt = zone ? DateTime.now().setZone(zone) : DateTime.now();
  }

  // ISO 周起始日是周一
  const startOfWeek = dt.startOf('week');
  const endOfWeek = dt.endOf('week');
  const todayStr = (zone ? DateTime.now().setZone(zone) : DateTime.now()).toFormat('yyyy-MM-dd');

  const days: DayInfo[] = [];
  const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const DAY_SHORT_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

  for (let i = 0; i < 7; i++) {
    const dayDt = startOfWeek.plus({ days: i });
    const dStr = formatPlainDate(dayDt);
    days.push({
      date: dStr,
      dayOfWeek: i + 1,
      dayName: DAY_NAMES[i] ?? `周${i + 1}`,
      dayShortName: DAY_SHORT_NAMES[i] ?? `${i + 1}`,
      dayNumber: dayDt.day,
      month: dayDt.month,
      year: dayDt.year,
      isToday: dStr === todayStr,
    });
  }

  return {
    from: formatPlainDate(startOfWeek),
    to: formatPlainDate(endOfWeek),
    year: dt.weekYear,
    weekNumber: dt.weekNumber,
    days,
  };
}

/**
 * 根据指定的 ISO 年份与周次计算周区间
 */
export function getWeekRangeByYearAndWeek(
  year: number,
  weekNumber: number,
  zone?: string,
): WeekRange {
  const dt = DateTime.fromObject(
    {
      weekYear: year,
      weekNumber: Math.max(1, Math.min(53, weekNumber)),
      weekday: 1,
    },
    zone ? { zone } : undefined,
  );

  return getWeekRange(dt.toFormat('yyyy-MM-dd'), zone);
}

/**
 * 获取指定年份的全部周列表（用于快速切换周下拉列表）
 */
export function getWeeksInYear(year: number, zone?: string): YearWeekOption[] {
  const firstDay = DateTime.fromObject({ weekYear: year, weekNumber: 1, weekday: 1 }, { zone });
  const weeks: YearWeekOption[] = [];

  const totalWeeks = firstDay.weeksInWeekYear;
  const currentWeek = getWeekRange(undefined, zone);

  for (let w = 1; w <= totalWeeks; w++) {
    const start = DateTime.fromObject({ weekYear: year, weekNumber: w, weekday: 1 }, { zone });
    const end = DateTime.fromObject({ weekYear: year, weekNumber: w, weekday: 7 }, { zone });
    const fromStr = formatPlainDate(start);
    const toStr = formatPlainDate(end);
    const isCurrent = year === currentWeek.year && w === currentWeek.weekNumber;

    weeks.push({
      year,
      weekNumber: w,
      from: fromStr,
      to: toStr,
      label: `第 ${w} 周 (${start.toFormat('MM/dd')} - ${end.toFormat('MM/dd')})`,
      isCurrentWeek: isCurrent,
    });
  }

  return weeks;
}

/**
 * 获取可选年份列表（当前年前后若干年，支持横向滚动切换）
 */
export function getAvailableYears(currentYear?: number, span = 6): number[] {
  const center = currentYear ?? DateTime.now().year;
  const years: number[] = [];
  for (let y = center - span; y <= center + span; y++) {
    years.push(y);
  }
  return years;
}

/**
 * 周标题友好展示
 * e.g. "2026 年 第 34 周 · 08月17日 — 08月23日"
 */
export function formatWeekHeaderTitle(range: WeekRange): string {
  const [fYear, fMonth, fDay] = range.from.split('-');
  const [tYear, tMonth, tDay] = range.to.split('-');

  if (fYear === tYear) {
    return `${fYear} 年 第 ${range.weekNumber} 周 · ${Number(fMonth)} 月 ${Number(fDay)} 日 — ${Number(tMonth)} 月 ${Number(tDay)} 日`;
  }
  return `${fYear}年${Number(fMonth)}月${Number(fDay)}日 — ${tYear}年${Number(tMonth)}月${Number(tDay)}日 (第 ${range.weekNumber} 周)`;
}

/**
 * 计算定时事件在时间轴上的垂直偏移量与高度
 * @param startIso UTC ISO8601 时刻
 * @param endIso 可选结束时刻
 * @param userZone 用户时区
 * @param pixelPerHour 每小时高度像素 (例如 56px)
 * @param minHeight 最小卡片高度 (默认 26px)
 */
export function calculateEventTimelinePosition(
  startIso: string,
  endIso: string | undefined,
  userZone: string,
  pixelPerHour = 56,
  minHeight = 26,
): { topPx: number; heightPx: number; timeRangeStr: string; startMinutes: number } {
  const startDt = DateTime.fromISO(startIso, { zone: userZone });
  const startHours = startDt.hour;
  const startMinutes = startDt.minute;
  const totalStartMinutes = startHours * 60 + startMinutes;

  let durationMinutes = 60; // 默认 1 小时
  let endDt: DateTime | null = null;

  if (endIso) {
    endDt = DateTime.fromISO(endIso, { zone: userZone });
    if (endDt.isValid) {
      const diff = endDt.diff(startDt, 'minutes').minutes;
      if (diff > 0) {
        durationMinutes = diff;
      }
    }
  }

  const topPx = (totalStartMinutes / 60) * pixelPerHour;
  const calculatedHeight = (durationMinutes / 60) * pixelPerHour;
  const heightPx = Math.max(minHeight, calculatedHeight);

  const startTimeStr = startDt.toFormat('HH:mm');
  const endTimeStr = endDt?.isValid
    ? endDt.toFormat('HH:mm')
    : startDt.plus({ minutes: durationMinutes }).toFormat('HH:mm');
  const timeRangeStr = `${startTimeStr} - ${endTimeStr}`;

  return {
    topPx,
    heightPx,
    timeRangeStr,
    startMinutes: totalStartMinutes,
  };
}

/**
 * 将本地小时和分钟换算为当前选定日期的 UTC ISO8601 时刻 (用于排程)
 */
export function localTimeToUtcIso(
  localDateStr: string, // YYYY-MM-DD
  hour: number,
  minute: number,
  userZone: string,
): string {
  const dt = DateTime.fromObject(
    {
      year: parseInt(localDateStr.slice(0, 4), 10),
      month: parseInt(localDateStr.slice(5, 7), 10),
      day: parseInt(localDateStr.slice(8, 10), 10),
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { zone: userZone },
  );

  return new Date(dt.toUTC().toMillis()).toISOString();
}
