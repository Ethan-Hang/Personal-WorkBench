export interface ReaderOutlineItem {
  title: string;
  depth: number;
  pageNumber: number | null;
}

export function ReaderSidePanel({
  outline,
  pageCount,
  onPage,
}: {
  outline: ReaderOutlineItem[];
  pageCount: number;
  onPage: (pageNumber: number) => void;
}) {
  return (
    <aside className="h-full w-[min(18rem,calc(100vw-1rem))] shrink-0 overflow-y-auto border-l border-line bg-surface px-4 py-4">
      <div className="border-b border-line pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">文档导航</p>
        <p className="mt-1 text-xs text-secondary">{pageCount} 页</p>
      </div>
      <nav className="mt-3 space-y-0.5" aria-label="PDF 目录">
        {outline.map((item, index) => (
          <button
            key={`${item.title}-${index}`}
            type="button"
            disabled={item.pageNumber === null}
            onClick={() => item.pageNumber !== null && onPage(item.pageNumber)}
            className="flex w-full items-start justify-between gap-2 border-l border-transparent py-1.5 pr-1 text-left text-xs text-secondary transition hover:border-accent hover:text-ink disabled:cursor-default disabled:opacity-60"
            style={{ paddingLeft: `${8 + item.depth * 14}px` }}
          >
            <span className="min-w-0 break-words leading-5">{item.title || '未命名章节'}</span>
            {item.pageNumber !== null && (
              <span className="shrink-0 font-mono text-[10px] text-muted">{item.pageNumber}</span>
            )}
          </button>
        ))}
        {outline.length === 0 && (
          <p className="py-6 text-center text-xs leading-5 text-muted">这份 PDF 没有内嵌目录。</p>
        )}
      </nav>
    </aside>
  );
}
