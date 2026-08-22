import React, { useState } from 'react';
import type { FolderView, NoteColor, NoteStatus } from '../../contract.js';
import { NOTE_COLORS } from '../../contract.js';
import {
  IconCheck,
  IconCheckSquare,
  IconChevronDown,
  IconFolder,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from '@workbench/ui';
import { getNoteColorDotClass, getNoteColorLabel } from './NoteEditor.js';
import { IconPin } from './icons.js';

export interface NotesToolbarProps {
  searchKeyword: string;
  onSearchChange: (keyword: string) => void;
  viewMode: 'masonry' | 'list';
  onViewModeChange: (mode: 'masonry' | 'list') => void;
  selectedColor: NoteColor | 'all';
  onSelectColor: (color: NoteColor | 'all') => void;
  pinnedOnly: boolean;
  onTogglePinnedOnly: () => void;
  selectedNoteIds: Set<string>;
  onClearSelection: () => void;
  onBatchPin?: (isPinned: boolean) => void;
  onBatchColor?: (color: NoteColor) => void;
  onBatchMove?: (folderId: string | null) => void;
  onBatchArchive?: (archive: boolean) => void;
  onBatchTrash?: () => void;
  onBatchDelete?: () => void;
  onCreateNote: (initialColor?: NoteColor) => void;
  allFoldersFlat: FolderView[];
  selectedStatus: NoteStatus;
  className?: string;
}

export function NotesToolbar({
  searchKeyword,
  onSearchChange,
  viewMode,
  onViewModeChange,
  selectedColor,
  onSelectColor,
  pinnedOnly,
  onTogglePinnedOnly,
  selectedNoteIds,
  onClearSelection,
  onBatchPin,
  onBatchColor,
  onBatchMove,
  onBatchArchive,
  onBatchTrash,
  onBatchDelete,
  onCreateNote,
  allFoldersFlat,
  selectedStatus,
  className = '',
}: NotesToolbarProps) {
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showBatchMoveDropdown, setShowBatchMoveDropdown] = useState(false);
  const [showBatchColorDropdown, setShowBatchColorDropdown] = useState(false);
  const [showNewNoteDropdown, setShowNewNoteDropdown] = useState(false);

  const isSelectionActive = selectedNoteIds.size > 0;
  const isTrashed = selectedStatus === 'trashed';

  return (
    <div className={`flex flex-col gap-3 ${className}`} data-testid="notes-toolbar">
      {/* 正常工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧：搜索框 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索便签标题、内容或标签..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-control border border-line bg-surface text-ink placeholder:text-muted focus:outline-hidden focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all shadow-2xs"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5 rounded cursor-pointer"
            >
              <IconX size={13} />
            </button>
          )}
        </div>

        {/* 右侧：视图切换、颜色筛选、置顶筛选、新建按钮 */}
        <div className="flex items-center gap-2">
          {/* 颜色过滤 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorDropdown((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border text-xs font-medium transition-all shadow-2xs cursor-pointer ${
                selectedColor !== 'all'
                  ? 'border-accent text-accent bg-accent-soft font-semibold'
                  : 'border-line bg-surface text-secondary hover:text-ink hover:bg-surface-2'
              }`}
              title="按主题色筛选"
            >
              {selectedColor === 'all' ? (
                <div className="size-3 rounded-full border border-line bg-gradient-to-tr from-amber-400 via-rose-400 to-sky-400" />
              ) : (
                <div
                  className={`size-3 rounded-full border border-black/20 ${getNoteColorDotClass(
                    selectedColor,
                  )}`}
                />
              )}
              <span>{selectedColor === 'all' ? '全部颜色' : getNoteColorLabel(selectedColor)}</span>
              <IconChevronDown size={12} />
            </button>

            {showColorDropdown && (
              <div
                className="absolute right-0 top-full mt-1.5 z-40 w-36 py-1 bg-surface rounded-panel shadow-xl border border-line text-xs text-ink animate-popover-enter flex flex-col backdrop-blur"
                onClick={() => setShowColorDropdown(false)}
              >
                <button
                  type="button"
                  onClick={() => onSelectColor('all')}
                  className={`px-3 py-1.5 text-left flex items-center justify-between hover:bg-surface-2 transition-colors cursor-pointer ${
                    selectedColor === 'all' ? 'font-bold text-accent bg-accent-soft/40' : ''
                  }`}
                >
                  <span>全部颜色</span>
                  {selectedColor === 'all' && <IconCheck size={12} />}
                </button>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSelectColor(c)}
                    className={`px-3 py-1.5 text-left flex items-center justify-between hover:bg-surface-2 transition-colors cursor-pointer ${
                      selectedColor === c ? 'font-bold text-accent bg-accent-soft/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`size-3 rounded-full border border-black/20 ${getNoteColorDotClass(
                          c,
                        )}`}
                      />
                      <span>{getNoteColorLabel(c)}</span>
                    </div>
                    {selectedColor === c && <IconCheck size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 仅看置顶 */}
          <button
            type="button"
            onClick={onTogglePinnedOnly}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-control border text-xs font-medium transition-all shadow-2xs cursor-pointer ${
              pinnedOnly
                ? 'border-warning/80 text-warning bg-warning-soft font-semibold'
                : 'border-line bg-surface text-secondary hover:text-ink hover:bg-surface-2'
            }`}
            title="仅看置顶便签"
          >
            <span>📌</span>
            <span>置顶</span>
          </button>

          {/* 视图模式切换 */}
          <div className="flex items-center rounded-control border border-line bg-surface p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => onViewModeChange('masonry')}
              className={`p-1.5 rounded-control transition-all text-xs flex items-center justify-center cursor-pointer ${
                viewMode === 'masonry'
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-secondary hover:text-ink'
              }`}
              title="瀑布流网格视图"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect width="8" height="10" x="3" y="3" rx="1" />
                <rect width="8" height="6" x="13" y="3" rx="1" />
                <rect width="8" height="6" x="3" y="15" rx="1" />
                <rect width="8" height="10" x="13" y="11" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 rounded-control transition-all text-xs flex items-center justify-center cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-secondary hover:text-ink'
              }`}
              title="经典列表视图"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="8" x2="21" y1="6" y2="6" />
                <line x1="8" x2="21" y1="12" y2="12" />
                <line x1="8" x2="21" y1="18" y2="18" />
                <line x1="3" x2="3.01" y1="6" y2="6" />
                <line x1="3" x2="3.01" y1="12" y2="12" />
                <line x1="3" x2="3.01" y1="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 新建便签一体化组合按钮 (Segmented Split Button) */}
          {!isTrashed && (
            <div className="relative inline-flex items-stretch rounded-control shadow-2xs bg-accent text-white group">
              <button
                type="button"
                onClick={() => onCreateNote()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent hover:bg-accent/90 text-white rounded-l-control transition-all active:scale-[0.98] cursor-pointer"
                title="新建便签"
              >
                <IconPlus size={14} />
                <span>新建便签</span>
              </button>
              <div className="w-[1px] bg-white/25 self-stretch" />
              <button
                type="button"
                onClick={() => setShowNewNoteDropdown((prev) => !prev)}
                className="inline-flex items-center justify-center px-2 py-1.5 bg-accent hover:bg-accent/90 text-white rounded-r-control transition-all active:scale-[0.98] cursor-pointer"
                title="选择初始便签颜色"
              >
                <IconChevronDown size={13} />
              </button>

              {showNewNoteDropdown && (
                <div
                  className="absolute right-0 top-full mt-1.5 z-40 flex gap-1.5 p-2 bg-surface rounded-panel shadow-xl border border-line animate-popover-enter backdrop-blur"
                  onClick={(e) => e.stopPropagation()}
                >
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onCreateNote(c);
                        setShowNewNoteDropdown(false);
                      }}
                      title={`以 ${getNoteColorLabel(c)} 新建便签`}
                      className={`size-6 rounded-full border border-black/20 transition-transform hover:scale-120 active:scale-95 cursor-pointer ${getNoteColorDotClass(
                        c,
                      )}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 批量操作浮层工具条 */}
      {isSelectionActive && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-surface-2 border border-accent/40 rounded-panel shadow-xs animate-slide-up-in text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-accent">已选中 {selectedNoteIds.size} 条便签</span>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-secondary hover:text-ink underline text-[11px] cursor-pointer"
            >
              取消选择
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 批量移动文件夹 */}
            {onBatchMove && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowBatchMoveDropdown((prev) => !prev);
                    setShowBatchColorDropdown(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface hover:bg-surface-3 border border-line text-ink transition-all cursor-pointer shadow-2xs"
                >
                  <IconFolder size={13} className="text-accent" />
                  <span>移动至</span>
                  <IconChevronDown size={11} />
                </button>

                {showBatchMoveDropdown && (
                  <div
                    className="absolute left-0 top-full mt-1.5 z-40 w-44 max-h-56 overflow-y-auto py-1 bg-surface rounded-panel shadow-xl border border-line text-xs text-ink animate-popover-enter backdrop-blur"
                    onClick={() => setShowBatchMoveDropdown(false)}
                  >
                    <button
                      type="button"
                      onClick={() => onBatchMove(null)}
                      className="w-full px-3 py-1.5 text-left hover:bg-surface-2 transition-colors cursor-pointer"
                    >
                      📄 未分类
                    </button>
                    {allFoldersFlat.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onBatchMove(f.id)}
                        className="w-full px-3 py-1.5 text-left hover:bg-surface-2 transition-colors truncate flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{f.icon || '📁'}</span>
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 批量修改颜色 */}
            {onBatchColor && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowBatchColorDropdown((prev) => !prev);
                    setShowBatchMoveDropdown(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface hover:bg-surface-3 border border-line text-ink transition-all cursor-pointer shadow-2xs"
                >
                  <div className="size-2.5 rounded-full bg-amber-400 border border-black/20" />
                  <span>变色</span>
                  <IconChevronDown size={11} />
                </button>

                {showBatchColorDropdown && (
                  <div
                    className="absolute left-0 top-full mt-1.5 z-40 flex gap-1.5 p-2 bg-surface rounded-panel shadow-xl border border-line animate-popover-enter backdrop-blur"
                    onClick={() => setShowBatchColorDropdown(false)}
                  >
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onBatchColor(c)}
                        title={`批量修改为 ${getNoteColorLabel(c)}`}
                        className={`size-5 rounded-full border border-black/20 hover:scale-120 active:scale-95 transition-transform cursor-pointer ${getNoteColorDotClass(
                          c,
                        )}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 批量置顶 / 取消置顶 */}
            {onBatchPin && !isTrashed && (
              <>
                <button
                  type="button"
                  onClick={() => onBatchPin(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface hover:bg-surface-3 border border-line text-ink transition-all cursor-pointer shadow-2xs"
                >
                  <IconPin size={13} className="text-warning" />
                  <span>置顶</span>
                </button>
                <button
                  type="button"
                  onClick={() => onBatchPin(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface hover:bg-surface-3 border border-line text-secondary hover:text-ink transition-all cursor-pointer shadow-2xs"
                >
                  <span>取消置顶</span>
                </button>
              </>
            )}

            {/* 批量归档 */}
            {onBatchArchive && !isTrashed && (
              <button
                type="button"
                onClick={() => onBatchArchive(selectedStatus !== 'archived')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-surface hover:bg-surface-3 border border-line text-ink transition-all cursor-pointer shadow-2xs"
              >
                <IconCheckSquare size={13} className="text-accent" />
                <span>{selectedStatus === 'archived' ? '恢复活跃' : '归档'}</span>
              </button>
            )}

            {/* 批量移至废纸篓 */}
            {onBatchTrash && !isTrashed && (
              <button
                type="button"
                onClick={onBatchTrash}
                className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-critical-soft hover:bg-critical/20 border border-critical/30 text-critical font-semibold transition-all cursor-pointer shadow-2xs"
              >
                <IconTrash size={13} />
                <span>移入废纸篓</span>
              </button>
            )}

            {/* 批量彻底删除 */}
            {onBatchDelete && isTrashed && (
              <button
                type="button"
                onClick={onBatchDelete}
                className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-critical hover:bg-critical/90 text-white font-semibold shadow-2xs transition-all cursor-pointer"
              >
                <IconTrash size={13} />
                <span>彻底删除</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
