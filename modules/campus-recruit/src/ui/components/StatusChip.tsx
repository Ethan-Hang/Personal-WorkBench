import { Chip } from '@workbench/ui';
import type { ApplicationStatusCode, RoundKind, RoundOutcome } from '../../contract.js';
import { ROUND_KIND_LABEL } from '../utils/roundNaming.js';

// 标签本体移到 utils/roundNaming.ts——那里同时住着「类型 → 名称」的自动填充规则，
// 而 .ts 才进 Vitest 的收集范围（.tsx 不进），规则得有测试护着。
export { ROUND_KIND_LABEL };

export const STATUS_TONE: Record<
  ApplicationStatusCode,
  'neutral' | 'good' | 'warning' | 'critical'
> = {
  offer: 'good',
  oc: 'good',
  declined: 'neutral',
  failed: 'critical',
  pending: 'warning',
  shelved: 'neutral',
  applied: 'neutral',
  in_progress: 'warning',
};

export const ROUND_OUTCOME_LABEL: Record<RoundOutcome, string> = {
  pending: '待定',
  // 中间态：做完了但还没开奖。不是「通过」的委婉说法
  completed: '已完成',
  passed: '通过',
  failed: '未通过',
};

export const ROUND_OUTCOME_TONE: Record<RoundOutcome, 'neutral' | 'good' | 'warning' | 'critical'> =
  {
    pending: 'neutral',
    completed: 'warning',
    passed: 'good',
    failed: 'critical',
  };

export function ApplicationStatusChip({
  status,
}: {
  status: { code: ApplicationStatusCode; label: string; failedRoundName?: string | null };
}) {
  const tone = STATUS_TONE[status.code];
  return (
    <Chip tone={tone}>
      {status.label}
      {status.failedRoundName ? ` · ${status.failedRoundName}` : ''}
    </Chip>
  );
}

export function RoundOutcomeChip({ outcome }: { outcome: RoundOutcome }) {
  return <Chip tone={ROUND_OUTCOME_TONE[outcome]}>{ROUND_OUTCOME_LABEL[outcome]}</Chip>;
}

export function RoundKindChip({ kind }: { kind: RoundKind }) {
  return <Chip tone="neutral">{ROUND_KIND_LABEL[kind]}</Chip>;
}
