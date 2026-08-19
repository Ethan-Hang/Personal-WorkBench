export type WatermarkVerdict = 'equal' | 'backup-older' | 'backup-newer';

export interface WatermarkComparison {
  verdict: WatermarkVerdict;
  /** 只在 `backup-newer` 时给出：说清是哪条谱系、差多少。 */
  reason?: string;
}

/**
 * 备份与当前代码的迁移水位比对（设计 §6.3 细节 ③）。
 *
 * **向下迁移不存在。** 备份比代码新时硬恢复的症状是运行时 `no such column`——
 * 一个在几步之后才炸、且看不出与恢复有关的错误。所以这里宁可拒绝。
 *
 * 判断用 meta 完成，**不必下载数据库**。
 */
export function compareWatermarks(
  local: Record<string, number>,
  backup: Record<string, number>,
): WatermarkComparison {
  const newer: string[] = [];
  let older = false;

  for (const [lineage, backupAt] of Object.entries(backup)) {
    const localAt = local[lineage];
    if (localAt === undefined) {
      // 本地根本没有这条谱系 = 备份来自装了更多模块（或更新代码）的一端。
      newer.push(`${lineage}（本地没有这条谱系，备份水位 ${backupAt}）`);
    } else if (backupAt > localAt) {
      newer.push(`${lineage}（备份 ${backupAt} > 本地 ${localAt}）`);
    } else if (backupAt < localAt) {
      older = true;
    }
  }

  for (const lineage of Object.keys(local)) {
    // 本地有而备份没有：备份来自更旧的代码，恢复后跑迁移把表建出来即可。
    if (!(lineage in backup)) older = true;
  }

  // 一条更新一条更旧时以「更新」为准：只要有任何一条向下，就不能恢复。
  if (newer.length > 0) {
    return { verdict: 'backup-newer', reason: `备份比当前代码新：${newer.join('；')}` };
  }
  return { verdict: older ? 'backup-older' : 'equal' };
}
