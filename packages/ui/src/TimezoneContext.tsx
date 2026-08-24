import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '@workbench/core';
import { useSettings } from './SettingsContext.js';

export interface TimezoneOption {
  id: string; // e.g. 'Asia/Shanghai'
  name: string; // e.g. '上海 (中国标准时间)'
  city: string; // e.g. '上海'
  region: 'Asia' | 'Europe' | 'America' | 'Pacific' | 'Africa' | 'Other';
  offsetHours: number; // e.g. 8
  offsetLabel: string; // e.g. 'UTC+08:00'
  coords: { x: number; y: number }; // Relative coordinates on 1000x500 SVG map
  hasDst: boolean;
  dstInfo: string;
}

export const WORLD_TIMEZONES: TimezoneOption[] = [
  {
    id: 'Asia/Shanghai',
    name: '北京 / 上海 (中国标准时间 CST)',
    city: '上海',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    coords: { x: 740, y: 220 },
    hasDst: false,
    dstInfo: '不实行夏令时，全年恒定 UTC+8',
  },
  {
    id: 'Asia/Tokyo',
    name: '东京 (日本标准时间 JST)',
    city: '东京',
    region: 'Asia',
    offsetHours: 9,
    offsetLabel: 'UTC+09:00',
    coords: { x: 825, y: 215 },
    hasDst: false,
    dstInfo: '不实行夏令时，全年恒定 UTC+9',
  },
  {
    id: 'Asia/Singapore',
    name: '新加坡 / 香港 (SGT / HKT)',
    city: '新加坡',
    region: 'Asia',
    offsetHours: 8,
    offsetLabel: 'UTC+08:00',
    coords: { x: 730, y: 310 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Asia/Dubai',
    name: '迪拜 (海湾标准时间 GST)',
    city: '迪拜',
    region: 'Asia',
    offsetHours: 4,
    offsetLabel: 'UTC+04:00',
    coords: { x: 590, y: 240 },
    hasDst: false,
    dstInfo: '不实行夏令时',
  },
  {
    id: 'Europe/London',
    name: '伦敦 (格林威治 GMT / 英国夏令 BST)',
    city: '伦敦',
    region: 'Europe',
    offsetHours: 0,
    offsetLabel: 'UTC+00:00',
    coords: { x: 450, y: 155 },
    hasDst: true,
    dstInfo: '3月最后一个周日至10月最后一个周日实行夏令时 (BST, UTC+1)',
  },
  {
    id: 'Europe/Paris',
    name: '巴黎 / 柏林 (中欧时间 CET / CEST)',
    city: '巴黎',
    region: 'Europe',
    offsetHours: 1,
    offsetLabel: 'UTC+01:00',
    coords: { x: 475, y: 170 },
    hasDst: true,
    dstInfo: '夏季实行 CEST (UTC+2)，冬季恢复 CET (UTC+1)',
  },
  {
    id: 'America/New_York',
    name: '纽约 (东部时间 EST / EDT)',
    city: '纽约',
    region: 'America',
    offsetHours: -5,
    offsetLabel: 'UTC-05:00',
    coords: { x: 275, y: 195 },
    hasDst: true,
    dstInfo: '3月第二个周日至11月第一个周日实行夏令时 (EDT, UTC-4)',
  },
  {
    id: 'America/Chicago',
    name: '芝加哥 (中部时间 CST / CDT)',
    city: '芝加哥',
    region: 'America',
    offsetHours: -6,
    offsetLabel: 'UTC-06:00',
    coords: { x: 235, y: 190 },
    hasDst: true,
    dstInfo: '实行夏令时 (CDT, UTC-5)',
  },
  {
    id: 'America/Los_Angeles',
    name: '洛杉矶 / 旧金山 (太平洋时间 PST / PDT)',
    city: '洛杉矶',
    region: 'America',
    offsetHours: -8,
    offsetLabel: 'UTC-08:00',
    coords: { x: 165, y: 205 },
    hasDst: true,
    dstInfo: '实行夏令时 (PDT, UTC-7)',
  },
  {
    id: 'Australia/Sydney',
    name: '悉尼 / 墨尔本 (澳洲东部时间 AEST / AEDT)',
    city: '悉尼',
    region: 'Pacific',
    offsetHours: 10,
    offsetLabel: 'UTC+10:00',
    coords: { x: 860, y: 410 },
    hasDst: true,
    dstInfo: '10月第一个周日至次年4月第一个周日实行夏令时 (AEDT, UTC+11)',
  },
  {
    id: 'Pacific/Auckland',
    name: '奥克兰 (新西兰标准时间 NZST / NZDT)',
    city: '奥克兰',
    region: 'Pacific',
    offsetHours: 12,
    offsetLabel: 'UTC+12:00',
    coords: { x: 925, y: 440 },
    hasDst: true,
    dstInfo: '实行夏令时 (NZDT, UTC+13)',
  },
  {
    id: 'Africa/Cairo',
    name: '开罗 (东欧标准时间 EET)',
    city: '开罗',
    region: 'Africa',
    offsetHours: 2,
    offsetLabel: 'UTC+02:00',
    coords: { x: 535, y: 225 },
    hasDst: true,
    dstInfo: '4月最后一个周五至10月最后一个周四实行夏令时 (UTC+3)',
  },
  {
    id: 'America/Sao_Paulo',
    name: '圣保罗 (巴西利亚时间 BRT)',
    city: '圣保罗',
    region: 'America',
    offsetHours: -3,
    offsetLabel: 'UTC-03:00',
    coords: { x: 345, y: 380 },
    hasDst: false,
    dstInfo: '目前已暂停夏令时',
  },
];

export const DEFAULT_TIMEZONE = DEFAULT_SETTINGS['timezone.id'];

export type DstMode = AppSettings['timezone.dstMode'];

interface TimezoneContextValue {
  timezone: string;
  setTimezone: (tz: string) => void;
  dstMode: DstMode;
  setDstMode: (mode: DstMode) => void;
  timezoneInfo: {
    timeZone: string;
    currentOffsetMin: number;
    offsetStr: string;
    hasDst: boolean;
    isDstNow: boolean;
  };
  toUtcIso: (localStr: string) => string;
  formatUtcToLocal: (utcIso: string) => { date: string; time: string; full: string };
  /** `9/21 10:00`。列表与卡片上显示时刻一律走它，别再手搓不带 timeZone 的 Intl */
  formatUtcShort: (utcIso: string) => string;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

/**
 * 将本地墙钟时间（形如 '2026-08-18 14:30' 或 '2026-08-18T14:30'）
 * 精确换算为 UTC ISO8601 时刻字符串（形如 '2026-08-18T06:30:00.000Z'）
 */
export function toUtcIso(localDateTimeStr: string, timeZone: string): string {
  const trimmed = localDateTimeStr.trim();
  if (!trimmed) return '';

  const parts = trimmed.split(/[T ]/);
  const datePart = parts[0];
  const timePart = parts[1] || '00:00';
  if (!datePart) return '';

  const dateNums = datePart.split('-').map(Number);
  const timeNums = timePart.split(':').map(Number);
  const y = dateNums[0];
  const m = dateNums[1];
  const d = dateNums[2];
  const h = timeNums[0] ?? 0;
  const min = timeNums[1] ?? 0;

  if (y === undefined || m === undefined || d === undefined) {
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? '' : fallback.toISOString();
  }

  // 构造对应的 UTC 时间基准并根据目标时区解算偏移量
  const targetDate = new Date(Date.UTC(y, m - 1, d, h, min, 0, 0));
  try {
    const invDate = new Date(targetDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(targetDate.toLocaleString('en-US', { timeZone }));
    const diff = tzDate.getTime() - invDate.getTime();
    const result = new Date(targetDate.getTime() - diff);
    return result.toISOString();
  } catch {
    return targetDate.toISOString();
  }
}

/**
 * 将 UTC ISO8601 字符串在指定时区下格式化为本地可读年月日与时分
 */
export function formatUtcToLocal(
  utcIso: string,
  timeZone: string,
): { date: string; time: string; full: string } {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return { date: '', time: '', full: '' };

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const y = getPart('year');
    const m = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const min = getPart('minute');
    const date = `${y}-${m}-${day}`;
    const time = `${hour}:${min}`;
    return { date, time, full: `${date} ${time}` };
  } catch {
    const date = utcIso.slice(0, 10);
    const time = utcIso.slice(11, 16);
    return { date, time, full: `${date} ${time}` };
  }
}

/**
 * 紧凑显示用：把 UTC 时刻在指定时区下渲染成 `9/21 10:00`。
 *
 * 存在的理由是**必须传 `timeZone`**。`new Intl.DateTimeFormat('zh-CN', {...})` 不带这一项
 * 时按宿主机器的时区渲染，于是设置里换时区，界面上的时刻纹丝不动——而且不报错，
 * 只是显示的一直是另一个时区的钟点。凡是拿 UTC 时刻往界面上写的地方都该走这里。
 */
export function formatUtcShort(utcIso: string, timeZone: string): string {
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return utcIso;
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  } catch {
    return utcIso;
  }
}

export function getTimezoneInfo(timeZone: string) {
  const now = new Date();
  try {
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);

    const getOffset = (d: Date) => {
      const invDate = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(d.toLocaleString('en-US', { timeZone }));
      return (tzDate.getTime() - invDate.getTime()) / 60000;
    };

    const currentOffset = getOffset(now);
    const janOffset = getOffset(jan);
    const julOffset = getOffset(jul);

    const hasDst = janOffset !== julOffset;
    const isDstNow = hasDst && currentOffset !== Math.min(janOffset, julOffset);

    const offsetHours = Math.floor(Math.abs(currentOffset) / 60);
    const offsetMins = Math.abs(currentOffset) % 60;
    const sign = currentOffset >= 0 ? '+' : '-';
    const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

    return {
      timeZone,
      currentOffsetMin: currentOffset,
      offsetStr,
      hasDst,
      isDstNow,
    };
  } catch {
    return {
      timeZone,
      currentOffsetMin: 480,
      offsetStr: 'UTC+08:00',
      hasDst: false,
      isDstNow: false,
    };
  }
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const timezone = settings['timezone.id'];
  const dstMode = settings['timezone.dstMode'];

  const timezoneInfo = useMemo(() => getTimezoneInfo(timezone), [timezone]);

  const value = useMemo(
    () => ({
      timezone,
      setTimezone: (tz: string) => update({ 'timezone.id': tz }),
      dstMode,
      setDstMode: (m: DstMode) => update({ 'timezone.dstMode': m }),
      timezoneInfo,
      toUtcIso: (localStr: string) => toUtcIso(localStr, timezone),
      formatUtcToLocal: (utcIso: string) => formatUtcToLocal(utcIso, timezone),
      formatUtcShort: (utcIso: string) => formatUtcShort(utcIso, timezone),
    }),
    [timezone, dstMode, timezoneInfo, update],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone(): TimezoneContextValue {
  const ctx = useContext(TimezoneContext);
  if (!ctx) {
    // 降级保护：若未包裹 Provider，默认使用上海时区
    const defaultInfo = getTimezoneInfo(DEFAULT_TIMEZONE);
    return {
      timezone: DEFAULT_TIMEZONE,
      setTimezone: () => {},
      dstMode: 'auto',
      setDstMode: () => {},
      timezoneInfo: defaultInfo,
      toUtcIso: (localStr: string) => toUtcIso(localStr, DEFAULT_TIMEZONE),
      formatUtcToLocal: (utcIso: string) => formatUtcToLocal(utcIso, DEFAULT_TIMEZONE),
      formatUtcShort: (utcIso: string) => formatUtcShort(utcIso, DEFAULT_TIMEZONE),
    };
  }
  return ctx;
}
