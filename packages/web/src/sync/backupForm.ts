/**
 * 备份配置表单的共享校验。
 *
 * `BackupPanel`（WebDAV）与 `LocalBackupPanel`（本地目录）是逐行同形的两个面板，
 * 保留份数的解析此前在两处各写一遍，且都写成：
 *
 * ```ts
 * retentionCount: Number(formRetention) || 10   // BackupPanel
 * retentionCount: Number(formRetention) || 5    // LocalBackupPanel
 * ```
 *
 * 这行有一个真缺陷：`||` 判的是 falsy，而 **`0` 与 `NaN` 都是 falsy**。
 * 于是用户输入 `0` 或 `abc` 时，请求里带出去的是默认值，界面还弹「已保存」——
 * 用户以为自己设成了 0，实际存的是 10。服务端 schema 是
 * `z.number().int().min(1).max(100)`，它本来会拒绝，**但那个值根本没被发出去**。
 *
 * 收敛后：留空才回退默认值（那是唯一一种「我没填，你看着办」的情形），
 * 其余非法输入一律报错并显示出来。边界与服务端 schema 对齐，
 * 用户不必等一个 400 才知道填错。
 */

/** 与 `packages/sync/src/contract.ts` 的 `z.number().int().min(1).max(100)` 对齐。 */
export const RETENTION_MIN = 1;
export const RETENTION_MAX = 100;

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * 解析保留份数。
 *
 * @param raw 表单里的原始值（受控 input 可能给字符串，也可能给 number）
 * @param fallback 留空时采用的默认值（WebDAV 面板 10，本地面板 5）
 */
export function parseRetentionCount(raw: string | number, fallback: number): ParseResult {
  const text = String(raw).trim();

  // 留空 = 「我没填」，用默认值。这是唯一该回退的情形。
  if (text === '') return { ok: true, value: fallback };

  const value = Number(text);
  const invalid = `保留份数须为 ${RETENTION_MIN} 到 ${RETENTION_MAX} 之间的整数`;

  if (!Number.isInteger(value)) return { ok: false, error: invalid };
  if (value < RETENTION_MIN || value > RETENTION_MAX) return { ok: false, error: invalid };

  return { ok: true, value };
}
