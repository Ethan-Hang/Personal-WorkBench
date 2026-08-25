import type { ReactNode } from 'react';

/**
 * 深色仪表盘上的一格指标。
 *
 * 之所以放在共享基座而不是某个模块里：它同时被仪表盘的拥有者与
 * 经插槽贡献进来的外部模块使用，两边必须长得一模一样，
 * 否则一眼就能看出哪一格是「别人塞进来的」。
 */
export function MetricTile({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-control bg-white/5 p-2 backdrop-blur-xs border border-white/5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-xs font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}
