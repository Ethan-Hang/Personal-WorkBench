import { Button } from '@workbench/ui';
import type { ReaderTab } from './reader-tabs.js';

export function ReaderTabs({
  activeAssetId,
  tabs,
  onActivate,
  onClose,
}: {
  activeAssetId: string;
  tabs: readonly ReaderTab[];
  onActivate: (assetId: string) => void;
  onClose: (assetId: string) => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-line bg-surface [scrollbar-width:thin]">
      {tabs.map((tab) => {
        const active = tab.assetId === activeAssetId;
        return (
          <div
            key={tab.assetId}
            className={`group flex min-w-40 max-w-64 items-center border-r border-line pl-3 ${
              active ? 'border-t-2 border-t-accent bg-surface-2' : 'border-t-2 border-t-transparent'
            }`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 py-2 text-left"
              onClick={() => onActivate(tab.assetId)}
            >
              <span
                className={`block truncate text-xs ${active ? 'font-bold text-ink' : 'text-secondary'}`}
              >
                {tab.title}
              </span>
              {tab.sleeping && <span className="block text-[9px] text-muted">已休眠</span>}
            </button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`关闭 ${tab.title}`}
              className="mr-1 opacity-60 group-hover:opacity-100"
              onClick={() => onClose(tab.assetId)}
            >
              ×
            </Button>
          </div>
        );
      })}
    </div>
  );
}
