import type { EvidenceSourceState } from '../../contract.js';

const SOURCE_STATE: Record<
  EvidenceSourceState,
  { label: string; description: string; className: string }
> = {
  current: {
    label: '来源正常',
    description: '证据仍对应创建时的批注和文件。',
    className: 'border-accent/30 bg-accent/10 text-accent',
  },
  'annotation-revised': {
    label: '批注已修订',
    description: '原批注内容发生变化，证据保留创建时快照。',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  'annotation-deleted': {
    label: '批注已删除',
    description: '原批注已进入回收状态，证据内容仍可查看。',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  'asset-mismatch': {
    label: '文件已变化',
    description: '当前文件与证据记录的内容 hash 不一致。',
    className: 'border-critical/30 bg-critical/10 text-critical',
  },
  'source-unavailable': {
    label: '来源不可用',
    description: '当前无法定位原文件或关联版本。',
    className: 'border-critical/30 bg-critical/10 text-critical',
  },
};

export function SourceStatus({
  state,
  compact = false,
}: {
  state: EvidenceSourceState;
  compact?: boolean;
}) {
  const status = SOURCE_STATE[state];
  return (
    <span
      title={status.description}
      className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold ${status.className}`}
    >
      {compact ? status.label.replace('来源', '') : status.label}
    </span>
  );
}

export function sourceStateDescription(state: EvidenceSourceState) {
  return SOURCE_STATE[state].description;
}
