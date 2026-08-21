import { formatUtcToLocal } from './TimezoneContext.js';

export interface RelativeTimeOptions {
  now?: number | Date | string;
  timeZone?: string;
}

/**
 * 格式化上一次备份时间的人性化相对时间描述：
 * - 空值或非法时间: '未备份'
 * - < 1 分钟: '刚刚'
 * - < 60 分钟: '几分钟前' (例如 '5分钟前')
 * - 1h ~ 24h: '几h几m前' (例如 '1h20m前', 整点为 '2h前')
 * - 1d ~ 7d: '几d几h前' (例如 '1d3h前', 整天为 '3d前')
 * - >= 7天: 具体日期时间 (例如 '2026-08-10 14:30')
 */
export function formatRelativeBackupTime(
  utcIsoOrDate: string | Date | number | null | undefined,
  options?: RelativeTimeOptions,
): string {
  if (!utcIsoOrDate) return '未备份';

  const targetDate =
    typeof utcIsoOrDate === 'string' || typeof utcIsoOrDate === 'number'
      ? new Date(utcIsoOrDate)
      : utcIsoOrDate;

  if (isNaN(targetDate.getTime())) return '未备份';

  const nowDate = options?.now
    ? typeof options.now === 'string' || typeof options.now === 'number'
      ? new Date(options.now)
      : options.now
    : new Date();

  const deltaMs = nowDate.getTime() - targetDate.getTime();

  // 若时间差为负（微小客户端时钟漂移），按「刚刚」计算
  if (deltaMs < 60 * 1000) {
    return '刚刚';
  }

  const ONE_MINUTE_MS = 60 * 1000;
  const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

  // 1 分钟 ~ 59 分钟: 几分钟前
  if (deltaMs < ONE_HOUR_MS) {
    const mins = Math.floor(deltaMs / ONE_MINUTE_MS);
    return `${mins}分钟前`;
  }

  // 1 小时 ~ 24 小时: 几h几m前
  if (deltaMs < ONE_DAY_MS) {
    const hours = Math.floor(deltaMs / ONE_HOUR_MS);
    const mins = Math.floor((deltaMs % ONE_HOUR_MS) / ONE_MINUTE_MS);
    return mins > 0 ? `${hours}h${mins}m前` : `${hours}h前`;
  }

  // 1 天 ~ 7 天: 几d几h前
  if (deltaMs < SEVEN_DAYS_MS) {
    const days = Math.floor(deltaMs / ONE_DAY_MS);
    const hours = Math.floor((deltaMs % ONE_DAY_MS) / ONE_HOUR_MS);
    return hours > 0 ? `${days}d${hours}h前` : `${days}d前`;
  }

  // 超过 7 天: 显示具体日期时间 (YYYY-MM-DD HH:mm)
  const isoString = targetDate.toISOString();
  const tz = options?.timeZone || 'Asia/Shanghai';
  const local = formatUtcToLocal(isoString, tz);
  return local.full || isoString.replace('T', ' ').slice(0, 16);
}
