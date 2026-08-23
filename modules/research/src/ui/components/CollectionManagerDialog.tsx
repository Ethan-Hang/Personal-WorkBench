import { useEffect, useMemo, useState } from 'react';
import { Button, Field, IconFolder, IconPlus, Modal, controlClass } from '@workbench/ui';
import type { UpdateCollectionInput } from '../../contract.js';
import type { CollectionDeletionPreview, CollectionView } from '../api.js';

function depthById(collections: CollectionView[]): Map<string, number> {
  const result = new Map<string, number>();
  const visit = (parentId: string | null, depth: number) => {
    for (const collection of collections.filter((value) => value.parentId === parentId)) {
      result.set(collection.id, depth);
      visit(collection.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function CollectionManagerDialog({
  open,
  collections,
  onClose,
  onCreate,
  onUpdate,
  onPreviewDelete,
  onDelete,
}: {
  open: boolean;
  collections: CollectionView[];
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onUpdate: (id: string, input: UpdateCollectionInput) => Promise<void>;
  onPreviewDelete: (id: string) => Promise<CollectionDeletionPreview>;
  onDelete: (id: string, strategy: 'parent' | 'unclassified') => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CollectionDeletionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const depths = useMemo(() => depthById(collections), [collections]);
  const selected = collections.find((collection) => collection.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setParentId(selected.parentId);
    setSortOrder(selected.sortOrder);
    setPreview(null);
    setError(null);
  }, [selected]);

  useEffect(() => {
    if (open) return;
    setSelectedId(null);
    setNewName('');
    setNewParentId(null);
    setPreview(null);
    setError(null);
  }, [open]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '目录操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="管理目录"
      description="目录可以任意嵌套、移动和排序。删除目录只改变归属，不会删除作品或附件。"
      maxWidth="max-w-4xl"
    >
      <div className="grid min-h-[430px] gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-panel border border-line bg-surface-2/35 p-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">目录树</h3>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {collections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => setSelectedId(collection.id)}
                className={`flex w-full items-center gap-2 rounded-control py-2 pr-2 text-left text-xs transition ${
                  selectedId === collection.id
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-secondary hover:bg-surface hover:text-ink'
                }`}
                style={{ paddingLeft: `${10 + (depths.get(collection.id) ?? 0) * 14}px` }}
              >
                <IconFolder size={13} />
                <span className="truncate">{collection.name}</span>
              </button>
            ))}
            {collections.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">暂无目录</p>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <Field label="新目录名称">
              <input
                className={controlClass}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </Field>
            <Field label="父目录" className="mt-3">
              <select
                className={controlClass}
                value={newParentId ?? ''}
                onChange={(event) => setNewParentId(event.target.value || null)}
              >
                <option value="">根目录</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {'　'.repeat(depths.get(collection.id) ?? 0)}
                    {collection.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              className="mt-3 w-full"
              icon={<IconPlus size={12} />}
              disabled={busy || !newName.trim()}
              onClick={() =>
                void run(async () => {
                  await onCreate(newName.trim(), newParentId);
                  setNewName('');
                })
              }
            >
              创建目录
            </Button>
          </div>
        </aside>

        <main>
          {!selected ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <IconFolder size={28} className="text-muted" />
              <p className="mt-3 text-sm font-semibold text-ink">选择一个目录进行编辑</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="目录名称">
                  <input
                    className={controlClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label="排序位置">
                  <input
                    className={controlClass}
                    type="number"
                    min={0}
                    value={sortOrder}
                    onChange={(event) => setSortOrder(Number(event.target.value))}
                  />
                </Field>
                <Field label="父目录" className="sm:col-span-2">
                  <select
                    className={controlClass}
                    value={parentId ?? ''}
                    onChange={(event) => setParentId(event.target.value || null)}
                  >
                    <option value="">根目录</option>
                    {collections
                      .filter((collection) => collection.id !== selected.id)
                      .map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {'　'.repeat(depths.get(collection.id) ?? 0)}
                          {collection.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Button
                variant="primary"
                disabled={busy || !name.trim()}
                onClick={() =>
                  void run(() =>
                    onUpdate(selected.id, {
                      name: name.trim(),
                      parentId,
                      sortOrder,
                    }),
                  )
                }
              >
                保存移动与排序
              </Button>

              <section className="border-t border-line pt-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  删除目录
                </h3>
                {!preview ? (
                  <Button
                    className="mt-3"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => setPreview(await onPreviewDelete(selected.id)))
                    }
                  >
                    查看删除影响
                  </Button>
                ) : (
                  <div className="mt-3 rounded-control border border-warning/25 bg-warning-soft/45 p-4">
                    <p className="text-xs leading-5 text-secondary">
                      这个目录有 {preview.childCount} 个直接子目录、{preview.directWorkCount}{' '}
                      个直接作品归属。
                    </p>
                    {preview.parentStrategyNameConflicts.length > 0 && (
                      <p className="mt-2 text-xs text-critical">
                        移到父级会重名：{preview.parentStrategyNameConflicts.join('、')}
                      </p>
                    )}
                    {preview.unclassifiedStrategyNameConflicts.length > 0 && (
                      <p className="mt-2 text-xs text-critical">
                        移到根目录会重名：{preview.unclassifiedStrategyNameConflicts.join('、')}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={busy || preview.parentStrategyNameConflicts.length > 0}
                        onClick={() =>
                          void run(async () => {
                            await onDelete(selected.id, 'parent');
                            setSelectedId(null);
                            setPreview(null);
                          })
                        }
                      >
                        子目录和条目移到父级
                      </Button>
                      <Button
                        disabled={busy || preview.unclassifiedStrategyNameConflicts.length > 0}
                        onClick={() =>
                          void run(async () => {
                            await onDelete(selected.id, 'unclassified');
                            setSelectedId(null);
                            setPreview(null);
                          })
                        }
                      >
                        子目录移到根，条目变未分类
                      </Button>
                      <Button onClick={() => setPreview(null)}>取消</Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-control bg-critical-soft p-3 text-xs text-critical">
              {error}
            </p>
          )}
        </main>
      </div>
    </Modal>
  );
}
