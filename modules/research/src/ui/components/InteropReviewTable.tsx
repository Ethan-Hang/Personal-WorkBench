import { Button, Chip, IconChevronLeft, IconChevronRight } from '@workbench/ui';
import type { InteropRecordsPage } from '../api.js';

const statusLabel = {
  valid: '待决定',
  invalid: '无效',
  'needs-review': '需审查',
  accepted: '已接受',
  skipped: '已跳过',
  committed: '已提交',
  failed: '失败',
} as const;

function tone(status: keyof typeof statusLabel) {
  if (status === 'accepted' || status === 'committed') return 'good' as const;
  if (status === 'invalid' || status === 'failed') return 'critical' as const;
  if (status === 'needs-review') return 'warning' as const;
  return 'neutral' as const;
}

export function InteropReviewTable({
  page,
  selectedId,
  onSelect,
  onPage,
}: {
  page: InteropRecordsPage | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPage: (offset: number) => void;
}) {
  if (!page) {
    return <p className="px-4 py-8 text-center text-xs text-muted">解析完成后显示记录</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {page.items.map((record) => (
          <button
            key={record.id}
            type="button"
            onClick={() => onSelect(record.id)}
            className={`block w-full border-b border-line px-4 py-3 text-left transition duration-150 ${
              selectedId === record.id
                ? 'border-l-2 border-l-accent bg-accent-soft/45 pl-[14px]'
                : 'border-l-2 border-l-transparent hover:bg-surface-2/55'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                {record.summary || `记录 ${record.ordinal + 1}`}
              </span>
              <Chip tone={tone(record.status)}>{statusLabel[record.status]}</Chip>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted">
              <span className="truncate font-mono">{record.sourceKey ?? '无来源 key'}</span>
              <span>{record.diagnostics.length} 条提示</span>
            </div>
          </button>
        ))}
        {page.items.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-muted">当前页没有记录</p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2">
        <span className="text-[11px] tabular-nums text-muted">
          {page.total === 0 ? 0 : page.offset + 1}–
          {Math.min(page.offset + page.items.length, page.total)} / {page.total}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            aria-label="上一页"
            disabled={page.offset === 0}
            onClick={() => onPage(Math.max(0, page.offset - page.limit))}
          >
            <IconChevronLeft size={13} />
          </Button>
          <Button
            size="sm"
            aria-label="下一页"
            disabled={page.nextOffset === null}
            onClick={() => page.nextOffset !== null && onPage(page.nextOffset)}
          >
            <IconChevronRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}
