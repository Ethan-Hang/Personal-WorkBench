import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconExternalLink, IconPlus } from '@workbench/ui';
import type {
  WritingBlock,
  WritingBlockKind,
  WritingDocumentDetail,
  WritingDocumentStatus,
  WritingSection,
  WritingStructureSectionInput,
} from '../../contract.js';
import {
  deleteWritingDocument,
  fetchKnowledgeClaims,
  fetchKnowledgeEvidence,
  fetchKnowledgeMatrices,
  fetchKnowledgeNotes,
  fetchWritingDocument,
  fetchWritingDocuments,
  fetchWorks,
  patchWritingBlock,
  patchWritingDocument,
  postRestoreWritingDocument,
  postWritingDocument,
  putWritingStructure,
} from '../api.js';
import { CitationDialog } from '../components/CitationDialog.js';
import { SourceStatus } from './SourceStatus.js';

const documentStatusLabels: Record<WritingDocumentStatus, string> = {
  active: '当前',
  archived: '已归档',
  deleted: '回收站',
};

const blockKindLabels: Record<WritingBlockKind, string> = {
  text: '正文',
  note: '笔记',
  evidence: '证据',
  claim: '观点',
  matrix: '矩阵',
  citation: '引用',
};

function activeSections(document: WritingDocumentDetail): WritingSection[] {
  return document.sections
    .filter((section) => section.status === 'active')
    .sort((left, right) => left.position - right.position)
    .map((section) => ({
      ...section,
      blocks: section.blocks
        .filter((block) => block.status === 'active')
        .sort((left, right) => left.position - right.position),
    }));
}

