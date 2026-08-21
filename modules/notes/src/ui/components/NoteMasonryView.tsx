import React, { useMemo } from 'react';
import type { FolderView, NoteColor, NoteView } from '../../contract.js';
import { EmptyState, IconFileText } from '@workbench/ui';
import { NoteCard } from './NoteCard.js';

export interface NoteMasonryViewProps {
  notes: NoteView[];
  foldersMap: Map<string, FolderView>;
  selectedNoteIds?: Set<string>;
  isSelectionMode?: boolean;
  onSelectNote?: (id: string, selected: boolean) => void;
  onClickNote: (note: NoteView) => void;
  onTogglePin?: (note: NoteView) => void;
  onChangeColor?: (note: NoteView, color: NoteColor) => void;
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

export function NoteMasonryView({
  notes,
  foldersMap,
  selectedNoteIds = new Set(),
  isSelectionMode = false,
  onSelectNote,
  onClickNote,
  onTogglePin,
  onChangeColor,
  onArchiveToggle,
  onTrashToggle,
  onDeletePermanent,
  onRestore,
  onExport,
  onTagClick,
  emptyTitle = '暂无便签',
  emptyDescription = '点击右上角「新建便签」开始记录您的第一条灵感与笔记',
  className = '',
}: NoteMasonryViewProps) {
  // 分离置顶与非置顶便签
  const { pinnedNotes, unpinnedNotes } = useMemo(() => {
    const pinned: NoteView[] = [];
    const unpinned: NoteView[] = [];
    for (const note of notes) {
      if (note.isPinned) {
        pinned.push(note);
      } else {
        unpinned.push(note);
      }
    }
    return { pinnedNotes: pinned, unpinnedNotes: unpinned };
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="py-16">
        <EmptyState icon={IconFileText} title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const renderNoteCard = (note: NoteView) => {
    const folder = note.folderId ? foldersMap.get(note.folderId) : undefined;
    const folderName = folder ? `${folder.icon || '📁'} ${folder.name}` : undefined;

    return (
      <div key={note.id} className="break-inside-avoid mb-4">
        <NoteCard
          note={note}
          folderName={folderName}
          isSelected={selectedNoteIds.has(note.id)}
          isSelectionMode={isSelectionMode}
          onSelect={onSelectNote}
          onClick={onClickNote}
          onTogglePin={onTogglePin}
          onChangeColor={onChangeColor}
          onArchiveToggle={onArchiveToggle}
          onTrashToggle={onTrashToggle}
          onDeletePermanent={onDeletePermanent}
          onRestore={onRestore}
          onExport={onExport}
          onTagClick={onTagClick}
        />
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-6 ${className}`} data-testid="notes-masonry-view">
      {/* 置顶便签分区 */}
      {pinnedNotes.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider px-1">
            <span>📌</span>
            <span>置顶便签 ({pinnedNotes.length})</span>
          </div>
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 [column-fill:_balance]">
            {pinnedNotes.map(renderNoteCard)}
          </div>
        </div>
      )}

      {/* 其它便签分区 */}
      {unpinnedNotes.length > 0 && (
        <div className="flex flex-col gap-3">
          {pinnedNotes.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-secondary uppercase tracking-wider px-1 pt-2">
              <span>其它便签 ({unpinnedNotes.length})</span>
            </div>
          )}
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 [column-fill:_balance]">
            {unpinnedNotes.map(renderNoteCard)}
          </div>
        </div>
      )}
    </div>
  );
}
