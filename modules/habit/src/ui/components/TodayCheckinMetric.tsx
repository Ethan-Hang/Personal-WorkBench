import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricTile, useTimezone } from '@workbench/ui';
import { fetchToday } from '../api.js';

/**
 * 「今日打卡」一格指标，供别的模块的仪表盘经 ui 的插槽注册表接入。
 *
 * 它自给自足：自己算本地今日、自己取数、自己处理加载与失败，因此消费方
 * 只需要把它塞进插槽，不需要知道习惯模块有哪些接口——两个模块之间仍然零依赖。
 *
 * 分母是**今天该打的**（`dueToday`），不是习惯总数：一周三次的习惯在不该打的
 * 那几天不该压低今日执行度。
 */
export function TodayCheckinMetric() {
  const { formatUtcToLocal } = useTimezone();
  const clientToday = useMemo(
    () => formatUtcToLocal(new Date().toISOString()).date || new Date().toISOString().slice(0, 10),
    [formatUtcToLocal],
  );

  const todayQuery = useQuery({
    queryKey: ['habit', 'today', clientToday],
    queryFn: () => fetchToday(clientToday),
  });

  const value = useMemo(() => {
    if (todayQuery.isPending) return '…';
    if (todayQuery.isError || !todayQuery.data) return '—';
    const due = todayQuery.data.habits.filter((h) => h.dueToday);
    const done = due.filter((h) => h.progress.current >= h.progress.target);
    return `${done.length}/${due.length}`;
  }, [todayQuery.isPending, todayQuery.isError, todayQuery.data]);

  return <MetricTile label="习惯打卡" value={value} />;
}
