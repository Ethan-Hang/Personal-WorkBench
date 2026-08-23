import { useEffect, useState } from 'react';
import { Button, Field, IconPlus, IconTag, Modal, controlClass } from '@workbench/ui';
import type { CreateTagInput, MergeTagsInput, UpdateTagInput } from '../../contract.js';
import type { MergeRecordView, TagCandidates, TagDeletionPreview, TagView } from '../api.js';

function aliasesFrom(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，\n]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

export function TagManagerDialog({
  open,
  tags,
  onClose,
  onCreate,
  onUpdate,
  onCandidates,
  onPreviewDelete,
  onTrash,
  onRestore,
  onPermanentDelete,
  onMerge,
  onUndo,
}: {
  open: boolean;
  tags: TagView[];
  onClose: () => void;
  onCreate: (input: CreateTagInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateTagInput) => Promise<void>;
  onCandidates: (name: string) => Promise<TagCandidates>;
  onPreviewDelete: (id: string) => Promise<TagDeletionPreview>;
  onTrash: (id: string, expectedUpdatedAt: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onPermanentDelete: (id: string) => Promise<void>;
  onMerge: (input: MergeTagsInput) => Promise<MergeRecordView>;
  onUndo: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [candidates, setCandidates] = useState<TagCandidates['candidates']>([]);
  const [lastMergeId, setLastMergeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = tags.find((tag) => tag.id === selectedId) ?? null;
  const activeTags = tags.filter((tag) => !tag.trashedAt);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setAliases(selected.aliases.join(', '));
    setColor(selected.color ?? '');
    setDescription(selected.description ?? '');
    setMergeTargetId('');
    setError(null);
  }, [selected]);

  useEffect(() => {
    if (open) return;
    setSelectedId(null);
    setCandidates([]);
    setLastMergeId(null);
    setError(null);
  }, [open]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '标签操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="管理标签"
      description="名称和别名用于统一检索；相似标签只提示，由你决定是否合并。"
      maxWidth="max-w-5xl"
    >
      <div className="grid min-h-[500px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-panel border border-line bg-surface-2/35 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
            <IconTag size={13} /> 标签库
          </div>
          <div className="mt-3 max-h-60 space-y-1 overflow-y-auto">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSelectedId(tag.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-2 text-left text-xs transition ${
                  selectedId === tag.id
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-secondary hover:bg-surface hover:text-ink'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: tag.color ?? 'transparent' }}
                  />
                  <span className="truncate">{tag.name}</span>
                  {tag.trashedAt && <span className="text-[10px] text-critical">已回收</span>}
                </span>
                <span className="tabular-nums text-[10px] text-muted">{tag.usageCount}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <Field label="新标签">
              <input
                className={controlClass}
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setCandidates([]);
                }}
                placeholder="规范名称"
              />
            </Field>
            <Field label="别名（逗号分隔）">
              <input
                className={controlClass}
                value={newAliases}
                onChange={(event) => setNewAliases(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !newName.trim()}
                onClick={() =>
                  void run(async () => {
                    const result = await onCandidates(newName);
                    setCandidates(result.candidates);
                  })
                }
              >
                检查相似项
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<IconPlus size={12} />}
                disabled={busy || !newName.trim()}
                onClick={() =>
                  void run(async () => {
                    await onCreate({
                      name: newName.trim(),
                      aliases: aliasesFrom(newAliases),
                      color: null,
                      description: null,
                    });
                    setNewName('');
                    setNewAliases('');
                    setCandidates([]);
                  })
                }
              >
                创建
              </Button>
            </div>
            {candidates.length > 0 && (
              <div className="rounded-control border border-line bg-surface p-2.5 text-[11px] text-secondary">
                <p className="font-semibold text-ink">相似标签建议</p>
                {candidates.map((candidate) => (
                  <p key={candidate.tag.id} className="mt-1">
                    {candidate.tag.name} · {Math.round(candidate.score * 100)}% ·{' '}
                    {candidate.matchedName}
                  </p>
                ))}
                <p className="mt-2 text-muted">不会自动合并。</p>
              </div>
            )}
          </div>
        </aside>

        <main>
          {!selected ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <IconTag size={28} className="text-muted" />
              <p className="mt-3 text-sm font-semibold text-ink">选择一个标签进行编辑</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="规范名称">
                  <input
                    className={controlClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label="颜色">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={color || '#64748b'}
                      onChange={(event) => setColor(event.target.value)}
                      className="h-9 w-12 rounded-control border border-line bg-surface p-1"
                    />
                    <input
                      className={controlClass}
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      placeholder="#64748b 或留空"
                    />
                  </div>
                </Field>
                <Field label="别名（逗号分隔）" className="sm:col-span-2">
                  <input
                    className={controlClass}
                    value={aliases}
                    onChange={(event) => setAliases(event.target.value)}
                  />
                </Field>
                <Field label="说明" className="sm:col-span-2">
                  <textarea
                    className={`${controlClass} min-h-20 resize-y`}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>
              {!selected.trashedAt ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    disabled={busy || !name.trim()}
                    onClick={() =>
                      void run(() =>
                        onUpdate(selected.id, {
                          name: name.trim(),
                          aliases: aliasesFrom(aliases),
                          color: color.trim() || null,
                          description: description.trim() || null,
                          expectedUpdatedAt: selected.updatedAt,
                        }),
                      )
                    }
                  >
                    保存标签
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const preview = await onPreviewDelete(selected.id);
                        if (
                          window.confirm(
                            `“${preview.name}”用于 ${preview.usageCount} 个作品，包含 ${preview.aliasCount} 个别名。移入标签回收站吗？`,
                          )
                        ) {
                          await onTrash(selected.id, selected.updatedAt);
                        }
                      })
                    }
                  >
                    移入回收站
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => void run(() => onRestore(selected.id))}>
                    恢复标签
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const preview = await onPreviewDelete(selected.id);
                        if (
                          window.confirm(
                            `永久删除“${preview.name}”及 ${preview.aliasCount} 个别名，并移除 ${preview.usageCount} 条标签引用。继续吗？`,
                          )
                        ) {
                          await onPermanentDelete(selected.id);
                          setSelectedId(null);
                        }
                      })
                    }
                  >
                    永久删除
                  </Button>
                </div>
              )}

              {!selected.trashedAt && (
                <section className="border-t border-line pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                    合并标签
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-secondary">
                    当前标签作为存活项；被合并标签的名称会保留为别名，作品引用会转移。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <select
                      className={`${controlClass} max-w-sm`}
                      value={mergeTargetId}
                      onChange={(event) => setMergeTargetId(event.target.value)}
                    >
                      <option value="">选择被合并标签</option>
                      {activeTags
                        .filter((tag) => tag.id !== selected.id)
                        .map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                    </select>
                    <Button
                      disabled={busy || !mergeTargetId}
                      onClick={() =>
                        void run(async () => {
                          const target = tags.find((tag) => tag.id === mergeTargetId)!;
                          if (!window.confirm(`保留“${selected.name}”，合并“${target.name}”吗？`))
                            return;
                          const record = await onMerge({
                            survivorId: selected.id,
                            mergedId: target.id,
                            expectedSurvivorUpdatedAt: selected.updatedAt,
                            expectedMergedUpdatedAt: target.updatedAt,
                          });
                          setLastMergeId(record.id);
                          setMergeTargetId('');
                        })
                      }
                    >
                      合并并保留快照
                    </Button>
                    {lastMergeId && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await onUndo(lastMergeId);
                            setLastMergeId(null);
                          })
                        }
                      >
                        撤销刚才的合并
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-control bg-critical-soft px-3 py-2 text-xs text-critical">
              {error}
            </p>
          )}
        </main>
      </div>
    </Modal>
  );
}
