import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, IconPlus } from '@workbench/ui';
import type {
  BatchInput,
  CreateFolderInput,
  CreateNoteInput,
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
  postNote,
  deleteNote,
  postBatch,
  deleteTrash,
  postFolder,
  patchFolder,
  deleteFolder,
} from './api.js';
import { NoteSidebar } from './components/NoteSidebar.js';
import { NotesToolbar } from './components/NotesToolbar.js';
import { NoteMasonryView } from './components/NoteMasonryView.js';
import { NoteListView } from './components/NoteListView.js';
import { NoteEditor } from './components/NoteEditor.js';
import { FolderModal } from './components/FolderModal.js';
import { NoteExportModal } from './components/NoteExportModal.js';

const NOTES_VIEW_MODE_STORAGE_KEY = 'notes_workbench_view_mode';

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

  const createNoteMutation = useMutation({
    mutationFn: (input: CreateNoteInput) => postNote(input),
    onSuccess: (newNote) => {
      invalidateAll();
      setActiveNoteForEdit(newNote);
    },
  });

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

  // 8. 交互操作处理器
  const handleCreateNote = (initialColor?: NoteColor) => {
    const currentFolder =
      selectedFolderId && selectedFolderId !== 'unfiled' ? selectedFolderId : null;
    createNoteMutation.mutate({
      title: '',
      content: '',
      color: initialColor ?? (selectedColor !== 'all' ? selectedColor : 'yellow'),
      folderId: currentFolder,
    });
  };

  const handleOpenEditor = (note: NoteView) => {
    setActiveNoteForEdit(note);
  };

  const handleCloseEditor = () => {
    setActiveNoteForEdit(null);
  };

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
    <div className="flex flex-col h-full w-full bg-page text-ink" data-testid="notes-page">
      {/* 主页面顶栏 */}
      <div className="px-6 py-3.5 border-b border-line bg-surface shrink-0">
        <PageHeader
          eyebrow={activeNoteForEdit ? '正在编辑便签' : 'Notes & Ideas'}
          title={activeNoteForEdit ? activeNoteForEdit.title.trim() || '无标题便签' : '便签笔记'}
          subtitle={
            activeNoteForEdit
              ? `主题色：${activeNoteForEdit.color} · 最后保存于 ${new Date(activeNoteForEdit.updatedAt).toLocaleTimeString()}`
              : 'Typora 级富 Markdown 写作、自适应多尺寸瀑布流、双视图体系与无限级树状文件夹管理'
          }
          action={
            activeNoteForEdit ? (
              <Button
                variant="secondary"
                onClick={handleCloseEditor}
                className="gap-1.5 px-3.5 text-xs font-semibold"
              >
                <span>← 返回便签列表</span>
              </Button>
            ) : selectedStatus !== 'trashed' ? (
              <Button
                variant="primary"
                onClick={() => handleCreateNote()}
                className="gap-1.5 px-4"
                data-testid="create-note-header-btn"
              >
                <IconPlus size={16} />
                <span>新建便签</span>
              </Button>
            ) : null
          }
        />
      </div>

      {/* 主体两栏布局：左侧树状侧栏 + 右侧便签流 / 便签编辑工作台 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧侧边栏 */}
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
            if (activeNoteForEdit) handleCloseEditor();
          }}
          onSelectStatus={(st) => {
            setSelectedStatus(st);
            setSelectedFolderId(null);
            setSelectedTag(null);
            if (activeNoteForEdit) handleCloseEditor();
          }}
          onSelectTag={(t) => {
            setSelectedTag(t);
            setSelectedFolderId(null);
            if (activeNoteForEdit) handleCloseEditor();
          }}
          onCreateFolder={handleOpenCreateFolder}
          onEditFolder={handleOpenEditFolder}
          onDeleteFolder={handleDeleteFolder}
          onEmptyTrash={handleEmptyTrash}
        />

        {/* 右侧主内容流 / 工作台 */}
        <main className="flex-1 flex flex-col min-w-0 bg-page overflow-y-auto p-4 sm:p-6">
          {activeNoteForEdit ? (
            /* 沉浸式原位便签工作区过渡 (In-place Note Workspace) */
            <div className="flex-1 flex flex-col h-full min-h-[600px] animate-scale-in">
              <NoteEditor
                note={activeNoteForEdit}
                folders={foldersTree}
                onClose={handleCloseEditor}
                onBack={handleCloseEditor}
                onUpdate={(updated) => {
                  setActiveNoteForEdit(updated);
                  invalidateAll();
                }}
                onDelete={() => {
                  handleCloseEditor();
                  invalidateAll();
                }}
                className="h-full"
              />
            </div>
          ) : (
            <>
              {/* 工具栏 */}
              <NotesToolbar
                searchKeyword={searchKeyword}
                onSearchChange={setSearchKeyword}
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
            </>
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
