import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  deleteCollection as deleteResearchCollection,
  deleteAttachment,
  deleteTag,
  deleteTagPermanently,
  deleteWorkRelation,
  fetchCollections,
  fetchAttachmentDeletionPreview,
  fetchCollectionDeletionPreview,
  fetchDeletionPreview,
  fetchTagCandidates,
  fetchTagDeletionPreview,
  fetchTags,
  fetchWork,
  fetchWorks,
  patchCollection,
  patchWorkMetadata,
  patchTag,
  postAddLocalAttachment,
  postBulkWorkAction,
  postBulkWorkPreview,
  postCheckLocation,
  postCollection,
  postCreateManualWork,
  postMergeTags,
  postMergeWorks,
  postPermanentDelete,
  postPermanentDeleteAttachment,
  postReconcile,
  postRelinkLocation,
  postRestoreTag,
  postRestoreAttachment,
  postSavedQuery,
  postStructuredSearch,
  postRestoreWork,
  postTrashWork,
  postTag,
  postUndoMerge,
  postWorkMergePreview,
  postWorkRelation,
  putWorkCollections,
  putWorkTags,
} from './api.js';
import type {
  BulkWorkActionInput,
  ResearchSearchAst,
  SearchSort,
  SystemView,
  UpdateCollectionInput,
  WorkRelationKind,
  UpdateWorkMetadataInput,
} from '../contract.js';
import { CompactLibraryView } from './components/CompactLibraryView.js';
import { AddAttachmentDialog } from './components/AddAttachmentDialog.js';
import { CollectionManagerDialog } from './components/CollectionManagerDialog.js';
import { CanonicalImportDialog } from './components/CanonicalImportDialog.js';
import { DuplicateMergeDialog } from './components/DuplicateMergeDialog.js';
import { ExportDialog } from './components/ExportDialog.js';
import { ImportInboxPanel } from './components/ImportInboxPanel.js';
import { ImportDialog } from './components/ImportDialog.js';
import type { ResearchLayout } from './components/LayoutSwitch.js';
import { ManualWorkDialog } from './components/ManualWorkDialog.js';
import { ManagedStorageDialog } from './components/ManagedStorageDialog.js';
import { TagManagerDialog } from './components/TagManagerDialog.js';
import { TemplateLibraryView } from './components/TemplateLibraryView.js';
import { WorkMetadataDialog } from './components/WorkMetadataDialog.js';
import { ResearchSectionNav } from './components/ResearchSectionNav.js';

const LAYOUT_STORAGE_KEY = 'research_library_layout';

function emptySearchFilters(): ResearchSearchAst['filters'] {
  return {
    collectionIds: [],
    tagIds: [],
    types: [],
    yearFrom: null,
    yearTo: null,
    attachmentRoles: [],
    storageModes: [],
    fileStatuses: [],
    maintenance: [],
    relatedWorkId: null,
  };
}

function initialLayout(): ResearchLayout {
  if (typeof window === 'undefined') return 'compact';
  return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'template' ? 'template' : 'compact';
}

