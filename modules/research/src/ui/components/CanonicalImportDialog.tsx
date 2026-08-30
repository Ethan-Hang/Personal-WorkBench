import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { CanonicalImportPreview, CanonicalImportReport } from '../../contract.js';
import {
  postCanonicalImport,
  postCanonicalImportPreview,
  postPickCanonicalImportSource,
} from '../api.js';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

export function CanonicalImportDialog({
  open,
  onClose,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}) {
  const [sourcePath, setSourcePath] = useState('');
  const [preview, setPreview] = useState<CanonicalImportPreview | null>(null);
  const [report, setReport] = useState<CanonicalImportReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setReport(null);
    setConfirmed(false);
  }, [sourcePath]);

  const chooseSource = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postPickCanonicalImportSource({});
      if (result.path) setSourcePath(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '选择恢复文件失败');
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    if (!sourcePath.trim()) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await postCanonicalImportPreview({ sourcePath: sourcePath.trim() });
      setPreview(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '恢复预览失败');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!confirmed || !sourcePath.trim()) return;
    const checked = preview ?? (await inspect());
    if (!checked?.targetEmpty) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postCanonicalImport({
        sourcePath: sourcePath.trim(),
        confirmed: true,
      });
      setReport(result);
      await onRestored();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '恢复失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="恢复研究资料包"
      description="从 canonical JSON 恢复文献、阅读状态、批注、研究知识和修订历史。"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <p className="border-l-2 border-warning bg-warning-soft/45 px-3 py-2 text-xs leading-5 text-secondary">
          恢复只写入空资料库。附件会先校验 SHA-256；找不到的文件保留记录并标记为缺失。
        </p>
        <Field label="canonical JSON">
          <div className="flex gap-2">
            <input
              className={controlClass}
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="选择资料包中的 library.json"
            />
            <Button type="button" disabled={busy} onClick={() => void chooseSource()}>
              选择…
            </Button>
          </div>
        </Field>

        {preview && (
          <div className="border border-line bg-surface-2/55 p-4 text-xs text-secondary">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <span>
                Schema
                <br />
                <strong className="text-ink">v{preview.schemaVersion}</strong>
              </span>
              <span>
                记录
                <br />
                <strong className="text-ink">{preview.recordCount}</strong>
              </span>
              <span>
                文献 / 附件
                <br />
                <strong className="text-ink">
                  {preview.workCount} / {preview.attachmentCount}
                </strong>
              </span>
              <span>
                预计复制
                <br />
                <strong className="text-ink">{formatBytes(preview.estimatedCopyBytes)}</strong>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              <span>可用文件：{preview.availableAssetCount}</span>
              <span>缺失文件：{preview.missingAssetCount}</span>
              <span>ID 冲突：{preview.conflictIds.length}</span>
              <span className={preview.targetEmpty ? 'text-accent' : 'text-critical'}>
                {preview.targetEmpty ? '当前资料库为空，可恢复' : '当前资料库有数据，不能恢复'}
              </span>
            </div>
            {preview.warnings.map((warning) => (
              <p key={warning} className="mt-2 text-warning">
                {warning}
              </p>
            ))}
            {preview.targetEmpty && (
              <label className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-ink">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                确认把这份资料恢复到当前空资料库
              </label>
            )}
          </div>
        )}

        {report && (
          <div className="border border-accent/25 bg-accent-soft/45 p-4 text-xs leading-5 text-secondary">
            恢复完成：{report.importedWorks} 篇文献、{report.importedAttachments} 个附件记录； 复制{' '}
            {report.copiedAssets} 个文件，缺失 {report.missingAssets} 个。外键、搜索索引和 canonical
            往返校验通过。
          </div>
        )}
        {error && <p className="bg-critical-soft p-3 text-xs text-critical">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onClose}>
          关闭
        </Button>
        <Button type="button" disabled={busy || !sourcePath.trim()} onClick={() => void inspect()}>
          {busy ? '处理中…' : '预览'}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || !confirmed || !preview?.targetEmpty || report !== null}
          onClick={() => void restore()}
        >
          开始恢复
        </Button>
      </div>
    </Modal>
  );
}
