import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, PageHeader, Panel, ProgressBar } from '@workbench/ui';
import type { RoundKind, StatsResponse } from '../contract.js';
import { fetchSeasons, fetchStats } from './api.js';
import { pickInitialSeason, readStoredSeasonId } from './useCurrentSeason.js';

const STATS_KEY = ['campus', 'stats'] as const;
const SEASONS_KEY = ['campus', 'seasons'] as const;

const KIND_LABEL: Record<RoundKind, string> = {
  screening: '简历初筛',
  assessment: '测评',
  written: '笔试',
  technical: '技术面',
  hr: 'HR 面',
  other: '其他',
};

function formatRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function FunnelStage({ label, count }: { label: string; count: number }) {
  return (
    <div className="min-w-0 rounded-control border border-line bg-surface px-3 py-3 sm:text-center shadow-2xs hover-lift transition-all animate-item-enter">
      <p className="text-[11px] font-bold tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums text-ink">
        {count}
      </p>
    </div>
  );
}

function FunnelLink({ label, rate }: { label: string; rate: number | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-1 sm:w-[72px] sm:shrink-0 sm:flex-col sm:gap-1 sm:py-0 animate-fade-in">
      <span aria-hidden="true" className="text-lg leading-none text-accent sm:rotate-0">
        <span className="sm:hidden">↓</span>
        <span className="hidden sm:inline">→</span>
      </span>
      <div>
        <p className="text-[11px] font-semibold text-secondary sm:text-center">{label}</p>
        <p className="text-[13px] font-bold tabular-nums text-accent sm:text-center">
          {formatRate(rate)}
        </p>
      </div>
    </div>
  );
}

function CountLedger({ stats }: { stats: StatsResponse }) {
  const counts = [
    ['投递总数', stats.total],
    ['待投递', stats.pending],
    ['已投递', stats.applied],
    ['笔试测评', stats.assessment],
    ['技术面', stats.technical],
    ['HR 面', stats.hr],
    ['OC + Offer', stats.offers],
    ['已挂', stats.failed],
    ['泡池子', stats.shelved],
  ] as const;

  return (
    <dl className="grid overflow-hidden rounded-control border border-line sm:grid-cols-3">
      {counts.map(([label, count]) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-line px-3 py-3 last:border-b-0 sm:block sm:border-r sm:last:border-r-0 [&:nth-child(3n)]:sm:border-r-0 [&:nth-last-child(-n+3)]:sm:border-b-0 transition-colors hover:bg-surface-2/50"
        >
          <dt className="text-[12px] font-semibold text-secondary">{label}</dt>
          <dd className="mt-0 text-xl font-semibold tracking-[-0.035em] tabular-nums sm:mt-1">
            {count}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FailureDistribution({ stats }: { stats: StatsResponse }) {
  const failedRoundCount = stats.failedByKind.reduce((total, item) => total + item.count, 0);

  if (failedRoundCount === 0) {
    return <p className="text-[13px] text-muted">还没有失败轮次数据。</p>;
  }

  return (
    <ul className="space-y-3.5" aria-label="失败轮次分布">
      {stats.failedByKind.map(({ kind, count }, index) => {
        const proportion = (count / failedRoundCount) * 100;
        return (
          <li
            key={kind}
            style={{ animationDelay: `${index * 70}ms` }}
            className="animate-slide-left-in"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-ink">{KIND_LABEL[kind]}</span>
              <span className="shrink-0 tabular-nums text-secondary font-medium">
                {count} 次 · {proportion.toFixed(1)}%
              </span>
            </div>
            <ProgressBar value={count} max={failedRoundCount} tone="critical" size="md" />
          </li>
        );
      })}
    </ul>
  );
}

function Statistics({ stats }: { stats: StatsResponse }) {
  return (
    <div className="space-y-5">
      <Panel
        className="hover-lift animate-slide-left-in"
        title="转化路径"
        hint="从投递到 Offer，查看下一步该补哪一环"
      >
        <ol
          className="flex flex-col gap-1 sm:flex-row sm:items-stretch sm:gap-2"
          aria-label="秋招转化路径"
        >
          <li className="min-w-0 flex-1">
            <FunnelStage label="投递" count={stats.applied} />
          </li>
          <li>
            <FunnelLink label="投递 → 笔试测评" rate={stats.rates.applicationToAssessment} />
          </li>
          <li className="min-w-0 flex-1">
            <FunnelStage label="笔试测评" count={stats.assessment} />
          </li>
          <li>
            <FunnelLink label="投递 → 技术面" rate={stats.rates.applicationToTechnical} />
          </li>
          <li className="min-w-0 flex-1">
            <FunnelStage label="技术面" count={stats.technical} />
          </li>
          <li>
            <FunnelLink label="技术面 → Offer" rate={stats.rates.technicalToOffer} />
          </li>
          <li className="min-w-0 flex-1">
            <FunnelStage label="OC + Offer" count={stats.offers} />
          </li>
        </ol>
      </Panel>

      <Panel
        className="hover-lift animate-slide-up-in"
        title="状态账本"
        hint="当前投递在各阶段的数量"
      >
        <CountLedger stats={stats} />
      </Panel>

      <Panel
        className="hover-lift animate-slide-left-in"
        title="挂点分布"
        hint="按失败轮次，而不是按公司计数"
      >
        <FailureDistribution stats={stats} />
      </Panel>
    </div>
  );
}

export function StatsPage() {
  const seasonsQuery = useQuery({ queryKey: SEASONS_KEY, queryFn: fetchSeasons });
  const seasons = useMemo(() => seasonsQuery.data?.seasons ?? [], [seasonsQuery.data]);
  // 与投递页读同一份 localStorage：两个页面对「当前是哪一季」必须一致
  const currentSeason = useMemo(() => pickInitialSeason(seasons, readStoredSeasonId()), [seasons]);

  const statsQuery = useQuery({
    queryKey: [...STATS_KEY, currentSeason?.id ?? null],
    // 统计页恒传季：秋招与社招混算转化率没有意义
    queryFn: () => fetchStats(currentSeason?.id),
    enabled: currentSeason !== null,
  });

  if (statsQuery.isPending) {
    return (
      <div className="space-y-4 animate-slide-down-in">
        <PageHeader eyebrow="招聘管理" title="转化统计" />
        <p role="status" className="text-[13px] text-muted">
          正在汇总你的投递进展…
        </p>
      </div>
    );
  }

  if (statsQuery.isError) {
    return (
      <div className="space-y-4 animate-slide-down-in">
        <PageHeader eyebrow="招聘管理" title="转化统计" />
        <Panel>
          <p className="text-[13px] text-critical">统计数据加载失败：{statsQuery.error.message}</p>
          <Button type="button" className="mt-3" onClick={() => void statsQuery.refetch()}>
            重新加载
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-down-in">
      {/* 标题必须带季名：不带的话没人说得清屏幕上这些数字是哪一季的 */}
      <PageHeader
        eyebrow="招聘管理"
        title={currentSeason === null ? '转化统计' : `转化统计 · ${currentSeason.name}`}
      />
      <Statistics stats={statsQuery.data} />
    </div>
  );
}
