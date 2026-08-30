import { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from '@workbench/ui';
import type {
  Annotation,
  AnnotationAnchor,
  AnnotationKind,
  CreateEvidenceRequest,
} from '../../contract.js';

export type EvidenceDraftSource =
  | { mode: 'annotation'; annotation: Annotation; targetContextId: string | null }
  | {
      mode: 'direct';
      assetId: string;
      editionId: string | null;
      kind: AnnotationKind;
      anchor: AnnotationAnchor;
      targetContextId: string | null;
    };

export function EvidenceComposer({
  source,
  busy,
  onClose,
  onSubmit,
}: {
  source: EvidenceDraftSource | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEvidenceRequest) => void;
}) {
  const excerpt =
    source?.mode === 'annotation'
      ? (source.annotation.anchor.textQuote?.exact ?? source.annotation.body ?? '')
      : (source?.anchor.textQuote?.exact ?? '');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceKind, setSourceKind] = useState<'pdf' | 'ocr'>('pdf');

  useEffect(() => {
    setTitle('');
    setSummary(excerpt);
    setNotes('');
    setSourceKind('pdf');
  }, [excerpt, source]);

  const pageNumber = useMemo(
    () =>
      source?.mode === 'annotation' ? source.annotation.pageNumber : source?.anchor.pageNumber,
    [source],
  );

  if (!source) return null;
  const submit = () => {
    const shared = {
      contextId: source.targetContextId,
      sourceKind,
      title: title.trim() || null,
      summary,
      notes: notes.trim() || null,
    } as const;
    onSubmit(
      source.mode === 'annotation'
        ? { mode: 'annotation', annotationId: source.annotation.id, ...shared }
        : {
            mode: 'direct',
            assetId: source.assetId,
            editionId: source.editionId,
            kind: source.kind,
            anchor: source.anchor,
            body: null,
            color: source.kind === 'highlight' ? '#facc15' : '#7c3aed',
            ...shared,
          },
    );
  };

  return (
    <Modal isOpen title="提炼为证据" onClose={onClose}>
      <div className="space-y-4">
        <div className="border-l-2 border-accent bg-surface-2 px-3 py-2">
          <p className="text-[10px] font-semibold text-muted">第 {pageNumber} 页 · 来源快照</p>
          <p className="mt-1 max-h-24 overflow-auto text-xs leading-5 text-secondary">
            {excerpt || '区域来源没有可提取文本，请在摘要中描述。'}
          </p>
        </div>
        <label className="block text-xs font-semibold text-secondary">
          标题（可选）
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs font-semibold text-secondary">
          摘要
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-control border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs font-semibold text-secondary">
          研究备注（可选）
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-control border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="flex items-center justify-between gap-3 border-y border-line py-2 text-xs text-secondary">
          来源文本类型
          <select
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value as 'pdf' | 'ocr')}
            className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="pdf">PDF 文本层</option>
            <option value="ocr">本地 OCR</option>
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? '正在保存…' : '保存证据'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