export function ResearchLibraryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<ResearchLayout>(initialLayout);
  const [activeView, setActiveView] = useState<'library' | 'inbox'>('library');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'trashed'>('active');
  const [systemView, setSystemView] = useState<SystemView>('all');
  const [search, setSearch] = useState('');
  const [searchFilters, setSearchFilters] =
    useState<ResearchSearchAst['filters']>(emptySearchFilters);
  const [searchSort, setSearchSort] = useState<SearchSort>('updated-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [manualWorkOpen, setManualWorkOpen] = useState(false);
  const [manualWorkBusy, setManualWorkBusy] = useState(false);
  const [attachmentEditionId, setAttachmentEditionId] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [metadataEditOpen, setMetadataEditOpen] = useState(false);
  const [metadataEditBusy, setMetadataEditBusy] = useState(false);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [duplicateMergeOpen, setDuplicateMergeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [canonicalImportOpen, setCanonicalImportOpen] = useState(false);
  const [managedStorageOpen, setManagedStorageOpen] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  const collectionsQuery = useQuery({
    queryKey: ['research', 'collections'],
    queryFn: fetchCollections,
  });
  const tagsQuery = useQuery({
    queryKey: ['research', 'tags'],
    queryFn: () => fetchTags({ status: 'all', sort: 'usage' }),
  });
  const worksQuery = useQuery({
    queryKey: [
      'research',
      'works',
      status,
      systemView,
      selectedCollectionId,
      search,
      searchFilters,
      searchSort,
      collectionsQuery.data,
    ],
    queryFn: () => {
      const selectedCollection = collectionsQuery.data?.collections.find(
        (collection) => collection.id === selectedCollectionId,
      );
      if (status === 'active' && systemView === 'all' && selectedCollection?.kind !== 'smart') {
        return postStructuredSearch({
          ast: {
            version: 1,
            text: search.trim(),
            filters: {
              ...searchFilters,
              collectionIds:
                selectedCollection?.kind === 'manual'
                  ? [...new Set([...searchFilters.collectionIds, selectedCollection.id])]
                  : searchFilters.collectionIds,
            },
            sort: searchSort,
          },
          cursor: null,
          limit: 100,
        });
      }
      return fetchWorks({
        status,
        systemView,
        collectionId:
          status === 'active' && systemView === 'all'
            ? (selectedCollectionId ?? undefined)
            : undefined,
        query: search.trim() || undefined,
        limit: 100,
      });
    },
  });
  const detailQuery = useQuery({
    queryKey: ['research', 'work', selectedWorkId],
    queryFn: () => fetchWork(selectedWorkId!),
    enabled: selectedWorkId !== null,
  });

  useEffect(() => {
    const works = worksQuery.data?.works ?? [];
    if (works.length === 0) {
      setSelectedWorkId(null);
      return;
    }
    if (!selectedWorkId || !works.some((work) => work.id === selectedWorkId)) {
      setSelectedWorkId(works[0]!.id);
    }
  }, [worksQuery.data, selectedWorkId]);

  useEffect(() => {
    const visibleIds = new Set((worksQuery.data?.works ?? []).map((work) => work.id));
    setSelectedWorkIds((ids) => ids.filter((id) => visibleIds.has(id)));
  }, [worksQuery.data]);

  useEffect(() => {
    if (detailQuery.data) {
      setSelectedCollectionIds(detailQuery.data.work.collectionIds);
      setSelectedTagIds(detailQuery.data.tags.map((tag) => tag.id));
    }
  }, [detailQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['research'] });
  };

  const createCollectionMutation = useMutation({
    mutationFn: (input: { name: string; parentId?: string | null }) => postCollection(input),
    onSuccess: invalidate,
  });
  const saveCollectionsMutation = useMutation({
    mutationFn: () => putWorkCollections(selectedWorkId!, selectedCollectionIds),
    onSuccess: async () => {
      setMessage('目录归属已保存');
      await invalidate();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '目录保存失败'),
  });
  const saveTagsMutation = useMutation({
    mutationFn: () => putWorkTags(selectedWorkId!, selectedTagIds),
    onSuccess: async () => {
      setMessage('标签已保存');
      await invalidate();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '标签保存失败'),
  });
  const saveSearchMutation = useMutation({
    mutationFn: (name: string) =>
      postSavedQuery({
        name,
        parentId: null,
        ast: {
          version: 1,
          text: search.trim(),
          filters: {
            ...searchFilters,
            collectionIds: (() => {
              const selected = collectionsQuery.data?.collections.find(
                (collection) => collection.id === selectedCollectionId,
              );
              return selected?.kind === 'manual'
                ? [...new Set([...searchFilters.collectionIds, selected.id])]
                : searchFilters.collectionIds;
            })(),
          },
          sort: searchSort,
        },
      }),
    onSuccess: async () => {
      setMessage('查询已保存为智能目录');
      await invalidate();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '保存查询失败'),
  });
  const reconcileMutation = useMutation({
    mutationFn: postReconcile,
    onSuccess: async () => {
      setMessage('文件状态已经重新检查');
      await invalidate();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '文件检查失败'),
  });

  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setMessage(null);
    try {
      await operation();
      if (success) setMessage(success);
      await invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '操作失败');
    }
  };

  const createCollection = async (name: string, parentId?: string | null) => {
    setMessage(null);
    try {
      await createCollectionMutation.mutateAsync({ name, parentId });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '目录创建失败');
    }
  };

  const permanentDelete = async (id: string) => {
    setMessage(null);
    try {
      const preview = await fetchDeletionPreview(id);
      const accepted = window.confirm(
        `永久删除将移除 ${preview.attachmentCount} 个附件和 ${preview.managedObjectCount} 个无引用托管文件；链接原文件不会删除。继续吗？`,
      );
      if (!accepted) return;
      await postPermanentDelete(id, preview.confirmationToken);
      setSelectedWorkId(null);
      setMessage('文献已永久删除');
      await invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '永久删除失败');
    }
  };

  const permanentDeleteAttachment = async (id: string) => {
    setMessage(null);
    try {
      const preview = await fetchAttachmentDeletionPreview(id);
      const shared =
        preview.otherAttachmentCount > 0
          ? `该文件仍被其他 ${preview.otherAttachmentCount} 个附件引用，不会删除托管文件。`
          : preview.managedObjectCount > 0
            ? '这是最后一条引用，对应的托管文件会一并删除。'
            : '这是最后一条引用，只删除文献库中的附件记录；链接原文件不会删除。';
      if (!window.confirm(`永久删除附件“${preview.displayName}”？${shared}`)) return;
      await postPermanentDeleteAttachment(id, preview.confirmationToken);
      setMessage('附件已永久删除');
      await invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '附件永久删除失败');
    }
  };

  const toggleCollection = (id: string) => {
    setSelectedCollectionIds((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  };

  const selectSystemView = (next: SystemView) => {
    setSystemView(next);
    setStatus(next === 'trash' ? 'trashed' : 'active');
    setSelectedCollectionId(null);
    setSelectedWorkIds([]);
  };

  const selectCollection = (id: string | null) => {
    setSystemView('all');
    setStatus('active');
    setSelectedCollectionId(id);
    setSelectedWorkIds([]);
  };

  const toggleWorkSelection = (id: string) => {
    setSelectedWorkIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  };

  const runBulkAction = async (action: BulkWorkActionInput['action'], targetId?: string) => {
    if (selectedWorkIds.length === 0) return;
    if ((action === 'add-to-collections' || action === 'remove-from-collections') && !targetId) {
      setMessage('请选择目录');
      return;
    }
    if ((action === 'add-tags' || action === 'remove-tags') && !targetId) {
      setMessage('请选择标签');
      return;
    }
    let input: BulkWorkActionInput;
    if (action === 'add-to-collections' || action === 'remove-from-collections') {
      input = { action, workIds: selectedWorkIds, collectionIds: [targetId!] };
    } else if (action === 'add-tags' || action === 'remove-tags') {
      input = { action, workIds: selectedWorkIds, tagIds: [targetId!] };
    } else {
      input = { action, workIds: selectedWorkIds };
    }
    setMessage(null);
    try {
      const preview = await postBulkWorkPreview(input);
      const missing = preview.items.reduce((sum, item) => sum + item.missingLocationCount, 0);
      if (
        !window.confirm(
          `将处理 ${preview.items.length} 条文献，共 ${preview.items.reduce((sum, item) => sum + item.attachmentCount, 0)} 个附件${missing ? `，其中 ${missing} 个位置缺失或变化` : ''}。继续吗？`,
        )
      ) {
        return;
      }
      const result = await postBulkWorkAction(input);
      const succeeded = result.results.filter((item) => item.status === 'succeeded').length;
      const skipped = result.results.filter((item) => item.status === 'skipped').length;
      const failed = result.results.filter((item) => item.status === 'failed').length;
      setMessage(`批量操作完成：成功 ${succeeded}，跳过 ${skipped}，失败 ${failed}`);
      setSelectedWorkIds([]);
      await invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '批量操作失败');
    }
  };

  const detailActions = {
    availableTags: (tagsQuery.data?.tags ?? []).filter((tag) => !tag.trashedAt),
    selectedTagIds,
    savingTags: saveTagsMutation.isPending,
    onToggleTag: toggleTag,
    onSaveTags: () => saveTagsMutation.mutate(),
    onToggleCollection: toggleCollection,
    onSaveCollections: () => saveCollectionsMutation.mutate(),
    onCheckLocation: (id: string) => {
      void run(() => postCheckLocation(id), '文件状态已更新');
    },
    onOpenReader: (assetId: string) => {
      const params = new URLSearchParams();
      if (selectedCollectionId) params.set('collectionId', selectedCollectionId);
      const query = params.toString();
      navigate(`/research/read/${encodeURIComponent(assetId)}${query ? `?${query}` : ''}`);
    },
    onRelinkLocation: (id: string) => {
      const path = window.prompt('输入新的本机文件路径');
      if (path) {
        void (async () => {
          setMessage(null);
          try {
            const result = await postRelinkLocation(id, path);
            setMessage(
              result.kind === 'restored'
                ? '文件内容一致，已恢复到新位置'
                : '所选文件内容不同，已保留为替换候选；原附件未改变',
            );
            await invalidate();
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : '重新定位失败');
          }
        })();
      }
    },
    onRemoveAttachment: (id: string) => {
      if (window.confirm('从文献库移除这条附件记录；链接原文件不会删除。')) {
        void run(() => deleteAttachment(id), '附件引用已移除');
      }
    },
    onRestoreAttachment: (id: string) => {
      void run(() => postRestoreAttachment(id), '附件已恢复');
    },
    onPermanentDeleteAttachment: (id: string) => {
      void permanentDeleteAttachment(id);
    },
    onAddAttachment: (editionId: string) => setAttachmentEditionId(editionId),
    onEditMetadata: () => setMetadataEditOpen(true),
    onAddRelation: (workId: string) => {
      const targetWorkId = window.prompt('输入目标文献 ID');
      if (!targetWorkId) return;
      const requested = window.prompt(
        '关系类型：related 相关 / extends 扩展 / revises 修订 / cites 引用',
        'related',
      );
      if (!requested || !['related', 'extends', 'revises', 'cites'].includes(requested)) {
        setMessage('关系类型无效');
        return;
      }
      const note = window.prompt('关系说明（可留空）');
      void run(
        () =>
          postWorkRelation(workId, {
            targetWorkId,
            kind: requested as WorkRelationKind,
            note: note?.trim() || null,
          }),
        '文献关系已保存',
      );
    },
    onRemoveRelation: (id: string) => {
      void run(() => deleteWorkRelation(id), '文献关系已移除');
    },
    onTrashWork: (id: string) => {
      void run(() => postTrashWork(id), '文献已移入回收站');
    },
    onRestoreWork: (id: string) => {
      void run(() => postRestoreWork(id), '文献已恢复');
    },
    onPermanentDelete: (id: string) => {
      void permanentDelete(id);
    },
  };

  const sharedProps = {
    layout,
    message,
    collections: collectionsQuery.data?.collections ?? [],
    works: worksQuery.data?.works ?? [],
    detail: detailQuery.data,
    worksLoading: worksQuery.isLoading,
    detailLoading: detailQuery.isLoading,
    selectedCollectionId,
    selectedWorkId,
    selectedCollectionIds,
    selectedWorkIds,
    status,
    systemView,
    search,
    tags: (tagsQuery.data?.tags ?? []).filter((tag) => !tag.trashedAt),
    searchFilters,
    searchSort,
    filtersOpen,
    savingSearch: saveSearchMutation.isPending,
    creatingCollection: createCollectionMutation.isPending,
    savingCollections: saveCollectionsMutation.isPending,
    reconciling: reconcileMutation.isPending,
    onLayout: setLayout,
    onImport: () => setImportOpen(true),
    onInbox: () => setActiveView('inbox'),
    onManualWork: () => setManualWorkOpen(true),
    onReconcile: () => reconcileMutation.mutate(),
    onCreateCollection: createCollection,
    onManageCollections: () => setCollectionManagerOpen(true),
    onManageTags: () => setTagManagerOpen(true),
    onReviewDuplicates: () => setDuplicateMergeOpen(true),
    onExport: () => setExportOpen(true),
    onRestoreBundle: () => setCanonicalImportOpen(true),
    onManageStorage: () => setManagedStorageOpen(true),
    onSelectCollection: selectCollection,
    onSelectWork: setSelectedWorkId,
    onToggleWorkSelection: toggleWorkSelection,
    onSystemView: selectSystemView,
    onBulkAction: runBulkAction,
    onStatus: (next: 'active' | 'trashed') =>
      selectSystemView(next === 'trashed' ? 'trash' : 'all'),
    onSearch: (value: string) => {
      if (!search.trim() && value.trim() && searchSort === 'updated-desc')
        setSearchSort('relevance');
      setSearch(value);
    },
    onToggleFilters: () => setFiltersOpen((value) => !value),
    onSearchFilters: setSearchFilters,
    onSearchSort: setSearchSort,
    onClearSearchFilters: () => {
      setSearchFilters(emptySearchFilters());
      setSearchSort(search.trim() ? 'relevance' : 'updated-desc');
    },
    onSaveSearch: async (name: string) => {
      await saveSearchMutation.mutateAsync(name);
    },
    detailActions,
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <ResearchSectionNav />
        <div className="min-h-0 flex-1">
          {activeView === 'inbox' ? (
            <ImportInboxPanel
              layout={layout}
              collections={sharedProps.collections.filter(
                (collection) => collection.kind === 'manual',
              )}
              onLayout={setLayout}
              onLibrary={() => setActiveView('library')}
              onManualWork={() => setManualWorkOpen(true)}
              onChanged={invalidate}
            />
          ) : layout === 'compact' ? (
            <CompactLibraryView {...sharedProps} />
          ) : (
            <TemplateLibraryView {...sharedProps} />
          )}
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        collections={sharedProps.collections.filter((collection) => collection.kind === 'manual')}
        onClose={() => setImportOpen(false)}
        onCommitted={() => {
          setMessage('PDF 已加入文献库');
          void invalidate();
        }}
      />

      <CollectionManagerDialog
        open={collectionManagerOpen}
        collections={sharedProps.collections}
        onClose={() => setCollectionManagerOpen(false)}
        onCreate={async (name, parentId) => {
          await createCollectionMutation.mutateAsync({ name, parentId });
          setMessage('目录已经创建');
        }}
        onUpdate={async (id: string, input: UpdateCollectionInput) => {
          await patchCollection(id, input);
          setMessage('目录已经更新');
          await invalidate();
        }}
        onPreviewDelete={fetchCollectionDeletionPreview}
        onDelete={async (id, strategy) => {
          await deleteResearchCollection(id, strategy);
          if (selectedCollectionId === id) selectCollection(null);
          setMessage('目录已删除，文献和附件保持不变');
          await invalidate();
        }}
      />

      <TagManagerDialog
        open={tagManagerOpen}
        tags={tagsQuery.data?.tags ?? []}
        onClose={() => setTagManagerOpen(false)}
        onCreate={async (input) => {
          await postTag(input);
          setMessage('标签已创建');
          await invalidate();
        }}
        onUpdate={async (id, input) => {
          await patchTag(id, input);
          setMessage('标签已更新');
          await invalidate();
        }}
        onCandidates={fetchTagCandidates}
        onPreviewDelete={fetchTagDeletionPreview}
        onTrash={async (id, expectedUpdatedAt) => {
          await deleteTag(id, expectedUpdatedAt);
          setMessage('标签已移入回收站');
          await invalidate();
        }}
        onRestore={async (id) => {
          await postRestoreTag(id);
          setMessage('标签已恢复');
          await invalidate();
        }}
        onPermanentDelete={async (id) => {
          await deleteTagPermanently(id);
          setMessage('标签已永久删除');
          await invalidate();
        }}
        onMerge={async (input) => {
          const record = await postMergeTags(input);
          setMessage('标签已合并，可在当前窗口撤销');
          await invalidate();
          return record;
        }}
        onUndo={async (id) => {
          await postUndoMerge(id);
          setMessage('标签合并已撤销');
          await invalidate();
        }}
      />

      <DuplicateMergeDialog
        open={duplicateMergeOpen}
        works={worksQuery.data?.works ?? []}
        initialSurvivorId={selectedWorkId}
        onClose={() => setDuplicateMergeOpen(false)}
        onPreview={postWorkMergePreview}
        onMerge={async (survivorId, input) => {
          const record = await postMergeWorks(survivorId, input);
          setSelectedWorkId(survivorId);
          setMessage('重复文献已合并，可在当前窗口撤销');
          await invalidate();
          return record;
        }}
        onUndo={async (id) => {
          await postUndoMerge(id);
          setMessage('文献合并已撤销');
          await invalidate();
        }}
      />

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      <CanonicalImportDialog
        open={canonicalImportOpen}
        onClose={() => setCanonicalImportOpen(false)}
        onRestored={async () => {
          setMessage('研究资料包已恢复');
          await invalidate();
        }}
      />

      <ManagedStorageDialog
        open={managedStorageOpen}
        onClose={() => setManagedStorageOpen(false)}
        onChanged={invalidate}
      />

      <ManualWorkDialog
        open={manualWorkOpen}
        collections={sharedProps.collections.filter((collection) => collection.kind === 'manual')}
        busy={manualWorkBusy}
        onClose={() => setManualWorkOpen(false)}
        onCreate={async (input) => {
          setManualWorkBusy(true);
          try {
            const created = await postCreateManualWork(input);
            setSelectedWorkId(created.work.id);
            setStatus('active');
            setSystemView('all');
            setSelectedCollectionId(null);
            setActiveView('library');
            setManualWorkOpen(false);
            setMessage('文献已创建');
            await invalidate();
          } finally {
            setManualWorkBusy(false);
          }
        }}
      />

      <AddAttachmentDialog
        open={attachmentEditionId !== null}
        busy={attachmentBusy}
        onClose={() => setAttachmentEditionId(null)}
        onAdd={async (input) => {
          if (!attachmentEditionId) return;
          setAttachmentBusy(true);
          try {
            await postAddLocalAttachment(attachmentEditionId, input);
            setAttachmentEditionId(null);
            setMessage('附件已经添加');
            await invalidate();
          } finally {
            setAttachmentBusy(false);
          }
        }}
      />

      <WorkMetadataDialog
        open={metadataEditOpen}
        detail={detailQuery.data}
        busy={metadataEditBusy}
        onClose={() => setMetadataEditOpen(false)}
        onSave={async (input: UpdateWorkMetadataInput) => {
          if (!selectedWorkId) return;
          setMetadataEditBusy(true);
          try {
            await patchWorkMetadata(selectedWorkId, input);
            setMetadataEditOpen(false);
            setMessage('文献信息已保存，原始识别结果仍可查看');
            await invalidate();
          } finally {
            setMetadataEditBusy(false);
          }
        }}
      />
    </>
  );
}
