import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { PortableExportJob, PortableExportPreview } from '../../contract.js';
import {
  fetchPortableExport,
  postCancelPortableExport,
  postPortableExport,
  postPortableExportPreview,
} from '../api.js';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [targetPath, setTargetPath] = useState('');
  const [includeManagedFiles, setIncludeManagedFiles] = useState(true);
  const [includeLinkedFiles, setIncludeLinkedFiles] = useState(false);
  const [preview, setPreview] = useState<PortableExportPreview | null>(null);
  const [job, setJob] = useState<PortableExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || (job.status !== 'draft' && job.status !== 'running')) return;
    const timer = window.setInterval(() => {
      void fetchPortableExport(job.id)
        .then(setJob)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : '读取导出进度失败'),
        );
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    setPreview(null);
  }, [targetPath, includeManagedFiles, includeLinkedFiles]);

  const inspect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postPortableExportPreview({
        targetPath: targetPath.trim() || undefined,
        includeManagedFiles,
        includeLinkedFiles,
      });
      setPreview(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出预检失败');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!targetPath.trim()) return;
    const checked = preview ?? (await inspect());
    if (!checked || checked.targetExists) {
      if (checked?.targetExists) setError('目标目录已经存在，请换一个新目录');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setJob(
        await postPortableExport({
          targetPath: targetPath.trim(),
          includeManagedFiles,
          includeLinkedFiles,
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
      setJob(await postCancelPortableExport(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消导出失败');
    } finally {
      setBusy(false);
    }
  };

  const running = job?.status === 'draft' || job?.status === 'running';
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导出文献库"
      description="选择是否包含附件；导出结果包含数据清单和校验报告。"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <Field label="目标目录（必须是尚不存在的新目录）">
          <input
            className={controlClass}
            value={targetPath}
            disabled={running}
            onChange={(event) => setTargetPath(event.target.value)}
            placeholder="/Users/me/Exports/research-2026-08-24 或 C:\Exports\research-2026-08-24"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-control border border-line p-3 text-xs text-secondary">
            <input
              type="checkbox"
              checked={includeManagedFiles}
              disabled={running}
              onChange={(event) => setIncludeManagedFiles(event.target.checked)}
            />
            <span>
              <strong className="block text-ink">加入托管文件</strong>
              将工作台对象库中可访问的附件复制进资料包。
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-control border border-line p-3 text-xs text-secondary">
            <input
              type="checkbox"
              checked={includeLinkedFiles}
              disabled={running}
              onChange={(event) => setIncludeLinkedFiles(event.target.checked)}
            />
            <span>
              <strong className="block text-ink">加入链接文件</strong>
              只复制当前可访问且校验通过的链接文件。
            </span>
          </label>
        </div>

        {preview && (
          <div className="rounded-control border border-line bg-surface-2/55 p-4 text-xs text-secondary">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <span>
                文献
                <br />
                <strong className="text-ink">{preview.workCount}</strong>
              </span>
              <span>
                附件
                <br />
                <strong className="text-ink">{preview.attachmentCount}</strong>
              </span>
              <span>
                导出文件
                <br />
                <strong className="text-ink">{preview.selectedAssetCount}</strong>
              </span>
              <span>
                预计大小
                <br />
                <strong className="text-ink">{formatBytes(preview.estimatedBytes)}</strong>
              </span>
            </div>
            {preview.missing.length > 0 && (
              <p className="mt-3 text-warning">
                {preview.missing.length} 个附件没有符合当前选项的可访问文件，详情会写入报告。
              </p>
            )}
          </div>
        )}

        {job && (
          <div className="rounded-control border border-line p-4 text-xs text-secondary">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-ink">状态：{job.status}</strong>
              <span>
                {job.progress.completedAssets}/{job.progress.totalAssets} 个文件对象
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${job.progress.totalAssets === 0 ? (job.status === 'completed' ? 100 : 0) : Math.min(100, (job.progress.completedAssets / job.progress.totalAssets) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2">
              {job.progress.phase} · {formatBytes(job.progress.copiedBytes)} /{' '}
              {formatBytes(job.progress.totalBytes)}
            </p>
            {job.report && (
              <p className="mt-3 text-ink">
                已发布到 {job.report.targetPath}。往返校验通过；复制 {job.report.copiedAssetCount}{' '}
                个对象，缺失 {job.report.missing.length} 项，复制失败{' '}
                {job.report.copyFailures.length} 项。
              </p>
            )}
            {job.errorCode && <p className="mt-3 text-critical">{job.errorCode}</p>}
          </div>
        )}
        {error && (
          <p className="rounded-control bg-critical-soft p-3 text-xs text-critical">{error}</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onClose}>
          关闭
        </Button>
        {running ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void cancel()}>
            取消导出
          </Button>
        ) : (
          <>
            <Button type="button" disabled={busy} onClick={() => void inspect()}>
              {busy ? '正在预检…' : '预检'}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy || !targetPath.trim() || job?.status === 'completed'}
              onClick={() => void start()}
            >
              开始导出
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
