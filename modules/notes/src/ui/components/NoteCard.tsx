import React, { useState } from 'react';
import type { NoteColor, NoteView } from '../../contract.js';
import { NOTE_COLORS } from '../../contract.js';
import { IconCheck, IconCheckSquare, IconFolder, IconRepeat, IconTrash } from '@workbench/ui';
import { getNoteColorBgClass, getNoteColorDotClass } from './NoteEditor.js';
import { IconPin, IconMoreVertical } from './icons.js';

export interface NoteCardProps {
  note: NoteView;
  folderName?: string;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onClick: (note: NoteView) => void;
  onTogglePin?: (note: NoteView) => void;
  onChangeColor?: (note: NoteView, color: NoteColor) => void;
  onArchiveToggle?: (note: NoteView) => void;
  onTrashToggle?: (note: NoteView) => void;
  onDeletePermanent?: (note: NoteView) => void;
  onRestore?: (note: NoteView) => void;
  onTagClick?: (tag: string) => void;
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
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return isoString;
  }
}

export function NoteCard({
  note,
  folderName,
  isSelected = false,
  isSelectionMode = false,
  onSelect,
  onClick,
  onTogglePin,
  onChangeColor,
  onArchiveToggle,
  onTrashToggle,
  onDeletePermanent,
  onRestore,
  onTagClick,
  className = '',
}: NoteCardProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const isTrashed = note.status === 'trashed';
  const isArchived = note.status === 'archived';

  const colorClass = getNoteColorBgClass(note.color);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) {
      return;
    }
    if (isSelectionMode && onSelect) {
      onSelect(note.id, !isSelected);
    } else {
      onClick(note);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-xl border p-4 transition-all duration-200 cursor-pointer select-none flex flex-col justify-between ${colorClass} ${
        isSelected
          ? 'ring-2 ring-accent border-accent/80 shadow-md scale-[1.01]'
          : 'hover:shadow-md hover:border-accent/40 dark:hover:border-accent/30'
      } ${note.isPinned ? 'shadow-xs border-amber-300/80 dark:border-amber-700/60' : ''} ${className}`}
      data-testid={`note-card-${note.id}`}
    >
      {/* 顶部行：多选框、置顶徽标、置顶切换与快速变色 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {(isSelectionMode || isSelected) && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect?.(note.id, e.target.checked);
              }}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent cursor-pointer"
            />
          )}

          {note.isPinned && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/50 px-1.5 py-0.5 rounded"
              title="已置顶便签"
            >
              <span className="text-xs">📌</span> 置顶
            </span>
          )}

          {isArchived && (
            <span className="text-[11px] font-medium text-purple-700 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/50 px-1.5 py-0.5 rounded">
              已归档
            </span>
          )}

          {isTrashed && (
            <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-900/50 px-1.5 py-0.5 rounded">
              废纸篓
            </span>
          )}
        </div>

        {/* 右上角快捷悬浮动作 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isTrashed && onTogglePin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(note);
              }}
              className={`p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${
                note.isPinned
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-secondary hover:text-ink'
              }`}
              title={note.isPinned ? '取消置顶' : '置顶便签'}
            >
              <IconPin size={14} />
            </button>
          )}

          {/* 变色菜单按钮 */}
          {!isTrashed && onChangeColor && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorMenu((prev) => !prev);
                  setShowActionMenu(false);
                }}
                className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-secondary hover:text-ink transition-colors"
                title="修改主题颜色"
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border border-black/20 ${getNoteColorDotClass(
                    note.color,
                  )}`}
                />
              </button>

              {showColorMenu && (
                <div
                  className="absolute right-0 top-7 z-30 flex gap-1.5 p-2 bg-surface rounded-lg shadow-lg border border-border animate-scale-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onChangeColor(note, c);
                        setShowColorMenu(false);
                      }}
                      className={`w-5 h-5 rounded-full border border-black/20 transition-transform ${getNoteColorDotClass(
                        c,
                      )} ${note.color === c ? 'ring-2 ring-accent scale-110' : 'hover:scale-110'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 更多动作 */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowActionMenu((prev) => !prev);
                setShowColorMenu(false);
              }}
              className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-secondary hover:text-ink transition-colors"
              title="更多操作"
            >
              <IconMoreVertical size={14} />
            </button>

            {showActionMenu && (
              <div
                className="absolute right-0 top-7 z-30 w-32 py-1 bg-surface rounded-lg shadow-lg border border-border text-xs text-ink animate-scale-in flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {isTrashed ? (
                  <>
                    {onRestore && (
                      <button
                        type="button"
                        onClick={() => {
                          onRestore(note);
                          setShowActionMenu(false);
                        }}
                        className="px-3 py-1.5 text-left hover:bg-surface-raised flex items-center gap-2"
                      >
                        <IconRepeat size={13} className="text-emerald-600" />
                        恢复便签
                      </button>
                    )}
                    {onDeletePermanent && (
                      <button
                        type="button"
                        onClick={() => {
                          onDeletePermanent(note);
                          setShowActionMenu(false);
                        }}
                        className="px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                      >
                        <IconTrash size={13} />
                        彻底删除
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {onArchiveToggle && (
                      <button
                        type="button"
                        onClick={() => {
                          onArchiveToggle(note);
                          setShowActionMenu(false);
                        }}
                        className="px-3 py-1.5 text-left hover:bg-surface-raised flex items-center gap-2"
                      >
                        <IconCheckSquare size={13} />
                        {isArchived ? '取消归档' : '移入归档'}
                      </button>
                    )}
                    {onTrashToggle && (
                      <button
                        type="button"
                        onClick={() => {
                          onTrashToggle(note);
                          setShowActionMenu(false);
                        }}
                        className="px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                      >
                        <IconTrash size={13} />
                        移至废纸篓
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 便签标题 */}
      <h3 className="font-semibold text-ink text-base tracking-tight line-clamp-2 mb-1.5 leading-snug">
        {note.title.trim() || '无标题便签'}
      </h3>

      {/* 便签正文摘要 */}
      <p className="text-xs text-secondary line-clamp-4 mb-3 leading-relaxed whitespace-pre-wrap">
        {note.excerpt.trim() || (note.content.trim() ? note.content.slice(0, 100) : '（空白便签）')}
      </p>

      {/* 标签列表 */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {note.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              onClick={(e) => {
                if (onTagClick) {
                  e.stopPropagation();
                  onTagClick(tag);
                }
              }}
              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-secondary hover:text-ink hover:bg-black/10 transition-colors"
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 5 && (
            <span className="text-[10px] text-muted self-center">+{note.tags.length - 5}</span>
          )}
        </div>
      )}

      {/* 底部元信息行：文件夹徽标、待办数、更新时间 */}
      <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-black/5 dark:border-white/5 mt-auto">
        <div className="flex items-center gap-2 truncate max-w-[65%]">
          {folderName ? (
            <span
              className="inline-flex items-center gap-1 truncate text-secondary font-medium"
              title={`所属文件夹: ${folderName}`}
            >
              <IconFolder size={12} className="shrink-0 text-accent/80" />
              <span className="truncate">{folderName}</span>
            </span>
          ) : (
            <span className="text-muted/70 text-[10px]">未分类</span>
          )}

          {note.todoLinks && note.todoLinks.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-100/60 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px]"
              title={`${note.todoLinks.length} 项关联待办`}
            >
              <IconCheck size={10} />
              {note.todoLinks.length}
            </span>
          )}
        </div>

        <span className="shrink-0 text-[10px]" title={`更新于 ${note.updatedAt}`}>
          {formatRelativeTime(note.updatedAt)}
        </span>
      </div>
    </div>
  );
}
