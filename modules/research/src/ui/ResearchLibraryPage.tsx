import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAttachment,
  fetchCollections,
  fetchDeletionPreview,
  fetchWork,
  fetchWorks,
  postAddLocalAttachment,
  postCheckLocation,
  postCollection,
  postCreateManualWork,
  postPermanentDelete,
  postReconcile,
  postRelinkLocation,
  postRestoreWork,
  postTrashWork,
  putWorkCollections,
} from './api.js';
import { CompactLibraryView } from './components/CompactLibraryView.js';
import { AddAttachmentDialog } from './components/AddAttachmentDialog.js';
import { ImportInboxPanel } from './components/ImportInboxPanel.js';
import { ImportDialog } from './components/ImportDialog.js';
import type { ResearchLayout } from './components/LayoutSwitch.js';
import { ManualWorkDialog } from './components/ManualWorkDialog.js';
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
  const [search, setSearch] = useState('');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualWorkOpen, setManualWorkOpen] = useState(false);
  const [manualWorkBusy, setManualWorkBusy] = useState(false);
  const [attachmentEditionId, setAttachmentEditionId] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  const collectionsQuery = useQuery({
    queryKey: ['research', 'collections'],
    queryFn: fetchCollections,
  });
  const worksQuery = useQuery({
    queryKey: ['research', 'works', status, selectedCollectionId, search],
    queryFn: () =>
      fetchWorks({
        status,
        collectionId: status === 'active' ? (selectedCollectionId ?? undefined) : undefined,
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
    if (detailQuery.data) setSelectedCollectionIds(detailQuery.data.work.collectionIds);
  }, [detailQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['research'] });
  };

  const createCollectionMutation = useMutation({
    mutationFn: (name: string) => postCollection({ name }),
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

  const createCollection = async (name: string) => {
    setMessage(null);
    try {
      await createCollectionMutation.mutateAsync(name);
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

  const detailActions = {
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
    status,
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
    onSelectCollection: setSelectedCollectionId,
    onSelectWork: setSelectedWorkId,
    onStatus: setStatus,
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
