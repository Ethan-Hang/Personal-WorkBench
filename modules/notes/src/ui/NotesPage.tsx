import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@workbench/ui';
import type {
  BatchInput,
  CreateFolderInput,
  FolderNode,
  FolderView,
  NoteColor,
  NoteStatus,
  NoteView,
  UpdateFolderInput,
} from '../contract.js';
import {
  fetchNotes,
  fetchFolders,
  fetchTags,
  fetchStats,
  deleteNote,
  postBatch,
  deleteTrash,
  postFolder,
  patchFolder,
  deleteFolder,
} from './api.js';
import { isModifierPressed } from './keyboard.js';
import { NoteSidebar } from './components/NoteSidebar.js';
import { NotesToolbar } from './components/NotesToolbar.js';
import { NoteMasonryView } from './components/NoteMasonryView.js';
import { NoteListView } from './components/NoteListView.js';
import { NoteEditor } from './components/NoteEditor.js';
import { FolderModal } from './components/FolderModal.js';
import { NoteExportModal } from './components/NoteExportModal.js';

const NOTES_VIEW_MODE_STORAGE_KEY = 'notes_workbench_view_mode';

export const NOTE_COLOR_LIST: NoteColor[] = ['yellow', 'green', 'blue', 'purple', 'pink', 'gray'];

export function getRandomNoteColor(): NoteColor {
  const index = Math.floor(Math.random() * NOTE_COLOR_LIST.length);
  return NOTE_COLOR_LIST[index] ?? 'yellow';
}

function flattenTree(nodes: FolderNode[]): FolderView[] {
  const list: FolderView[] = [];
  for (const node of nodes) {
    list.push({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      icon: node.icon,
      color: node.color,
      sortOrder: node.sortOrder,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      noteCount: node.noteCount ?? 0,
    });
    if (node.children && node.children.length > 0) {
      list.push(...flattenTree(node.children));
    }
  }
  return list;
}

