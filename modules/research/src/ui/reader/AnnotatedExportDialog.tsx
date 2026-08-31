import { useEffect, useState } from 'react';
import { Button, IconExternalLink, IconFileText, IconFolder, Modal } from '@workbench/ui';
import type { AnnotatedExportJob, AnnotatedExportPreview, ReadingContext } from '../../contract.js';
import {
  fetchAnnotatedExport,
  postAnnotatedExport,
  postAnnotatedExportPreview,
  postCancelAnnotatedExport,
  postOpenAnnotatedExportLocation,
  postPickAnnotatedExportTarget,
  postRetryAnnotatedExport,
} from '../api.js';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

function suggestedName(displayName: string): string {
  const base = displayName.replace(/\.pdf$/i, '').trim() || 'document';
  return `${base}-annotated.pdf`;
}

const STATUS_LABEL: Record<AnnotatedExportJob['status'], string> = {
  queued: '等待开始',
  running: '正在写入',
  paused: '已暂停',
  completed: '导出完成',
  cancelled: '已取消',
  failed: '导出失败',
  interrupted: '上次导出被中断',
};

export function AnnotatedExportDialog({
  open,
  assetId,
  displayName,
  includeGeneral,
  visibleContextIds,
  contexts,
  onClose,
}: {
  open: boolean;
  assetId: string;
  displayName: string;
  includeGeneral: boolean;
  visibleContextIds: string[];
  contexts: ReadingContext[];
  onClose: () => void;
}) {
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<AnnotatedExportPreview | null>(null);
  const [job, setJob] = useState<AnnotatedExportJob | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextKey = visibleContextIds.join(',');
  const scope = { includeGeneral, contextIds: [...visibleContextIds].sort() };

  useEffect(() => {
    setTargetPath(null);
    setPreview(null);
    setJob(null);
    setOverwriteConfirmed(false);
    setError(null);
  }, [assetId]);

  useEffect(() => {
    setPreview(null);
    setOverwriteConfirmed(false);
  }, [contextKey, includeGeneral, targetPath]);

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void fetchAnnotatedExport(job.id)
        .then(setJob)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : '读取导出进度失败'),
        );
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  const scopeNames = [
    ...(includeGeneral ? ['通用批注'] : []),
    ...visibleContextIds.map(
      (id) => contexts.find((context) => context.id === id)?.name ?? '不可用上下文',
    ),
  ];
  const running = job?.status === 'queued' || job?.status === 'running';
  const retryable =
    job?.status === 'cancelled' || job?.status === 'failed' || job?.status === 'interrupted';
  const progress =
    job && job.totalAnnotations > 0
      ? Math.min(100, (job.completedAnnotations / job.totalAnnotations) * 100)
      : job?.status === 'completed'
        ? 100
        : 0;

  const chooseTarget = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await postPickAnnotatedExportTarget(assetId, {
        suggestedName: suggestedName(displayName),
      });
      if (!picked.cancelled && picked.path) setTargetPath(picked.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法选择导出位置');
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    if (!targetPath) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await postAnnotatedExportPreview(assetId, { ...scope, targetPath });
      setPreview(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法预览导出结果');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!targetPath) return;
    const checked = preview ?? (await inspect());
    if (!checked) return;
    if (checked.targetExists && !overwriteConfirmed) {
      setError('目标文件已存在，请确认覆盖后再导出');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(
        await postAnnotatedExport(assetId, {
          ...scope,
          targetPath,
          overwriteConfirmed,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动导出');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await postCancelAnnotatedExport(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消导出失败');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await postRetryAnnotatedExport(job.id, { overwriteConfirmed }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试导出失败');
    } finally {
      setBusy(false);
    }
  };

  const openLocation = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      await postOpenAnnotatedExportLocation(job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开导出位置');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导出带批注副本"
      description="把当前可见批注写入新的 PDF；原文件保持不变。"
      maxWidth="max-w-2xl"
    >
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        <section className="border-y border-line py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                导出范围
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {scopeNames.length > 0 ? scopeNames.join('、') : '当前没有可见批注层'}
              </p>
              <p className="mt-1 text-xs text-secondary">范围取自阅读器当前可见层。</p>
            </div>
            <span className="font-mono text-[11px] text-muted">
              {preview ? `${preview.annotationCount} 条批注` : '等待预览'}
            </span>
          </div>
        </section>

        <section className="py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                输出位置
              </p>
              <p className="mt-2 truncate text-xs text-ink" title={targetPath ?? undefined}>
                {targetPath ?? '尚未选择 PDF 文件'}
              </p>
            </div>
            <Button
              type="button"
              icon={<IconFolder size={14} />}
              disabled={busy || running}
              onClick={() => void chooseTarget()}
            >
              选择位置
            </Button>
          </div>
        </section>

        {preview && (
          <section className="border-y border-line py-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {[
                ['标准批注', preview.standardCount],
                ['页面写入', preview.flattenedCount],
                ['跳过', preview.skippedCount],
                ['预计大小', formatBytes(preview.estimatedOutputBytes)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] text-muted">{label}</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-secondary">
              高亮、下划线、删除线、区域和便笺写为标准 PDF 批注；页书签写入页面边缘。
            </p>
            {preview.targetExists && (
              <label className="mt-4 flex items-start gap-2 border-l-2 border-warning pl-3 text-xs text-secondary">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={overwriteConfirmed}
                  disabled={running}
                  onChange={(event) => setOverwriteConfirmed(event.target.checked)}
                />
                <span>
                  <strong className="block text-ink">目标文件已存在</strong>
                  确认用新副本替换该文件。原始 PDF 不在这个操作范围内。
                </span>
              </label>
            )}
            {preview.warnings.length > 0 && (
              <details className="mt-4 text-xs text-secondary">
                <summary className="cursor-pointer font-semibold text-ink">查看导出说明</summary>
                <ul className="mt-2 space-y-1 border-l border-line pl-3 leading-5">
                  {[...new Set(preview.warnings)].map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {job && (
          <section className="border-b border-line py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{STATUS_LABEL[job.status]}</p>
                <p className="mt-1 text-xs text-secondary">
                  {job.completedAnnotations} / {job.totalAnnotations} 条批注
                </p>
              </div>
              <span className="font-mono text-xs text-muted">{Math.round(progress)}%</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden bg-line">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {job.report && (
              <div className="mt-4 flex items-start gap-3 text-xs leading-5 text-secondary">
                <IconFileText size={17} className="mt-0.5 shrink-0 text-accent" />
                <p className="min-w-0 break-all">
                  已生成 {formatBytes(job.report.outputBytes)} 的可打开副本，原文件 hash 未变化。
                  <br />
                  {job.report.targetPath}
                </p>
              </div>
            )}
            {job.errorCode && <p className="mt-3 text-xs text-critical">{job.errorCode}</p>}
          </section>
        )}

        {error && <p className="mt-4 text-xs text-critical">{error}</p>}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onClose}>
          关闭
        </Button>
        {job?.status === 'completed' ? (
          <Button
            type="button"
            variant="primary"
            icon={<IconExternalLink size={14} />}
            disabled={busy}
            onClick={() => void openLocation()}
          >
            打开文件位置
          </Button>
        ) : running ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void cancel()}>
            取消导出
          </Button>
        ) : retryable ? (
          <Button type="button" variant="primary" disabled={busy} onClick={() => void retry()}>
            重试导出
          </Button>
        ) : (
          <>
            <Button type="button" disabled={busy || !targetPath} onClick={() => void inspect()}>
              {busy ? '正在预览…' : '预览'}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={
                busy || !targetPath || !preview || (preview.targetExists && !overwriteConfirmed)
              }
              onClick={() => void start()}
            >
              导出副本
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
