import { useEffect, useRef, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { ManagedRootMigrationJob, ManagedStorageStatus } from '../../contract.js';
import {
  fetchManagedRootMigration,
  fetchManagedStorageStatus,
  postCancelManagedRootMigration,
  postManagedRootMigration,
  postRetryManagedRootMigration,
} from '../api.js';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

export function ManagedStorageDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState<ManagedStorageStatus | null>(null);
  const [job, setJob] = useState<ManagedRootMigrationJob | null>(null);
  const [targetRoot, setTargetRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifiedJobId = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void fetchManagedStorageStatus()
      .then((value) => {
        setStatus(value);
        setJob(value.latestMigration);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : '读取附件存储状态失败'),
      );
  }, [open]);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(() => {
      void fetchManagedRootMigration(job.id)
        .then(setJob)
        .catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : '读取迁移进度失败'),
        );
    }, 500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (job?.status !== 'completed' || notifiedJobId.current === job.id) return;
    notifiedJobId.current = job.id;
    setStatus((current) =>
      current ? { activeRoot: job.targetRoot, latestMigration: job } : current,
    );
    void onChanged();
  }, [job, onChanged]);

  const start = async () => {
    if (!targetRoot.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const started = await postManagedRootMigration(targetRoot.trim());
      notifiedJobId.current = null;
      setJob(started);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动附件迁移失败');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await postCancelManagedRootMigration(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消附件迁移失败');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      notifiedJobId.current = null;
      setJob(await postRetryManagedRootMigration(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试附件迁移失败');
    } finally {
      setBusy(false);
    }
  };

  const running = job?.status === 'running';
  const retryable =
    job?.status === 'failed' || job?.status === 'cancelled' || job?.status === 'interrupted';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="更改附件存储位置"
      description="复制并校验完成后切换到新位置，原目录将保留。"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-control border border-line bg-surface-2/55 p-4 text-xs text-secondary">
          <p className="font-semibold text-ink">当前位置</p>
          <p className="mt-1 break-all leading-5">{status?.activeRoot ?? '正在读取…'}</p>
        </div>
        <Field label="新的存储位置">
          <input
            className={controlClass}
            value={targetRoot}
            disabled={running}
            onChange={(event) => setTargetRoot(event.target.value)}
            placeholder="/Volumes/Research/managed 或 D:\Research\managed"
          />
        </Field>

        {job && (
          <div className="rounded-control border border-line p-4 text-xs text-secondary">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-ink">状态：{job.status}</strong>
              <span>
                {job.copiedObjects}/{job.totalObjects} 个文件
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${job.totalObjects === 0 ? (job.status === 'completed' ? 100 : 0) : Math.min(100, (job.copiedObjects / job.totalObjects) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 break-all">
              {formatBytes(job.copiedBytes)} / {formatBytes(job.totalBytes)} · {job.sourceRoot} →{' '}
              {job.targetRoot}
            </p>
            {job.status === 'completed' && (
              <p className="mt-3 text-ink">文件复制和校验完成，已切换到新位置。</p>
            )}
            {job.errorCode && <p className="mt-3 break-all text-critical">{job.errorCode}</p>}
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
            取消迁移
          </Button>
        ) : retryable ? (
          <Button type="button" variant="primary" disabled={busy} onClick={() => void retry()}>
            重试迁移
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={busy || !status || !targetRoot.trim()}
            onClick={() => void start()}
          >
            {busy ? '正在启动…' : '开始迁移'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
