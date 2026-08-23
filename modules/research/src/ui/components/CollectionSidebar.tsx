import { useState, type FormEvent } from 'react';
import {
  IconAlertCircle,
  IconBookOpen,
  IconDatabase,
  IconFolder,
  IconPlus,
  IconRefreshCw,
  IconTrash,
} from '@workbench/ui';
import type { SystemView } from '../../contract.js';
import type { CollectionView } from '../api.js';

function navClass(active: boolean): string {
  return `flex w-full items-center gap-2 rounded-control border px-2.5 py-2 text-left text-xs transition ${
    active
      ? 'border-accent/20 bg-accent-soft font-semibold text-accent'
      : 'border-transparent text-secondary hover:bg-surface-2 hover:text-ink'
  }`;
}

function CollectionItem({
  collection,
  depth,
  selectedId,
  onSelect,
}: {
  collection: CollectionView;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <button
      type="button"
      className={navClass(selectedId === collection.id)}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      onClick={() => onSelect(collection.id)}
    >
      {collection.kind === 'smart' ? <IconDatabase size={14} /> : <IconFolder size={14} />}
      <span className="truncate">{collection.name}</span>
    </button>
  );
}

export function CollectionSidebar({
  collections,
  selectedId,
  status,
  systemView,
  creating,
  onSelect,
  onStatus,
  onSystemView,
  onCreate,
  onManage,
}: {
  collections: CollectionView[];
  selectedId: string | null;
  status: 'active' | 'trashed';
  systemView: SystemView;
  creating: boolean;
  onSelect: (id: string | null) => void;
  onStatus: (status: 'active' | 'trashed') => void;
  onSystemView: (view: SystemView) => void;
  onCreate: (name: string) => Promise<void>;
  onManage: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
    setAdding(false);
  };

  const byParent = new Map<string | null, CollectionView[]>();
  for (const collection of collections) {
    const values = byParent.get(collection.parentId) ?? [];
    values.push(collection);
    byParent.set(collection.parentId, values);
  }
  const ordered: Array<{ collection: CollectionView; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const collection of byParent.get(parentId) ?? []) {
      ordered.push({ collection, depth });
      visit(collection.id, depth + 1);
    }
  };
  visit(null, 0);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface-2/35">
      <div className="space-y-1 p-3">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          资料库
        </p>
        <button
          type="button"
          className={navClass(systemView === 'all' && status === 'active' && selectedId === null)}
          onClick={() => {
            onStatus('active');
            onSelect(null);
          }}
        >
          <IconBookOpen size={14} />
          全部文献
        </button>
        <button
          type="button"
          className={navClass(systemView === 'uncategorized')}
          onClick={() => onSystemView('uncategorized')}
        >
          <IconFolder size={14} />
          未分类
        </button>
        <button
          type="button"
          className={navClass(systemView === 'missing-files')}
          onClick={() => onSystemView('missing-files')}
        >
          <IconAlertCircle size={14} />
          缺失文件
        </button>
        <button
          type="button"
          className={navClass(systemView === 'metadata-review')}
          onClick={() => onSystemView('metadata-review')}
        >
          <IconRefreshCw size={14} />
          待确认元数据
        </button>
        <button
          type="button"
          className={navClass(systemView === 'duplicate-candidates')}
          onClick={() => onSystemView('duplicate-candidates')}
        >
          <IconDatabase size={14} />
          重复候选
        </button>
        <button
          type="button"
          className={navClass(systemView === 'trash')}
          onClick={() => {
            onStatus('trashed');
            onSelect(null);
          }}
        >
          <IconTrash size={14} />
          回收站
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line/70 p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">目录</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onManage}
              className="text-[10px] font-semibold text-muted hover:text-accent"
            >
              管理
            </button>
            <button
              type="button"
              aria-label="新建目录"
              onClick={() => setAdding(true)}
              className="rounded-control p-1 text-muted transition hover:bg-surface-2 hover:text-accent"
            >
              <IconPlus size={13} />
            </button>
          </div>
        </div>
        <div className="space-y-0.5">
          {ordered.map(({ collection, depth }) => (
            <CollectionItem
              key={collection.id}
              collection={collection}
              depth={depth}
              selectedId={status === 'active' ? selectedId : null}
              onSelect={(id) => {
                onStatus('active');
                onSelect(id);
              }}
            />
          ))}
          {collections.length === 0 && !adding && (
            <p className="px-2 py-3 text-[11px] leading-5 text-muted">还没有目录，可按主题创建。</p>
          )}
        </div>
        {adding && (
          <form onSubmit={submit} className="mt-2 flex gap-1.5 animate-scale-in">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="目录名称"
              className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-control bg-accent px-2 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              添加
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
