import type { SeasonView } from '../contract.js';

/**
 * 「当前招聘季」是**页面局部状态**，不是用户设置，所以走 localStorage 而不是
 * `app_settings`（判据见 ADR-0018：只有「无 core Item、无模块归属、外壳启动即需要」
 * 三条同时满足的东西才走设置那条通道）。同目录的视图模式（表格 / 看板）已有先例。
 */
const STORAGE_KEY = 'campus_current_season';

export function readStoredSeasonId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredSeasonId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

/**
 * 决定进入页面时停在哪一季。
 *
 * 已归档的季若正被选中就继续尊重它——归档只影响默认列举顺序，
 * 不该把人踢出他正在看的那一季。
 */
export function pickInitialSeason(
  seasons: SeasonView[],
  storedId: string | null,
): SeasonView | null {
  const stored = seasons.find((season) => season.id === storedId);
  if (stored !== undefined) return stored;
  return seasons.find((season) => season.archivedAt === null) ?? seasons[0] ?? null;
}
