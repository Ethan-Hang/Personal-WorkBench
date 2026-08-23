import { useEffect, useState } from 'react';
import {
  Button,
  Chip,
  Field,
  IconExternalLink,
  IconFolder,
  IconShield,
  IconUpload,
  Modal,
  controlClass,
} from '@workbench/ui';
import type { ConfirmImportInput } from '../../contract.js';
import {
  postConfirmImport,
  postInspectImport,
  postPickPdf,
  postPrepareImport,
  postUploadPdf,
  type CollectionView,
  type ImportInspection,
  type ImportSession,
} from '../api.js';
import { MetadataReview } from './MetadataReview.js';

export function ImportDialog({
  open,
  collections,
  onClose,
  onCommitted,
}: {
  open: boolean;
  collections: CollectionView[];
  onClose: () => void;
  onCommitted: () => void;
}) {
  const [storageMode, setStorageMode] = useState<'managed' | 'linked'>('managed');
  const [paths, setPaths] = useState<string[]>([]);
  const [manualPath, setManualPath] = useState('');
  const [browserFile, setBrowserFile] = useState<File | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setPaths([]);
    setManualPath('');
    setBrowserFile(null);
    setSession(null);
    setInspection(null);
    setCollectionIds([]);
    setError(null);
  }, [open]);

  const choose = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postPickPdf({ multiple: false });
      if (!result.cancelled) {
        setPaths(result.paths);
        setBrowserFile(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件选择失败');
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    const selectedPaths = paths.length > 0 ? paths : manualPath.trim() ? [manualPath.trim()] : [];
    if (!browserFile && selectedPaths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = browserFile
        ? await postUploadPdf(browserFile, crypto.randomUUID())
        : await postPrepareImport({
            files: selectedPaths.map((path) => ({ path, storageMode })),
            requestId: crypto.randomUUID(),
          });
      setSession(prepared);
      setInspection(
        await postInspectImport(prepared.id, { allowExternal: false, forceRefresh: false }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF 识别失败');
    } finally {
      setBusy(false);
    }
  };

  const lookupExternal = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setInspection(
        await postInspectImport(session.id, { allowExternal: true, forceRefresh: false }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '外部元数据查询失败');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (input: ConfirmImportInput) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await postConfirmImport(session.id, input);
      onCommitted();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '入库失败');
    } finally {
      setBusy(false);
    }
  };

  const item = inspection?.items[0] ?? null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="导入 PDF"
      description="先确认文件保存方式，再核对作品身份和元数据来源。"
      maxWidth="max-w-4xl"
    >
      {!item ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStorageMode('managed')}
              className={`rounded-panel border p-4 text-left transition ${
                storageMode === 'managed'
                  ? 'border-accent bg-accent-soft/65'
                  : 'border-line hover:bg-surface-2/50'
              }`}
            >
              <IconShield size={20} className="text-accent" />
              <h4 className="mt-3 text-sm font-semibold text-ink">托管副本</h4>
              <p className="mt-1 text-xs leading-5 text-secondary">
                WorkBench 保存按内容 hash 编址的副本；原文件不会被移动或删除。
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setStorageMode('linked');
                setBrowserFile(null);
              }}
              className={`rounded-panel border p-4 text-left transition ${
                storageMode === 'linked'
                  ? 'border-accent bg-accent-soft/65'
                  : 'border-line hover:bg-surface-2/50'
              }`}
            >
              <IconExternalLink size={20} className="text-accent" />
              <h4 className="mt-3 text-sm font-semibold text-ink">链接原文件</h4>
              <p className="mt-1 text-xs leading-5 text-secondary">
                只记录当前位置与 hash；源文件始终由你管理，WorkBench 不会删除它。
              </p>
            </button>
          </div>

          <div className="rounded-panel border border-dashed border-line p-5 text-center">
            <IconUpload size={24} className="mx-auto text-muted" />
            <p className="mt-2 text-sm font-semibold text-ink">
              {browserFile?.name ?? (paths[0] ? paths[0].split(/[\\/]/).at(-1) : '选择本机 PDF')}
            </p>
            <p
              className="mt-1 truncate text-[11px] text-muted"
              title={browserFile?.name ?? paths[0]}
            >
              {browserFile
                ? '浏览器只把 PDF 发送到当前本机 server，作为托管副本。'
                : (paths[0] ?? '也可以由本机 server 打开系统文件选择器。')}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {storageMode === 'managed' && (
                <label className="inline-flex cursor-pointer items-center justify-center rounded-control border border-accent bg-accent px-3 py-[7px] text-xs font-bold text-white transition hover:opacity-90">
                  从浏览器选择
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setBrowserFile(file);
                      if (file) {
                        setPaths([]);
                        setManualPath('');
                      }
                    }}
                  />
                </label>
              )}
              <Button type="button" onClick={choose} disabled={busy}>
                由本机选择
              </Button>
            </div>
          </div>

          <Field label="也可以手工输入本机绝对路径">
            <input
              className={controlClass}
              value={manualPath}
              onChange={(event) => {
                setManualPath(event.target.value);
                if (event.target.value) {
                  setPaths([]);
                  setBrowserFile(null);
                }
              }}
              placeholder="/Users/me/Papers/paper.pdf 或 C:\\Papers\\paper.pdf"
            />
          </Field>

          {collections.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                同时加入目录
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {collections.map((collection) => {
                  const checked = collectionIds.includes(collection.id);
                  return (
                    <label
                      key={collection.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                        checked
                          ? 'border-accent/25 bg-accent-soft text-accent'
                          : 'border-line text-secondary'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setCollectionIds((values) =>
                            checked
                              ? values.filter((value) => value !== collection.id)
                              : [...values, collection.id],
                          )
                        }
                      />
                      <IconFolder size={12} />
                      {collection.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-line pt-4">
            <Button
              type="button"
              variant="primary"
              disabled={busy || (!browserFile && paths.length === 0 && !manualPath.trim())}
              onClick={inspect}
            >
              {busy ? '正在读取…' : '计算 hash 并识别'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[72vh] overflow-y-auto pr-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-2/55 p-3">
            <div>
              <p className="text-xs font-semibold text-ink">本地识别已经完成</p>
              <p className="mt-1 text-[11px] text-secondary">
                外部查询只发送 DOI、arXiv ID，或缺少标识符时的标题/作者/年份；不会发送 PDF。
              </p>
            </div>
            <Button type="button" size="sm" onClick={lookupExternal} disabled={busy}>
              查询 Crossref 等服务
            </Button>
          </div>
          {inspection?.disclosure.externalEnabled && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Chip tone="accent">
                已访问：{inspection.disclosure.services.join('、') || '无可查询字段'}
              </Chip>
              <Chip tone="neutral">
                已发送：{inspection.disclosure.sentFields.join('、') || '无'}
              </Chip>
              <Chip tone="good">PDF 未发送</Chip>
            </div>
          )}
          <MetadataReview
            key={item.item.id}
            item={item}
            collectionIds={collectionIds}
            busy={busy}
            onConfirm={confirm}
          />
        </div>
      )}
      {error && (
        <p className="mt-4 rounded-control bg-critical-soft p-3 text-xs text-critical">{error}</p>
      )}
    </Modal>
  );
}
