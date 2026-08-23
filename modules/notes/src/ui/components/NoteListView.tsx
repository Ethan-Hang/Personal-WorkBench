import React, { useState } from 'react';
import type { FolderView, NoteView } from '../../contract.js';
import { EmptyState, IconCheckSquare, IconFileText, IconRepeat, IconTrash } from '@workbench/ui';
import { getNoteColorDotClass } from './NoteEditor.js';
import { IconPin, IconShare } from './icons.js';

export interface NoteListViewProps {
  notes: NoteView[];
  foldersMap: Map<string, FolderView>;
  selectedNoteIds?: Set<string>;
  isSelectionMode?: boolean;
  onSelectNote?: (id: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onClickNote: (note: NoteView) => void;
  onTogglePin?: (note: NoteView) => void;
  onArchiveToggle?: (note: NoteView) => void;
  onTrashToggle?: (note: NoteView) => void;
  onDeletePermanent?: (note: NoteView) => void;
  onRestore?: (note: NoteView) => void;
  onExport?: (note: NoteView) => void;
  onTagClick?: (tag: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return isoString;
  }
}

interface NoteListRowProps {
  note: NoteView;
  folder?: FolderView;
  isSelected: boolean;
  isSelectionMode: boolean;
  onSelectNote?: (id: string, selected: boolean) => void;
  onClickNote: (note: NoteView) => void;
  onTogglePin?: (note: NoteView) => void;
  onArchiveToggle?: (note: NoteView) => void;
  onTrashToggle?: (note: NoteView) => void;
  onDeletePermanent?: (note: NoteView) => void;
  onRestore?: (note: NoteView) => void;
  onExport?: (note: NoteView) => void;
  onTagClick?: (tag: string) => void;
}

function NoteListRow({
  note,
  folder,
  isSelected,
  isSelectionMode,
  onSelectNote,
  onClickNote,
  onTogglePin,
  onArchiveToggle,
  onTrashToggle,
  onDeletePermanent,
  onRestore,
  onExport,
  onTagClick,
}: NoteListRowProps) {
  const [isExiting, setIsExiting] = useState(false);
  const isTrashed = note.status === 'trashed';
  const isArchived = note.status === 'archived';

  const handleTriggerTrash = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onTrashToggle?.(note);
    }, 320);
  };

  const handleTriggerArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onArchiveToggle?.(note);
    }, 320);
  };

  const handleTriggerPermanentDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要彻底删除该便签吗？此操作无法撤销。')) {
      setIsExiting(true);
      setTimeout(() => {
        onDeletePermanent?.(note);
      }, 320);
    }
  };

  return (
    <div className={`note-fluid-row-slot ${isExiting ? 'is-exiting' : ''}`}>
      <div>
        <div
          onClick={(e) => {
            if (isExiting) return;
            if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) {
              return;
            }
            if (isSelectionMode && onSelectNote) {
              onSelectNote(note.id, !isSelected);
            } else {
              onClickNote(note);
            }
          }}
          className={`group flex items-center px-4 py-3 cursor-pointer transition-colors select-none ${
            isSelected ? 'bg-accent-soft/40' : 'hover:bg-surface-2/60'
          }`}
          data-testid={`note-list-row-${note.id}`}
        >
          {/* 多选框 */}
          {(isSelectionMode || isSelected) && (
            <div className="w-8 shrink-0">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelectNote?.(note.id, e.target.checked);
                }}
                className="size-4 rounded border-line text-accent focus:ring-accent cursor-pointer"
              />
            </div>
          )}

          {/* 颜色圆点与置顶标记 */}
          <div className="w-7 shrink-0 flex items-center justify-center relative">
            <div
              className={`size-3.5 rounded-full border border-black/20 ${getNoteColorDotClass(
                note.color,
              )}`}
              title={`颜色: ${note.color}`}
            />
            {note.isPinned && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center"
                title="置顶便签"
              >
                <IconPin size={11} className="text-warning" />
              </span>
            )}
          </div>

          {/* 标题与摘要 */}
          <div className="flex-1 min-w-0 px-2.5">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ink truncate">
                {note.title.trim() || '无标题便签'}
              </h4>
              {isArchived && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-soft text-accent font-semibold border border-accent/20">
                  已归档
                </span>
              )}
              {isTrashed && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-critical-soft text-critical font-semibold border border-critical/20">
                  废纸篓
                </span>
              )}
            </div>
            <p className="text-xs text-secondary truncate mt-0.5">
              {note.excerpt.trim() || note.content.trim() || '（空白便签）'}
            </p>
          </div>

          {/* 文件夹 */}
          <div className="w-36 shrink-0 hidden md:flex items-center gap-1.5 px-2 text-xs text-secondary truncate">
            {folder ? (
              <>
                <span className="text-sm">{folder.icon || '📁'}</span>
                <span className="truncate">{folder.name}</span>
              </>
            ) : (
              <span className="text-muted text-[11px]">未分类</span>
            )}
          </div>

          {/* 标签 */}
          <div className="w-36 shrink-0 hidden lg:flex flex-wrap gap-1 px-2">
            {note.tags && note.tags.length > 0 ? (
              note.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  onClick={(e) => {
                    if (onTagClick) {
                      e.stopPropagation();
                      onTagClick(tag);
                    }
                  }}
                  className="inline-flex items-center text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-secondary hover:text-ink hover:bg-surface-3 transition-colors border border-line/40 font-medium"
                >
                  #{tag}
                </span>
              ))
            ) : (
              <span className="text-muted/40 text-[11px]">-</span>
            )}
            {note.tags && note.tags.length > 2 && (
              <span className="text-[10px] text-muted self-center">+{note.tags.length - 2}</span>
            )}
          </div>

          {/* 更新时间 */}
          <div className="w-24 shrink-0 text-right px-2 text-xs text-muted font-mono">
            {formatRelativeTime(note.updatedAt)}
          </div>

          {/* 快捷操作 */}
          <div className="w-20 shrink-0 flex items-center justify-end gap-1">
            {!isTrashed && onTogglePin && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(note);
                }}
                className={`p-1 rounded-control hover:bg-surface-2 transition-all cursor-pointer ${
                  note.isPinned
                    ? 'text-warning font-bold'
                    : 'text-muted hover:text-ink opacity-0 group-hover:opacity-100'
                }`}
                title={note.isPinned ? '取消置顶' : '置顶'}
              >
                <IconPin size={13} />
              </button>
            )}

            {isTrashed ? (
              <>
                {onRestore && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(note);
                    }}
                    className="p-1 rounded-control hover:bg-surface-2 text-good transition-all cursor-pointer"
                    title="恢复便签"
                  >
                    <IconRepeat size={13} />
                  </button>
                )}
                {onDeletePermanent && (
                  <button
                    type="button"
                    onClick={handleTriggerPermanentDelete}
                    className="p-1 rounded-control hover:bg-critical-soft text-critical transition-all cursor-pointer"
                    title="彻底删除"
                  >
                    <IconTrash size={13} />
                  </button>
                )}
              </>
            ) : (
              <>
                {onArchiveToggle && (
                  <button
                    type="button"
                    onClick={handleTriggerArchive}
                    className="p-1 rounded-control hover:bg-surface-2 text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title={isArchived ? '取消归档' : '归档'}
                  >
                    <IconCheckSquare size={13} />
                  </button>
                )}
                {onTrashToggle && (
                  <button
                    type="button"
                    onClick={handleTriggerTrash}
                    className="p-1 rounded-control hover:bg-critical-soft text-muted hover:text-critical opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="移至废纸篓"
                  >
                    <IconTrash size={13} />
                  </button>
                )}
                {onExport && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExport(note);
                    }}
                    className="p-1 rounded-control hover:bg-surface-2 text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="导出便签"
                  >
                    <IconShare size={13} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoteListView({
  notes,
  foldersMap,
  selectedNoteIds = new Set(),
  isSelectionMode = false,
  onSelectNote,
  onSelectAll,
  onClickNote,
  onTogglePin,
  onArchiveToggle,
  onTrashToggle,
  onDeletePermanent,
  onRestore,
  onExport,
  onTagClick,
  emptyTitle = '暂无便签',
  emptyDescription = '点击右上角「新建便签」开始记录您的第一条灵感与笔记',
  className = '',
}: NoteListViewProps) {
  if (notes.length === 0) {
    return (
      <div className="py-16">
        <EmptyState icon={IconFileText} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const allSelected = notes.length > 0 && notes.every((n) => selectedNoteIds.has(n.id));

  return (
    <div
      className={`rounded-panel border border-line bg-surface overflow-hidden shadow-xs ${className}`}
      data-testid="notes-list-view"
    >
      {/* 列表表头 */}
      <div className="flex items-center px-4 py-2.5 bg-surface-2/80 border-b border-line text-[11px] font-bold text-muted uppercase tracking-wider select-none">
        {(isSelectionMode || selectedNoteIds.size > 0) && (
          <div className="w-8 shrink-0">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll?.(e.target.checked)}
              className="size-4 rounded border-line text-accent focus:ring-accent cursor-pointer"
            />
          </div>
        )}
        <div className="w-7 shrink-0 text-center">色标</div>
        <div className="flex-1 min-w-0 px-2">标题与摘要</div>
        <div className="w-36 shrink-0 hidden md:block px-2">文件夹</div>
        <div className="w-36 shrink-0 hidden lg:block px-2">标签</div>
        <div className="w-24 shrink-0 text-right px-2">更新时间</div>
        <div className="w-20 shrink-0 text-right">操作</div>
      </div>

      {/* 列表条目 */}
      <div className="divide-y divide-line/60">
        {notes.map((note) => {
          const isSelected = selectedNoteIds.has(note.id);
          const folder = note.folderId ? foldersMap.get(note.folderId) : undefined;

          return (
            <NoteListRow
              key={note.id}
              note={note}
              folder={folder}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              onSelectNote={onSelectNote}
              onClickNote={onClickNote}
              onTogglePin={onTogglePin}
              onArchiveToggle={onArchiveToggle}
              onTrashToggle={onTrashToggle}
              onDeletePermanent={onDeletePermanent}
              onRestore={onRestore}
              onExport={onExport}
              onTagClick={onTagClick}
            />
          );
        })}
      </div>
    </div>
  );
}
