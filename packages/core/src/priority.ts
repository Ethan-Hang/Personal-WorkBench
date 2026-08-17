import type { IsoInstant } from './time.js';
import { type Importance, IMPORTANCE_RANK } from './item.js';

/** 阈值为具名常量，调整只改这里（spec §7.2） */
export const IMMINENT_HOURS = 24;
export const SOON_HOURS = 72;

const HOUR_MS = 3_600_000;

export const URGENCIES = ['overdue', 'imminent', 'soon', 'later', 'none'] as const;
export type Urgency = (typeof URGENCIES)[number];

/**
 * 紧急度由 due_at 派生，永不入库（spec §7.1）。
 * 这样它永远新鲜、零维护 —— 手工维护的紧急度必然腐化。
 */
export function deriveUrgency(dueAt: IsoInstant | null, now: IsoInstant): Urgency {
  if (dueAt === null) return 'none';

  const deltaMs = Date.parse(dueAt) - Date.parse(now);
  if (Number.isNaN(deltaMs)) {
    throw new Error(`无法解析时间：dueAt="${dueAt}" now="${now}"`);
  }

  if (deltaMs < 0) return 'overdue';
  if (deltaMs <= IMMINENT_HOURS * HOUR_MS) return 'imminent';
  if (deltaMs <= SOON_HOURS * HOUR_MS) return 'soon';
  return 'later';
}

export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 4,
  imminent: 3,
  soon: 2,
  later: 1,
  none: 0,
};

/**
 * 列表默认排序用的派生分，不入库（spec §7.3）。
 * importance 权重 10 倍于 urgency，使"重要"始终压过"紧急" ——
 * 这正是艾森豪威尔矩阵的本意：不要让紧急的琐事挤掉重要的事。
 */
export function priorityScore(importance: Importance, urgency: Urgency): number {
  return IMPORTANCE_RANK[importance] * 10 + URGENCY_RANK[urgency];
}

/** 四象限横轴（spec §7.2） */
export function isUrgentQuadrant(u: Urgency): boolean {
  return u === 'overdue' || u === 'imminent' || u === 'soon';
}

/** 四象限纵轴（spec §7.2） */
export function isImportantQuadrant(i: Importance): boolean {
  return i === 'high';
}
