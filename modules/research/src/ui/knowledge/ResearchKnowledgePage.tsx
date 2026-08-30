import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconExternalLink, IconPlus } from '@workbench/ui';
import type { EvidenceDetail, NoteLink, ResearchNote } from '../../contract.js';
import {
  deleteNoteLink,
  deleteKnowledgeEvidence,
  deleteKnowledgeNote,
  fetchEvidenceDetail,
  fetchKnowledgeEvidence,
  fetchKnowledgeNotes,
  fetchNoteLinks,
  fetchReadingContexts,
  patchKnowledgeEvidence,
  patchKnowledgeNote,
  postKnowledgeNote,
  postNoteLink,
  postRestoreKnowledgeEvidence,
  postRestoreKnowledgeNote,
} from '../api.js';
import { ResearchSectionNav } from '../components/ResearchSectionNav.js';
import { ClaimBoard } from './ClaimBoard.js';
import { KnowledgeSearch } from './KnowledgeSearch.js';
import { KnowledgeExportDialog } from './KnowledgeExportDialog.js';
import { MatrixEditor } from './MatrixEditor.js';
import { NoteEditor } from './NoteEditor.js';
import { SourceStatus, sourceStateDescription } from './SourceStatus.js';
import { WritingBoard } from './WritingBoard.js';

type ContextSelection = 'all' | 'general' | string;
type MobilePane = 'notes' | 'evidence' | 'inspect';
type KnowledgeMode = 'sources' | 'claims' | 'matrices' | 'writing';

function initialQueryValue(name: string): string | null {
  return typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get(name);
}

function initialKnowledgeMode(): KnowledgeMode {
  const mode = initialQueryValue('mode');
  return mode === 'claims' || mode === 'matrices' || mode === 'writing' ? mode : 'sources';
}

function initialSourceStatus(): 'active' | 'deleted' {
  return initialQueryValue('sourceStatus') === 'deleted' ? 'deleted' : 'active';
}

function contextQuery(selection: ContextSelection) {
  if (selection === 'all') return {};
  return { contextId: selection === 'general' ? null : selection };
}

function excerptFor(evidence: EvidenceDetail) {
  return evidence.sourceSnapshot.anchor.textQuote?.exact ?? '';
}

function EmptyPane({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center text-xs leading-5 text-muted">
      {children}
    </div>
  );
}

