import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { MergeWorksInput } from '../../contract.js';
import type { MergeRecordView, WorkMergePreview, WorksPage } from '../api.js';

type Side = 'survivor' | 'merged';

export function DuplicateMergeDialog({
  open,
  works,
  initialSurvivorId,
  onClose,
  onPreview,
  onMerge,
  onUndo,
}: {
  open: boolean;
  works: WorksPage['works'];
  initialSurvivorId: string | null;
  onClose: () => void;
  onPreview: (survivorId: string, mergedId: string) => Promise<WorkMergePreview>;
  onMerge: (survivorId: string, input: MergeWorksInput) => Promise<MergeRecordView>;
  onUndo: (id: string) => Promise<void>;
}) {
  const [survivorId, setSurvivorId] = useState('');
  const [mergedId, setMergedId] = useState('');
  const [preview, setPreview] = useState<WorkMergePreview | null>(null);
  const [choices, setChoices] = useState<Record<'title' | 'type' | 'abstract' | 'year', Side>>({
    title: 'survivor',
    type: 'survivor',
    abstract: 'survivor',
    year: 'survivor',
  });
  const [preferredEditionId, setPreferredEditionId] = useState<string | null>(null);
  const [lastMergeId, setLastMergeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSurvivorId(initialSurvivorId ?? works[0]?.id ?? '');
    setMergedId('');
    setPreview(null);
    setLastMergeId(null);
    setError(null);
  }, [open, initialSurvivorId, works]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文献合并失败');
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async () => {
    const result = await onPreview(survivorId, mergedId);
    setPreview(result);
    setChoices({ title: 'survivor', type: 'survivor', abstract: 'survivor', year: 'survivor' });
    setPreferredEditionId(result.survivor.editionIds[0] ?? result.merged.editionIds[0] ?? null);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="合并重复文献"
      description="选择要保留的文献，并确认信息和版本；合并后可以撤销。"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="保留的文献">
            <select
              className={controlClass}
              value={survivorId}
              onChange={(event) => {
                setSurvivorId(event.target.value);
                setPreview(null);
              }}
            >
              <option value="">选择要保留的文献</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title || work.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="要合并的文献">
            <select
              className={controlClass}
              value={mergedId}
              onChange={(event) => {
                setMergedId(event.target.value);
                setPreview(null);
              }}
            >
              <option value="">选择要合并的文献</option>
              {works
                .filter((work) => work.id !== survivorId)
                .map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.title || work.id}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Button
          disabled={busy || !survivorId || !mergedId || survivorId === mergedId}
          onClick={() => void run(loadPreview)}
        >
          生成合并预览
        </Button>

        {preview && (
          <div className="space-y-5 border-t border-line pt-5">
            <div className="overflow-x-auto rounded-panel border border-line">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-surface-2/55 text-muted">
                  <tr>
                    <th className="px-3 py-2.5">字段</th>
                    <th className="px-3 py-2.5">保留文献</th>
                    <th className="px-3 py-2.5">合并文献</th>
                    <th className="px-3 py-2.5">最终内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(['title', 'type', 'abstract', 'year'] as const).map((field) => (
                    <tr key={field}>
                      <td className="px-3 py-3 font-semibold text-ink">{field}</td>
                      <td className="max-w-52 px-3 py-3 text-secondary">
                        {String(preview.survivor.fields[field] ?? '—')}
                      </td>
                      <td className="max-w-52 px-3 py-3 text-secondary">
                        {String(preview.merged.fields[field] ?? '—')}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className={controlClass}
                          value={choices[field]}
                          onChange={(event) =>
                            setChoices((value) => ({
                              ...value,
                              [field]: event.target.value as Side,
                            }))
                          }
                        >
                          <option value="survivor">保留文献</option>
                          <option value="merged">合并文献</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <section className="rounded-panel border border-line bg-surface-2/30 p-4">
                <h3 className="text-xs font-semibold text-ink">版本归属</h3>
                <p className="mt-2 text-xs leading-5 text-secondary">
                  以下 {preview.merged.editionIds.length} 个版本将并入保留的文献：
                </p>
                <div className="mt-2 space-y-1 font-mono text-[10px] text-muted">
                  {preview.merged.editionIds.map((id) => (
                    <p key={id}>{id}</p>
                  ))}
                </div>
              </section>
              <Field label="合并后的首选版本">
                <select
                  className={controlClass}
                  value={preferredEditionId ?? ''}
                  onChange={(event) => setPreferredEditionId(event.target.value || null)}
                >
                  <option value="">不指定</option>
                  {[...preview.survivor.editionIds, ...preview.merged.editionIds].map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {preview.matrixImpact.affectedMatrixCount > 0 && (
              <section
                className={`rounded-panel border p-4 ${
                  preview.matrixImpact.conflicts.length > 0
                    ? 'border-critical/35 bg-critical-soft'
                    : 'border-line bg-surface-2/30'
                }`}
              >
                <h3 className="text-xs font-semibold text-ink">跨论文矩阵</h3>
                <p className="mt-2 text-xs leading-5 text-secondary">
                  将更新 {preview.matrixImpact.affectedMatrixCount} 个矩阵；其中{' '}
                  {preview.matrixImpact.duplicateColumnCount} 个矩阵包含两条待合并列。
                </p>
                {preview.matrixImpact.conflicts.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-critical">
                    <p className="font-semibold">
                      有 {preview.matrixImpact.conflicts.length}{' '}
                      个单元格两侧都有不同的综合内容，请先在矩阵中处理。
                    </p>
                    {preview.matrixImpact.conflicts.map((item) => (
                      <p key={`${item.matrixId}:${item.rowId}`} className="font-mono text-[10px]">
                        {item.matrixId} · {item.rowId}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={busy || preview.matrixImpact.conflicts.length > 0}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm('执行合并并保存可撤销快照吗？')) return;
                    const record = await onMerge(preview.survivor.id, {
                      mergedWorkId: preview.merged.id,
                      expectedSurvivorRevision: preview.survivor.revision,
                      expectedMergedRevision: preview.merged.revision,
                      fieldChoices: choices,
                      editionIdsToMove: preview.merged.editionIds,
                      preferredEditionId,
                    });
                    setLastMergeId(record.id);
                  })
                }
              >
                合并文献
              </Button>
              {lastMergeId && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await onUndo(lastMergeId);
                      setLastMergeId(null);
                      setPreview(null);
                    })
                  }
                >
                  撤销刚才的合并
                </Button>
              )}
            </div>
          </div>
        )}
        {error && (
          <p className="rounded-control bg-critical-soft px-3 py-2 text-xs text-critical">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
