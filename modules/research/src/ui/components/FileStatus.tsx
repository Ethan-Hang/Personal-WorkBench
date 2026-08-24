import { Chip, IconAlertCircle, IconCheck, IconClock } from '@workbench/ui';

const LABELS = {
  none: '无附件',
  available: '文件可用',
  missing: '文件缺失',
  changed: '内容已变化',
  recycled: '附件已移除',
  mixed: '状态混合',
} as const;

export function FileStatus({
  status,
  compact = false,
}: {
  status: keyof typeof LABELS;
  compact?: boolean;
}) {
  const tone =
    status === 'available'
      ? 'good'
      : status === 'missing' || status === 'changed'
        ? 'critical'
        : status === 'mixed'
          ? 'warning'
          : 'neutral';
  const Icon =
    status === 'available'
      ? IconCheck
      : status === 'missing' || status === 'changed'
        ? IconAlertCircle
        : IconClock;
  return (
    <Chip tone={tone} icon={<Icon size={11} />} className={compact ? 'px-1.5' : ''}>
      {LABELS[status]}
    </Chip>
  );
}

export function StorageModes({ modes }: { modes: Array<'managed' | 'linked'> }) {
  if (modes.length === 0) return null;
  return (
    <span className="text-[11px] text-muted">
      {modes.map((mode) => (mode === 'managed' ? '托管' : '链接')).join(' + ')}
    </span>
  );
}
