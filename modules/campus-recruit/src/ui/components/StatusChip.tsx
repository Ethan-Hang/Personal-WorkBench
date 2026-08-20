import { Chip } from '@workbench/ui';
import type { ApplicationStatusCode, RoundKind, RoundOutcome } from '../../contract.js';

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

export const ROUND_KIND_LABEL: Record<RoundKind, string> = {
  screening: '简历初筛',
  assessment: '测评',
  written: '笔试',
  technical: '专业面',
  hr: 'HR面',
  other: '其他',
};

export const ROUND_OUTCOME_LABEL: Record<RoundOutcome, string> = {
  pending: '待定',
  passed: '通过',
  failed: '未通过',
};

export const ROUND_OUTCOME_TONE: Record<RoundOutcome, 'neutral' | 'good' | 'critical'> = {
  pending: 'neutral',
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
