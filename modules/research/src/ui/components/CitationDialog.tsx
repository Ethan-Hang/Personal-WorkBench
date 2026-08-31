import { useEffect, useState } from 'react';
import { Button, Field, Modal, controlClass } from '@workbench/ui';
import type { CslStyle, RenderCitationInput } from '../../contract.js';
import type { CitationRenderResult } from '../api.js';
import { postRenderCitation } from '../api.js';

const styleLabels: Record<CslStyle, string> = {
  apa: 'APA',
  ieee: 'IEEE',
  'chicago-author-date': 'Chicago author-date',
};

type Representation = 'text' | 'markdown' | 'html';

export function CitationDialog({
  open,
  items,
  initialMode = 'citation',
  title = '生成引用',
  onClose,
}: {
  open: boolean;
  items: RenderCitationInput['items'];
  initialMode?: RenderCitationInput['mode'];
  title?: string;
  onClose: () => void;
}) {
  const [style, setStyle] = useState<CslStyle>('apa');
  const [mode, setMode] = useState<RenderCitationInput['mode']>(initialMode);
  const [representation, setRepresentation] = useState<Representation>('text');
  const [result, setResult] = useState<CitationRenderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setResult(null);
    setError(null);
    setCopied(false);
  }, [initialMode, open, items]);

  const render = async () => {
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setResult(await postRenderCitation({ style, locale: 'en-US', mode, items }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成引用失败');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    setCopied(false);
    setError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('当前环境不能访问剪贴板');
      await navigator.clipboard.writeText(result[representation]);
      setCopied(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '复制失败');
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      description={`当前包含 ${items.length} 篇文献；引用始终从最新元数据重新生成。`}
      maxWidth="max-w-3xl"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="样式">
          <select
            className={controlClass}
            value={style}
            onChange={(event) => {
              setStyle(event.target.value as CslStyle);
              setResult(null);
              setCopied(false);
            }}
          >
            {Object.entries(styleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="内容">
          <select
            className={controlClass}
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as RenderCitationInput['mode']);
              setResult(null);
              setCopied(false);
            }}
          >
            <option value="citation">文内引用</option>
            <option value="bibliography">参考文献表</option>
          </select>
        </Field>
        <Field label="复制格式">
          <select
            className={controlClass}
            value={representation}
            onChange={(event) => {
              setRepresentation(event.target.value as Representation);
              setCopied(false);
            }}
          >
            <option value="text">纯文本</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
        </Field>
      </div>

      <div className="mt-4 min-h-40 border-y border-line bg-surface-2/35 px-4 py-3">
        {result ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-6 text-ink">
            {result[representation]}
          </pre>
        ) : (
          <p className="py-12 text-center text-xs text-muted">选择样式和内容后生成预览。</p>
        )}
      </div>
      {copied && <p className="mt-3 text-xs font-semibold text-accent">已复制到剪贴板</p>}
      {error && <p className="mt-3 bg-critical-soft px-3 py-2 text-xs text-critical">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>关闭</Button>
        <Button disabled={busy || items.length === 0} onClick={() => void render()}>
          {busy ? '正在生成…' : result ? '刷新' : '生成'}
        </Button>
        <Button variant="primary" disabled={!result || busy} onClick={() => void copy()}>
          复制
        </Button>
      </div>
    </Modal>
  );
}
