import { useEffect, useState } from 'react';
import { Button } from '@workbench/ui';
import type { ResearchNote } from '../../contract.js';

export function NoteEditor({
  note,
  contextName,
  busy,
  onSave,
  onDelete,
  onRestore,
}: {
  note: ResearchNote | null;
  contextName: string;
  busy: boolean;
  onSave: (note: ResearchNote, changes: { title: string; body: string }) => void;
  onDelete: (note: ResearchNote) => void;
  onRestore: (note: ResearchNote) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    setTitle(note?.title ?? '');
    setBody(note?.body ?? '');
  }, [note?.id, note?.revision, note?.body, note?.title]);

  if (!note) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-ink">选择一条笔记</p>
          <p className="mt-2 max-w-xs text-xs leading-5 text-muted">
            笔记用于整理你的判断；证据保留可回到原文的来源。
          </p>
        </div>
      </div>
    );
  }

  const dirty = title !== note.title || body !== note.body;
  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            {contextName}
          </p>
          <p className="mt-1 text-[10px] text-secondary">笔记修订 v{note.revision}</p>
        </div>
        <div className="flex gap-2">
          {note.status === 'deleted' ? (
            <Button size="sm" disabled={busy} onClick={() => onRestore(note)}>
              恢复
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(note)}>
                删除
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !dirty || !title.trim()}
                onClick={() => onSave(note, { title: title.trim(), body })}
              >
                保存
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <input
          aria-label="笔记标题"
          value={title}
          disabled={note.status === 'deleted'}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full border-0 border-b border-line bg-transparent pb-3 text-lg font-semibold text-ink outline-none focus:border-accent disabled:opacity-70"
        />
        <textarea
          aria-label="笔记正文"
          value={body}
          disabled={note.status === 'deleted'}
          onChange={(event) => setBody(event.target.value)}
          placeholder="写下判断、问题和下一步…"
          className="mt-4 min-h-0 flex-1 resize-none bg-transparent text-sm leading-7 text-secondary outline-none placeholder:text-muted disabled:opacity-70"
        />
      </div>
    </section>
  );
}
