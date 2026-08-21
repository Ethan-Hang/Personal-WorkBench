import React, { useState, useEffect } from 'react';
import { Modal, Button, Field, controlClass } from '@workbench/ui';
import type { FolderNode, FolderView } from '../../contract.js';
import { FOLDER_NAME_MAX } from '../../contract.js';

export interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderToEdit?: FolderView | null;
  initialParentId?: string | null;
  folders: (FolderNode | FolderView)[];
  onSave: (data: {
    name: string;
    parentId?: string | null;
    icon?: string;
    color?: string;
  }) => Promise<void>;
}

const PRESET_EMOJIS = [
  '📁',
  '📚',
  '💡',
  '🚀',
  '💻',
  '🎯',
  '🎨',
  '📝',
  '☕',
  '🌟',
  '📌',
  '🔬',
  '📦',
  '🔍',
];
const PRESET_COLORS = [
  { name: '默认蓝', value: '#3b82f6' },
  { name: '清新绿', value: '#10b981' },
  { name: '活力橙', value: '#f59e0b' },
  { name: '优雅紫', value: '#8b5cf6' },
  { name: '甜美粉', value: '#ec4899' },
  { name: '低调灰', value: '#6b7280' },
];

function flattenFolderTree(nodes: (FolderNode | FolderView)[]): FolderView[] {
  const result: FolderView[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      icon: node.icon,
      color: node.color,
      sortOrder: node.sortOrder,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      noteCount: 'noteCount' in node ? node.noteCount : 0,
    });
    if ('children' in node && Array.isArray(node.children)) {
      result.push(...flattenFolderTree(node.children));
    }
  }
  return result;
}

export function FolderModal({
  isOpen,
  onClose,
  folderToEdit,
  initialParentId = null,
  folders,
  onSave,
}: FolderModalProps) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(initialParentId);
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#3b82f6');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (folderToEdit) {
        setName(folderToEdit.name);
        setParentId(folderToEdit.parentId ?? null);
        setIcon(folderToEdit.icon ?? '📁');
        setColor(folderToEdit.color ?? '#3b82f6');
      } else {
        setName('');
        setParentId(initialParentId ?? null);
        setIcon('📁');
        setColor('#3b82f6');
      }
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, folderToEdit, initialParentId]);

  const allFolders = flattenFolderTree(folders);

  // 避免将自身或自身子孙作为父级
  const availableParentFolders = allFolders.filter((f) => {
    if (!folderToEdit) return true;
    return f.id !== folderToEdit.id;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('文件夹名称不能为空');
      return;
    }
    if (trimmed.length > FOLDER_NAME_MAX) {
      setError(`文件夹名称不能超过 ${FOLDER_NAME_MAX} 个字符`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        name: trimmed,
        parentId: parentId || null,
        icon: icon || '📁',
        color: color || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存文件夹失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={folderToEdit ? '编辑文件夹' : '新建文件夹'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-md border border-rose-200 dark:border-rose-900/50">
            {error}
          </div>
        )}

        <Field label="文件夹名称 *">
          <input
            type="text"
            className={controlClass}
            placeholder="如：技术随笔、架构设计、读书笔记..."
            value={name}
            maxLength={FOLDER_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="父级目录">
          <select
            className={controlClass}
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value ? e.target.value : null)}
          >
            <option value="">（顶级根目录）</option>
            {availableParentFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon || '📁'} {f.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="图标 / Emoji">
          <div className="flex flex-wrap gap-2 pt-1">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`w-9 h-9 rounded-md flex items-center justify-center text-lg transition-colors border ${
                  icon === emoji
                    ? 'border-accent bg-accent/10 shadow-xs'
                    : 'border-border-subtle hover:border-border hover:bg-surface-raised'
                }`}
                onClick={() => setIcon(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>

        <Field label="标识颜色">
          <div className="flex flex-wrap gap-2.5 pt-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c.value
                    ? 'ring-2 ring-offset-2 ring-accent scale-110'
                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.value }}
                onClick={() => setColor(c.value)}
              />
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