function EvidenceInspector({
  evidence,
  busy,
  linkedNote,
  noteLink,
  sourceContextName,
  onSave,
  onDelete,
  onRestore,
  onLink,
  onUnlink,
}: {
  evidence: EvidenceDetail | null;
  busy: boolean;
  linkedNote: ResearchNote | null;
  noteLink: NoteLink | null;
  sourceContextName: string;
  onSave: (
    evidence: EvidenceDetail,
    changes: { title: string | null; summary: string; notes: string | null },
  ) => void;
  onDelete: (evidence: EvidenceDetail) => void;
  onRestore: (evidence: EvidenceDetail) => void;
  onLink: (note: ResearchNote, evidence: EvidenceDetail) => void;
  onUnlink: (link: NoteLink) => void;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setTitle(evidence?.title ?? '');
    setSummary(evidence?.summary ?? '');
    setNotes(evidence?.notes ?? '');
  }, [evidence?.id, evidence?.revision, evidence?.notes, evidence?.summary, evidence?.title]);

  if (!evidence) {
    return <EmptyPane>选择一条证据，检查它的摘要、来源状态和原文位置。</EmptyPane>;
  }

  const dirty =
    title !== (evidence.title ?? '') ||
    summary !== evidence.summary ||
    notes !== (evidence.notes ?? '');
  const disabled = evidence.status === 'deleted';
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              来源检查 · v{evidence.revision}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <SourceStatus state={evidence.sourceState} />
              <span className="text-[10px] text-muted">
                {sourceContextName} · 第 {evidence.sourceLink.pageNumber} 页
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {disabled ? (
              <Button size="sm" disabled={busy} onClick={() => onRestore(evidence)}>
                恢复
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(evidence)}>
                删除
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-secondary">
          {sourceStateDescription(evidence.sourceState)}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs font-semibold text-ink">{evidence.sourceSnapshot.workTitle}</p>
        <blockquote className="mt-3 border-l-2 border-accent bg-surface-2 px-3 py-2 text-xs leading-5 text-secondary">
          {excerptFor(evidence) || '区域来源没有文本快照。'}
        </blockquote>
        <a
          href={evidence.sourceLink.readerUrl}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          回到原文 <IconExternalLink size={12} />
        </a>
        {linkedNote?.status === 'active' && evidence.status === 'active' && (
          <div className="mt-3 border-y border-line py-3">
            <p className="text-[10px] font-semibold text-muted">当前笔记</p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-secondary">{linkedNote.title}</p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => (noteLink ? onUnlink(noteLink) : onLink(linkedNote, evidence))}
              >
                {noteLink ? '解除关联' : '关联证据'}
              </Button>
            </div>
          </div>
        )}

        <label className="mt-5 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          证据标题
          <input
            value={title}
            disabled={disabled}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          摘要
          <textarea
            value={summary}
            disabled={disabled}
            onChange={(event) => setSummary(event.target.value)}
            rows={5}
            className="mt-1.5 w-full resize-y rounded-control border border-line bg-surface px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          研究备注
          <textarea
            value={notes}
            disabled={disabled}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-control border border-line bg-surface px-3 py-2 text-sm normal-case leading-6 tracking-normal text-ink outline-none focus:border-accent"
          />
        </label>
        {!disabled && (
          <Button
            className="mt-4 w-full"
            variant="primary"
            disabled={busy || !dirty}
            onClick={() =>
              onSave(evidence, {
                title: title.trim() || null,
                summary,
                notes: notes.trim() || null,
              })
            }
          >
            保存证据
          </Button>
        )}

        <dl className="mt-6 border-t border-line pt-4 text-[10px] leading-5 text-muted">
          <div className="flex justify-between gap-4">
            <dt>来源类型</dt>
            <dd>{evidence.sourceSnapshot.sourceKind === 'ocr' ? '本地 OCR' : 'PDF 文本层'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>文件 hash</dt>
            <dd className="font-mono">{evidence.sourceSnapshot.assetHash.slice(0, 12)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>批注修订</dt>
            <dd>v{evidence.sourceSnapshot.annotationRevision}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function ResearchKnowledgePage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<KnowledgeMode>(initialKnowledgeMode);
  const [context, setContext] = useState<ContextSelection>('all');
  const [status, setStatus] = useState<'active' | 'deleted'>(initialSourceStatus);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() =>
    initialQueryValue('note'),
  );
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [selectionKind, setSelectionKind] = useState<'note' | 'evidence'>('evidence');
  const [mobilePane, setMobilePane] = useState<MobilePane>('evidence');
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const contextsQuery = useQuery({
    queryKey: ['research', 'reading-contexts', 'all'],
    queryFn: () => fetchReadingContexts('all'),
  });
  const notesQuery = useQuery({
    queryKey: ['research', 'knowledge', 'notes', context, status],
    queryFn: () => fetchKnowledgeNotes({ ...contextQuery(context), status, limit: 100 }),
  });
  const evidenceQuery = useQuery({
    queryKey: ['research', 'knowledge', 'evidence', context, status],
    queryFn: () => fetchKnowledgeEvidence({ ...contextQuery(context), status, limit: 100 }),
  });
  const generalEvidenceQuery = useQuery({
    queryKey: ['research', 'knowledge', 'evidence', 'general', status, 'shared'],
    queryFn: () => fetchKnowledgeEvidence({ contextId: null, status, limit: 100 }),
    enabled: context !== 'all' && context !== 'general',
  });
  const evidenceDetailQuery = useQuery({
    queryKey: ['research', 'knowledge', 'evidence-detail', selectedEvidenceId],
    queryFn: () => fetchEvidenceDetail(selectedEvidenceId!),
    enabled: selectedEvidenceId !== null,
  });
  const contexts = contextsQuery.data?.contexts ?? [];
  const notes = notesQuery.data?.notes ?? [];
  const evidence = useMemo(
    () =>
      [
        ...(evidenceQuery.data?.evidence ?? []),
        ...(generalEvidenceQuery.data?.evidence ?? []),
      ].filter(
        (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
      ),
    [evidenceQuery.data?.evidence, generalEvidenceQuery.data?.evidence],
  );
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedEvidence = evidenceDetailQuery.data ?? null;
  const noteLinksQuery = useQuery({
    queryKey: ['research', 'knowledge', 'note-links', selectedNoteId],
    queryFn: () => fetchNoteLinks(selectedNoteId!),
    enabled: selectedNoteId !== null,
  });
  const selectedEvidenceLink =
    noteLinksQuery.data?.find(
      (link) =>
        link.status === 'active' &&
        link.target.kind === 'evidence' &&
        link.target.evidenceId === selectedEvidenceId,
    ) ?? null;

  useEffect(() => {
    if (selectedNoteId && notes.some((note) => note.id === selectedNoteId)) return;
    setSelectedNoteId(notes[0]?.id ?? null);
  }, [notes, selectedNoteId]);

  useEffect(() => {
    if (selectedEvidenceId && evidence.some((item) => item.id === selectedEvidenceId)) return;
    setSelectedEvidenceId(evidence[0]?.id ?? null);
  }, [evidence, selectedEvidenceId]);

  useEffect(() => {
    if (selectionKind === 'evidence' && evidence.length === 0 && notes.length > 0) {
      setSelectionKind('note');
    }
  }, [evidence.length, notes.length, selectionKind]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2_400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const invalidateNotes = () =>
    queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'notes'] });
  const invalidateEvidence = () =>
    queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'evidence'] });
  const noteMutation = useMutation({
    mutationFn: async (action: {
      kind: 'create' | 'update' | 'delete' | 'restore';
      note?: ResearchNote;
      title?: string;
      body?: string;
    }) => {
      if (action.kind === 'create') {
        return postKnowledgeNote({
          contextId: context === 'all' || context === 'general' ? null : context,
          title: '未命名笔记',
          body: '',
        });
      }
      const note = action.note!;
      if (action.kind === 'update') {
        return patchKnowledgeNote(note.id, {
          title: action.title!,
          body: action.body!,
          expectedRevision: note.revision,
        });
      }
      if (action.kind === 'delete') return deleteKnowledgeNote(note.id, note.revision);
      return postRestoreKnowledgeNote(note.id, note.revision);
    },
    onSuccess: (note, action) => {
      setSelectedNoteId(note.id);
      if (action.kind === 'create') {
        setSelectionKind('note');
        setMobilePane('inspect');
      }
      setMessage(
        action.kind === 'create'
          ? '笔记已创建'
          : action.kind === 'delete'
            ? '笔记已移入回收站'
            : action.kind === 'restore'
              ? '笔记已恢复'
              : '笔记已保存',
      );
      void invalidateNotes();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '笔记操作失败'),
  });
  const evidenceMutation = useMutation({
    mutationFn: async (action: {
      kind: 'update' | 'delete' | 'restore';
      evidence: EvidenceDetail;
      title?: string | null;
      summary?: string;
      notes?: string | null;
    }) => {
      if (action.kind === 'update') {
        return patchKnowledgeEvidence(action.evidence.id, {
          title: action.title,
          summary: action.summary,
          notes: action.notes,
          expectedRevision: action.evidence.revision,
        });
      }
      if (action.kind === 'delete') {
        return deleteKnowledgeEvidence(action.evidence.id, action.evidence.revision);
      }
      return postRestoreKnowledgeEvidence(action.evidence.id, action.evidence.revision);
    },
    onSuccess: (item, action) => {
      queryClient.setQueryData(['research', 'knowledge', 'evidence-detail', item.id], item);
      setMessage(
        action.kind === 'delete'
          ? '证据已移入回收站'
          : action.kind === 'restore'
            ? '证据已恢复'
            : '证据已保存',
      );
      void invalidateEvidence();
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '证据操作失败'),
  });
  const noteLinkMutation = useMutation({
    mutationFn: async (action: {
      kind: 'link' | 'unlink';
      note?: ResearchNote;
      evidence?: EvidenceDetail;
      link?: NoteLink;
    }) => {
      if (action.kind === 'link') {
        return postNoteLink(action.note!.id, {
          target: { kind: 'evidence', evidenceId: action.evidence!.id },
        });
      }
      return deleteNoteLink(action.link!.id, action.link!.revision);
    },
    onSuccess: (_, action) => {
      setMessage(action.kind === 'link' ? '证据已关联到笔记' : '证据关联已解除');
      void queryClient.invalidateQueries({ queryKey: ['research', 'knowledge', 'note-links'] });
    },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : '证据关联失败'),
  });

  const contextName =
    selectedNote?.contextId === null
      ? '通用研究'
      : (contexts.find((item) => item.id === selectedNote?.contextId)?.name ?? '研究上下文');
  const busy = noteMutation.isPending || evidenceMutation.isPending || noteLinkMutation.isPending;
  const selectedContextArchived =
    context !== 'all' &&
    context !== 'general' &&
    contexts.find((item) => item.id === context)?.status === 'archived';
  const setContextAndReset = (next: ContextSelection) => {
    setContext(next);
    setSelectedNoteId(null);
    setSelectedEvidenceId(null);
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-surface">
      <ResearchSectionNav />
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-base font-semibold text-ink">研究知识</h1>
          <p className="mt-1 text-xs text-secondary">
            {mode === 'sources'
              ? `${notes.length} 条笔记 · ${evidence.length} 条证据`
              : mode === 'claims'
                ? '组织可追溯的观点与证据关系'
                : mode === 'matrices'
                  ? '按论文和问题比较证据'
                  : '把论述与研究资料组织成文稿'}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)}>
            导出研究内容
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSearchOpen((open) => !open)}>
            {searchOpen ? '关闭搜索' : '搜索知识'}
          </Button>
          <select
            aria-label="研究上下文"
            value={context}
            onChange={(event) => setContextAndReset(event.target.value as ContextSelection)}
            className="max-w-44 border border-line bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
          >
            <option value="all">全部上下文</option>
            <option value="general">通用研究</option>
            {contexts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.status === 'archived' ? '（已归档）' : ''}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 border border-line p-0.5">
            {(
              [
                ['sources', '资料'],
                ['claims', '观点'],
                ['matrices', '矩阵'],
                ['writing', '写作'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setSearchOpen(false);
                }}
                className={`px-2.5 py-1 text-xs font-semibold ${mode === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-secondary'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'sources' && (
            <div className="flex items-center gap-1 border border-line p-0.5">
              {(['active', 'deleted'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`px-2.5 py-1 text-xs font-semibold ${
                    status === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-secondary'
                  }`}
                >
                  {value === 'active' ? '当前' : '回收站'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {searchOpen ? (
        <KnowledgeSearch
          contextId={context === 'all' ? undefined : context === 'general' ? null : context}
          onMessage={setMessage}
        />
      ) : mode === 'sources' ? (
        <>
          <div className="grid shrink-0 grid-cols-3 border-b border-line lg:hidden" role="tablist">
            {(
              [
                ['notes', '笔记'],
                ['evidence', '证据'],
                ['inspect', '检查'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mobilePane === value}
                onClick={() => setMobilePane(value)}
                className={`py-2 text-xs font-semibold ${
                  mobilePane === value ? 'bg-surface-2 text-ink' : 'text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[15rem_minmax(20rem,1fr)_minmax(19rem,0.82fr)]">
            <aside
              className={`${mobilePane === 'notes' ? 'flex' : 'hidden'} h-full min-h-0 flex-col border-r border-line lg:flex`}
            >
              <div className="shrink-0 border-b border-line px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  上下文
                </p>
                <select
                  value={context}
                  onChange={(event) => setContextAndReset(event.target.value as ContextSelection)}
                  className="mt-2 w-full rounded-control border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none focus:border-accent"
                >
                  <option value="all">全部上下文</option>
                  <option value="general">通用研究</option>
                  {contexts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.status === 'archived' ? '（已归档）' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex shrink-0 items-center justify-between px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">笔记</p>
                {status === 'active' && !selectedContextArchived && (
                  <Button
                    size="sm"
                    icon={<IconPlus size={12} />}
                    disabled={busy}
                    onClick={() => noteMutation.mutate({ kind: 'create' })}
                  >
                    新建
                  </Button>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setSelectionKind('note');
                      setMobilePane('inspect');
                    }}
                    className={`w-full border-l-2 px-3 py-2.5 text-left transition ${
                      note.id === selectedNoteId
                        ? 'border-accent bg-surface-2'
                        : 'border-transparent hover:border-line hover:bg-surface-2/60'
                    }`}
                  >
                    <span className="block truncate text-xs font-semibold text-ink">
                      {note.title}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-muted">
                      {note.body || '空白笔记'}
                    </span>
                  </button>
                ))}
                {!notesQuery.isLoading && notes.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs leading-5 text-muted">
                    {status === 'deleted' ? '回收站里没有笔记。' : '这个范围还没有笔记。'}
                  </p>
                )}
              </div>
            </aside>

            <main
              className={`${mobilePane === 'evidence' ? 'flex' : 'hidden'} h-full min-h-0 flex-col border-r border-line lg:flex`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    证据流
                  </p>
                  <p className="mt-1 text-xs text-secondary">从阅读器提炼，保留来源快照</p>
                </div>
                <span className="font-mono text-[10px] text-muted">{evidence.length}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {evidence.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedEvidenceId(item.id);
                      setSelectionKind('evidence');
                      setMobilePane('inspect');
                    }}
                    className={`block w-full border-b border-line px-4 py-4 text-left transition ${
                      selectedEvidenceId === item.id ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-xs font-semibold text-ink">
                        {item.title || item.sourceSnapshot.workTitle}
                      </p>
                      <SourceStatus state={item.sourceState} compact />
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-secondary">
                      {item.summary || item.sourceSnapshot.anchor.textQuote?.exact || '区域证据'}
                    </p>
                    <p className="mt-2 text-[10px] text-muted">
                      {item.contextId === null
                        ? '通用证据'
                        : (contexts.find((entry) => entry.id === item.contextId)?.name ??
                          '研究上下文')}
                      {' · 来源：'}
                      {item.sourceSnapshot.contextId === null
                        ? '通用批注'
                        : (contexts.find((entry) => entry.id === item.sourceSnapshot.contextId)
                            ?.name ?? '已归档上下文')}
                      {' · 第 '}
                      {item.sourceSnapshot.pageNumber} 页
                    </p>
                  </button>
                ))}
                {!evidenceQuery.isLoading && evidence.length === 0 && (
                  <EmptyPane>
                    {status === 'deleted'
                      ? '回收站里没有证据。'
                      : '还没有证据。打开一篇 PDF，选择文字或区域后提炼。'}
                  </EmptyPane>
                )}
              </div>
            </main>

            <aside
              className={`${mobilePane === 'inspect' ? 'block' : 'hidden'} h-full min-h-0 lg:block`}
            >
              {selectionKind === 'evidence' ? (
                <EvidenceInspector
                  evidence={selectedEvidence}
                  busy={busy}
                  linkedNote={selectedNote}
                  noteLink={selectedEvidenceLink}
                  sourceContextName={
                    selectedEvidence?.sourceSnapshot.contextId === null
                      ? '通用批注'
                      : (contexts.find(
                          (entry) => entry.id === selectedEvidence?.sourceSnapshot.contextId,
                        )?.name ?? '已归档上下文')
                  }
                  onSave={(item, changes) =>
                    evidenceMutation.mutate({ kind: 'update', evidence: item, ...changes })
                  }
                  onDelete={(item) => evidenceMutation.mutate({ kind: 'delete', evidence: item })}
                  onRestore={(item) => evidenceMutation.mutate({ kind: 'restore', evidence: item })}
                  onLink={(note, item) =>
                    noteLinkMutation.mutate({ kind: 'link', note, evidence: item })
                  }
                  onUnlink={(link) => noteLinkMutation.mutate({ kind: 'unlink', link })}
                />
              ) : (
                <NoteEditor
                  note={selectedNote}
                  contextName={contextName}
                  busy={busy}
                  onSave={(note, changes) =>
                    noteMutation.mutate({ kind: 'update', note, ...changes })
                  }
                  onDelete={(note) => noteMutation.mutate({ kind: 'delete', note })}
                  onRestore={(note) => noteMutation.mutate({ kind: 'restore', note })}
                />
              )}
            </aside>
          </div>
        </>
      ) : mode === 'claims' ? (
        <ClaimBoard
          contextId={context === 'all' ? undefined : context === 'general' ? null : context}
          contextArchived={selectedContextArchived}
          initialClaimId={initialQueryValue('claim')}
          initialStatus={
            initialQueryValue('claimStatus') === 'draft' ||
            initialQueryValue('claimStatus') === 'archived' ||
            initialQueryValue('claimStatus') === 'deleted'
              ? (initialQueryValue('claimStatus') as 'draft' | 'archived' | 'deleted')
              : 'active'
          }
          onMessage={setMessage}
        />
      ) : mode === 'matrices' ? (
        <MatrixEditor
          contextId={context === 'all' ? undefined : context === 'general' ? null : context}
          contextArchived={selectedContextArchived}
          initialMatrixId={initialQueryValue('matrix')}
          initialStatus={
            initialQueryValue('matrixStatus') === 'archived' ||
            initialQueryValue('matrixStatus') === 'deleted'
              ? (initialQueryValue('matrixStatus') as 'archived' | 'deleted')
              : 'active'
          }
          onMessage={setMessage}
        />
      ) : (
        <WritingBoard
          contextId={context === 'all' ? undefined : context === 'general' ? null : context}
          contextArchived={selectedContextArchived}
          initialDocumentId={initialQueryValue('document')}
          initialStatus={
            initialQueryValue('writingStatus') === 'archived' ||
            initialQueryValue('writingStatus') === 'deleted'
              ? (initialQueryValue('writingStatus') as 'archived' | 'deleted')
              : 'active'
          }
          onMessage={setMessage}
        />
      )}

      {message && (
        <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 border border-line bg-surface px-3 py-2 text-xs text-secondary shadow-lg">
          {message}
        </div>
      )}
      <KnowledgeExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </section>
  );
}
