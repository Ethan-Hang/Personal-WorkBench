import React, { useState } from 'react';
import type { NoteColor, NoteView } from '../../contract.js';
import { NOTE_COLORS } from '../../contract.js';
import { IconCheck, IconCheckSquare, IconFolder, IconRepeat, IconTrash } from '@workbench/ui';
import { getNoteColorBgClass, getNoteColorDotClass, getNoteColorLabel } from './NoteEditor.js';
import { IconPin, IconMoreVertical, IconShare } from './icons.js';

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
  onExport?: (note: NoteView) => void;
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
  onExport,
  onTagClick,
  className = '',
}: NoteCardProps) {
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const isTrashed = note.status === 'trashed';
  const isArchived = note.status === 'archived';

  const colorClass = getNoteColorBgClass(note.color);

  const handleTriggerTrash = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isExiting) return;
    setIsExiting(true);
    setShowActionMenu(false);
    setTimeout(() => {
      onTrashToggle?.(note);
    }, 350);
  };

  const handleTriggerArchive = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isExiting) return;
    setIsExiting(true);
    setShowActionMenu(false);
    setTimeout(() => {
      onArchiveToggle?.(note);
    }, 350);
  };

  const handleTriggerPermanentDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm('确定要彻底删除该便签吗？此操作无法撤销。')) {
      setIsExiting(true);
      setShowActionMenu(false);
      setTimeout(() => {
        onDeletePermanent?.(note);
      }, 350);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isExiting) return;
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
    <div className={`note-fluid-card-slot ${isExiting ? 'is-exiting' : ''}`}>
      <div className="pb-4">
        <div
          onClick={handleCardClick}
          className={`group relative rounded-panel border p-4.5 transition-all duration-300 ease-out cursor-pointer select-none flex flex-col justify-between hover-lift animate-note-enter ${colorClass} ${
            isSelected
              ? 'ring-2 ring-accent border-accent! shadow-md scale-[1.01]'
              : 'hover:shadow-md hover:border-accent/50'
          } ${note.isPinned ? 'shadow-xs border-warning/80 ring-1 ring-warning/30' : ''} ${className}`}
          data-testid={`note-card-${note.id}`}
        >
          {/* 顶部行：多选框、置顶徽标、置顶切换与快速变色 */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center flex-wrap gap-1.5">
              {(isSelectionMode || isSelected) && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSelect?.(note.id, e.target.checked);
                  }}
                  className="size-4 rounded border-line text-accent focus:ring-accent cursor-pointer"
                />
              )}

              {note.isPinned && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full border border-warning/30 shadow-2xs"
                  title="已置顶便签"
                >
                  <IconPin size={11} className="text-warning" />
                  <span>置顶</span>
                </span>
              )}

              {isArchived && (
                <span className="inline-flex items-center text-[11px] font-bold text-accent bg-accent-soft px-2 py-0.5 rounded-full border border-accent/20">
                  已归档
                </span>
              )}

              {isTrashed && (
                <span className="inline-flex items-center text-[11px] font-bold text-critical bg-critical-soft px-2 py-0.5 rounded-full border border-critical/20">
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
                  className={`p-1.5 rounded-control hover:bg-surface-2 transition-all active:scale-90 cursor-pointer ${
                    note.isPinned ? 'text-warning font-bold' : 'text-secondary hover:text-ink'
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
                    className="p-1.5 rounded-control hover:bg-surface-2 text-secondary hover:text-ink transition-all active:scale-90 cursor-pointer"
                    title={`当前主题色：${getNoteColorLabel(note.color)} (点击修改)`}
                  >
                    <div
                      className={`size-3.5 rounded-full border border-black/20 ${getNoteColorDotClass(
                        note.color,
                      )}`}
                    />
                  </button>

                  {showColorMenu && (
                    <div
                      className="absolute right-0 top-8 z-30 flex gap-1.5 p-2 bg-surface rounded-panel shadow-xl border border-line animate-popover-enter backdrop-blur"
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
                          className={`size-5.5 rounded-full border border-black/20 transition-transform cursor-pointer ${getNoteColorDotClass(
                            c,
                          )} ${note.color === c ? 'ring-2 ring-accent scale-115' : 'hover:scale-115'}`}
                          title={`切换为 ${getNoteColorLabel(c)}`}
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
                  className="p-1.5 rounded-control hover:bg-surface-2 text-secondary hover:text-ink transition-all active:scale-90"
                  title="更多操作"
                >
                  <IconMoreVertical size={14} />
                </button>

                {showActionMenu && (
                  <div
                    className="absolute right-0 top-8 z-30 w-36 py-1 bg-surface rounded-panel shadow-xl border border-line text-xs text-ink animate-popover-enter flex flex-col backdrop-blur"
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
                            className="px-3 py-1.5 text-left hover:bg-surface-2 flex items-center gap-2 text-good font-medium"
                          >
                            <IconRepeat size={13} />
                            <span>恢复便签</span>
                          </button>
                        )}
                        {onDeletePermanent && (
                          <button
                            type="button"
                            onClick={handleTriggerPermanentDelete}
                            className="px-3 py-1.5 text-left text-critical hover:bg-critical-soft/60 flex items-center gap-2 font-medium cursor-pointer"
                          >
                            <IconTrash size={13} />
                            <span>彻底删除</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {onArchiveToggle && (
                          <button
                            type="button"
                            onClick={handleTriggerArchive}
                            className="px-3 py-1.5 text-left hover:bg-surface-2 flex items-center gap-2 text-ink cursor-pointer"
                          >
                            <IconCheckSquare size={13} />
                            <span>{isArchived ? '取消归档' : '移入归档'}</span>
                          </button>
                        )}
                        {onTrashToggle && (
                          <button
                            type="button"
                            onClick={handleTriggerTrash}
                            className="px-3 py-1.5 text-left text-critical hover:bg-critical-soft/60 flex items-center gap-2 font-medium cursor-pointer"
                          >
                            <IconTrash size={13} />
                            <span>移至废纸篓</span>
                          </button>
                        )}
                        {onExport && (
                          <button
                            type="button"
                            onClick={() => {
                              onExport(note);
                              setShowActionMenu(false);
                            }}
                            className="px-3 py-1.5 text-left hover:bg-surface-2 flex items-center gap-2 text-ink border-t border-line/60 mt-0.5 pt-1.5 cursor-pointer font-medium"
                          >
                            <IconShare size={13} className="text-secondary" />
                            <span>导出便签...</span>
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
          <h3 className="font-bold text-ink text-base tracking-tight line-clamp-2 mb-1.5 leading-snug">
            {note.title.trim() || '无标题便签'}
          </h3>

          {/* 便签正文摘要 */}
          <p className="text-xs text-secondary line-clamp-4 mb-3 leading-relaxed whitespace-pre-wrap">
            {note.excerpt.trim() ||
              (note.content.trim() ? note.content.slice(0, 100) : '（空白便签）')}
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
                  className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-white/70 dark:bg-black/20 text-secondary hover:text-ink hover:bg-white dark:hover:bg-black/30 transition-colors border border-black/5 dark:border-white/10 font-medium cursor-pointer"
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
          <div className="flex items-center justify-between text-[11px] text-muted pt-2 border-t border-black/5 dark:border-white/10 mt-auto">
            <div className="flex items-center gap-2 truncate max-w-[65%]">
              {folderName ? (
                <span
                  className="inline-flex items-center gap-1 truncate text-secondary font-medium"
                  title={`所属文件夹: ${folderName}`}
                >
                  <IconFolder size={12} className="shrink-0 text-accent" />
                  <span className="truncate">{folderName}</span>
                </span>
              ) : (
                <span className="text-muted text-[10px]">未分类</span>
              )}

              {note.todoLinks && note.todoLinks.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-accent-soft text-accent text-[10px] font-semibold border border-accent/20"
                  title={`${note.todoLinks.length} 项关联待办`}
                >
                  <IconCheck size={10} />
                  <span>{note.todoLinks.length}</span>
                </span>
              )}
            </div>

            <span className="shrink-0 text-[10px]" title={`更新于 ${note.updatedAt}`}>
              {formatRelativeTime(note.updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
