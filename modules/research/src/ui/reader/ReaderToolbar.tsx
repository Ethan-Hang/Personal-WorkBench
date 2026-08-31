import { Button, IconChevronLeft, IconChevronRight, IconRefreshCw } from '@workbench/ui';
import type { ReaderLayout } from '../../contract.js';

export function ReaderToolbar({
  layout,
  pageNumber,
  pageCount,
  rotation,
  sidePanelOpen,
  zoom,
  onLayout,
  onPage,
  onRotate,
  onSidePanel,
  onZoom,
}: {
  layout: ReaderLayout;
  pageNumber: number;
  pageCount: number;
  rotation: number;
  sidePanelOpen: boolean;
  zoom: number;
  onLayout: (layout: ReaderLayout) => void;
  onPage: (pageNumber: number) => void;
  onRotate: () => void;
  onSidePanel: () => void;
  onZoom: (zoom: number) => void;
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          aria-label="上一页"
          disabled={pageNumber <= 1}
          onClick={() => onPage(pageNumber - 1)}
        >
          <IconChevronLeft size={14} />
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          <input
            aria-label="页码"
            type="number"
            min={1}
            max={pageCount}
            value={pageNumber}
            onChange={(event) => onPage(Number(event.target.value))}
            className="w-14 rounded-control border border-line bg-surface-2 px-2 py-1 text-center font-mono text-xs text-ink outline-none focus:border-accent"
          />
          <span className="tabular-nums">/ {pageCount || '—'}</span>
        </label>
        <Button
          size="sm"
          aria-label="下一页"
          disabled={pageNumber >= pageCount}
          onClick={() => onPage(pageNumber + 1)}
        >
          <IconChevronRight size={14} />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button size="sm" aria-label="缩小" onClick={() => onZoom(zoom - 0.1)}>
          −
        </Button>
        <span className="w-12 text-center font-mono text-[11px] text-secondary">
          {Math.round(zoom * 100)}%
        </span>
        <Button size="sm" aria-label="放大" onClick={() => onZoom(zoom + 0.1)}>
          +
        </Button>
        <Button size="sm" icon={<IconRefreshCw size={13} />} onClick={onRotate}>
          {rotation}°
        </Button>
        <select
          aria-label="页面布局"
          value={layout}
          onChange={(event) => onLayout(event.target.value as ReaderLayout)}
          className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        >
          <option value="continuous">连续</option>
          <option value="single-page">单页</option>
        </select>
        <Button size="sm" variant={sidePanelOpen ? 'secondary' : 'ghost'} onClick={onSidePanel}>
          目录
        </Button>
      </div>
    </div>
  );
}