function asStructure(sections: WritingSection[]): WritingStructureSectionInput[] {
  return sections.map((section, position) => ({
    id: section.id,
    title: section.title,
    position,
    blocks: section.blocks.map((block, blockPosition) => ({
      id: block.id,
      position: blockPosition,
    })),
  }));
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function resourceStateLabel(block: Exclude<WritingBlock, { kind: 'text' }>): string {
  if (block.targetState === 'archived') return '来源已归档';
  if (block.targetState === 'deleted') return '来源已删除';
  if (block.targetState === 'unavailable') return '文件不可用';
  return '来源可用';
}

function TextBlockEditor({
  block,
  busy,
  onSave,
}: {
  block: Extract<WritingBlock, { kind: 'text' }>;
  busy: boolean;
  onSave: (block: Extract<WritingBlock, { kind: 'text' }>, text: string) => void;
}) {
  const [text, setText] = useState(block.text);
  useEffect(() => setText(block.text), [block.id, block.revision, block.text]);
  return (
    <div>
      <textarea
        value={text}
        rows={5}
        onChange={(event) => setText(event.target.value)}
        placeholder="写下这一段的论述……"
        className="w-full resize-y border-0 bg-transparent text-sm leading-7 text-ink outline-none placeholder:text-muted"
      />
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <span className="text-[10px] text-muted">正文块 · v{block.revision}</span>
        <Button
          size="sm"
          disabled={busy || text === block.text}
          onClick={() => onSave(block, text)}
        >
          保存
        </Button>
      </div>
    </div>
  );
}

function ReferenceBlock({ block }: { block: Exclude<WritingBlock, { kind: 'text' }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-start">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          {blockKindLabels[block.kind]}
        </p>
        <p
          className={`mt-1 text-[10px] font-semibold ${block.targetState === 'current' ? 'text-accent' : 'text-warning'}`}
        >
          {resourceStateLabel(block)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-6 text-ink">{block.targetLabel}</p>
        {block.kind === 'evidence' && block.sourceState && (
          <div className="mt-2">
            <SourceStatus state={block.sourceState} compact />
          </div>
        )}
        <p className="mt-1 font-mono text-[9px] text-muted">{block.targetId}</p>
        {block.kind === 'citation' && (
          <p className="mt-2 text-[10px] leading-5 text-secondary">
            {block.citation.editionId ? `Edition ${block.citation.editionId}` : '无指定 Edition'}
            {block.citation.locator
              ? ` · ${block.citation.label ?? 'page'} ${block.citation.locator}`
              : ''}
            {block.citation.suppressAuthor ? ' · 隐藏作者' : ''}
          </p>
        )}
      </div>
      {block.targetUrl ? (
        <a
          href={block.targetUrl}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          查看来源 <IconExternalLink size={12} />
        </a>
      ) : (
        <span className="text-[10px] text-muted">来源不可打开</span>
      )}
    </div>
  );
}

export function WritingBoard({
  contextId,
  contextArchived,
  initialDocumentId,
  initialStatus,
  onMessage,
}: {
  contextId: string | null | undefined;
  contextArchived: boolean;
  initialDocumentId?: string | null;
  initialStatus?: WritingDocumentStatus;
  onMessage: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WritingDocumentStatus>(initialStatus ?? 'active');
  const [selectedId, setSelectedId] = useState<string | null>(initialDocumentId ?? null);
  const [title, setTitle] = useState('');
  const [resourceKind, setResourceKind] = useState<Exclude<WritingBlockKind, 'text'>>('note');
  const [citationLocator, setCitationLocator] = useState('');
  const [citationPrefix, setCitationPrefix] = useState('');
  const [citationSuffix, setCitationSuffix] = useState('');
  const [citationSuppressAuthor, setCitationSuppressAuthor] = useState(false);
  const [bibliographyOpen, setBibliographyOpen] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: ['research', 'knowledge', 'writing-documents', contextId ?? 'all', status],
    queryFn: () =>
      fetchWritingDocuments({
        ...(contextId !== undefined ? { contextId } : {}),
        status,
        limit: 100,
      }),
  });
  const documents = documentsQuery.data?.documents ?? [];
  const documentQuery = useQuery({
    queryKey: ['research', 'knowledge', 'writing-document', selectedId],
    queryFn: () => fetchWritingDocument(selectedId!, true),
    enabled: selectedId !== null,
  });
  const document = documentQuery.data ?? null;
  const sections = useMemo(() => (document ? activeSections(document) : []), [document]);
  const deletedSections =
    document?.sections.filter((section) => section.status === 'deleted') ?? [];
  const deletedBlocks =
    document?.sections
      .filter((section) => section.status === 'active')
      .flatMap((section) => section.blocks.filter((block) => block.status === 'deleted')) ?? [];

  useEffect(() => {
    if (selectedId && documents.some((item) => item.id === selectedId)) return;
    setSelectedId(documents[0]?.id ?? null);
  }, [documents, selectedId]);
  useEffect(
    () => setTitle(document?.title ?? ''),
    [document?.id, document?.revision, document?.title],
  );

  const pickerContextId = document?.contextId;
  const notesQuery = useQuery({
    queryKey: ['research', 'knowledge', 'notes', 'writing-picker', pickerContextId],
    queryFn: () =>
      fetchKnowledgeNotes({
        ...(pickerContextId !== undefined ? { contextId: pickerContextId } : {}),
        status: 'active',
        limit: 100,
      }),
    enabled: document?.status === 'active',
  });
  const evidenceQuery = useQuery({
    queryKey: ['research', 'knowledge', 'evidence', 'writing-picker', 'all'],
    queryFn: () => fetchKnowledgeEvidence({ status: 'active', limit: 100 }),
    enabled: document?.status === 'active',
  });
  const claimsQuery = useQuery({
    queryKey: ['research', 'knowledge', 'claims', 'writing-picker', pickerContextId],
    queryFn: () =>
      fetchKnowledgeClaims({
        ...(pickerContextId !== undefined ? { contextId: pickerContextId } : {}),
        status: 'active',
        limit: 100,
      }),
    enabled: document?.status === 'active',
  });
  const matricesQuery = useQuery({
    queryKey: ['research', 'knowledge', 'matrices', 'writing-picker', pickerContextId],
    queryFn: () =>
      fetchKnowledgeMatrices({
        ...(pickerContextId !== undefined ? { contextId: pickerContextId } : {}),
        status: 'active',
        limit: 100,
      }),
    enabled: document?.status === 'active',
  });
  const worksQuery = useQuery({
    queryKey: ['research', 'works', 'writing-picker'],
    queryFn: () => fetchWorks({ status: 'active', limit: 100 }),
    enabled: document?.status === 'active',
  });
  const resourceOptions = useMemo(() => {
    if (resourceKind === 'note')
      return (notesQuery.data?.notes ?? []).map((item) => ({ id: item.id, label: item.title }));
    if (resourceKind === 'evidence')
      return (evidenceQuery.data?.evidence ?? []).map((item) => ({
        id: item.id,
        label: item.title ?? item.sourceSnapshot.workTitle,
      }));
    if (resourceKind === 'claim')
      return (claimsQuery.data?.claims ?? []).map((item) => ({
        id: item.id,
        label: item.statement,
      }));
    if (resourceKind === 'citation')
      return (worksQuery.data?.works ?? []).map((item) => ({
        id: item.id,
        label: item.title,
        editionId: item.preferredEditionId,
      }));
    return (matricesQuery.data?.matrices ?? []).map((item) => ({
      id: item.id,
      label: item.title,
    }));
  }, [
    claimsQuery.data,
    evidenceQuery.data,
    matricesQuery.data,
    notesQuery.data,
    resourceKind,
    worksQuery.data,
  ]);

  const updateCachedDocument = (next: WritingDocumentDetail) => {
    queryClient.setQueryData(['research', 'knowledge', 'writing-document', next.id], next);
    void queryClient.invalidateQueries({
      queryKey: ['research', 'knowledge', 'writing-documents'],
    });
  };
  const createMutation = useMutation({
    mutationFn: () =>
      postWritingDocument({
        contextId: contextId ?? null,
        title: '未命名文稿',
      }),
    onSuccess: (next) => {
      setStatus('active');
      setSelectedId(next.id);
      updateCachedDocument(next);
      onMessage('文稿已创建');
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '创建失败'),
  });
  const documentMutation = useMutation({
    mutationFn: async (action: 'rename' | 'archive' | 'activate' | 'delete' | 'restore') => {
      if (!document) throw new Error('尚未选择文稿');
      if (action === 'delete') return deleteWritingDocument(document.id, document.revision);
      if (action === 'restore') return postRestoreWritingDocument(document.id, document.revision);
      return patchWritingDocument(document.id, {
        ...(action === 'rename'
          ? { title: title.trim() }
          : { status: action === 'archive' ? ('archived' as const) : ('active' as const) }),
        expectedRevision: document.revision,
      });
    },
    onSuccess: (next, action) => {
      updateCachedDocument(next);
      if (action !== 'rename') setStatus(next.status);
      onMessage(action === 'rename' ? '标题已保存' : '文稿状态已更新');
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '文稿更新失败'),
  });
  const structureMutation = useMutation({
    mutationFn: (nextSections: WritingStructureSectionInput[]) => {
      if (!document) throw new Error('尚未选择文稿');
      return putWritingStructure(document.id, {
        expectedStructureRevision: document.structureRevision,
        sections: nextSections,
      });
    },
    onSuccess: (next) => {
      updateCachedDocument(next);
      onMessage('文稿结构已保存');
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '结构保存失败'),
  });
  const blockMutation = useMutation({
    mutationFn: ({ block, text: nextText }: { block: WritingBlock; text: string }) =>
      patchWritingBlock(block.id, { text: nextText, expectedRevision: block.revision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['research', 'knowledge', 'writing-document', selectedId],
      });
      onMessage('正文已保存');
    },
    onError: (cause) => onMessage(cause instanceof Error ? cause.message : '正文保存失败'),
  });
  const busy =
    createMutation.isPending ||
    documentMutation.isPending ||
    structureMutation.isPending ||
    blockMutation.isPending;

  const renameSection = (section: WritingSection, nextTitle: string) => {
    if (!nextTitle.trim() || nextTitle.trim() === section.title) return;
    structureMutation.mutate(
      asStructure(sections).map((item) =>
        item.id === section.id ? { ...item, title: nextTitle.trim() } : item,
      ),
    );
  };
  const addSection = () => {
    const next = asStructure(sections);
    next.push({ title: '新章节', position: next.length, blocks: [] });
    structureMutation.mutate(next);
  };
  const reorderSection = (sectionIndex: number, direction: -1 | 1) => {
    structureMutation.mutate(
      asStructure(moveItem(sections, sectionIndex, sectionIndex + direction)),
    );
  };
  const removeSection = (sectionId: string) => {
    structureMutation.mutate(asStructure(sections.filter((section) => section.id !== sectionId)));
  };
  const restoreSection = (section: WritingSection) => {
    const next = asStructure(sections);
    next.push({
      id: section.id,
      title: section.title,
      position: next.length,
      blocks: [],
    });
    structureMutation.mutate(next);
  };
  const addTextBlock = (section: WritingSection) => {
    const next = asStructure(sections).map((item) =>
      item.id === section.id
        ? {
            ...item,
            blocks: [
              ...item.blocks,
              { kind: 'text' as const, text: '', position: item.blocks.length },
            ],
          }
        : item,
    );
    structureMutation.mutate(next);
  };
  const addResourceBlock = (
    section: WritingSection,
    resource: { id: string; editionId?: string | null },
  ) => {
    const next = asStructure(sections).map((item) =>
      item.id === section.id
        ? {
            ...item,
            blocks: [
              ...item.blocks,
              resourceKind === 'citation'
                ? {
                    kind: 'citation' as const,
                    targetId: resource.id,
                    editionId: resource.editionId ?? null,
                    locator: citationLocator.trim() || null,
                    label: citationLocator.trim() ? 'page' : null,
                    prefix: citationPrefix || null,
                    suffix: citationSuffix || null,
                    suppressAuthor: citationSuppressAuthor,
                    position: item.blocks.length,
                  }
                : {
                    kind: resourceKind,
                    targetId: resource.id,
                    position: item.blocks.length,
                  },
            ],
          }
        : item,
    );
    structureMutation.mutate(next);
  };
  const citationItems = useMemo(() => {
    const seen = new Set<string>();
    return sections
      .flatMap((section) => section.blocks)
      .filter(
        (block): block is Extract<WritingBlock, { kind: 'citation' }> => block.kind === 'citation',
      )
      .filter((block) => {
        const key = `${block.targetId}:${block.citation.editionId ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((block) => ({
        workId: block.targetId,
        editionId: block.citation.editionId,
        locator: block.citation.locator,
        label: block.citation.label,
        prefix: block.citation.prefix,
        suffix: block.citation.suffix,
        suppressAuthor: block.citation.suppressAuthor,
      }));
  }, [sections]);
  const removeBlock = (blockId: string) => {
    structureMutation.mutate(
      asStructure(
        sections.map((section) => ({
          ...section,
          blocks: section.blocks.filter((block) => block.id !== blockId),
        })),
      ),
    );
  };
  const restoreBlock = (block: WritingBlock) => {
    const next = asStructure(sections).map((section) =>
      section.id === block.sectionId
        ? {
            ...section,
            blocks: [...section.blocks, { id: block.id, position: section.blocks.length }],
          }
        : section,
    );
    structureMutation.mutate(next);
  };
  const moveBlock = (blockId: string, targetSectionId: string, targetIndex: number) => {
    const nextSections = sections.map((section) => ({ ...section, blocks: [...section.blocks] }));
    let moving: WritingBlock | undefined;
    for (const section of nextSections) {
      const index = section.blocks.findIndex((block) => block.id === blockId);
      if (index >= 0) [moving] = section.blocks.splice(index, 1);
    }
    if (!moving) return;
    const target = nextSections.find((section) => section.id === targetSectionId);
    if (!target) return;
    target.blocks.splice(Math.max(0, Math.min(targetIndex, target.blocks.length)), 0, moving);
    structureMutation.mutate(asStructure(nextSections));
  };
  const handleBlockKey = (
    event: KeyboardEvent<HTMLElement>,
    sectionIndex: number,
    blockIndex: number,
    blockId: string,
  ) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveBlock(
        blockId,
        sections[sectionIndex]!.id,
        blockIndex + (event.key === 'ArrowUp' ? -1 : 1),
      );
    }
    if (event.key === 'ArrowLeft' && sectionIndex > 0) {
      event.preventDefault();
      moveBlock(blockId, sections[sectionIndex - 1]!.id, sections[sectionIndex - 1]!.blocks.length);
    }
    if (event.key === 'ArrowRight' && sectionIndex < sections.length - 1) {
      event.preventDefault();
      moveBlock(blockId, sections[sectionIndex + 1]!.id, sections[sectionIndex + 1]!.blocks.length);
    }
  };
  const dropBlock = (event: DragEvent<HTMLElement>, sectionId: string, blockIndex: number) => {
    event.preventDefault();
    if (draggedBlockId) moveBlock(draggedBlockId, sectionId, blockIndex);
    setDraggedBlockId(null);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[14rem_minmax(28rem,1fr)_17rem] lg:overflow-hidden">
      <aside className="border-b border-line lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">文稿</p>
          {status === 'active' && !contextArchived && (
            <Button
              size="sm"
              icon={<IconPlus size={12} />}
              disabled={busy}
              onClick={() => createMutation.mutate()}
            >
              新建
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 border-y border-line">
          {(Object.keys(documentStatusLabels) as WritingDocumentStatus[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setSelectedId(null);
              }}
              className={`py-2 text-[10px] font-semibold ${status === value ? 'bg-surface-2 text-ink' : 'text-muted'}`}
            >
              {documentStatusLabels[value]}
            </button>
          ))}
        </div>
        <div className="p-2">
          {documents.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`w-full border-l-2 px-3 py-3 text-left ${item.id === selectedId ? 'border-accent bg-surface-2' : 'border-transparent hover:bg-surface-2/60'}`}
            >
              <span className="block truncate text-xs font-semibold text-ink">{item.title}</span>
              <span className="mt-1 block text-[10px] text-muted">
                结构 v{item.structureRevision} · 内容 v{item.revision}
              </span>
            </button>
          ))}
          {!documentsQuery.isLoading && documents.length === 0 && (
            <p className="px-3 py-8 text-center text-xs leading-5 text-muted">
              {status === 'active' ? '还没有文稿。' : '这里没有文稿。'}
            </p>
          )}
        </div>
      </aside>

      <main className="min-h-0 border-b border-line lg:overflow-y-auto lg:border-b-0 lg:border-r">
        {!document ? (
          <div className="grid min-h-72 place-items-center px-6 text-center text-xs text-muted">
            选择或新建一份文稿。
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-5 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
              <div className="min-w-0 flex-1">
                <input
                  value={title}
                  disabled={document.status === 'deleted'}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={() => {
                    if (title.trim() && title.trim() !== document.title)
                      documentMutation.mutate('rename');
                  }}
                  className="w-full border-0 bg-transparent text-xl font-semibold text-ink outline-none"
                />
                <p className="mt-1 text-[10px] text-muted">
                  结构 v{document.structureRevision} · 文档 v{document.revision} · 文本独立修订
                </p>
              </div>
              <div className="flex gap-2">
                {document.status !== 'deleted' && citationItems.length > 0 && (
                  <Button size="sm" onClick={() => setBibliographyOpen(true)}>
                    草稿参考文献
                  </Button>
                )}
                {document.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => documentMutation.mutate('archive')}
                  >
                    归档
                  </Button>
                )}
                {document.status === 'archived' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => documentMutation.mutate('activate')}
                  >
                    恢复使用
                  </Button>
                )}
                {document.status === 'deleted' ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => documentMutation.mutate('restore')}
                  >
                    恢复文稿
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => documentMutation.mutate('delete')}
                  >
                    移到回收站
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-8">
              {sections.map((section, sectionIndex) => (
                <section key={section.id} id={`writing-section-${section.id}`}>
                  <header className="flex items-center gap-2 border-b border-line pb-2">
                    <span className="font-mono text-[10px] text-muted">
                      {String(sectionIndex + 1).padStart(2, '0')}
                    </span>
                    <input
                      defaultValue={section.title}
                      disabled={document.status !== 'active'}
                      onBlur={(event) => renameSection(section, event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent text-base font-semibold text-ink outline-none"
                    />
                    {document.status === 'active' && (
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          disabled={busy || sectionIndex === 0}
                          onClick={() => reorderSection(sectionIndex, -1)}
                          className="px-1.5 py-1 text-muted hover:text-ink disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          disabled={busy || sectionIndex === sections.length - 1}
                          onClick={() => reorderSection(sectionIndex, 1)}
                          className="px-1.5 py-1 text-muted hover:text-ink disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => removeSection(section.id)}
                          className="px-1.5 py-1 text-muted hover:text-danger"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </header>
                  <div
                    className="mt-3 space-y-3"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropBlock(event, section.id, section.blocks.length)}
                  >
                    {section.blocks.map((block, blockIndex) => (
                      <article
                        key={block.id}
                        tabIndex={0}
                        draggable={document.status === 'active'}
                        onDragStart={() => setDraggedBlockId(block.id)}
                        onDragEnd={() => setDraggedBlockId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => dropBlock(event, section.id, blockIndex)}
                        onKeyDown={(event) =>
                          handleBlockKey(event, sectionIndex, blockIndex, block.id)
                        }
                        className="group border-l-2 border-line bg-surface-2/45 px-4 py-3 outline-none focus:border-accent"
                      >
                        <div className="mb-2 flex items-center justify-between text-[9px] text-muted">
                          <span>{blockKindLabels[block.kind]} · 拖动或 Alt+方向键移动</span>
                          {document.status === 'active' && (
                            <button
                              disabled={busy}
                              onClick={() => removeBlock(block.id)}
                              className="opacity-0 transition hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
                            >
                              移除
                            </button>
                          )}
                        </div>
                        {block.kind === 'text' ? (
                          <TextBlockEditor
                            block={block}
                            busy={busy || document.status !== 'active'}
                            onSave={(item, nextText) =>
                              blockMutation.mutate({ block: item, text: nextText })
                            }
                          />
                        ) : (
                          <ReferenceBlock block={block} />
                        )}
                      </article>
                    ))}
                    {section.blocks.length === 0 && (
                      <p className="border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                        这个章节还是空的。
                      </p>
                    )}
                  </div>
                  {document.status === 'active' && (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => addTextBlock(section)}
                    >
                      添加正文块
                    </Button>
                  )}
                </section>
              ))}
              {document.status === 'active' && (
                <Button icon={<IconPlus size={12} />} disabled={busy} onClick={addSection}>
                  添加章节
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      <aside className="min-h-0 p-4 lg:overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">插入资料</p>
        <select
          value={resourceKind}
          onChange={(event) =>
            setResourceKind(event.target.value as Exclude<WritingBlockKind, 'text'>)
          }
          className="mt-3 w-full border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
        >
          {(['note', 'evidence', 'claim', 'matrix', 'citation'] as const).map((kind) => (
            <option key={kind} value={kind}>
              {blockKindLabels[kind]}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[10px] leading-4 text-muted">
          选择资料后，将它加入目标章节；引用仍可回到原对象。
        </p>
        {resourceKind === 'citation' && (
          <div className="mt-3 grid gap-2 border-y border-line py-3">
            <input
              className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
              value={citationLocator}
              onChange={(event) => setCitationLocator(event.target.value)}
              placeholder="页码或位置（可选）"
            />
            <input
              className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
              value={citationPrefix}
              onChange={(event) => setCitationPrefix(event.target.value)}
              placeholder="前缀（可选）"
            />
            <input
              className="border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
              value={citationSuffix}
              onChange={(event) => setCitationSuffix(event.target.value)}
              placeholder="后缀（可选）"
            />
            <label className="flex items-center gap-2 text-[10px] text-secondary">
              <input
                type="checkbox"
                checked={citationSuppressAuthor}
                onChange={(event) => setCitationSuppressAuthor(event.target.checked)}
              />
              隐藏作者
            </label>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {resourceOptions.map((resource) => (
            <div key={resource.id} className="border-b border-line pb-2">
              <p className="line-clamp-2 text-xs font-semibold leading-5 text-ink">
                {resource.label}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {document?.status === 'active' &&
                  sections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      disabled={busy}
                      onClick={() => addResourceBlock(section, resource)}
                      className="border border-line px-1.5 py-1 text-[9px] text-muted hover:border-accent hover:text-accent"
                    >
                      加入 {index + 1}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {resourceOptions.length === 0 && (
            <p className="py-5 text-center text-xs text-muted">
              当前范围没有可用{blockKindLabels[resourceKind]}。
            </p>
          )}
        </div>

        {(deletedSections.length > 0 || deletedBlocks.length > 0) && (
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              可恢复内容
            </p>
            {deletedSections.map((section) => (
              <button
                key={section.id}
                disabled={busy || document?.status !== 'active'}
                onClick={() => restoreSection(section)}
                className="mt-2 block w-full text-left text-xs text-secondary hover:text-ink disabled:opacity-40"
              >
                恢复章节 · {section.title}
              </button>
            ))}
            {deletedBlocks.map((block) => (
              <button
                key={block.id}
                disabled={busy || document?.status !== 'active'}
                onClick={() => restoreBlock(block)}
                className="mt-2 block w-full text-left text-xs text-secondary hover:text-ink disabled:opacity-40"
              >
                恢复{blockKindLabels[block.kind]} ·{' '}
                {block.kind === 'text' ? block.text.slice(0, 28) || '空白正文' : block.targetLabel}
              </button>
            ))}
          </div>
        )}
      </aside>
      <CitationDialog
        open={bibliographyOpen}
        items={citationItems}
        initialMode="bibliography"
        title="草稿参考文献表"
        onClose={() => setBibliographyOpen(false)}
      />
    </div>
  );
}
