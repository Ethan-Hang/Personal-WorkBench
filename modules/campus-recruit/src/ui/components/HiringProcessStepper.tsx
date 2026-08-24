import type { KeyboardEvent } from 'react';
import { IconCheck, IconClock, IconBriefcase, IconX, useTimezone } from '@workbench/ui';
import type { ApplicationView, RoundView } from '../../contract.js';
import { ROUND_KIND_LABEL } from './StatusChip.js';

interface HiringProcessStepperProps {
  application: ApplicationView;
  onMarkApplied: (id: string) => void;
  /** 传了才让轮次节点可点——步进条本身只负责显示，改哪一轮由上层决定怎么开编辑器 */
  onEditRound?: (roundId: string) => void;
  isBusy: boolean;
}

interface ProcessStep {
  id: string;
  title: string;
  subtitle: string;
  kind: 'apply' | 'round' | 'outcome';
  state: 'completed' | 'current' | 'failed' | 'upcoming';
  badgeText: string;
  badgeTone: 'good' | 'warning' | 'critical' | 'neutral' | 'accent';
  timeText?: string | null;
  /** 只有轮次节点有。投递节点与终局节点不对应任何一条 round 记录 */
  roundId?: string;
}

export function HiringProcessStepper({
  application,
  onMarkApplied,
  onEditRound,
  isBusy,
}: HiringProcessStepperProps) {
  // 时刻一律按设置里的时区渲染。之前这里用不带 timeZone 的 Intl，
  // 换时区界面纹丝不动；appliedAt 那几处更是直接切 UTC 字符串的前 10 位，
  // 本地日的傍晚会显示成前一天
  const { formatUtcShort, formatUtcToLocal } = useTimezone();
  const formatDay = (utcIso: string | null): string =>
    utcIso === null ? '' : formatUtcToLocal(utcIso).date;
  const sortedRounds = [...application.rounds].sort((a, b) => a.sequence - b.sequence);

  // 1. 构建全流程节点列表 (投递 -> 各轮次 -> 终局)
  const steps: ProcessStep[] = [];

  // 节点 1：投递阶段
  const isApplied = application.appliedAt !== null;
  steps.push({
    id: 'step-apply',
    title: '网申投递',
    subtitle: isApplied
      ? `已投递 ${formatDay(application.appliedAt)}`
      : application.applyDeadlineDate
        ? `截止 ${application.applyDeadlineDate}`
        : '待完善简历投递',
    kind: 'apply',
    state: isApplied ? 'completed' : 'current',
    badgeText: isApplied ? '已提交' : '待投递',
    badgeTone: isApplied ? 'good' : 'warning',
    timeText: isApplied
      ? formatDay(application.appliedAt)
      : application.applyDeadlineDate
        ? `截止: ${application.applyDeadlineDate}`
        : null,
  });

  // 中间节点：各个轮次
  let hasFailedInRounds = false;
  sortedRounds.forEach((round: RoundView, index: number) => {
    let state: ProcessStep['state'] = 'upcoming';
    let badgeText = '待进行';
    let badgeTone: ProcessStep['badgeTone'] = 'neutral';

    if (round.outcome === 'passed') {
      state = 'completed';
      badgeText = '已通过';
      badgeTone = 'good';
    } else if (round.outcome === 'failed') {
      state = 'failed';
      badgeText = '未通过';
      badgeTone = 'critical';
      hasFailedInRounds = true;
    } else if (round.outcome === 'completed') {
      // 做完了但还没开奖：流程仍停在这一轮，所以是 current 而不是 completed
      state = 'current';
      badgeText = '已完成 · 待开奖';
      badgeTone = 'warning';
    } else if (round.outcome === 'pending') {
      // 判定是否是当前正在活跃进行的轮次。前面那些轮次「已完成」也算走过去了
      const isCurrentActive =
        isApplied &&
        !hasFailedInRounds &&
        sortedRounds
          .slice(0, index)
          .every((r) => r.outcome === 'passed' || r.outcome === 'completed');

      if (isCurrentActive) {
        state = 'current';
        badgeText = round.scheduledAt ? '已约时间' : '进行中';
        badgeTone = 'accent';
      } else {
        state = 'upcoming';
        badgeText = '待定';
        badgeTone = 'neutral';
      }
    }

    steps.push({
      id: `step-round-${round.id}`,
      roundId: round.id,
      title: round.name,
      subtitle: `${ROUND_KIND_LABEL[round.kind]}${round.format ? ` · ${round.format}` : ''}`,
      kind: 'round',
      state,
      badgeText,
      badgeTone,
      timeText: round.scheduledAt ? formatUtcShort(round.scheduledAt) : null,
    });
  });

  // 终局节点：录取结果
  const isOffer = application.outcome === 'offer' || application.outcome === 'oc';
  const isRejected =
    application.outcome === 'rejected' || application.status.code === 'failed' || hasFailedInRounds;
  const isDeclined = application.outcome === 'declined';

  let finalState: ProcessStep['state'] = 'upcoming';
  let finalTitle = '录用终局';
  let finalSubtitle = '等待所有轮次完成';
  let finalBadge = '待定';
  let finalTone: ProcessStep['badgeTone'] = 'neutral';

  if (isOffer) {
    finalState = 'completed';
    finalTitle = application.outcome === 'offer' ? '正式录用 (Offer)' : '口头录用 (OC)';
    finalSubtitle = application.salary ? `待遇: ${application.salary}` : '已获录用意向';
    finalBadge = '已通关';
    finalTone = 'good';
  } else if (isRejected) {
    finalState = 'failed';
    finalTitle = '流程终止';
    finalSubtitle = application.status.failedRoundName
      ? `止步于：${application.status.failedRoundName}`
      : '未通过筛选或面试';
    finalBadge = '已结束';
    finalTone = 'critical';
  } else if (isDeclined) {
    finalState = 'failed';
    finalTitle = '主动放弃';
    finalSubtitle = '已婉拒该机会';
    finalBadge = '已放弃';
    finalTone = 'neutral';
  } else {
    // 还在流程中
    if (isApplied && sortedRounds.length > 0 && sortedRounds.every((r) => r.outcome === 'passed')) {
      finalState = 'current';
      finalBadge = '开奖中';
      finalTone = 'accent';
      finalSubtitle = '所有轮次已通过，等待开奖';
    }
  }

  steps.push({
    id: 'step-outcome',
    title: finalTitle,
    subtitle: finalSubtitle,
    kind: 'outcome',
    state: finalState,
    badgeText: finalBadge,
    badgeTone: finalTone,
    timeText: application.outcomeAt ? formatDay(application.outcomeAt) : null,
  });

  // 计算当前总进度百分比
  const completedCount = steps.filter((s) => s.state === 'completed').length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="rounded-lg border border-line bg-surface p-3.5 space-y-3 shadow-2xs animate-item-enter">
      {/* 流程顶栏：推进概述与阶段状态 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded bg-surface-2 text-ink">
            <IconBriefcase size={12} />
          </span>
          <h4 className="text-[12px] font-bold text-ink">招聘推进流程</h4>
          {isOffer && (
            <span className="rounded bg-good-soft px-1.5 py-0.2 text-[10px] font-bold text-good animate-item-enter">
              已获得录用
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-muted">
            流转节点: <strong className="text-ink font-mono">{completedCount}</strong> /{' '}
            {steps.length}
          </span>
          <span className="rounded bg-surface-2 px-1.5 py-0.2 font-bold font-mono text-[10px] text-secondary">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* 动态自适应伸缩流转步骤条 (Fluid Dynamic Workflow Stepper) */}
      <div className="overflow-x-auto pb-1.5 pt-0.5">
        <ol className="flex w-full min-w-[620px] items-center justify-between">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            const editableRoundId =
              step.roundId !== undefined && onEditRound !== undefined ? step.roundId : null;

            // 节点样式判定
            let nodeBg = 'bg-surface border-line text-muted';
            let circleBg = 'bg-surface-2 text-secondary border-line';
            let titleColor = 'text-muted';

            if (step.state === 'completed') {
              nodeBg = 'bg-good-soft/20 border-good/40';
              circleBg = 'bg-good text-white border-good shadow-2xs';
              titleColor = 'text-ink font-bold';
            } else if (step.state === 'current') {
              nodeBg = 'bg-accent/10 border-accent/60 ring-1 ring-accent/30';
              circleBg = 'bg-accent text-white border-accent shadow-xs';
              titleColor = 'text-accent font-extrabold';
            } else if (step.state === 'failed') {
              nodeBg = 'bg-critical-soft/30 border-critical/40';
              circleBg = 'bg-critical text-white border-critical shadow-2xs';
              titleColor = 'text-critical font-bold';
            }

            const lineColor =
              step.state === 'completed'
                ? 'bg-good'
                : step.state === 'failed'
                  ? 'bg-critical/60'
                  : 'bg-line';

            return (
              <li
                key={step.id}
                className={`flex items-center min-w-0 ${isLast ? 'shrink-0' : 'flex-1'}`}
              >
                {/* 流程卡片。轮次节点可点开就地编辑——投递与终局节点不对应 round，保持静态 */}
                <div
                  {...(editableRoundId === null
                    ? {}
                    : {
                        role: 'button',
                        tabIndex: 0,
                        title: '点击编辑这一轮',
                        onClick: () => onEditRound?.(editableRoundId),
                        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onEditRound?.(editableRoundId);
                          }
                        },
                      })}
                  className={`flex flex-col shrink-0 rounded-md border px-3 py-2 min-w-[130px] sm:min-w-[145px] transition-all shadow-2xs ${nodeBg} ${
                    editableRoundId === null
                      ? ''
                      : 'cursor-pointer hover:border-accent hover:shadow-xs'
                  }`}
                >
                  {/* 节点顶行：序号徽标 + 状态药丸 */}
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span
                      className={`flex size-4 items-center justify-center rounded-full text-[9px] font-bold border shrink-0 ${circleBg}`}
                    >
                      {step.state === 'completed' ? (
                        <IconCheck size={10} strokeWidth={3} />
                      ) : step.state === 'failed' ? (
                        <IconX size={10} strokeWidth={3} />
                      ) : (
                        idx + 1
                      )}
                    </span>

                    <span
                      className={`rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                        step.badgeTone === 'good'
                          ? 'bg-good-soft text-good'
                          : step.badgeTone === 'critical'
                            ? 'bg-critical-soft text-critical'
                            : step.badgeTone === 'accent'
                              ? 'bg-accent text-white'
                              : step.badgeTone === 'warning'
                                ? 'bg-warning-soft text-warning'
                                : 'bg-surface-2 text-muted'
                      }`}
                    >
                      {step.badgeText}
                    </span>
                  </div>

                  {/* 阶段标题与副标题 */}
                  <div className="min-w-0">
                    <p className={`text-[12px] truncate ${titleColor}`}>{step.title}</p>
                    <p className="text-[10px] text-secondary truncate mt-0.5">{step.subtitle}</p>
                  </div>

                  {/* 节点时间标记 */}
                  {step.timeText && (
                    <div className="mt-1.5 flex items-center gap-1 border-t border-line/40 pt-1 text-[10px] font-medium text-secondary">
                      <IconClock size={10} className="shrink-0 text-muted" />
                      <span className="truncate">{step.timeText}</span>
                    </div>
                  )}

                  {/* 如果是未投递节点，提供一键快捷操作 */}
                  {step.id === 'step-apply' && step.state === 'current' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onMarkApplied(application.id)}
                      className="mt-1.5 w-full rounded bg-accent py-0.5 text-[10px] font-bold text-white shadow-2xs hover:bg-accent/90 transition-all"
                    >
                      标已投
                    </button>
                  )}
                </div>

                {/* 动态伸缩连接线 (Dynamic Fluid Line) */}
                {!isLast && (
                  <div className="flex-1 mx-2 sm:mx-3 h-0.5 min-w-3 flex items-center">
                    <div
                      className={`h-0.5 w-full rounded-full transition-colors duration-300 ${lineColor}`}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
