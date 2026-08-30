import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type {
  KnowledgeExportFormat,
  KnowledgeExportObjectType,
  KnowledgeExportPreview,
  KnowledgeExportReport,
} from '../../contract.js';
import {
  fetchKnowledgeMatrices,
  fetchWritingDocuments,
  postKnowledgeExport,
  postKnowledgeExportPreview,
  postPickKnowledgeExportTarget,
} from '../api.js';

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function fileName(title: string, format: KnowledgeExportFormat): string {
  const stem =
    title
      .trim()
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/[. ]+$/g, '') || 'research';
  return `${stem}.${format === 'csv' ? 'csv' : 'md'}`;
}

export function KnowledgeExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [objectType, setObjectType] = useState<KnowledgeExportObjectType>('writing-document');
  const [objectId, setObjectId] = useState('');
  const [format, setFormat] = useState<KnowledgeExportFormat>('markdown');
  const [targetPath, setTargetPath] = useState('');
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [preview, setPreview] = useState<KnowledgeExportPreview | null>(null);
  const [report, setReport] = useState<KnowledgeExportReport | null>(null);
  const [matrices, setMatrices] = useState<Array<{ id: string; title: string }>>([]);
  const [documents, setDocuments] = useState<Array<{ id: string; title: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    Promise.all([
      fetchWritingDocuments({ status: 'active', limit: 100 }),
      fetchKnowledgeMatrices({ status: 'active', limit: 100 }),
    ])
      .then(([writing, matrixPage]) => {
        if (!active) return;
        setDocuments(writing.documents.map(({ id, title }) => ({ id, title })));
        setMatrices(matrixPage.matrices.map(({ id, title }) => ({ id, title })));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '读取可导出内容失败');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const objects = objectType === 'writing-document' ? documents : matrices;
  const selected = useMemo(
    () => objects.find((item) => item.id === objectId) ?? null,
    [objectId, objects],
  );

  useEffect(() => {
    if (objects.some((item) => item.id === objectId)) return;
    setObjectId(objects[0]?.id ?? '');
  }, [objectId, objects]);

  useEffect(() => {
    if (objectType === 'writing-document') setFormat('markdown');
    setTargetPath('');
    setPreview(null);
    setReport(null);
    setOverwriteConfirmed(false);
  }, [objectType]);

  useEffect(() => {
    setPreview(null);
    setReport(null);
    setOverwriteConfirmed(false);
  }, [format, objectId, targetPath]);

  const chooseTarget = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postPickKnowledgeExportTarget({
        format,
        suggestedName: fileName(selected.title, format),
      });
      if (result.path) setTargetPath(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '选择输出文件失败');
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    if (!objectId) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await postKnowledgeExportPreview({
        objectType,
        objectId,
        format,
        ...(targetPath.trim() ? { targetPath: targetPath.trim() } : {}),
      });
      setPreview(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出预览失败');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!objectId || !targetPath.trim()) return;
    const checked = preview ?? (await inspect());
    if (!checked || (checked.targetExists && !overwriteConfirmed)) return;
    setBusy(true);
    setError(null);
    try {
      setReport(
        await postKnowledgeExport({
          objectType,
          objectId,
          format,
          targetPath: targetPath.trim(),
          overwriteConfirmed,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导出研究内容"
      description="输出写作稿或对照矩阵，并保留来源页码、内部链接和稳定 ID。"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="内容类型" className="min-w-0">
            <select
              className={`${controlClass} min-w-0 max-w-full`}
              value={objectType}
              onChange={(event) => setObjectType(event.target.value as KnowledgeExportObjectType)}
            >
              <option value="writing-document">写作稿</option>
              <option value="matrix">对照矩阵</option>
            </select>
          </Field>
          <Field label="内容" className="min-w-0">
            <select
              className={`${controlClass} min-w-0 max-w-full`}
              value={objectId}
              onChange={(event) => setObjectId(event.target.value)}
            >
              {objects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="格式" className="min-w-0">
            <select
              className={`${controlClass} min-w-0 max-w-full`}
              value={format}
              disabled={objectType === 'writing-document'}
              onChange={(event) => setFormat(event.target.value as KnowledgeExportFormat)}
            >
              <option value="markdown">Markdown</option>
              {objectType === 'matrix' && <option value="csv">CSV</option>}
            </select>
          </Field>
        </div>

        <Field label="输出文件">
          <div className="flex gap-2">
            <input
              className={controlClass}
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              placeholder="选择文件，或输入 .md / .csv 路径"
            />
            <Button type="button" disabled={busy || !selected} onClick={() => void chooseTarget()}>
              选择…
            </Button>
          </div>
        </Field>

        {preview && (
          <div className="border border-line bg-surface-2/55 p-4 text-xs text-secondary">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <span>
                对象
                <br />
                <strong className="text-ink">{preview.objectCount}</strong>
              </span>
              <span>
                来源引用
                <br />
                <strong className="text-ink">{preview.referenceCount}</strong>
              </span>
              <span>
                需复核
                <br />
                <strong className="text-ink">{preview.sourceIssueCount}</strong>
              </span>
              <span>
                预计大小
                <br />
                <strong className="text-ink">{formatBytes(preview.estimatedBytes)}</strong>
              </span>
            </div>
            {preview.targetExists && (
              <label className="mt-4 flex items-center gap-2 text-warning">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={(event) => setOverwriteConfirmed(event.target.checked)}
                />
                文件已存在，确认覆盖
              </label>
            )}
            {preview.warnings.map((warning) => (
              <p key={warning} className="mt-2 text-warning">
                {warning}
              </p>
            ))}
          </div>
        )}

        {report && (
          <div className="border border-accent/25 bg-accent-soft/45 p-4 text-xs text-secondary">
            已导出到 <strong className="text-ink">{report.targetPath}</strong>，写入校验通过。
          </div>
        )}
        {objects.length === 0 && !busy && (
          <p className="bg-surface-2 p-3 text-xs text-muted">当前没有可导出的内容。</p>
        )}
        {error && <p className="bg-critical-soft p-3 text-xs text-critical">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onClose}>
          关闭
        </Button>
        <Button type="button" disabled={busy || !objectId} onClick={() => void inspect()}>
          {busy ? '处理中…' : '预览'}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={
            busy ||
            !objectId ||
            !targetPath.trim() ||
            report !== null ||
            Boolean(preview?.targetExists && !overwriteConfirmed)
          }
          onClick={() => void start()}
        >
          导出
        </Button>
      </div>
    </Modal>
  );
}
