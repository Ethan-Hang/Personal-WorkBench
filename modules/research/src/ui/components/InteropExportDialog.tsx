import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { InteropExportScope, InteropFormat } from '../../contract.js';
import type { InteropExportJob, InteropExportPreview } from '../api.js';
import {
  fetchInteropExport,
  postCancelInteropExport,
  postPickInteropExportTarget,
  postPreviewInteropExport,
  postStartInteropExport,
  putInteropCitationKey,
} from '../api.js';

type ScopeKind = InteropExportScope['kind'];

const formatLabels: Record<InteropFormat, string> = {
  bibtex: 'BibTeX / BibLaTeX',
  ris: 'RIS',
  'csl-json': 'CSL JSON',
};

const lossLabels: Record<InteropExportPreview['losses'][number]['status'], string> = {
  complete: '完整',
  normalized: '已规范化',
  degraded: '降级',
  unmapped: '未映射',
  'attachment-omitted': '未包含附件',
  'no-edition': '无版本',
};

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `interop-export-${Date.now()}`;
}

function targetKey(workId: string, editionId: string | null): string {
  return `${workId}:${editionId ?? ''}`;
}

export function InteropExportDialog({
  open,
  selectedWorkIds,
  visibleWorkIds,
  selectedCollectionId,
  selectedCollectionLabel,
  onClose,
}: {
  open: boolean;
  selectedWorkIds: string[];
  visibleWorkIds: string[];
  selectedCollectionId: string | null;
  selectedCollectionLabel: string | null;
  onClose: () => void;
}) {
  const initialScope: ScopeKind =
    selectedWorkIds.length > 0
      ? 'selection'
      : selectedCollectionId
        ? 'collection'
        : visibleWorkIds.length > 0
          ? 'filter'
          : 'all-active';
  const [format, setFormat] = useState<InteropFormat>('bibtex');
  const [scopeKind, setScopeKind] = useState<ScopeKind>(initialScope);
  const [editionPolicy, setEditionPolicy] = useState<'preferred' | 'all'>('preferred');
  const [keyOverrides, setKeyOverrides] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<InteropExportPreview | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [targetPath, setTargetPath] = useState('');
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [job, setJob] = useState<InteropExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setScopeKind(initialScope);
    setPreview(null);
    setPreviewDirty(false);
    setKeyOverrides({});
    setTargetPath('');
    setOverwriteConfirmed(false);
    setJob(null);
    setError(null);
    setSavedKey(null);
  }, [initialScope, open]);

  useEffect(() => {
    if (!job || !['draft', 'previewed', 'running'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void fetchInteropExport(job.id)
        .then(setJob)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : '读取导出进度失败'),
        );
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  const scope = useMemo<InteropExportScope>(() => {
    if (scopeKind === 'selection') return { kind: scopeKind, workIds: selectedWorkIds };
    if (scopeKind === 'collection' && selectedCollectionId)
      return { kind: scopeKind, collectionId: selectedCollectionId };
    if (scopeKind === 'filter')
      return { kind: scopeKind, workIds: visibleWorkIds, label: '当前筛选结果' };
    return { kind: 'all-active' };
  }, [scopeKind, selectedCollectionId, selectedWorkIds, visibleWorkIds]);

  const inspect = async (overrides = keyOverrides) => {
    setBusy(true);
    setError(null);
    setSavedKey(null);
    try {
      const next = await postPreviewInteropExport({
        requestId: requestId(),
        format,
        scope,
        editionPolicy,
        keyOverrides: overrides,
      });
      setPreview(next);
      setPreviewDirty(false);
      setKeyOverrides(
        Object.fromEntries(
          next.frozenEntities.map((entity) => [
            targetKey(entity.workId, entity.editionId),
            entity.citationKey,
          ]),
        ),
      );
      setJob(null);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出预览失败');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pickTarget = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await postPickInteropExportTarget(format);
      if (!picked.cancelled && picked.path) setTargetPath(picked.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '选择导出文件失败');
    } finally {
      setBusy(false);
    }
  };

  const savePreference = async (entity: InteropExportPreview['frozenEntities'][number]) => {
    const key = targetKey(entity.workId, entity.editionId);
    const preferredKey = keyOverrides[key]?.trim() ?? '';
    setBusy(true);
    setError(null);
    setSavedKey(null);
    try {
      await putInteropCitationKey(entity.workId, {
        editionId: entity.editionId,
        preferredKey,
        expectedRevision: entity.citationKeyRevision,
      });
      setSavedKey(key);
      await inspect({ ...keyOverrides, [key]: preferredKey });
      setSavedKey(key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存 citation key 失败');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!preview || previewDirty || !targetPath) return;
    setBusy(true);
    setError(null);
    try {
      setJob(
        await postStartInteropExport(preview.jobId, {
          previewToken: preview.previewToken,
          expectedRevision: preview.revision,
          targetPath,
          overwriteConfirmed,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动导出失败');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    try {
      setJob(await postCancelInteropExport(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消导出失败');
    } finally {
      setBusy(false);
    }
  };

  const running = job?.status === 'running';
  const issueLosses = preview?.losses.filter((item) => item.status !== 'complete') ?? [];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导出文献记录"
      description="按当前文献库状态生成 BibTeX、RIS 或 CSL JSON；附件文件不写入记录导出。"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="格式">
            <select
              className={controlClass}
              value={format}
              disabled={running}
              onChange={(event) => {
                setFormat(event.target.value as InteropFormat);
                setPreview(null);
                setTargetPath('');
              }}
            >
              {Object.entries(formatLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="范围">
            <select
              className={controlClass}
              value={scopeKind}
              disabled={running}
              onChange={(event) => {
                setScopeKind(event.target.value as ScopeKind);
                setPreview(null);
              }}
            >
              <option value="selection" disabled={selectedWorkIds.length === 0}>
                已选择文献（{selectedWorkIds.length}）
              </option>
              <option value="collection" disabled={!selectedCollectionId}>
                当前目录{selectedCollectionLabel ? `：${selectedCollectionLabel}` : ''}
              </option>
              <option value="filter" disabled={visibleWorkIds.length === 0}>
                当前筛选结果（{visibleWorkIds.length}）
              </option>
              <option value="all-active">全部有效文献</option>
            </select>
          </Field>
          <Field label="版本">
            <select
              className={controlClass}
              value={editionPolicy}
              disabled={running}
              onChange={(event) => {
                setEditionPolicy(event.target.value as 'preferred' | 'all');
                setPreview(null);
              }}
            >
              <option value="preferred">每篇首选版本</option>
              <option value="all">全部版本</option>
            </select>
          </Field>
        </div>

        {preview && (
          <div className="space-y-4 border-t border-line pt-4">
            <div className="grid grid-cols-3 gap-3 text-xs sm:max-w-lg">
              <div>
                <span className="text-muted">文献</span>
                <strong className="mt-1 block text-lg text-ink">{preview.workCount}</strong>
              </div>
              <div>
                <span className="text-muted">记录</span>
                <strong className="mt-1 block text-lg text-ink">{preview.recordCount}</strong>
              </div>
              <div>
                <span className="text-muted">问题项</span>
                <strong className="mt-1 block text-lg text-ink">{preview.issueCount}</strong>
              </div>
            </div>

            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Citation key</h3>
                  <p className="mt-1 text-xs text-muted">
                    当前显示前 100 条；修改后重新预览才可导出。
                  </p>
                </div>
                {previewDirty && (
                  <span className="text-xs font-semibold text-warning">有未验证修改</span>
                )}
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto border-y border-line">
                {preview.frozenEntities.slice(0, 100).map((entity) => {
                  const key = targetKey(entity.workId, entity.editionId);
                  return (
                    <div
                      key={key}
                      className="grid gap-2 border-b border-line/70 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[10px] text-muted">
                          {entity.workId}
                          {entity.editionId ? ` / ${entity.editionId}` : ''}
                        </p>
                        <p className="mt-0.5 text-[10px] text-secondary">
                          {entity.citationKeySource === 'user'
                            ? '已保存偏好'
                            : entity.citationKeySource === 'imported'
                              ? '来源 key'
                              : '自动生成'}
                        </p>
                      </div>
                      <input
                        aria-label={`Citation key ${entity.workId}`}
                        className={controlClass}
                        value={keyOverrides[key] ?? entity.citationKey}
                        disabled={running}
                        onChange={(event) => {
                          setKeyOverrides((values) => ({ ...values, [key]: event.target.value }));
                          setPreviewDirty(true);
                          setSavedKey(null);
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={busy || running}
                        onClick={() => void savePreference(entity)}
                      >
                        {savedKey === key ? '已保存' : '保存偏好'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-ink">格式诊断</h3>
              {issueLosses.length === 0 ? (
                <p className="mt-2 text-xs text-secondary">当前记录可以完整写入目标格式。</p>
              ) : (
                <div className="mt-2 max-h-44 overflow-y-auto border-l-2 border-warning/40 pl-3">
                  {issueLosses.slice(0, 100).map((item, index) => (
                    <p
                      key={`${item.workId}-${item.field ?? ''}-${index}`}
                      className="mb-2 text-xs leading-5 text-secondary"
                    >
                      <strong className="text-ink">{lossLabels[item.status]}</strong>
                      {item.field ? ` · ${item.field}` : ''}：{item.message}
                    </p>
                  ))}
                  {issueLosses.length > 100 && (
                    <p className="text-xs text-muted">另有 {issueLosses.length - 100} 项未展开。</p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="输出文件" className="min-w-[16rem] flex-1">
              <input
                className={controlClass}
                value={targetPath}
                readOnly
                placeholder="通过系统窗口选择文件"
              />
            </Field>
            <Button disabled={busy || running} onClick={() => void pickTarget()}>
              选择文件
            </Button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={overwriteConfirmed}
              disabled={running}
              onChange={(event) => setOverwriteConfirmed(event.target.checked)}
            />
            如果目标已存在，允许先备份旧文件再原子替换
          </label>
        </div>

        {job && (
          <div className="border-l-2 border-accent bg-surface-2/45 px-4 py-3 text-xs text-secondary">
            <strong className="text-ink">
              {job.status === 'completed'
                ? '导出完成'
                : job.status === 'failed'
                  ? '导出失败'
                  : job.status === 'cancelled'
                    ? '已取消'
                    : '正在导出'}
            </strong>
            {job.result && (
              <p className="mt-1 break-all">
                {job.result.targetPath} · {job.result.recordCount} 条 · {job.result.bytes} bytes
              </p>
            )}
            {job.errorCode && <p className="mt-1 text-critical">{job.errorCode}</p>}
          </div>
        )}
        {error && <p className="bg-critical-soft px-3 py-2 text-xs text-critical">{error}</p>}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onClose}>关闭</Button>
        {running ? (
          <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
            取消导出
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={() => void inspect()}>
              {previewDirty ? '重新预览' : preview ? '刷新预览' : '生成预览'}
            </Button>
            <Button
              variant="primary"
              disabled={
                busy || !preview || previewDirty || !targetPath || job?.status === 'completed'
              }
              onClick={() => void start()}
            >
              导出记录
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
