import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { AddLocalAttachmentInput, AttachmentRole } from '../../contract.js';

const MIME_BY_ROLE: Record<AttachmentRole, string> = {
  'primary-pdf': 'application/pdf',
  supplement: 'application/octet-stream',
  dataset: 'application/octet-stream',
  code: 'text/plain',
  'web-snapshot': 'text/html',
  other: 'application/octet-stream',
};

export function AddAttachmentDialog({
  open,
  busy,
  onClose,
  onAdd,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onAdd: (input: AddLocalAttachmentInput) => Promise<void>;
}) {
  const [path, setPath] = useState('');
  const [storageMode, setStorageMode] = useState<'managed' | 'linked'>('managed');
  const [role, setRole] = useState<AttachmentRole>('other');
  const [displayName, setDisplayName] = useState('');
  const [mimeType, setMimeType] = useState(MIME_BY_ROLE.other);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setPath('');
    setStorageMode('managed');
    setRole('other');
    setDisplayName('');
    setMimeType(MIME_BY_ROLE.other);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!path.trim()) return;
    setError(null);
    try {
      await onAdd({
        path: path.trim(),
        storageMode,
        role,
        displayName: displayName.trim() || undefined,
        mimeType: mimeType.trim(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '附件添加失败');
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="添加附件"
      description="附件可以是 PDF、补充材料、数据集、代码或网页快照；系统只按角色和 MIME 保存，不假设内容可阅读。"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <Field label="本机绝对路径">
          <input
            autoFocus
            className={controlClass}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/Users/me/Data/result.csv 或 C:\Data\result.csv"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="保存方式">
            <select
              className={controlClass}
              value={storageMode}
              onChange={(event) => setStorageMode(event.target.value as 'managed' | 'linked')}
            >
              <option value="managed">托管副本</option>
              <option value="linked">链接原文件</option>
            </select>
          </Field>
          <Field label="附件角色">
            <select
              className={controlClass}
              value={role}
              onChange={(event) => {
                const next = event.target.value as AttachmentRole;
                setRole(next);
                setMimeType(MIME_BY_ROLE[next]);
              }}
            >
              <option value="primary-pdf">主 PDF</option>
              <option value="supplement">补充材料</option>
              <option value="dataset">数据集</option>
              <option value="code">代码</option>
              <option value="web-snapshot">网页快照</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="显示名称">
            <input
              className={controlClass}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="默认使用文件名"
            />
          </Field>
          <Field label="MIME 类型">
            <input
              className={controlClass}
              value={mimeType}
              onChange={(event) => setMimeType(event.target.value)}
            />
          </Field>
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-control bg-critical-soft p-3 text-xs text-critical">{error}</p>
      )}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || !path.trim() || !mimeType.trim()}
          onClick={() => void submit()}
        >
          {busy ? '正在添加…' : '添加附件'}
        </Button>
      </div>
    </Modal>
  );
}
