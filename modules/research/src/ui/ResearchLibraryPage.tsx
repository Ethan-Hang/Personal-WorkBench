import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCollection as deleteResearchCollection,
  deleteAttachment,
  deleteTag,
  deleteTagPermanently,
  deleteWorkRelation,
  fetchCollections,
  fetchCollectionDeletionPreview,
  fetchDeletionPreview,
  fetchTagCandidates,
  fetchTagDeletionPreview,
  fetchTags,
  fetchWork,
  fetchWorks,
  patchCollection,
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
  postReconcile,
  postRelinkLocation,
  postRestoreTag,
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
  SystemView,
  UpdateCollectionInput,
  WorkRelationKind,
} from '../contract.js';
import { CompactLibraryView } from './components/CompactLibraryView.js';
import { AddAttachmentDialog } from './components/AddAttachmentDialog.js';
import { CollectionManagerDialog } from './components/CollectionManagerDialog.js';
import { DuplicateMergeDialog } from './components/DuplicateMergeDialog.js';
import { ImportInboxPanel } from './components/ImportInboxPanel.js';
import { ImportDialog } from './components/ImportDialog.js';
import type { ResearchLayout } from './components/LayoutSwitch.js';
import { ManualWorkDialog } from './components/ManualWorkDialog.js';
import { TagManagerDialog } from './components/TagManagerDialog.js';
import { TemplateLibraryView } from './components/TemplateLibraryView.js';

const LAYOUT_STORAGE_KEY = 'research_library_layout';

function initialLayout(): ResearchLayout {
  if (typeof window === 'undefined') return 'compact';
  return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'template' ? 'template' : 'compact';
}

export function ResearchLibraryPage() {
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<ResearchLayout>(initialLayout);
  const [activeView, setActiveView] = useState<'library' | 'inbox'>('library');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'trashed'>('active');
  const [systemView, setSystemView] = useState<SystemView>('all');
  const [search, setSearch] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [manualWorkOpen, setManualWorkOpen] = useState(false);
  const [manualWorkBusy, setManualWorkBusy] = useState(false);
  const [attachmentEditionId, setAttachmentEditionId] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [collectionManagerOpen, setCollectionManagerOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [duplicateMergeOpen, setDuplicateMergeOpen] = useState(false);
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
    queryKey: ['research', 'works', status, systemView, selectedCollectionId, search],
    queryFn: () =>
      fetchWorks({
        status,
        systemView,
        collectionId:
          status === 'active' && systemView === 'all'
            ? (selectedCollectionId ?? undefined)
            : undefined,
        query: search.trim() || undefined,
        limit: 100,
      }),
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
        `永久删除将移除 ${preview.attachmentCount} 个附件关系和 ${preview.managedObjectCount} 个无引用托管对象；链接原文件不会删除。继续吗？`,
      );
      if (!accepted) return;
      await postPermanentDelete(id, preview.confirmationToken);
      setSelectedWorkId(null);
      setMessage('作品已永久删除');
      await invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '永久删除失败');
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
          `将处理 ${preview.items.length} 个作品，共 ${preview.items.reduce((sum, item) => sum + item.attachmentCount, 0)} 个附件${missing ? `，其中 ${missing} 个位置缺失或变化` : ''}。继续吗？`,
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
    onRelinkLocation: (id: string) => {
      const path = window.prompt('输入新的本机文件路径');
      if (path) {
        void (async () => {
          setMessage(null);
          try {
            const result = await postRelinkLocation(id, path);
            setMessage(
              result.kind === 'restored'
                ? '文件已按相同 hash 恢复到新位置'
                : `所选文件内容不同，已登记替换候选 ${result.candidateAssetId.slice(0, 8)}；原附件未改变`,
            );
            await invalidate();
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : '重新定位失败');
          }
        })();
      }
    },
    onRemoveAttachment: (id: string) => {
      if (window.confirm('只移除这条附件引用。链接原文件不会删除。')) {
        void run(() => deleteAttachment(id), '附件引用已移除');
      }
    },
    onAddAttachment: (editionId: string) => setAttachmentEditionId(editionId),
    onAddRelation: (workId: string) => {
      const targetWorkId = window.prompt('输入目标 Work ID');
      if (!targetWorkId) return;
      const requested = window.prompt('关系类型：related / extends / revises / cites', 'related');
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
        '作品关系已保存',
      );
    },
    onRemoveRelation: (id: string) => {
      void run(() => deleteWorkRelation(id), '作品关系已移除');
    },
    onTrashWork: (id: string) => {
      void run(() => postTrashWork(id), '作品已移入回收站');
    },
    onRestoreWork: (id: string) => {
      void run(() => postRestoreWork(id), '作品已恢复');
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
    onSelectCollection: selectCollection,
    onSelectWork: setSelectedWorkId,
    onToggleWorkSelection: toggleWorkSelection,
    onSystemView: selectSystemView,
    onBulkAction: runBulkAction,
    onStatus: (next: 'active' | 'trashed') =>
      selectSystemView(next === 'trashed' ? 'trash' : 'all'),
    onSearch: setSearch,
    detailActions,
  };

  return (
    <>
      {activeView === 'inbox' ? (
        <ImportInboxPanel
          layout={layout}
          collections={sharedProps.collections}
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

      <ImportDialog
        open={importOpen}
        collections={sharedProps.collections}
        onClose={() => setImportOpen(false)}
        onCommitted={() => {
          setMessage('论文已经入库');
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
          setMessage('目录已删除，作品和附件保持不变');
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
          setMessage('重复作品已合并，可在当前窗口撤销');
          await invalidate();
          return record;
        }}
        onUndo={async (id) => {
          await postUndoMerge(id);
          setMessage('作品合并已撤销');
          await invalidate();
        }}
      />

      <ManualWorkDialog
        open={manualWorkOpen}
        collections={sharedProps.collections}
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
            setMessage('手工记录已经创建');
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
    </>
  );
}