export function NotesPage() {
  const queryClient = useQueryClient();

  // 1. 检索与筛选状态
  const [selectedStatus, setSelectedStatus] = useState<NoteStatus>('active');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<NoteColor | 'all'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 2. 视图持久化模式（瀑布流 / 经典列表）
  const [viewMode, setViewMode] = useState<'masonry' | 'list'>(() => {
    try {
      const saved = localStorage.getItem(NOTES_VIEW_MODE_STORAGE_KEY);
      if (saved === 'masonry' || saved === 'list') return saved;
    } catch {
      // ignore
    }
    return 'masonry';
  });

  const handleViewModeChange = (mode: 'masonry' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem(NOTES_VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  // 3. 多选批处理状态
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // 4. 弹窗状态（便签编辑器 & 文件夹配置）
  const [activeNoteForEdit, setActiveNoteForEdit] = useState<NoteView | null>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderView | null>(null);
  const [folderInitialParentId, setFolderInitialParentId] = useState<string | null>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportingNote, setExportingNote] = useState<NoteView | null>(null);

  // 5. 远端数据请求
  const foldersQuery = useQuery({
    queryKey: ['notes', 'folders'],
    queryFn: fetchFolders,
  });

  const tagsQuery = useQuery({
    queryKey: ['notes', 'tags'],
    queryFn: fetchTags,
  });

  const statsQuery = useQuery({
    queryKey: ['notes', 'stats'],
    queryFn: fetchStats,
  });

  const notesQuery = useQuery({
    queryKey: [
      'notes',
      'list',
      {
        status: selectedStatus,
        folderId: selectedFolderId,
        tag: selectedTag,
        keyword: searchKeyword,
        pinnedOnly,
      },
    ],
    queryFn: () =>
      fetchNotes({
        status: selectedStatus,
        folderId: selectedFolderId ?? undefined,
        tag: selectedTag ?? undefined,
        keyword: searchKeyword ? searchKeyword.trim() : undefined,
        pinnedOnly: pinnedOnly ? true : undefined,
        includeDescendants: true,
      }),
  });

  const rawNotes = useMemo(() => notesQuery.data?.notes ?? [], [notesQuery.data]);

  // 前端辅助颜色二次过滤
  const notes = useMemo(() => {
    if (selectedColor === 'all') return rawNotes;
    return rawNotes.filter((n) => n.color === selectedColor);
  }, [rawNotes, selectedColor]);

  // 文件夹映射表
  const foldersTree = useMemo(() => foldersQuery.data?.folders ?? [], [foldersQuery.data]);
  const allFoldersFlat = useMemo(() => flattenTree(foldersTree), [foldersTree]);
  const foldersMap = useMemo(() => {
    const map = new Map<string, FolderView>();
    for (const f of allFoldersFlat) {
      map.set(f.id, f);
    }
    return map;
  }, [allFoldersFlat]);

  // 6. 监听 URL query 参数（例如从全局跳转自动打开某便签或定位文件夹）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetNoteId = params.get('noteId');
    const targetFolderId = params.get('folderId');
    const targetTag = params.get('tag');

    if (targetFolderId) {
      setSelectedFolderId(targetFolderId);
    }
    if (targetTag) {
      setSelectedTag(targetTag);
    }
    if (targetNoteId && rawNotes.length > 0) {
      const match = rawNotes.find((n) => n.id === targetNoteId);
      if (match) {
        setActiveNoteForEdit(match);
      }
    }
  }, [rawNotes]);

  // 7. Mutations
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['notes'] });
  }, [queryClient]);

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => {
      invalidateAll();
    },
  });

  const batchMutation = useMutation({
    mutationFn: (input: BatchInput) => postBatch(input),
    onSuccess: () => {
      invalidateAll();
      setSelectedNoteIds(new Set());
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: deleteTrash,
    onSuccess: () => {
      invalidateAll();
      setSelectedNoteIds(new Set());
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (input: CreateFolderInput) => postFolder(input),
    onSuccess: () => invalidateAll(),
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFolderInput }) => patchFolder(id, input),
    onSuccess: () => invalidateAll(),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => {
      invalidateAll();
      if (selectedFolderId && !allFoldersFlat.some((f) => f.id === selectedFolderId)) {
        setSelectedFolderId(null);
      }
    },
  });

  // 8. 交互操作处理器 (本地草稿优先机制，只有真正输入并保存后才落库出现在瀑布流中)
  const handleCreateNote = useCallback(
    (initialColor?: NoteColor) => {
      const currentFolder =
        selectedFolderId && selectedFolderId !== 'unfiled' ? selectedFolderId : null;
      const noteColor =
        initialColor ?? (selectedColor !== 'all' ? selectedColor : getRandomNoteColor());

      const draftNote: NoteView = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        folderId: currentFolder,
        revision: 1,
        title: '',
        content: '',
        excerpt: '',
        color: noteColor,
        isPinned: false,
        status: 'active',
        metadata: {},
        tags: selectedTag ? [selectedTag] : [],
        todoLinks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        trashedAt: null,
      };

      setActiveNoteForEdit(draftNote);
    },
    [selectedFolderId, selectedColor, selectedTag],
  );

  const handleOpenEditor = (note: NoteView) => {
    setActiveNoteForEdit(note);
  };

  const handleCloseEditor = useCallback(() => {
    setActiveNoteForEdit(null);
    invalidateAll();
  }, [invalidateAll]);

  // 页面级快捷键监听 (Ctrl+N 新建, Ctrl+F 聚焦搜索, Esc 清除筛选/多选, 1/2 视图切换)
  useEffect(() => {
    const handlePageKeyDown = (e: KeyboardEvent) => {
      // 若当前正处于便签编辑器全屏/专注编辑状态，由 NoteEditor 内部快捷键处理
      if (activeNoteForEdit) return;

      const modKey = isModifierPressed(e);

      const activeEl = document.activeElement;
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute('contenteditable') === 'true';

      // 1. Ctrl+N / Cmd+N / Alt+N: 快速新建随机配色便签
      if ((modKey || e.altKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        handleCreateNote();
        return;
      }

      // 2. Ctrl+F / Cmd+F: 聚焦搜索输入框
      if (modKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // 3. Esc: 清除多选状态 / 清除搜索框 / 清除标签筛选 / 关闭文件夹弹窗
      if (e.key === 'Escape') {
        if (isFolderModalOpen) {
          setIsFolderModalOpen(false);
        } else if (isExportModalOpen) {
          setIsExportModalOpen(false);
        } else if (selectedNoteIds.size > 0) {
          setSelectedNoteIds(new Set());
        } else if (searchKeyword) {
          setSearchKeyword('');
        } else if (selectedTag) {
          setSelectedTag(null);
        }
        return;
      }

      // 4. 当用户未在搜索输入框中打字时，支持 1 / 2 快捷切换瀑布流与列表视图
      if (!isTyping) {
        if (e.key === '1') {
          handleViewModeChange('masonry');
        } else if (e.key === '2') {
          handleViewModeChange('list');
        }
      }
    };

    window.addEventListener('keydown', handlePageKeyDown);
    return () => {
      window.removeEventListener('keydown', handlePageKeyDown);
    };
  }, [
    activeNoteForEdit,
    isFolderModalOpen,
    isExportModalOpen,
    selectedNoteIds,
    searchKeyword,
    selectedTag,
    handleCreateNote,
  ]);

  const handleTogglePin = (note: NoteView) => {
    batchMutation.mutate({
      ids: [note.id],
      action: { kind: 'pin', pinned: !note.isPinned },
    });
  };

  const handleChangeColor = (note: NoteView, newColor: NoteColor) => {
    batchMutation.mutate({
      ids: [note.id],
      action: { kind: 'color', color: newColor },
    });
  };

  const handleArchiveToggle = (note: NoteView) => {
    const isCurrentlyArchived = note.status === 'archived';
    batchMutation.mutate({
      ids: [note.id],
      action: { kind: isCurrentlyArchived ? 'unarchive' : 'archive' },
    });
  };

  const handleTrashToggle = (note: NoteView) => {
    batchMutation.mutate({
      ids: [note.id],
      action: { kind: 'trash' },
    });
  };

  const handleRestore = (note: NoteView) => {
    batchMutation.mutate({
      ids: [note.id],
      action: { kind: 'restore' },
    });
  };

  const handleDeletePermanent = (note: NoteView) => {
    if (window.confirm('确定要彻底删除该便签吗？此操作不可撤销。')) {
      deleteNoteMutation.mutate(note.id);
    }
  };

  const handleEmptyTrash = () => {
    if (window.confirm('确定要清空废纸篓中的所有便签吗？所有已删除便签将永久消失，不可撤销。')) {
      emptyTrashMutation.mutate();
    }
  };

  // 批量操作回调
  const handleSelectNote = (id: string, selected: boolean) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedNoteIds(new Set(notes.map((n) => n.id)));
    } else {
      setSelectedNoteIds(new Set());
    }
  };

  const handleBatchPin = (isPinned: boolean) => {
    batchMutation.mutate({
      ids: Array.from(selectedNoteIds),
      action: { kind: 'pin', pinned: isPinned },
    });
  };

  const handleBatchColor = (color: NoteColor) => {
    batchMutation.mutate({
      ids: Array.from(selectedNoteIds),
      action: { kind: 'color', color },
    });
  };

  const handleBatchMove = (folderId: string | null) => {
    batchMutation.mutate({
      ids: Array.from(selectedNoteIds),
      action: { kind: 'move', folderId },
    });
  };

  const handleBatchArchive = (archive: boolean) => {
    batchMutation.mutate({
      ids: Array.from(selectedNoteIds),
      action: { kind: archive ? 'archive' : 'unarchive' },
    });
  };

  const handleBatchTrash = () => {
    batchMutation.mutate({
      ids: Array.from(selectedNoteIds),
      action: { kind: 'trash' },
    });
  };

  const handleBatchDelete = () => {
    if (window.confirm(`确定要彻底删除选中的 ${selectedNoteIds.size} 条便签吗？`)) {
      batchMutation.mutate({
        ids: Array.from(selectedNoteIds),
        action: { kind: 'delete' },
      });
    }
  };

  // 文件夹管理弹窗
  const handleOpenCreateFolder = (parentId?: string | null) => {
    setEditingFolder(null);
    setFolderInitialParentId(parentId ?? null);
    setIsFolderModalOpen(true);
  };

  const handleOpenEditFolder = (folder: FolderView) => {
    setEditingFolder(folder);
    setFolderInitialParentId(folder.parentId ?? null);
    setIsFolderModalOpen(true);
  };

  const handleDeleteFolder = (folderId: string) => {
    const f = foldersMap.get(folderId);
    const folderName = f ? f.name : '该文件夹';
    if (
      window.confirm(
        `确定删除文件夹「${folderName}」吗？其中的便签和子文件夹将自动提升至父级目录。`,
      )
    ) {
      deleteFolderMutation.mutate(folderId);
    }
  };

  const handleSaveFolder = async (data: {
    name: string;
    parentId?: string | null;
    icon?: string;
    color?: string;
  }) => {
    if (editingFolder) {
      await updateFolderMutation.mutateAsync({
        id: editingFolder.id,
        input: data,
      });
    } else {
      await createFolderMutation.mutateAsync(data);
    }
  };

  const handleNoteUpdate = useCallback(
    (updated: NoteView) => {
      setActiveNoteForEdit(updated);
      invalidateAll();
    },
    [invalidateAll],
  );

  const handleNoteDeleted = useCallback(() => {
    handleCloseEditor();
    invalidateAll();
  }, [handleCloseEditor, invalidateAll]);

  // 面包屑 / 筛选标题
  const currentViewTitle = useMemo(() => {
    if (selectedStatus === 'archived') return '已归档便签';
    if (selectedStatus === 'trashed') return '废纸篓';
    if (selectedFolderId === 'unfiled') return '未分类便签';
    if (selectedFolderId && foldersMap.has(selectedFolderId)) {
      const f = foldersMap.get(selectedFolderId)!;
      return `${f.icon || '📁'} ${f.name}`;
    }
    if (selectedTag) return `标签 #${selectedTag}`;
    return '全部便签';
  }, [selectedStatus, selectedFolderId, selectedTag, foldersMap]);

  return (
    <div
      className="flex flex-col h-full w-full bg-page text-ink overflow-hidden"
      data-testid="notes-page"
    >
      {/* 主页面顶栏（仅在列表视图显示，编辑便签时隐藏以让编辑器撑满整屏高度） */}
      {!activeNoteForEdit && (
        <div className="px-6 py-3.5 border-b border-line bg-surface shrink-0 animate-fade-in">
          <PageHeader
            eyebrow="Notes & Ideas"
            title="便签笔记"
            subtitle="Typora 级富 Markdown 写作、自适应多尺寸瀑布流、双视图体系与无限级树状文件夹管理"
          />
        </div>
      )}

      {/* 主体布局：仅在列表视图显示左侧树状侧栏，编辑时让编辑器占据全部宽度 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左侧侧边栏 */}
        {!activeNoteForEdit && (
          <NoteSidebar
            folders={foldersTree}
            selectedFolderId={selectedFolderId}
            selectedStatus={selectedStatus}
            selectedTag={selectedTag}
            stats={statsQuery.data}
            tags={tagsQuery.data}
            onSelectFolder={(fId) => {
              setSelectedFolderId(fId);
              setSelectedTag(null);
            }}
            onSelectStatus={(st) => {
              setSelectedStatus(st);
              setSelectedFolderId(null);
              setSelectedTag(null);
            }}
            onSelectTag={(t) => {
              setSelectedTag(t);
              setSelectedFolderId(null);
            }}
            onCreateFolder={handleOpenCreateFolder}
            onEditFolder={handleOpenEditFolder}
            onDeleteFolder={handleDeleteFolder}
            onEmptyTrash={handleEmptyTrash}
          />
        )}

        {/* 右侧主内容流 / 工作台 */}
        <main
          className={`flex-1 flex flex-col min-w-0 min-h-0 bg-page ${
            activeNoteForEdit ? 'overflow-hidden p-2 sm:p-3' : 'overflow-y-auto p-4 sm:p-6'
          }`}
        >
          {activeNoteForEdit ? (
            /* 沉浸式原位便签工作区过渡 (In-place Note Workspace) */
            <div className="flex-1 flex flex-col h-full min-h-0 max-h-full overflow-hidden animate-editor-enter">
              <NoteEditor
                note={activeNoteForEdit}
                folders={foldersTree}
                onClose={handleCloseEditor}
                onBack={handleCloseEditor}
                onUpdate={handleNoteUpdate}
                onDelete={handleNoteDeleted}
                className="h-full"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0 animate-view-fade-in">
              {/* 工具栏 */}
              <NotesToolbar
                searchKeyword={searchKeyword}
                onSearchChange={setSearchKeyword}
                searchInputRef={searchInputRef}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                selectedColor={selectedColor}
                onSelectColor={setSelectedColor}
                pinnedOnly={pinnedOnly}
                onTogglePinnedOnly={() => setPinnedOnly((prev) => !prev)}
                selectedNoteIds={selectedNoteIds}
                onClearSelection={() => setSelectedNoteIds(new Set())}
                onBatchPin={handleBatchPin}
                onBatchColor={handleBatchColor}
                onBatchMove={handleBatchMove}
                onBatchArchive={handleBatchArchive}
                onBatchTrash={handleBatchTrash}
                onBatchDelete={handleBatchDelete}
                onCreateNote={handleCreateNote}
                allFoldersFlat={allFoldersFlat}
                selectedStatus={selectedStatus}
                className="mb-5"
              />

              {/* 筛选指示标签栏 */}
              <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-line/60 text-xs text-secondary">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-sm">{currentViewTitle}</span>
                  <span className="text-muted font-mono">（共 {notes.length} 条）</span>

                  {selectedTag && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-soft text-accent font-semibold text-[11px] border border-accent/20">
                      标签: #{selectedTag}
                      <button
                        type="button"
                        onClick={() => setSelectedTag(null)}
                        className="hover:text-accent font-bold ml-0.5 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}

                  {selectedColor !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-2 border border-line text-[11px] font-semibold capitalize">
                      颜色: {selectedColor}
                      <button
                        type="button"
                        onClick={() => setSelectedColor('all')}
                        className="hover:text-ink font-bold ml-0.5 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}

                  {pinnedOnly && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warning-soft text-warning font-semibold border border-warning/20 text-[11px]">
                      仅置顶
                      <button
                        type="button"
                        onClick={() => setPinnedOnly(false)}
                        className="hover:text-warning font-bold ml-0.5 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* 视图内容区（瀑布流 / 列表） */}
              {notesQuery.isLoading ? (
                <div className="flex items-center justify-center py-20 text-xs text-muted">
                  正在加载便签列表...
                </div>
              ) : viewMode === 'masonry' ? (
                <NoteMasonryView
                  notes={notes}
                  foldersMap={foldersMap}
                  selectedNoteIds={selectedNoteIds}
                  isSelectionMode={selectedNoteIds.size > 0}
                  onSelectNote={handleSelectNote}
                  onClickNote={handleOpenEditor}
                  onTogglePin={handleTogglePin}
                  onChangeColor={handleChangeColor}
                  onArchiveToggle={handleArchiveToggle}
                  onTrashToggle={handleTrashToggle}
                  onDeletePermanent={handleDeletePermanent}
                  onRestore={handleRestore}
                  onExport={(note) => {
                    setExportingNote(note);
                    setIsExportModalOpen(true);
                  }}
                  onTagClick={(tag) => setSelectedTag(tag)}
                />
              ) : (
                <NoteListView
                  notes={notes}
                  foldersMap={foldersMap}
                  selectedNoteIds={selectedNoteIds}
                  isSelectionMode={selectedNoteIds.size > 0}
                  onSelectNote={handleSelectNote}
                  onSelectAll={handleSelectAll}
                  onClickNote={handleOpenEditor}
                  onTogglePin={handleTogglePin}
                  onArchiveToggle={handleArchiveToggle}
                  onTrashToggle={handleTrashToggle}
                  onDeletePermanent={handleDeletePermanent}
                  onRestore={handleRestore}
                  onExport={(note) => {
                    setExportingNote(note);
                    setIsExportModalOpen(true);
                  }}
                  onTagClick={(tag) => setSelectedTag(tag)}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* 文件夹新建/编辑弹窗 */}
      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        folderToEdit={editingFolder}
        initialParentId={folderInitialParentId}
        folders={foldersTree}
        onSave={handleSaveFolder}
      />

      {/* 导出中心模态弹窗 */}
      <NoteExportModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportingNote(null);
        }}
        note={exportingNote}
      />
    </div>
  );
}
