import { EmptyState, IconBookOpen } from '@workbench/ui';
import type { WorksPage } from '../api.js';
import { FileStatus, StorageModes } from './FileStatus.js';

export function LibraryList({
  works,
  selectedId,
  loading,
  onSelect,
  onImport,
}: {
  works: WorksPage['works'];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onImport: () => void;
}) {
  if (loading) {
    return (
      <div className="divide-y divide-line/70" aria-label="正在加载文献">
        {[0, 1, 2].map((value) => (
          <div key={value} className="px-5 py-5 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-surface-2" />
            <div className="mt-3 h-3 w-1/3 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }
  if (works.length === 0) {
    return (
      <EmptyState
        icon={IconBookOpen}
        title="这里还没有论文"
        description="导入 PDF 后，作品、版本、文件位置和元数据来源会一起进入资料库。"
        action={
          <button type="button" onClick={onImport} className="text-xs font-semibold text-accent">
            导入第一篇
          </button>
        }
        className="m-5 min-h-72 border-0 bg-transparent"
      />
    );
  }
  return (
    <div className="divide-y divide-line/70">
      {works.map((work) => {
        const selected = selectedId === work.id;
        return (
          <button
            key={work.id}
            type="button"
            onClick={() => onSelect(work.id)}
            className={`group w-full px-5 py-4 text-left transition-all duration-200 ${
              selected
                ? 'bg-accent-soft/80 shadow-[inset_3px_0_0_var(--color-accent)]'
                : 'hover:bg-surface-2/55'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                  {work.title || '未命名作品'}
                </h3>
                <p className="mt-1 truncate text-xs text-secondary">
                  {work.authors.length > 0 ? work.authors.join('、') : '作者待补充'}
                  {work.year !== null ? ` · ${work.year}` : ''}
                </p>
              </div>
              <FileStatus status={work.fileStatus} compact />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <StorageModes modes={work.storageModes} />
              <span className="text-[11px] tabular-nums text-muted">
                {work.attachmentCount} 个附件
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
